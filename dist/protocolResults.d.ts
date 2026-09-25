import { ProtocolReadAdapter, ProtocolCodec, Address, Hex } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall } from './protocolExecution.js';
import { CallerCiphertext } from './confidentialExecution.js';
export interface ProtocolReceiptAdapter extends ProtocolReadAdapter {
    getTransaction(hash: Hex): Promise<unknown>;
    getTransactionReceipt(hash: Hex): Promise<unknown>;
}
export interface CotiDecryptionAdapter {
    decryptResult(input: Readonly<{
        chainId: bigint;
        caller: Address;
        ciphertext: CallerCiphertext;
    }>): Promise<unknown>;
}
export type VerifiedPublicResult = Readonly<{
    transactionHash: Hex;
    bundle: VerifiedBundle;
    selectedPool: VerifiedPool;
    amountOut: bigint;
}>;
export type VerifiedConfidentialResult = Readonly<{
    transactionHash: Hex;
    bundle: VerifiedBundle;
    selectedPool: VerifiedPool;
    caller: Address;
    ciphertext: CallerCiphertext;
}>;
export declare function parseProtocolReceipt(call: ProtocolCall, transactionHash: Hex, adapter: ProtocolReceiptAdapter, codec: ProtocolCodec): Promise<VerifiedPublicResult | VerifiedConfidentialResult>;
export declare function verifyReceiptTransaction(call: ProtocolCall, transactionHash: Hex, adapter: ProtocolReceiptAdapter): Promise<Readonly<{
    current: Readonly<{
        policy: import("./poolIdentity.js").ProtocolPolicy;
        block: import("./protocolData.js").BlockRef;
        quoteCap: 16 | 8;
        swapCap: 16 | 2;
    }>;
    txHash: `0x${string}`;
    at: Readonly<{
        number: bigint;
        hash: Hex;
        timestamp: bigint;
    }>;
    tx: Readonly<{
        chainId: bigint;
        hash: `0x${string}`;
        from: `0x${string}`;
        to: `0x${string}`;
        data: `0x${string}`;
        value: bigint;
        blockHash: `0x${string}`;
        blockNumber: bigint;
    }>;
    logs: readonly Readonly<{
        address: `0x${string}`;
        topics: readonly `0x${string}`[];
        data: `0x${string}`;
    }>[];
}>>;
/** Shared mined-evidence checks only. This INTERNAL helper does not authenticate an
 * outer controller signature/calldata or any internal call. Exact top-level users
 * must use verifyReceiptTransaction; protected event confirmation is explicitly weaker.
 */
export declare function verifyMinedReceipt(b: VerifiedBundle, transactionHash: Hex, adapter: ProtocolReceiptAdapter): Promise<Readonly<{
    current: Readonly<{
        policy: import("./poolIdentity.js").ProtocolPolicy;
        block: import("./protocolData.js").BlockRef;
        quoteCap: 16 | 8;
        swapCap: 16 | 2;
    }>;
    txHash: `0x${string}`;
    at: Readonly<{
        number: bigint;
        hash: Hex;
        timestamp: bigint;
    }>;
    tx: Readonly<{
        chainId: bigint;
        hash: `0x${string}`;
        from: `0x${string}`;
        to: `0x${string}`;
        data: `0x${string}`;
        value: bigint;
        blockHash: `0x${string}`;
        blockNumber: bigint;
    }>;
    logs: readonly Readonly<{
        address: `0x${string}`;
        topics: readonly `0x${string}`[];
        data: `0x${string}`;
    }>[];
}>>;
/** INTERNAL mined checks; does not confer contract or operation authentication. */
export declare function verifyMinedTransaction(chainId: bigint, notBeforeBlock: bigint, transactionHash: Hex, adapter: ProtocolReceiptAdapter): Promise<Readonly<{
    txHash: `0x${string}`;
    at: Readonly<{
        number: bigint;
        hash: Hex;
        timestamp: bigint;
    }>;
    tx: Readonly<{
        chainId: bigint;
        hash: `0x${string}`;
        from: `0x${string}`;
        to: `0x${string}`;
        data: `0x${string}`;
        value: bigint;
        blockHash: `0x${string}`;
        blockNumber: bigint;
    }>;
    logs: readonly Readonly<{
        address: `0x${string}`;
        topics: readonly `0x${string}`[];
        data: `0x${string}`;
    }>[];
}>>;
export declare function decryptProtocolResult(result: VerifiedConfidentialResult, adapter: CotiDecryptionAdapter): Promise<bigint>;
