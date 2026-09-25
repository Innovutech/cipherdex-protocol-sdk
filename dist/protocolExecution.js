// SPDX-License-Identifier: UNLICENSED
import { PROTOCOL_ABIS, PROTOCOL_SELECTORS } from './protocolAbi.js';
import { address, hex, uint, optional, fail, freezeArgs } from './protocolData.js';
import { requireBundle } from './poolIdentity.js';
const contexts = new WeakMap();
export function context(call) { return contexts.get(call) ?? fail('Unverified call plan'); }
export function makeCall(codec, label, b, from, to, functionName, args, value, ctx, gasLimit) {
    requireBundle(b);
    const call = encodeProtocolCall(codec, label, b.policy.chainId, from, to, functionName, args, value, gasLimit);
    contexts.set(call, Object.freeze(ctx));
    return call;
}
/** INTERNAL encoding primitive; public builders separately brand authentication. */
export function encodeProtocolCall(codec, label, chainId, from, to, functionName, args, value, gasLimit) {
    const normalized = freezeArgs(args), abi = PROTOCOL_ABIS[label];
    const data = hex(codec.encodeFunctionData(abi, functionName, normalized));
    const selector = PROTOCOL_SELECTORS[label][functionName];
    if (!selector || data.slice(0, 10) !== selector)
        fail('Codec returned wrong selector');
    const call = Object.freeze({ chainId: uint(chainId, 256, true), from: address(from), to: address(to), abi, functionName, args: normalized, data, value: uint(value), ...(gasLimit === undefined ? {} : { gasLimit: uint(gasLimit, 256, true) }) });
    return call;
}
export function deadline(b, v) { const t = uint(v, 64); if (t < b.block.timestamp)
    fail('Expired at authenticated block'); return t; }
export function recipient(b, v, candidates, native = false) {
    // A multi-candidate winner is not known yet; the contract rejects its own address at settlement.
    const r = address(v), forbidden = [b.policy.router.address, ...(candidates.length === 1 ? [candidates[0].address] : [])];
    if (native)
        forbidden.push(b.policy.nativeRouter.address, b.policy.wrappedNative.address);
    if (forbidden.includes(r))
        fail('Invalid recipient');
    return r;
}
export function gas(input) { const g = optional(input, 'gasLimit'); return g === undefined ? undefined : uint(g, 256, true); }
export function winner(call, value) { const w = address(value); return context(call).candidates.find(p => p.address === w) ?? fail('Winner not in authenticated candidates'); }
