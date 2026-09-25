import { Address, Hex, ProtocolCodec } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall } from './protocolExecution.js';
import { ProtocolReceiptAdapter, CotiDecryptionAdapter } from './protocolResults.js';
import { CallerCiphertext } from './confidentialExecution.js';
type ResultBase = Readonly<{
    transactionHash: Hex;
    bundle: VerifiedBundle;
    pool: VerifiedPool;
    caller: Address;
}>;
type Outcome = Readonly<{
    kind: 'creation';
    newCreationEvent: boolean;
}> | Readonly<{
    kind: 'public-deposit';
    amount0: bigint;
    amount1: bigint;
    mintedShares: bigint;
}> | Readonly<{
    kind: 'native-deposit';
    tokenUsed: bigint;
    nativeUsed: bigint;
    mintedShares: bigint;
}> | Readonly<{
    kind: 'public-removal';
    amount0: bigint;
    amount1: bigint;
    shareAmount: bigint;
}> | Readonly<{
    kind: 'native-removal';
    tokenAmount: bigint;
    nativeAmount: bigint;
    shareAmount: bigint;
}> | Readonly<{
    kind: 'private-success';
    amountsAvailable: false;
}> | Readonly<{
    kind: 'public-claim';
    side: bigint;
    amount: bigint;
}> | Readonly<{
    kind: 'ciphertexts';
    ciphertexts: Readonly<Record<string, CallerCiphertext>>;
    requestId?: Hex;
    side?: bigint;
}> | Readonly<{
    kind: 'lock';
    lockId: Hex;
    unlockTime: bigint;
    permanent: boolean;
    shareAmount?: bigint;
}> | Readonly<{
    kind: 'unlock';
    lockId: Hex;
}>;
export type VerifiedLiquidityResult = ResultBase & Outcome;
/** Strict direct top-level execution only. Receipts do not contain Solidity return data. */
export declare function parseLiquidityReceipt(call: ProtocolCall, transactionHash: Hex, a: ProtocolReceiptAdapter, codec: ProtocolCodec): Promise<VerifiedLiquidityResult>;
export declare function decryptLiquidityResult(result: VerifiedLiquidityResult, fieldName: string, adapter: CotiDecryptionAdapter): Promise<bigint>;
export {};
