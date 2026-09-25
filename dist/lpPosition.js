// SPDX-License-Identifier: UNLICENSED
import { PROTOCOL_ABIS } from './protocolAbi.js';
import { address, uint, hash, hex, bool, field, optional, tuple, array, equal, fail, one, read, stable, ZERO_HASH } from './protocolData.js';
import { requirePool, abi } from './poolIdentity.js';
import { makeCall, deadline, gas } from './protocolExecution.js';
export function requireLiquidityIntent(b, p, initialize) {
    requirePool(b, p);
    if (initialize) {
        if (p.initialized)
            fail('PoolAlreadyInitialized');
        if (p.lifecycle === 'bonding-reservation')
            fail('ProtectedInitializationRequired');
    }
    else if (!p.initialized)
        fail('PoolNotInitialized');
}
export function poolRecipient(p, value, forbidden = []) {
    const r = address(value);
    if (r === p.address || forbidden.includes(r))
        fail('Invalid recipient');
    return r;
}
export function lockTerms(b, input) {
    const unlockTime = uint(field(input, 'unlockTime'), 64), permanent = bool(field(input, 'permanent')), time = deadline(b, field(input, 'deadline'));
    if (permanent ? unlockTime !== 0n : unlockTime <= b.block.timestamp)
        fail('Invalid lock lifetime');
    return Object.freeze({ unlockTime, permanent, deadline: time });
}
export function positionCall(b, p, caller, name, args, codec, info, options = {}) {
    requirePool(b, p);
    const label = options.lp ? 'PrivateLP' : ['PublicPool', 'ConfidentialPool', 'ObservablePool'][b.policy.mode];
    return makeCall(codec, label, b, caller, options.lp ? p.lpToken : p.address, name, args, 0n, { bundle: b, candidates: Object.freeze([p]), tokenIn: p.token0, tokenOut: p.token1, kind: 'position', recipient: options.recipient,
        liquidity: Object.freeze({ ...info, poolAddress: p.address, key: p.key, label }) }, options.gasLimit);
}
export function buildClaimLPFees(b, p, input, codec) {
    requirePool(b, p);
    const side = uint(field(input, 'side'), 8);
    if (side > 1n)
        fail('Invalid fee side');
    const recipient = poolRecipient(p, field(input, 'recipient'));
    return positionCall(b, p, address(field(input, 'caller')), 'claimLPFees', [side, recipient], codec, { result: 'claim', eventName: b.policy.mode === 0 ? 'LPFeesClaimed' : 'ConfidentialLPFeesClaimed', side }, { recipient, gasLimit: gas(input) });
}
export function buildPublicLockShares(b, p, input, codec) {
    requirePool(b, p);
    if (b.policy.mode !== 0)
        fail('Public mode required');
    const shareAmount = uint(field(input, 'shareAmount'), 256, true), terms = lockTerms(b, input);
    return positionCall(b, p, address(field(input, 'caller')), 'lockShares', [shareAmount, terms.unlockTime, terms.permanent, terms.deadline], codec, { result: 'lock', eventName: 'SharesLocked', shareAmount, ...terms }, { gasLimit: gas(input) });
}
export function buildUnlockShares(b, p, input, codec) {
    requirePool(b, p);
    const lockId = hash(field(input, 'lockId'), true);
    return positionCall(b, p, address(field(input, 'caller')), 'unlockShares', [lockId], codec, { result: 'unlock', eventName: b.policy.mode === 0 ? 'SharesUnlocked' : 'LiquidityUnlocked', lockId }, { gasLimit: gas(input) });
}
export function buildRequestMyPosition(b, p, input, codec) {
    requireLiquidityIntent(b, p, false);
    if (b.policy.mode === 0)
        fail('Confidential mode required');
    const requestId = hash(field(input, 'requestId'), true), time = deadline(b, field(input, 'deadline'));
    // The pool enforces positive caller ownership. No arbitrary-owner read or extra IT.
    return positionCall(b, p, address(field(input, 'caller')), 'requestMyPosition', [requestId, time], codec, { result: 'ciphertexts', eventName: 'ConfidentialPositionResult', requestId }, { gasLimit: gas(input) });
}
export function buildRequestMyAccounting(b, p, input, codec) {
    requirePool(b, p);
    if (b.policy.mode === 0)
        fail('Confidential mode required');
    // This LP endpoint has neither requestId nor deadline in its actual ABI.
    return positionCall(b, p, address(field(input, 'caller')), 'requestMyAccounting', [], codec, { result: 'ciphertexts', eventName: 'PrivateLPAccountingResult' }, { gasLimit: gas(input), lp: true });
}
export async function readPublicLPPosition(a, b, p, owner) {
    requirePool(b, p);
    if (b.policy.mode !== 0)
        fail('Public mode required');
    const who = address(owner);
    const lp = (name, args = []) => one(a, b.block, p.lpToken, PROTOCOL_ABIS.PublicLP, name, args);
    const shares = uint(await lp('balanceOf', [who])), totalShares = uint(await lp('totalSupply'));
    equal(uint(await one(a, b.block, p.address, abi(b, 'Pool'), 'shares', [who])), shares, 'pool/LP shares');
    equal(uint(await one(a, b.block, p.address, abi(b, 'Pool'), 'totalShares')), totalShares, 'pool/LP supply');
    const lockedPrincipal = uint(await lp('lockedPrincipal', [who]));
    if (lockedPrincipal > shares || shares > totalShares)
        fail('Invalid public position');
    const previewClaim0 = uint(await lp('previewClaim', [who, 0n])), previewClaim1 = uint(await lp('previewClaim', [who, 1n]));
    await stable(a, b.policy.chainId, b.block);
    return Object.freeze({ pool: p, owner: who, shares, totalShares, lockedPrincipal, previewClaim0, previewClaim1 });
}
export async function readLPLock(a, b, p, lockId) {
    requirePool(b, p);
    const id = hash(lockId, true), pub = b.policy.mode === 0;
    const v = tuple(await read(a, b.block, p.lpToken, pub ? PROTOCOL_ABIS.PublicLP : PROTOCOL_ABIS.PrivateLP, pub ? 'locks' : 'lockInfo', [id]), pub ? 5 : 4);
    const result = Object.freeze({ lockId: id, owner: address(v[0], true), ...(pub ? { amount: uint(v[1]) } : {}),
        unlockTime: uint(v[pub ? 2 : 1], 64), permanent: bool(v[pub ? 3 : 2]), active: bool(v[pub ? 4 : 3]) });
    if (result.owner === '0x0000000000000000000000000000000000000000' && (result.active || result.permanent || result.unlockTime !== 0n || (result.amount ?? 0n) !== 0n))
        fail('Invalid unissued lock');
    if (result.permanent && result.unlockTime !== 0n)
        fail('Invalid permanent lock metadata');
    await stable(a, b.policy.chainId, b.block);
    return result;
}
const permitIntents = new WeakMap(), signedPermits = new WeakSet();
export async function prepareLPPermit(a, b, p, input) {
    requirePool(b, p);
    if (b.policy.mode !== 0)
        fail('Public LP permit only');
    const owner = address(field(input, 'caller')), value = uint(field(input, 'shareAmount'), 256, true), time = uint(field(input, 'permitDeadline'));
    const native = optional(input, 'native') === undefined ? false : bool(field(input, 'native'));
    const spender = (native ? b.policy.nativeLiquidityRouter : b.policy.liquidityRouter)?.address ?? fail('Missing reviewed liquidity anchor');
    // No fabricated contract-wallet permit support. Such holders use ordinary LP approval.
    if (hex(await a.getCode(owner, b.block)) !== '0x')
        fail('Contract holders use ordinary approval');
    const lp = (name, args = []) => one(a, b.block, p.lpToken, PROTOCOL_ABIS.PublicLP, name, args);
    const d = tuple(await read(a, b.block, p.lpToken, PROTOCOL_ABIS.PublicLP, 'eip712Domain'), 7);
    equal(hex(d[0], 1), '0x0f', 'LP domain fields');
    const name = d[1], version = d[2];
    if (typeof name !== 'string' || name.length === 0 || name.length > 1024)
        fail('Invalid LP domain name');
    equal(name, await lp('name'), 'LP domain name');
    equal(version, '1', 'LP permit domain version');
    equal(uint(d[3]), b.policy.chainId, 'LP domain chain');
    equal(address(d[4]), p.lpToken, 'LP domain token');
    equal(hash(d[5]), ZERO_HASH, 'LP domain salt');
    array(d[6], 0, 0);
    const nonce = uint(await lp('nonces', [owner])), domainSeparator = hash(await lp('DOMAIN_SEPARATOR'), true);
    await stable(a, b.policy.chainId, b.block);
    const types = Object.freeze({ Permit: Object.freeze([['owner', 'address'], ['spender', 'address'], ['value', 'uint256'], ['nonce', 'uint256'], ['deadline', 'uint256']].map(([name, type]) => Object.freeze({ name, type }))) });
    const intent = Object.freeze({ domain: Object.freeze({ name, version: '1', chainId: b.policy.chainId, verifyingContract: p.lpToken }), types,
        message: Object.freeze({ owner, spender, value, nonce, deadline: time }), domainSeparator });
    permitIntents.set(intent, Object.freeze({ bundle: b, pool: p }));
    return intent;
}
/** The reviewed wallet signs the exact intent. The SDK checks context/shape, not ECDSA. */
export function bindLPPermit(intent, signature) {
    if (!permitIntents.has(intent))
        fail('Unverified permit intent');
    const result = Object.freeze({ intent, v: uint(field(signature, 'v'), 8), r: hash(field(signature, 'r')), s: hash(field(signature, 's')) });
    signedPermits.add(result);
    return result;
}
export function permitArguments(permit, b, p, caller, spender, shares) {
    if (!signedPermits.has(permit))
        fail('Unbound LP permit');
    const origin = permitIntents.get(permit.intent);
    equal(origin.bundle.policy.chainId, b.policy.chainId, 'permit chain');
    equal(origin.bundle.policy.factory.runtimeCodehash, b.policy.factory.runtimeCodehash, 'permit factory hash');
    equal(origin.pool.address, p.address, 'permit pool');
    equal(origin.pool.key, p.key, 'permit pool key');
    equal(origin.pool.lpToken, p.lpToken, 'permit LP');
    equal(origin.pool.lpRuntimeCodehash, p.lpRuntimeCodehash, 'permit LP hash');
    const m = permit.intent.message;
    equal(m.owner, caller, 'permit owner');
    equal(m.spender, spender, 'permit spender');
    equal(m.value, shares, 'permit value');
    // Nonce/expiry may have changed after prior submission. Only the contract's
    // sufficient-allowance fallback can authorize the withdrawal when permit fails.
    return Object.freeze([m.deadline, permit.v, permit.r, permit.s]);
}
