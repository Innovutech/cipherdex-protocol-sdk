// SPDX-License-Identifier: UNLICENSED
// Replacement public orders. Legacy publicLimitOrder.ts remains a separate surface.
import { PROTOCOL_ABIS } from './protocolAbi.js';
import { address, hex, hash, uint, bool, field, array, tuple, equal, fail, block, one, read, stable, ZERO_ADDRESS } from './protocolData.js';
import { normalizeProtocolPolicy, checkPublicOrderBook, verifyProtocolBundle, requirePool, authenticatedCandidates } from './poolIdentity.js';
import { encodeProtocolCall, gas } from './protocolExecution.js';
import { buildPublicTokenApprovalPlan, PUBLIC_ERC20_APPROVAL_ABI } from './tokenApproval.js';
import { EVM_NATIVE_ASSET_ADDRESS } from './nativeAsset.js';
export const PUBLIC_ORDER_STATUS = Object.freeze({ NONE: 0n, OPEN: 1n, FILLED: 2n, CANCELLED: 3n });
export const PUBLIC_ORDER_SETTLEMENT = Object.freeze({ TOKEN: 0n, NATIVE_INPUT: 1n, NATIVE_OUTPUT: 2n });
/** Numeric policy bits keep historical meanings. They never identify pools. */
export const PUBLIC_ORDER_FEE_BITS = Object.freeze({ 5: 1n, 30: 2n, 100: 4n, 1: 8n });
export const PUBLIC_ORDER_ALL_FEES = 15n;
const books = new WeakSet();
export function requireOrderBook(b, trading = false) {
    if (!books.has(b))
        fail('Unverified order book');
    if (trading && (!b.trading || !b.bundle))
        fail('Live trading authentication required');
}
/** Refund/read authentication: book runtime and stored reviewed identities only.
 * No claim that its router, factory, wrapper or recipient can currently execute. */
export async function authenticatePublicOrderBook(a, input, atBlock) {
    const p = normalizeProtocolPolicy(input), height = atBlock === undefined ? undefined : uint(atBlock);
    equal(uint(await a.readChainId(), 256, true), p.chainId, 'order chain');
    const at = block(await a.readBlock(height));
    if (height !== undefined)
        equal(at.number, height, 'order block');
    await checkPublicOrderBook(a, at, p);
    await stable(a, p.chainId, at);
    const b = Object.freeze({ kind: 'order-book', policy: p, block: at, trading: false });
    books.add(b);
    return b;
}
/** Trading also authenticates current factory/router bindings and the 16-pool cap. */
export async function authenticatePublicOrderTrading(a, p, atBlock) {
    const bundle = await verifyProtocolBundle(a, p, atBlock);
    if (!bundle.policy.orderBook || bundle.policy.mode !== 0)
        fail('Public order anchor required');
    const b = Object.freeze({ kind: 'order-book', policy: bundle.policy, block: bundle.block, trading: true, bundle });
    books.add(b);
    return b;
}
export function publicOrderFeePolicy(v) { const mask = uint(v, 8, true); if (mask > 15n)
    fail('Invalid fee-tier policy'); return mask; }
function settlement(v) { const m = uint(v, 8); if (m > 2n)
    fail('Invalid settlement mode'); return m; }
export function orderRecipient(b, v) {
    const r = address(v);
    if ([b.policy.orderBook.address, b.policy.factory.address, b.policy.router.address, b.policy.wrappedNative.address].includes(r))
        fail('Invalid order recipient');
    return r;
}
function pair(b, input, output, m) {
    const wrapped = b.policy.wrappedNative.address;
    const normalize = (v, native) => typeof v === 'string' && v.toLowerCase() === EVM_NATIVE_ASSET_ADDRESS.toLowerCase() && native ? wrapped : address(v);
    const x = normalize(input, m === 1n), y = normalize(output, m === 2n);
    if (x === y || [x, y].some(t => [b.policy.orderBook.address, b.policy.router.address, b.policy.factory.address].includes(t)))
        fail('Invalid order pair');
    if (m === 0n ? (x === wrapped || y === wrapped) : m === 1n ? x !== wrapped || y === wrapped : y !== wrapped || x === wrapped)
        fail('Invalid settlement pair');
    return Object.freeze([x, y]);
}
function terms(b, p, amount) {
    const recipient = orderRecipient(b, field(p, 'recipient')), expiry = uint(field(p, 'expiry'), 64);
    if (expiry <= b.block.timestamp)
        fail('Order expiry must be future');
    const feeTierPolicy = publicOrderFeePolicy(field(p, 'feeTierPolicy')), allowPartialFills = bool(field(p, 'allowPartialFills')), minimumFillAmount = uint(field(p, 'minimumFillAmount'));
    if (allowPartialFills ? (minimumFillAmount === 0n || minimumFillAmount > amount) : (minimumFillAmount !== 0n && minimumFillAmount !== amount))
        fail('Invalid partial-fill policy');
    return Object.freeze({ recipient, expiry, feeTierPolicy, allowPartialFills, minimumFillAmount });
}
const snapshots = new WeakMap();
function get(a, b, name, args = []) { return one(a, b.block, b.policy.orderBook.address, PROTOCOL_ABIS.OrderBook, name, args); }
export async function readPublicOrder(a, b, id) {
    requireOrderBook(b);
    const orderId = uint(id), status = uint(await get(a, b, 'orderStatus', [orderId]), 8);
    if (status > 3n)
        fail('Invalid order status');
    const v = tuple(await get(a, b, 'getOrder', [orderId]), 15);
    let order = null;
    if (status !== 1n) {
        for (let i = 0; i < 15; i++)
            if (i >= 1 && i <= 4)
                equal(address(v[i], true), ZERO_ADDRESS, 'cleared order address');
            else if (i === 13)
                equal(bool(v[i]), false, 'cleared partial flag');
            else
                equal(uint(v[i]), 0n, 'cleared order field');
    }
    else {
        const m = settlement(v[14]), [tokenIn, tokenOut] = pair(b, v[3], v[4], m);
        order = Object.freeze({ id: uint(v[0], 256, true), maker: address(v[1]), recipient: orderRecipient(b, v[2]), tokenIn, tokenOut,
            remainingAmountIn: uint(v[5], 256, true), priceNumerator: uint(v[6], 256, true), priceDenominator: uint(v[7], 256, true), minimumFillAmount: uint(v[8], 256, true),
            remainingExecutionBounty: uint(v[9]), expiry: uint(v[10], 64), revision: uint(v[11], 32), feeTierPolicy: publicOrderFeePolicy(v[12]), allowPartialFills: bool(v[13]), settlementMode: m });
        equal(order.id, orderId, 'order ID');
        if (order.remainingAmountIn > order.priceDenominator || order.minimumFillAmount > order.priceDenominator || (!order.allowPartialFills && order.minimumFillAmount !== order.priceDenominator))
            fail('Invalid stored price/fill bounds');
    }
    await stable(a, b.policy.chainId, b.block);
    const result = Object.freeze({ book: b, orderId, status, order });
    snapshots.set(result, b);
    return result;
}
function open(b, s, caller) {
    requireOrderBook(b);
    if (snapshots.get(s) !== b)
        fail('Unverified order snapshot');
    if (s.status !== 1n || !s.order)
        fail('Order not open');
    if (caller !== undefined)
        equal(s.order.maker, caller, 'order maker');
    return s.order;
}
function validFill(o, amount) { return amount > 0n && amount <= o.remainingAmountIn && (amount === o.remainingAmountIn || (o.allowPartialFills && amount >= o.minimumFillAmount)); }
export async function readPublicOrderMinimumOutput(a, b, s, amount) {
    const o = open(b, s), fill = uint(amount, 256, true);
    if (!validFill(o, fill))
        fail('Invalid fill amount');
    const result = uint(await get(a, b, 'minimumOutputFor', [o.id, fill]), 256, true);
    await stable(a, b.policy.chainId, b.block);
    return result;
}
export async function readPublicOrderAccounting(a, b, caller, tokens = []) {
    requireOrderBook(b);
    const who = address(caller), assets = array(tokens, 16).map(t => address(t));
    if (new Set(assets).size !== assets.length)
        fail('Duplicate accounting token');
    const nextOrderId = uint(await get(a, b, 'nextOrderId'), 256, true), openBounties = uint(await get(a, b, 'totalOpenExecutionBounties')), claimableBounties = uint(await get(a, b, 'totalClaimableNativeBounties')), claimableProceeds = uint(await get(a, b, 'totalClaimableNativeProceeds')), callerBounty = uint(await get(a, b, 'claimableNativeBounties', [who])), callerProceeds = uint(await get(a, b, 'claimableNativeProceeds', [who]));
    if (callerBounty > claimableBounties || callerProceeds > claimableProceeds)
        fail('Inconsistent native credits');
    const escrow = [];
    for (const token of assets)
        escrow.push(Object.freeze({ token, amount: uint(await get(a, b, 'totalEscrowed', [token])) }));
    await stable(a, b.policy.chainId, b.block);
    return Object.freeze({ book: b, caller: who, nextOrderId, openBounties, claimableBounties, claimableProceeds, callerBounty, callerProceeds, escrow: Object.freeze(escrow) });
}
const calls = new WeakMap();
export function orderCallContext(call) { return calls.get(call) ?? fail('Unverified order call'); }
function call(b, caller, name, args, value, codec, c, limit) {
    requireOrderBook(b);
    const result = encodeProtocolCall(codec, 'OrderBook', b.policy.chainId, caller, b.policy.orderBook.address, name, args, value, limit);
    calls.set(result, Object.freeze(c));
    return result;
}
const plans = new WeakSet();
function plan(c, approvals) {
    const frozen = Object.freeze([...approvals]), steps = Object.freeze([...frozen.flatMap(p => p.calls.map(call => Object.freeze({ kind: 'approval', call }))), Object.freeze({ kind: 'operation', call: c })]);
    const result = Object.freeze({ call: c, approvals: frozen, steps, transactions: 1, approvalTransactions: steps.length - 1 });
    plans.add(result);
    return result;
}
export async function buildCreatePublicOrder(a, b, input, codec) {
    requireOrderBook(b, true);
    const caller = address(field(input, 'caller')), p = field(input, 'params'), m = settlement(field(p, 'settlementMode'));
    const [tokenIn, tokenOut] = pair(b, field(p, 'tokenIn'), field(p, 'tokenOut'), m), amountIn = uint(field(p, 'amountIn'), 256, true), minAmountOut = uint(field(p, 'minAmountOut'), 256, true);
    const t = terms(b, p, amountIn), bounty = uint(field(input, 'executionBounty')), value = uint(bounty + (m === 1n ? amountIn : 0n)), limit = gas(input);
    const params = Object.freeze({ ...t, tokenIn, tokenOut, amountIn, minAmountOut, settlementMode: m });
    for (const token of [tokenIn, tokenOut])
        if (hex(await a.getCode(token, b.block)) === '0x')
            fail('Order token has no code');
    const approvals = [];
    if (m !== 1n) {
        const current = uint(await one(a, b.block, tokenIn, PUBLIC_ERC20_APPROVAL_ABI, 'allowance', [caller, b.policy.orderBook.address]));
        approvals.push(buildPublicTokenApprovalPlan({ token: tokenIn, spender: b.policy.orderBook.address, requiredAmount: amountIn, currentAllowance: current }));
    }
    await stable(a, b.policy.chainId, b.block);
    const args = [tokenIn, tokenOut, amountIn, minAmountOut, t.recipient, t.expiry, t.feeTierPolicy, t.allowPartialFills, t.minimumFillAmount, m];
    return plan(call(b, caller, 'createOrder', [args], value, codec, { book: b, operation: 'create', params, bounty }, limit), approvals);
}
export function buildAmendPublicOrder(b, s, input, codec) {
    requireOrderBook(b, true);
    const caller = address(field(input, 'caller')), o = open(b, s, caller);
    if (o.revision === (1n << 32n) - 1n)
        fail('Order revision exhausted');
    const p = field(input, 'amendment'), t = terms(b, p, o.remainingAmountIn), minAmountOutForRemaining = uint(field(p, 'minAmountOutForRemaining'), 256, true);
    const params = Object.freeze({ ...t, minAmountOutForRemaining });
    return call(b, caller, 'amendOrder', [o.id, [t.recipient, minAmountOutForRemaining, t.expiry, t.feeTierPolicy, t.allowPartialFills, t.minimumFillAmount]], 0n, codec, { book: b, operation: 'amend', order: o, params }, gas(input));
}
export function buildIncreasePublicOrderBounty(b, s, input, codec) {
    requireOrderBook(b, true);
    const caller = address(field(input, 'caller')), o = open(b, s, caller), amount = uint(field(input, 'amount'), 256, true);
    uint(o.remainingExecutionBounty + amount);
    return call(b, caller, 'increaseExecutionBounty', [o.id], amount, codec, { book: b, operation: 'topup', order: o, amount }, gas(input));
}
export function buildCancelPublicOrder(b, s, input, codec) {
    const caller = address(field(input, 'caller')), o = open(b, s, caller);
    return call(b, caller, 'cancelOrder', [o.id], 0n, codec, { book: b, operation: 'cancel', order: o }, gas(input));
}
function candidates(b, o, list) {
    requireOrderBook(b, true);
    const pools = authenticatedCandidates(b.bundle, o.tokenIn, o.tokenOut, list, 'swap');
    for (const p of pools) {
        const bit = PUBLIC_ORDER_FEE_BITS[p.feeBps.toString()];
        if (bit === undefined || (o.feeTierPolicy & bit) === 0n)
            fail('Candidate outside order fee-tier policy');
    }
    return pools;
}
export async function canFillPublicOrder(a, b, s, amount, list) {
    requireOrderBook(b, true);
    if (snapshots.get(s) !== b)
        fail('Unverified order snapshot');
    const fill = uint(amount);
    // The contract returns false for unavailable orders before candidate validation.
    // Still require an explicit bounded authenticated list; do not turn malformed
    // live-order candidates or dependency failures into a normal no-route preview.
    const raw = array(list, 16);
    if (raw.length === 0)
        fail('Empty candidates');
    for (const p of raw)
        requirePool(b.bundle, p);
    if (new Set(raw.map(p => p.address)).size !== raw.length)
        fail('Duplicate candidates');
    const active = s.order && s.status === 1n && s.order.expiry >= b.block.timestamp && validFill(s.order, fill);
    const pools = active ? candidates(b, s.order, raw) : raw;
    const v = tuple(await read(a, b.block, b.policy.orderBook.address, PROTOCOL_ABIS.OrderBook, 'canFillOrder', [s.orderId, fill, pools.map(p => p.address)]), 5);
    const canFill = bool(v[0]), selected = address(v[1], true), feeBps = uint(v[2]), expectedAmountOut = uint(v[3]), minimumAmountOut = uint(v[4]);
    let selectedPool = null;
    if (selected === ZERO_ADDRESS) {
        if (canFill || feeBps !== 0n || expectedAmountOut !== 0n)
            fail('Invalid empty fill preview');
    }
    else {
        if (!active)
            fail('Unavailable order returned winner');
        selectedPool = pools.find(p => p.address === selected) ?? fail('Preview winner outside candidates');
        equal(feeBps, selectedPool.feeBps, 'preview fee');
        if (expectedAmountOut === 0n || canFill !== (expectedAmountOut >= minimumAmountOut))
            fail('Invalid output preview');
    }
    if (active)
        equal(minimumAmountOut, await readPublicOrderMinimumOutput(a, b, s, fill), 'authoritative order minimum');
    else if (canFill || selected !== ZERO_ADDRESS || minimumAmountOut !== 0n)
        fail('Invalid unavailable order preview');
    await stable(a, b.policy.chainId, b.block);
    return Object.freeze({ book: b, orderId: s.orderId, amountIn: fill, canFill, selectedPool, selectedFeeBps: feeBps, expectedAmountOut, minimumAmountOut });
}
export function buildFillPublicOrder(b, s, input, codec) {
    requireOrderBook(b, true);
    const caller = address(field(input, 'caller')), o = open(b, s), amount = uint(field(input, 'amountIn'), 256, true);
    if (o.expiry < b.block.timestamp)
        fail('Order expired');
    if (!validFill(o, amount))
        fail('Invalid fill amount');
    const pools = candidates(b, o, field(input, 'candidates'));
    return call(b, caller, 'fillOrder', [o.id, amount, pools.map(p => p.address)], 0n, codec, { book: b, operation: 'fill', order: o, candidates: pools, amount }, gas(input));
}
async function claim(a, b, input, codec, bounty) {
    requireOrderBook(b);
    const caller = address(field(input, 'caller')), recipient = orderRecipient(b, field(input, 'recipient')), limit = gas(input);
    uint(await get(a, b, bounty ? 'claimableNativeBounties' : 'claimableNativeProceeds', [caller]), 256, true);
    await stable(a, b.policy.chainId, b.block);
    return call(b, caller, bounty ? 'claimNativeBounty' : 'claimNativeProceeds', [recipient], 0n, codec, { book: b, operation: bounty ? 'claim-bounty' : 'claim-proceeds', recipient }, limit);
}
export const buildClaimPublicOrderNativeBounty = (a, b, input, codec) => claim(a, b, input, codec, true);
export const buildClaimPublicOrderNativeProceeds = (a, b, input, codec) => claim(a, b, input, codec, false);
const permitPlans = new WeakMap(), signatures = new WeakSet();
/** Explicit token domain verified against DOMAIN_SEPARATOR, never inferred from
 * LP names or mandatory EIP-5267. Unsupported/reverting domains fail closed. */
export async function preparePublicOrderPermit(a, p, input, domainAdapter) {
    if (!plans.has(p))
        fail('Unverified creation plan');
    const c = orderCallContext(p.call), b = c.book, params = c.params;
    if (c.operation !== 'create' || p.call.functionName !== 'createOrder' || params.settlementMode === 1n)
        fail('Input permit requires token creation');
    const name = field(input, 'name'), version = field(input, 'version'), time = uint(field(input, 'permitDeadline'));
    for (const value of [name, version])
        if (typeof value !== 'string' || value.length === 0 || value.length > 1024)
            fail('Unsupported permit domain');
    if (hex(await a.getCode(p.call.from, b.block)) !== '0x')
        fail('Contract holders use ordinary approval');
    const nonce = uint(await one(a, b.block, params.tokenIn, PROTOCOL_ABIS.TokenPermit, 'nonces', [p.call.from])), domainSeparator = hash(await one(a, b.block, params.tokenIn, PROTOCOL_ABIS.TokenPermit, 'DOMAIN_SEPARATOR'), true);
    const domain = Object.freeze({ name: name, version: version, chainId: p.call.chainId, verifyingContract: params.tokenIn });
    equal(hash(domainAdapter.hashDomain(domain), true), domainSeparator, 'input-token permit domain');
    const types = Object.freeze({ Permit: Object.freeze([['owner', 'address'], ['spender', 'address'], ['value', 'uint256'], ['nonce', 'uint256'], ['deadline', 'uint256']].map(([name, type]) => Object.freeze({ name, type }))) });
    const intent = Object.freeze({ domain, types, message: Object.freeze({ owner: p.call.from, spender: p.call.to, value: params.amountIn, nonce, deadline: time }), domainSeparator });
    await stable(a, b.policy.chainId, b.block);
    permitPlans.set(intent, p);
    return intent;
}
/** Context/shape only; ECDSA and sufficient-allowance fallback remain on chain. */
export function bindPublicOrderPermit(intent, input) {
    if (!permitPlans.has(intent))
        fail('Unverified order permit');
    const result = Object.freeze({ intent, v: uint(field(input, 'v'), 8), r: hash(field(input, 'r')), s: hash(field(input, 's')) });
    signatures.add(result);
    return result;
}
export function buildCreatePublicOrderWithPermit(p, s, codec) {
    if (!plans.has(p) || !signatures.has(s) || permitPlans.get(s.intent) !== p)
        fail('Permit belongs to another creation plan');
    const c = orderCallContext(p.call), m = s.intent.message;
    return plan(call(c.book, p.call.from, 'createOrderWithPermit', [p.call.args[0], m.deadline, s.v, s.r, s.s], p.call.value, codec, c, p.call.gasLimit), []);
}
/** Permissionless surplus triggers. The fixed destination and liability exclusions
 * are enforced by the book, not selected by the caller. No route is required. */
export async function buildSweepPublicOrderTokenSurplus(a, b, input, codec) {
    requireOrderBook(b);
    const caller = address(field(input, 'caller')), token = address(field(input, 'token'));
    if (hex(await a.getCode(token, b.block)) === '0x')
        fail('Surplus token has no deployed code');
    await stable(a, b.policy.chainId, b.block);
    return call(b, caller, 'sweepTokenSurplus', [token], 0n, codec, { book: b, operation: 'sweep-token-surplus', token }, gas(input));
}
export function buildSweepPublicOrderNativeSurplus(b, input, codec) {
    requireOrderBook(b);
    return call(b, address(field(input, 'caller')), 'sweepNativeSurplus', [], 0n, codec, { book: b, operation: 'sweep-native-surplus' }, gas(input));
}
