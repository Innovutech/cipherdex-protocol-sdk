// SPDX-License-Identifier: UNLICENSED
import { PROTOCOL_EVENT_TOPICS } from './protocolAbi.js';
import { address, hex, hash, uint, bool, field, optional, array, tuple, equal, fail, block, stable, ZERO_ADDRESS } from './protocolData.js';
import { verifyProtocolBundle, requireBundle, authenticateCandidates } from './poolIdentity.js';
import { context } from './protocolExecution.js';
const privateResults = new WeakSet();
export async function parseProtocolReceipt(call, transactionHash, adapter, codec) {
    const c = context(call);
    if (c.kind === 'public-quote' || c.kind === 'position')
        fail('Use the matching result parser');
    const { txHash, at, current, logs } = await verifyReceiptTransaction(call, transactionHash, adapter);
    const pools = await authenticateCandidates(adapter, current, c.tokenIn, c.tokenOut, c.candidates.map(p => p.address), c.kind === 'confidential-quote' ? 'quote' : 'swap');
    const privateResult = c.kind.startsWith('confidential-');
    const native = c.kind === 'native-input' || c.kind === 'native-output';
    const label = privateResult ? (current.policy.mode === 1 ? 'ConfidentialRouter' : 'ObservableRouter') : native ? 'NativeRouter' : 'PublicRouter';
    const eventName = c.kind === 'confidential-quote' ? 'ConfidentialBestQuoteResult' : c.kind === 'confidential-swap' ? 'ConfidentialBestSwapResult' : native ? 'NativeBestSwapRouted' : 'BestSwapRouted';
    const topic = PROTOCOL_EVENT_TOPICS[label][eventName];
    const matches = logs.filter(l => l.address === call.to && l.topics[0] === topic);
    if (matches.length !== 1)
        fail('Missing or ambiguous routed result');
    const log = matches[0];
    if (log.topics.length !== 4)
        fail('Malformed indexed event');
    hex(log.data, privateResult ? 64 : 128);
    const decoded = tuple(codec.decodeEventLog(call.abi, eventName, log), privateResult ? 4 : 7);
    equal(address(decoded[0]), call.from, 'event caller');
    let selected;
    if (c.kind === 'confidential-quote') {
        equal(hash(decoded[1]), c.requestId, 'request ID');
        selected = address(decoded[2]);
    }
    else {
        selected = address(decoded[1]);
        equal(address(decoded[2]), c.recipient, 'event recipient');
    }
    const pool = pools.find(p => p.address === selected) ?? fail('Event winner outside candidates');
    await stable(adapter, call.chainId, at);
    if (privateResult) {
        const ct = tuple(decoded[3], 2);
        const result = Object.freeze({ transactionHash: txHash, bundle: current, selectedPool: pool, caller: call.from, ciphertext: Object.freeze({ ciphertextHigh: uint(ct[0]), ciphertextLow: uint(ct[1]) }) });
        privateResults.add(result);
        return result;
    }
    equal(address(decoded[3], true), c.kind === 'native-input' ? ZERO_ADDRESS : c.tokenIn, 'event input asset');
    equal(address(decoded[4], true), c.kind === 'native-output' ? ZERO_ADDRESS : c.tokenOut, 'event output asset');
    equal(uint(decoded[5]), c.amountIn, 'event input');
    const amountOut = uint(decoded[6], 256, true);
    if (amountOut < c.minimumOut)
        fail('Event output below minimum');
    return Object.freeze({ transactionHash: txHash, bundle: current, selectedPool: pool, amountOut });
}
export async function verifyReceiptTransaction(call, transactionHash, adapter) {
    const c = context(call), result = await verifyMinedReceipt(c.bundle, transactionHash, adapter);
    equal(result.tx.from, call.from, 'transaction caller');
    equal(result.tx.to, call.to, 'transaction target');
    equal(result.tx.data, call.data, 'transaction calldata');
    equal(result.tx.value, call.value, 'transaction value');
    return result;
}
/** Shared mined-evidence checks only. This INTERNAL helper does not authenticate an
 * outer controller signature/calldata or any internal call. Exact top-level users
 * must use verifyReceiptTransaction; protected event confirmation is explicitly weaker.
 */
export async function verifyMinedReceipt(b, transactionHash, adapter) {
    requireBundle(b);
    const result = await verifyMinedTransaction(b.policy.chainId, b.block.number, transactionHash, adapter);
    const current = await verifyProtocolBundle(adapter, b.policy, result.at.number);
    return Object.freeze({ ...result, current });
}
/** INTERNAL mined checks; does not confer contract or operation authentication. */
export async function verifyMinedTransaction(chainId, notBeforeBlock, transactionHash, adapter) {
    const txHash = hash(transactionHash, true);
    equal(uint(await adapter.readChainId(), 256, true), chainId, 'receipt chain');
    const rawTx = await adapter.getTransaction(txHash), receipt = await adapter.getTransactionReceipt(txHash);
    const tx = Object.freeze({ chainId: uint(field(rawTx, 'chainId'), 256, true), hash: hash(field(rawTx, 'hash')),
        from: address(field(rawTx, 'from')), to: address(field(rawTx, 'to')), data: hex(field(rawTx, 'data')), value: uint(field(rawTx, 'value')),
        blockHash: hash(field(rawTx, 'blockHash'), true), blockNumber: uint(field(rawTx, 'blockNumber')) });
    equal(tx.chainId, chainId, 'transaction chain');
    equal(tx.hash, txHash, 'transaction hash');
    equal(hash(field(receipt, 'transactionHash')), txHash, 'receipt hash');
    equal(uint(field(receipt, 'status'), 8), 1n, 'successful receipt');
    const height = uint(field(receipt, 'blockNumber')), blockHash = hash(field(receipt, 'blockHash'), true);
    if (height < notBeforeBlock)
        fail('Receipt predates authentication');
    const at = block(await adapter.readBlock(height));
    equal(at.hash, blockHash, 'receipt block');
    equal(at.number, height, 'receipt height');
    equal(tx.blockHash, blockHash, 'mined transaction block');
    equal(tx.blockNumber, height, 'mined transaction height');
    const logs = array(field(receipt, 'logs'), 4096).map(l => {
        const removed = optional(l, 'removed');
        if (removed !== undefined && bool(removed))
            fail('Removed receipt log');
        return Object.freeze({ address: address(field(l, 'address')), topics: Object.freeze(array(field(l, 'topics'), 8).map(t => hex(t, 32))), data: hex(field(l, 'data')) });
    });
    await stable(adapter, chainId, at);
    return Object.freeze({ txHash, at, tx, logs: Object.freeze(logs) });
}
export async function decryptProtocolResult(result, adapter) {
    if (!privateResults.has(result))
        fail('Unverified confidential result');
    return uint(await adapter.decryptResult(Object.freeze({ chainId: result.bundle.policy.chainId, caller: result.caller, ciphertext: result.ciphertext })));
}
