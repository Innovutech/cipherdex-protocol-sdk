import { Address, Hex, ProtocolCodec } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall } from './protocolExecution.js';
import { ConfidentialInputIntent, BoundConfidentialInput } from './confidentialExecution.js';
import { PrivateTokenApprovalPlan } from './tokenApproval.js';
import { OwnerCallInput } from './lpPosition.js';
export type LiquidityInputIntent = ConfidentialInputIntent & Readonly<{
    fieldName: string;
    fieldIndex: number;
    publicArguments: readonly unknown[];
}>;
export type ConfidentialLiquidityPreparation = Readonly<{
    inputs: readonly LiquidityInputIntent[];
    approvals: readonly PrivateTokenApprovalPlan[];
    approvalInputs: readonly LiquidityInputIntent[];
    inputITs: number;
    transactions: 1;
    approvalITs: number;
    approvalTransactions: number;
}>;
export declare function packLiquidityPair(amount0: bigint, amount1: bigint): bigint;
export type PrivateInitializationInput = OwnerCallInput & Readonly<{
    amount0: bigint;
    amount1: bigint;
    recipient: Address;
    deadline: bigint;
    initialPriceReferenceX18?: bigint;
    currentAllowance0: bigint;
    currentAllowance1: bigint;
}>;
export declare function prepareConfidentialInitialization(b: VerifiedBundle, p: VerifiedPool, input: PrivateInitializationInput): ConfidentialLiquidityPreparation;
export type PrivateAdditionInput = OwnerCallInput & Readonly<{
    amount0Maximum: bigint;
    amount1Maximum: bigint;
    minimumShares: bigint;
    minimumPriceX18: bigint;
    maximumPriceX18: bigint;
    recipient: Address;
    deadline: bigint;
    currentAllowance0: bigint;
    currentAllowance1: bigint;
}>;
export declare function prepareConfidentialAddition(b: VerifiedBundle, p: VerifiedPool, input: PrivateAdditionInput): ConfidentialLiquidityPreparation;
export type PrivateRemovalInput = OwnerCallInput & Readonly<{
    shareAmount: bigint;
    minimumAmount0: bigint;
    minimumAmount1: bigint;
    recipient: Address;
    deadline: bigint;
}>;
export declare function prepareConfidentialRemoval(b: VerifiedBundle, p: VerifiedPool, input: PrivateRemovalInput): ConfidentialLiquidityPreparation;
export declare function prepareConfidentialLock(b: VerifiedBundle, p: VerifiedPool, input: OwnerCallInput & Readonly<{
    shareAmount: bigint;
    unlockTime: bigint;
    permanent: boolean;
    deadline: bigint;
}>): ConfidentialLiquidityPreparation;
export declare function prepareAddLiquidityQuote(b: VerifiedBundle, p: VerifiedPool, input: OwnerCallInput & Readonly<{
    specifiedAmount: bigint;
    token0Specified: boolean;
    requestId: Hex;
    deadline: bigint;
}>): ConfidentialLiquidityPreparation;
export declare function prepareRemoveLiquidityQuote(b: VerifiedBundle, p: VerifiedPool, input: OwnerCallInput & Readonly<{
    shareAmount: bigint;
    requestId: Hex;
    deadline: bigint;
}>): ConfidentialLiquidityPreparation;
export type ConfidentialLiquidityCallPlan = ConfidentialLiquidityPreparation & Readonly<{
    call: ProtocolCall;
}>;
export declare function buildConfidentialLiquidity(preparation: ConfidentialLiquidityPreparation, bound: readonly BoundConfidentialInput[], codec: ProtocolCodec): ConfidentialLiquidityCallPlan;
/** Each approval/reset is a separate token-bound IT transaction, never a pool input. */
export declare function buildConfidentialLiquidityApproval(preparation: ConfidentialLiquidityPreparation, index: number, bound: BoundConfidentialInput, codec: ProtocolCodec): ProtocolCall;
