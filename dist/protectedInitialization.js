// SPDX-License-Identifier: UNLICENSED
import { PROTOCOL_ABIS, PROTOCOL_SELECTORS } from './protocolAbi.js';
import { address, uint, hash, hex, bool, field, optional, tuple, equal, fail, one, read, stable, freezeArgs, ZERO_ADDRESS, FEE_TIERS } from './protocolData.js';
import { requireBundle, authenticatePool, checkCode, abi } from './poolIdentity.js';
import { makeCall, deadline, gas } from './protocolExecution.js';
import { registerConfidentialIntent, requireBoundInput } from './confidentialExecution.js';
import { packLiquidityPair } from './confidentialLiquidity.js';
import { buildPublicTokenApprovalPlan, buildPrivateTokenApprovalPlan } from './tokenApproval.js';
import { poolRecipient } from './lpPosition.js';
const predictions = new WeakMap();
const reservations = new WeakSet(), graduations = new WeakSet();
const factoryLabels = ['PublicFactory', 'ConfidentialFactory', 'ObservableFactory'];
const initializerLabels = ['PublicInitializer', 'ConfidentialInitializer', 'ObservableInitializer'];
export function protectedIdentityArgs(p) {
    return Object.freeze([p.tokenA, p.tokenB, p.feeBps, p.protectedToken]);
}
function requirePrediction(b, p) {
    requireBundle(b);
    if (predictions.get(p) !== b)
        fail('Protected prediction not authenticated at this bundle/block');
}
export async function predictProtectedPool(a, b, input) {
    requireBundle(b);
    const tokenA = address(field(input, 'tokenA')), tokenB = address(field(input, 'tokenB'));
    const feeBps = uint(field(input, 'feeBps')), protectedToken = address(field(input, 'protectedToken'));
    if (tokenA === tokenB || !FEE_TIERS.includes(feeBps) || ![tokenA, tokenB].includes(protectedToken))
        fail('Invalid protected pair/tier/token');
    const [token0, token1] = BigInt(tokenA) < BigInt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
    const args = Object.freeze([tokenA, tokenB, feeBps, protectedToken]);
    const get = (name) => one(a, b.block, b.policy.factory.address, abi(b, 'Factory'), name, args);
    const key = hash(await get('protectedPoolKey'), true);
    equal(hash(a.hashAbiEncoded(Object.freeze(['address', 'address', 'uint256', 'uint256', 'uint8', 'uint8', 'address']), Object.freeze([token0, token1, feeBps, 1n, BigInt(b.policy.mode), 1n, protectedToken]))), key, 'protected canonical key');
    const predictedAddress = address(await get('predictProtectedPool')), existing = address(await get('protectedPoolFor'), true);
    equal(address(await one(a, b.block, b.policy.factory.address, abi(b, 'Factory'), 'getPool', [key]), true), existing, 'protected key lookup');
    let existingPool;
    if (existing !== ZERO_ADDRESS) {
        equal(existing, predictedAddress, 'protected prediction');
        existingPool = await authenticatePool(a, b, existing);
        equal(existingPool.kind, 'protected', 'protected kind');
        equal(existingPool.key, key, 'protected key');
        equal(existingPool.token0, token0, 'protected token0');
        equal(existingPool.token1, token1, 'protected token1');
        equal(existingPool.feeBps, feeBps, 'protected fee');
        equal(existingPool.protectedToken, protectedToken, 'protected token');
    }
    else if (hex(await a.getCode(predictedAddress, b.block)) !== '0x')
        fail('Occupied unrecorded protected prediction');
    await stable(a, b.policy.chainId, b.block);
    const result = Object.freeze({ tokenA, tokenB, token0, token1, feeBps, protectedToken, key, predictedAddress, ...(existingPool ? { existingPool } : {}) });
    predictions.set(result, b);
    return result;
}
/** The trusted adapter must reject noncanonical raw bool/address words and trailing data.
 * Strict positional snapshots cannot recover malformation discarded by a permissive decoder.
 * No launch-factory ERC-165 call is made. The single authenticated registry supplies authority.
 */
async function approvedLaunch(a, b, launch, token) {
    const entry = tuple(await read(a, b.block, b.policy.registry.address, PROTOCOL_ABIS.Registry, 'approval', [launch]), 2);
    equal(bool(entry[0]), true, 'launch approval');
    const committed = hash(entry[1], true);
    await checkCode(a, b.block, launch, committed);
    equal(bool(await one(a, b.block, b.policy.registry.address, PROTOCOL_ABIS.Registry, 'isApprovedLaunchFactory', [launch])), true, 'live launch approval');
    equal(bool(await one(a, b.block, launch, PROTOCOL_ABIS.LaunchFactory, 'isLaunchToken', [token])), true, 'recognized launch token');
    return committed;
}
export async function preflightProtectedReservation(a, b, p, launchFactory) {
    requirePrediction(b, p);
    const launch = address(launchFactory);
    if (p.existingPool)
        fail('Protected reservation already exists');
    const approvedRuntimeCodehash = await approvedLaunch(a, b, launch, p.protectedToken);
    // The authorizedInitializer getter is deliberately irrelevant to reservation.
    await stable(a, b.policy.chainId, b.block);
    const result = Object.freeze({ bundle: b, prediction: p, launchFactory: launch, approvedRuntimeCodehash });
    reservations.add(result);
    return result;
}
export async function preflightProtectedGraduation(a, b, p, effectiveCaller) {
    requirePrediction(b, p);
    const caller = address(effectiveCaller), pool = p.existingPool ?? fail('Protected reservation absent');
    if (pool.initialized || pool.protectedCompleted || pool.lifecycle !== 'bonding-reservation')
        fail('Protected graduation already completed or initialized');
    const launch = pool.reservingLaunchFactory, approvedRuntimeCodehash = await approvedLaunch(a, b, launch, p.protectedToken);
    const direct = caller === launch;
    if (!direct) {
        const authorized = address(await one(a, b.block, launch, PROTOCOL_ABIS.LaunchFactory, 'authorizedInitializer', [p.protectedToken]));
        equal(authorized, caller, 'current authorized initializer');
    }
    const callerKind = hex(await a.getCode(caller, b.block)) === '0x' ? 'eoa' : 'contract';
    await stable(a, b.policy.chainId, b.block);
    const result = Object.freeze({ bundle: b, prediction: p, pool, effectiveCaller: caller, callerKind,
        authorization: direct ? 'stored-factory' : 'authorized-initializer', approvedRuntimeCodehash });
    graduations.add(result);
    return result;
}
function requireGraduation(p) {
    if (!graduations.has(p))
        fail('Unverified protected graduation preflight');
    requirePrediction(p.bundle, p.prediction);
}
const eventContexts = new WeakMap();
export function protectedEventContext(plan) {
    return eventContexts.get(plan) ?? fail('Unknown protected event expectation');
}
function innerCall(codec, b, caller, target, label, name, args, event) {
    const normalized = freezeArgs(args), data = hex(codec.encodeFunctionData(PROTOCOL_ABIS[label], name, normalized));
    equal(data.slice(0, 10), PROTOCOL_SELECTORS[label][name], 'inner selector');
    const result = Object.freeze({ kind: 'contract-inner-call', chainId: b.policy.chainId, requiredEffectiveCaller: caller, to: target, abi: PROTOCOL_ABIS[label], functionName: name, args: normalized, data, value: 0n });
    eventContexts.set(result, Object.freeze(event));
    return result;
}
export function buildProtectedReservation(p, codec) {
    if (!reservations.has(p))
        fail('Unverified protected reservation preflight');
    requirePrediction(p.bundle, p.prediction);
    return innerCall(codec, p.bundle, p.launchFactory, p.bundle.policy.factory.address, factoryLabels[p.bundle.policy.mode], 'reserveProtectedPool', protectedIdentityArgs(p.prediction), { bundle: p.bundle, prediction: p.prediction, launchFactory: p.launchFactory, effectiveCaller: p.launchFactory, event: p.bundle.policy.mode === 0 ? 'ProtectedPoolReserved' : 'ProtectedPoolCreated' });
}
function terms(p, input) {
    requireGraduation(p);
    const b = p.bundle;
    const lpRecipient = poolRecipient(p.pool, field(input, 'lpRecipient'), [b.policy.initializer.address]);
    const disposition = uint(field(input, 'disposition'), 8), unlockTime = uint(field(input, 'unlockTime'), 64), time = deadline(b, field(input, 'deadline'));
    if (disposition > 2n || (disposition === 1n ? unlockTime <= b.block.timestamp : unlockTime !== 0n))
        fail('Invalid protected disposition/unlock time');
    const reference = optional(input, 'initialPriceReferenceX18');
    if (b.policy.mode !== 2 && reference !== undefined)
        fail('Only Mode 2 has an opening reference');
    return Object.freeze({ lpRecipient, disposition, unlockTime, deadline: time, ...(b.policy.mode === 2 ? { initialPriceReferenceX18: uint(reference, 256, true) } : {}) });
}
function privateParams(p, t) {
    return freezeArgs([...protectedIdentityArgs(p.prediction), ...(p.bundle.policy.mode === 2 ? [t.initialPriceReferenceX18] : []), t.lpRecipient, t.disposition, t.unlockTime, t.deadline]);
}
function graduationEvent(p, t) {
    return Object.freeze({ bundle: p.bundle, prediction: p.prediction, launchFactory: p.pool.reservingLaunchFactory, effectiveCaller: p.effectiveCaller, event: 'ProtectedPoolGraduated', terms: t });
}
function directCall(p, codec, name, args, event, gasLimit) {
    if (p.callerKind !== 'eoa')
        fail('Contract graduation requires an inner call or transaction-scoped GT integration');
    const b = p.bundle, call = makeCall(codec, initializerLabels[b.policy.mode], b, p.effectiveCaller, b.policy.initializer.address, name, args, 0n, { bundle: b, candidates: Object.freeze([p.pool]), tokenIn: p.pool.token0, tokenOut: p.pool.token1, kind: 'position' }, gasLimit);
    eventContexts.set(call, Object.freeze(event));
    return call;
}
export function buildPublicProtectedGraduation(p, input, codec) {
    requireGraduation(p);
    if (p.bundle.policy.mode !== 0)
        fail('Public mode required');
    const t = terms(p, input), a = uint(field(input, 'amountA'), 128, true), b = uint(field(input, 'amountB'), 128, true);
    const minimumShares = uint(field(input, 'minimumShares')), minPrice = uint(field(input, 'minimumPriceX18')), maxPrice = uint(field(input, 'maximumPriceX18'));
    if (minPrice > maxPrice)
        fail('Invalid canonical price bounds');
    const amount0 = p.prediction.tokenA === p.pool.token0 ? a : b, amount1 = p.prediction.tokenA === p.pool.token0 ? b : a;
    const params = freezeArgs([...protectedIdentityArgs(p.prediction), a, b, minimumShares, minPrice, maxPrice, t.lpRecipient, t.disposition, t.unlockTime, t.deadline]);
    const event = Object.freeze({ ...graduationEvent(p, t), amount0, amount1, minimumShares });
    const call = p.callerKind === 'eoa' ? directCall(p, codec, 'graduate', [params], event, gas(input)) :
        innerCall(codec, p.bundle, p.effectiveCaller, p.bundle.policy.initializer.address, 'PublicInitializer', 'graduate', [params], event);
    const approvals = Object.freeze([
        buildPublicTokenApprovalPlan({ token: p.prediction.tokenA, spender: p.bundle.policy.initializer.address, requiredAmount: a, currentAllowance: uint(field(input, 'currentAllowanceA')) }),
        buildPublicTokenApprovalPlan({ token: p.prediction.tokenB, spender: p.bundle.policy.initializer.address, requiredAmount: b, currentAllowance: uint(field(input, 'currentAllowanceB')) }),
    ]);
    const approvalSteps = approvals.flatMap(a => a.calls.map(call => Object.freeze({ kind: 'approval', call })));
    return Object.freeze({ execution: p.callerKind === 'eoa' ? 'direct-eoa' : 'contract-inner', call, approvals, approvalCalls: approvalSteps.length, operationCalls: 1,
        steps: Object.freeze([...approvalSteps, Object.freeze({ kind: 'graduation', call })]) });
}
const preparations = new WeakMap();
function inputArgs(bound, intent) {
    const v = requireBoundInput(bound, intent);
    return Object.freeze([Object.freeze([v.ciphertext.ciphertextHigh, v.ciphertext.ciphertextLow]), v.signature]);
}
export function prepareConfidentialProtectedGraduation(p, input) {
    requireGraduation(p);
    const b = p.bundle;
    if (b.policy.mode === 0)
        fail('Confidential mode required');
    if (p.callerKind !== 'eoa')
        fail('Contract graduation uses transaction-scoped GT guidance; no fabricated contract IT sender');
    const t = terms(p, input), params = privateParams(p, t), amount0 = uint(field(input, 'amount0'), 128, true), amount1 = uint(field(input, 'amount1'), 128, true);
    const target = b.policy.initializer.address, selector = hex(PROTOCOL_SELECTORS[initializerLabels[b.policy.mode]].initializeProtectedIT, 4);
    const make = (target, selector, plaintext, fieldName, fieldIndex, publicArguments) => {
        const intent = Object.freeze({ chainId: b.policy.chainId, caller: p.effectiveCaller, target, selector, plaintext, fieldName, fieldIndex, publicArguments });
        registerConfidentialIntent(intent);
        return intent;
    };
    const inputs = Object.freeze([make(target, selector, packLiquidityPair(amount0, amount1), 'packedCanonicalAmounts', 0, freezeArgs([params]))]);
    const approvals = Object.freeze([
        buildPrivateTokenApprovalPlan({ token: p.pool.token0, spender: target, requiredAmount: amount0, currentAllowance: uint(field(input, 'currentAllowance0')) }),
        buildPrivateTokenApprovalPlan({ token: p.pool.token1, spender: target, requiredAmount: amount1, currentAllowance: uint(field(input, 'currentAllowance1')) }),
    ]);
    const approvalInputs = Object.freeze(approvals.flatMap((a, side) => a.plaintextAmounts.map((v, i) => make(a.token, hex(PROTOCOL_SELECTORS.PrivateApproval.approve, 4), v, 'token' + side + 'Approval' + i, i, Object.freeze([target])))));
    const result = Object.freeze({ inputs, approvals, approvalInputs, inputITs: 1, transactions: 1, approvalITs: approvalInputs.length, approvalTransactions: approvalInputs.length });
    preparations.set(result, Object.freeze({ preflight: p, terms: t, params, gasLimit: gas(input) }));
    return result;
}
export function buildConfidentialProtectedGraduation(preparation, bound, codec) {
    const p = preparations.get(preparation) ?? fail('Unknown protected preparation');
    const call = directCall(p.preflight, codec, 'initializeProtectedIT', [inputArgs(bound, preparation.inputs[0]), p.params], graduationEvent(p.preflight, p.terms), p.gasLimit);
    return Object.freeze({ ...preparation, call });
}
/** Every reset/approval is separately signed for its token and INITIALIZER spender. */
export function buildProtectedTokenApproval(preparation, index, bound, codec) {
    const p = preparations.get(preparation) ?? fail('Unknown protected preparation'), g = p.preflight, b = g.bundle;
    if (!Number.isInteger(index) || index < 0 || index >= preparation.approvalInputs.length)
        fail('Invalid protected approval index');
    const intent = preparation.approvalInputs[index];
    return makeCall(codec, 'PrivateApproval', b, g.effectiveCaller, intent.target, 'approve', [b.policy.initializer.address, inputArgs(bound, intent)], 0n, { bundle: b, candidates: Object.freeze([g.pool]), tokenIn: g.pool.token0, tokenOut: g.pool.token1, kind: 'position' });
}
/** No GT values, EOA calldata or partner executor are created here. The contract obtains
 * its own transaction-scoped GT, approves, graduates and clears within its outer transaction.
 */
export function prepareProtectedGTGraduation(p, input) {
    requireGraduation(p);
    const b = p.bundle;
    if (b.policy.mode === 0 || p.callerKind !== 'contract')
        fail('Self-funded confidential contract required for GT guidance');
    const t = terms(p, input), label = initializerLabels[b.policy.mode];
    const result = Object.freeze({ kind: 'transaction-scoped-gt-guidance', chainId: b.policy.chainId, requiredEffectiveCaller: p.effectiveCaller,
        to: b.policy.initializer.address, abi: PROTOCOL_ABIS[label], functionName: 'initializeProtectedGT',
        selector: hex(PROTOCOL_SELECTORS[label].initializeProtectedGT, 4), params: privateParams(p, t),
        token0: p.pool.token0, token1: p.pool.token1, spender: b.policy.initializer.address, amountOrder: 'canonical-token0-token1',
        steps: Object.freeze(['Obtain transaction-scoped amount0/amount1 GT from the effective caller contract own funds.',
            'Approve each canonical token to this initializer for its exact GT amount.',
            'Call initializeProtectedGT(amount0, amount1, params) from that same contract.',
            'Clear and verify both allowances before the outer transaction completes.']) });
    eventContexts.set(result, graduationEvent(p, t));
    return result;
}
