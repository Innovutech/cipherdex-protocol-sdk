// SPDX-License-Identifier: UNLICENSED
import { address, uint, field, fail } from './protocolData.js';
import { requireBundle } from './poolIdentity.js';
import { makeCall, deadline, gas } from './protocolExecution.js';
import { requirePrediction, creationArgs } from './poolCreation.js';
import { requireLiquidityIntent, permitArguments } from './lpPosition.js';
import { buildPublicTokenApprovalPlan } from './tokenApproval.js';
function adapter(b, native) {
    requireBundle(b);
    if (b.policy.mode !== 0)
        fail('Public mode required');
    return (native ? b.policy.nativeLiquidityRouter : b.policy.liquidityRouter)?.address ?? fail('Missing reviewed liquidity anchor');
}
function recipient(b, value, pool, target, native) {
    const r = address(value), forbidden = [pool, target, ...(native ? [b.policy.wrappedNative.address, b.policy.liquidityRouter.address] : [])];
    if (forbidden.includes(r))
        fail('Invalid liquidity recipient');
    return r;
}
function nativeToken(b, token0, token1, target) {
    const wrapped = b.policy.wrappedNative?.address ?? fail('Missing wrapper anchor');
    if (token0 !== wrapped && token1 !== wrapped)
        fail('Pool does not contain configured WCOTI');
    const token = token0 === wrapped ? token1 : token0;
    if ([wrapped, target, b.policy.liquidityRouter.address].includes(token))
        fail('Invalid paired token');
    return token;
}
function approval(token, spender, amount, current) {
    return buildPublicTokenApprovalPlan({ token, spender, requiredAmount: amount, currentAllowance: uint(current) });
}
function plan(call, approvals) {
    const frozen = Object.freeze([...approvals]);
    const steps = Object.freeze([...frozen.flatMap(p => p.calls.map(call => Object.freeze({ kind: 'approval', call }))), Object.freeze({ kind: 'operation', call })]);
    return Object.freeze({ call, approvals: frozen, steps, transactions: 1, approvalTransactions: steps.length - 1 });
}
function deposit(b, targetPool, input, codec, native, operation) {
    const target = adapter(b, native), creation = operation === 1 || operation === 2;
    let pool, key, token0, token1, args = [], candidates, prediction;
    if (creation) {
        prediction = targetPool;
        requirePrediction(b, prediction);
        if (!!prediction.instanceNamespace !== (operation === 2))
            fail('Wrong standard creation operation');
        if (prediction.existingPool)
            requireLiquidityIntent(b, prediction.existingPool, true);
        pool = prediction.predictedAddress;
        key = prediction.key;
        token0 = prediction.token0;
        token1 = prediction.token1;
        args = creationArgs(prediction);
        candidates = Object.freeze(prediction.existingPool ? [prediction.existingPool] : []);
    }
    else {
        const p = targetPool;
        requireLiquidityIntent(b, p, operation === 0);
        pool = p.address;
        key = p.key;
        token0 = p.token0;
        token1 = p.token1;
        candidates = Object.freeze([p]);
    }
    const paired = native ? nativeToken(b, token0, token1, target) : undefined;
    const caller = address(field(input, 'caller')), p = field(input, 'params');
    const a0 = uint(field(p, native ? 'tokenAmount' : 'amount0'), 128, true), a1 = native ? uint(field(input, 'value'), 128, true) : uint(field(p, 'amount1'), 128, true);
    const minShares = uint(field(p, 'minimumShares')), minPrice = uint(field(p, 'minimumPriceX18')), maxPrice = uint(field(p, 'maximumPriceX18'));
    if (minPrice > maxPrice)
        fail('Invalid canonical price bounds');
    const recv = recipient(b, field(p, 'recipient'), pool, target, native), time = deadline(b, field(p, 'deadline'));
    const params = native ? [a0, minShares, minPrice, maxPrice, recv, time] : [a0, a1, minShares, minPrice, maxPrice, recv, time];
    const names = native ? ['initializePoolNative', 'createAndInitializeStandardNative', 'createAndInitializeStandardInstanceNative', 'addLiquidityNative'] :
        ['initializePool', 'createAndInitializeStandard', 'createAndInitializeStandardInstance', 'addLiquidity'];
    const callArgs = creation ? (native ? [paired, prediction.feeBps, ...(operation === 2 ? [prediction.instanceNamespace, prediction.nonce] : []), params] : [...args, params]) : [pool, params];
    const label = native ? 'NativeLiquidityRouter' : 'LiquidityRouter';
    const info = Object.freeze({ poolAddress: pool, key, label, result: 'deposit', native, operation: BigInt(operation),
        eventName: native ? 'NativeLiquidityDeposited' : 'LiquidityDepositRouted', maximums: Object.freeze([a0, a1]), minimumShares: minShares,
        ...(creation ? { creationArgs: args, instance: operation === 2 } : {}) });
    const call = makeCall(codec, label, b, caller, target, names[operation], callArgs, native ? a1 : 0n, { bundle: b, candidates, tokenIn: token0, tokenOut: token1, kind: 'position', recipient: recv, liquidity: info }, gas(input));
    const approvals = native ? [approval(paired, target, a0, field(input, 'currentTokenAllowance'))] :
        [approval(token0, target, a0, field(input, 'currentAllowance0')), approval(token1, target, a1, field(input, 'currentAllowance1'))];
    return plan(call, approvals);
}
function removal(b, p, input, codec, native, permit) {
    const target = adapter(b, native);
    requireLiquidityIntent(b, p, false);
    if (native)
        nativeToken(b, p.token0, p.token1, target);
    const caller = address(field(input, 'caller')), params = field(input, 'params'), shares = uint(field(params, 'shareAmount'), 256, true);
    const min0 = uint(field(params, native ? 'minimumTokenAmount' : 'minimumAmount0')), min1 = uint(field(params, native ? 'minimumNativeAmount' : 'minimumAmount1'));
    const recv = recipient(b, field(params, 'recipient'), p.address, target, native), time = deadline(b, field(params, 'deadline'));
    const current = uint(field(input, 'currentLPAllowance')), label = native ? 'NativeLiquidityRouter' : 'LiquidityRouter';
    const suffix = permit ? 'WithPermit' : '', name = (native ? 'removeLiquidityNative' : 'removeLiquidity') + suffix;
    const args = [p.address, [shares, min0, min1, recv, time], ...(permit ? permitArguments(permit, b, p, caller, target, shares) : [])];
    const call = makeCall(codec, label, b, caller, target, name, args, 0n, { bundle: b, candidates: Object.freeze([p]), tokenIn: p.token0, tokenOut: p.token1, kind: 'position', recipient: recv,
        liquidity: Object.freeze({ poolAddress: p.address, key: p.key, label, result: 'removal', native, shareAmount: shares, minimums: Object.freeze([min0, min1]),
            eventName: native ? 'NativeLiquidityRemoved' : 'LiquidityRemovalRouted' }) }, gas(input));
    return plan(call, permit ? [] : [approval(p.lpToken, target, shares, current)]);
}
export const buildInitializePool = (b, p, i, c) => deposit(b, p, i, c, false, 0);
export const buildCreateAndInitializeStandard = (b, p, i, c) => deposit(b, p, i, c, false, 1);
export const buildCreateAndInitializeStandardInstance = (b, p, i, c) => deposit(b, p, i, c, false, 2);
export const buildAddLiquidity = (b, p, i, c) => deposit(b, p, i, c, false, 3);
export const buildRemoveLiquidity = (b, p, i, c) => removal(b, p, i, c, false);
export const buildRemoveLiquidityWithPermit = (b, p, i, permit, c) => removal(b, p, i, c, false, permit);
export const buildInitializePoolNative = (b, p, i, c) => deposit(b, p, i, c, true, 0);
export const buildCreateAndInitializeStandardNative = (b, p, i, c) => deposit(b, p, i, c, true, 1);
export const buildCreateAndInitializeStandardInstanceNative = (b, p, i, c) => deposit(b, p, i, c, true, 2);
export const buildAddLiquidityNative = (b, p, i, c) => deposit(b, p, i, c, true, 3);
export const buildRemoveLiquidityNative = (b, p, i, c) => removal(b, p, i, c, true);
export const buildRemoveLiquidityNativeWithPermit = (b, p, i, permit, c) => removal(b, p, i, c, true, permit);
