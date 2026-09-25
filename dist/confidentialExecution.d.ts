import { PrivateTokenApprovalPlan } from './tokenApproval.js';
import { Address, Hex, ProtocolCodec } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall } from './protocolExecution.js';
export type ConfidentialInputIntent = Readonly<{
    chainId: bigint;
    caller: Address;
    target: Address;
    selector: Hex;
    plaintext: bigint;
}>;
export type CallerCiphertext = Readonly<{
    ciphertextHigh: bigint;
    ciphertextLow: bigint;
}>;
export type OfficialIT = Readonly<{
    ciphertext: CallerCiphertext;
    signature: Hex;
}>;
export type BoundConfidentialInput = Readonly<{
    intent: ConfidentialInputIntent;
    input: OfficialIT;
}>;
export interface CotiEncryptionAdapter {
    encryptAndSign(intent: ConfidentialInputIntent): Promise<unknown>;
}
export type ConfidentialQuoteInput = Readonly<{
    caller: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    candidates: readonly VerifiedPool[];
    requestId: Hex;
    deadline: bigint;
    gasLimit?: bigint;
}>;
export type ConfidentialSwapInput = Omit<ConfidentialQuoteInput, 'requestId'> & Readonly<{
    minimumOut: bigint;
    recipient: Address;
}>;
export declare function registerConfidentialIntent(intent: ConfidentialInputIntent): ConfidentialInputIntent;
export declare function requireBoundInput(bound: BoundConfidentialInput, intent: ConfidentialInputIntent): OfficialIT;
export declare function packConfidentialSwap(amountIn: bigint, minimumOut: bigint): bigint;
export declare function prepareConfidentialQuote(b: VerifiedBundle, input: ConfidentialQuoteInput): ConfidentialInputIntent;
export declare function prepareConfidentialSwap(b: VerifiedBundle, input: ConfidentialSwapInput): ConfidentialInputIntent;
export declare function snapshotCiphertext(v: unknown): CallerCiphertext;
export declare function bindConfidentialInput(intent: ConfidentialInputIntent, value: unknown): BoundConfidentialInput;
export declare function encryptConfidentialInput(intent: ConfidentialInputIntent, adapter: CotiEncryptionAdapter): Promise<BoundConfidentialInput>;
export type ConfidentialCallPlan = Readonly<{
    call: ProtocolCall;
    approval: PrivateTokenApprovalPlan | null;
    inputITs: 1;
    transactions: 1;
    approvalITs: number;
    approvalTransactions: number;
}>;
export declare function buildConfidentialCall(bound: BoundConfidentialInput, codec: ProtocolCodec, currentAllowance?: bigint): ConfidentialCallPlan;
