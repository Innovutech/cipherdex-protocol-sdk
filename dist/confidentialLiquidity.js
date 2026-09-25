// SPDX-License-Identifier: UNLICENSED
import { PROTOCOL_SELECTORS } from './protocolAbi.js';
import { address, uint, hash, hex, bool, field, optional, array, fail, freezeArgs } from './protocolData.js';
import { requirePool } from './poolIdentity.js';
import { makeCall, deadline, gas } from './protocolExecution.js';
import { registerConfidentialIntent, requireBoundInput } from './confidentialExecution.js';
import { buildPrivateTokenApprovalPlan } from './tokenApproval.js';
import { requireLiquidityIntent, poolRecipient, lockTerms, positionCall } from './lpPosition.js';
const preparations = new WeakMap();
export function packLiquidityPair(amount0, amount1) { return (uint(amount0, 128) << 128n) | uint(amount1, 128); }
function itArgs(bound, intent) {
    const v = requireBoundInput(bound, intent);
    return Object.freeze([Object.freeze([v.ciphertext.ciphertextHigh, v.ciphertext.ciphertextLow]), v.signature]);
}
function prepare(b, p, input, name, fields, publicArgs, receipt, funding, recipient) {
    requirePool(b, p);
    if (b.policy.mode === 0)
        fail('Confidential mode required');
    const caller = address(field(input, 'caller')), args = freezeArgs(publicArgs), label = b.policy.mode === 1 ? 'ConfidentialPool' : 'ObservablePool';
    const selector = hex(PROTOCOL_SELECTORS[label][name], 4);
    const make = (target, selector, fieldName, fieldIndex, plaintext, publicArguments) => {
        const intent = Object.freeze({ chainId: b.policy.chainId, caller, target, selector, plaintext, fieldName, fieldIndex, publicArguments });
        registerConfidentialIntent(intent);
        return intent;
    };
    const inputs = Object.freeze(fields.map(([name, amount], i) => make(p.address, selector, name, i, uint(amount), args)));
    const approvals = Object.freeze(funding ? [
        buildPrivateTokenApprovalPlan({ token: p.token0, spender: p.address, requiredAmount: funding.amount0, currentAllowance: funding.allowance0 }),
        buildPrivateTokenApprovalPlan({ token: p.token1, spender: p.address, requiredAmount: funding.amount1, currentAllowance: funding.allowance1 }),
    ] : []);
    const approvalInputs = Object.freeze(approvals.flatMap((a, side) => a.plaintextAmounts.map((amount, i) => make(a.token, hex(PROTOCOL_SELECTORS.PrivateApproval.approve, 4), 'token' + side + 'Approval' + i, i, amount, Object.freeze([p.address])))));
    const result = Object.freeze({ inputs, approvals, approvalInputs, inputITs: inputs.length, transactions: 1, approvalITs: approvalInputs.length, approvalTransactions: approvalInputs.length });
    preparations.set(result, Object.freeze({ bundle: b, pool: p, caller, name, argsAfterInputs: args, receipt: Object.freeze(receipt), recipient, gasLimit: gas(input) }));
    return result;
}
export function prepareConfidentialInitialization(b, p, input) {
    requireLiquidityIntent(b, p, true);
    const a0 = uint(field(input, 'amount0'), 128, true), a1 = uint(field(input, 'amount1'), 128, true), recv = poolRecipient(p, field(input, 'recipient')), time = deadline(b, field(input, 'deadline'));
    const reference = optional(input, 'initialPriceReferenceX18');
    if (b.policy.mode === 1 && reference !== undefined)
        fail('Mode 1 has no opening reference');
    const publicArgs = [...(b.policy.mode === 2 ? [uint(reference, 256, true)] : []), recv, time];
    return prepare(b, p, input, 'initializeStandardIT', [['packedAmounts', packLiquidityPair(a0, a1)]], publicArgs, { result: 'success', eventName: 'StandardPoolInitialized' }, { amount0: a0, amount1: a1, allowance0: uint(field(input, 'currentAllowance0')), allowance1: uint(field(input, 'currentAllowance1')) }, recv);
}
export function prepareConfidentialAddition(b, p, input) {
    requireLiquidityIntent(b, p, false);
    const a0 = uint(field(input, 'amount0Maximum'), 128, true), a1 = uint(field(input, 'amount1Maximum'), 128, true), min = uint(field(input, 'minimumShares'));
    const minPrice = uint(field(input, 'minimumPriceX18')), maxPrice = uint(field(input, 'maximumPriceX18'));
    if (minPrice > maxPrice)
        fail('Invalid canonical price bounds');
    const recv = poolRecipient(p, field(input, 'recipient')), time = deadline(b, field(input, 'deadline'));
    return prepare(b, p, input, 'addLiquidityIT', [['packedMaximums', packLiquidityPair(a0, a1)], ['minimumShares', min], ['minimumPriceX18', minPrice], ['maximumPriceX18', maxPrice]], [recv, time], { result: 'success', eventName: 'LiquidityAdded' }, { amount0: a0, amount1: a1, allowance0: uint(field(input, 'currentAllowance0')), allowance1: uint(field(input, 'currentAllowance1')) }, recv);
}
export function prepareConfidentialRemoval(b, p, input) {
    requireLiquidityIntent(b, p, false);
    const shares = uint(field(input, 'shareAmount'), 128, true), mins = packLiquidityPair(uint(field(input, 'minimumAmount0'), 128), uint(field(input, 'minimumAmount1'), 128));
    const recv = poolRecipient(p, field(input, 'recipient')), time = deadline(b, field(input, 'deadline'));
    return prepare(b, p, input, 'removeLiquidityIT', [['shares', shares], ['packedMinimums', mins]], [recv, time], { result: 'success', eventName: 'LiquidityRemoved' }, undefined, recv);
}
export function prepareConfidentialLock(b, p, input) {
    requirePool(b, p);
    const terms = lockTerms(b, input);
    return prepare(b, p, input, 'lockSharesIT', [['shares', uint(field(input, 'shareAmount'), 128, true)]], [terms.unlockTime, terms.permanent, terms.deadline], { result: 'lock', eventName: 'LiquidityLocked', unlockTime: terms.unlockTime, permanent: terms.permanent });
}
export function prepareAddLiquidityQuote(b, p, input) {
    requireLiquidityIntent(b, p, false);
    const token0Specified = bool(field(input, 'token0Specified')), requestId = hash(field(input, 'requestId'), true), time = deadline(b, field(input, 'deadline'));
    return prepare(b, p, input, 'requestAddLiquidityQuote', [['specifiedAmount', uint(field(input, 'specifiedAmount'), 128, true)]], [token0Specified, requestId, time], { result: 'ciphertexts', eventName: 'ConfidentialLiquidityQuoteResult', requestId, token0Specified });
}
export function prepareRemoveLiquidityQuote(b, p, input) {
    requireLiquidityIntent(b, p, false);
    const requestId = hash(field(input, 'requestId'), true), time = deadline(b, field(input, 'deadline'));
    return prepare(b, p, input, 'requestRemoveLiquidityQuote', [['shares', uint(field(input, 'shareAmount'), 128, true)]], [requestId, time], { result: 'ciphertexts', eventName: 'ConfidentialRemovalQuoteResult', requestId });
}
export function buildConfidentialLiquidity(preparation, bound, codec) {
    const p = preparations.get(preparation) ?? fail('Unknown liquidity preparation'), inputs = array(bound, 4, preparation.inputs.length);
    const args = [...inputs.map((v, i) => itArgs(v, preparation.inputs[i])), ...p.argsAfterInputs];
    const call = positionCall(p.bundle, p.pool, p.caller, p.name, args, codec, p.receipt, { recipient: p.recipient, gasLimit: p.gasLimit });
    return Object.freeze({ ...preparation, call });
}
/** Each approval/reset is a separate token-bound IT transaction, never a pool input. */
export function buildConfidentialLiquidityApproval(preparation, index, bound, codec) {
    const p = preparations.get(preparation) ?? fail('Unknown liquidity preparation');
    if (!Number.isInteger(index) || index < 0 || index >= preparation.approvalInputs.length)
        fail('Invalid approval index');
    const intent = preparation.approvalInputs[index], args = [p.pool.address, itArgs(bound, intent)];
    return makeCall(codec, 'PrivateApproval', p.bundle, p.caller, intent.target, 'approve', args, 0n, { bundle: p.bundle, candidates: Object.freeze([p.pool]), tokenIn: p.pool.token0, tokenOut: p.pool.token1, kind: 'position' });
}
