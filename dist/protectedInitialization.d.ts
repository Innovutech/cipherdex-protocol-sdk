import { Address, Hex, ProtocolReadAdapter, ProtocolCodec } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall } from './protocolExecution.js';
import { BoundConfidentialInput } from './confidentialExecution.js';
import { LiquidityInputIntent } from './confidentialLiquidity.js';
import { PublicTokenApprovalPlan, PrivateTokenApprovalPlan } from './tokenApproval.js';
export type ProtectedIdentityInput = Readonly<{
    tokenA: Address;
    tokenB: Address;
    feeBps: bigint;
    protectedToken: Address;
}>;
/** A prediction is not an issued pool, an authority grant, or a reservation. */
export type ProtectedPoolPrediction = ProtectedIdentityInput & Readonly<{
    predictedAddress: Address;
    key: Hex;
    token0: Address;
    token1: Address;
    existingPool?: VerifiedPool;
}>;
export type ProtectedReservationPreflight = Readonly<{
    bundle: VerifiedBundle;
    prediction: ProtectedPoolPrediction;
    launchFactory: Address;
    approvedRuntimeCodehash: Hex;
}>;
export type ProtectedGraduationPreflight = Readonly<{
    bundle: VerifiedBundle;
    prediction: ProtectedPoolPrediction;
    pool: VerifiedPool;
    effectiveCaller: Address;
    callerKind: 'eoa' | 'contract';
    authorization: 'stored-factory' | 'authorized-initializer';
    approvedRuntimeCodehash: Hex;
}>;
export declare function protectedIdentityArgs(p: ProtectedPoolPrediction): readonly unknown[];
export declare function predictProtectedPool(a: ProtocolReadAdapter, b: VerifiedBundle, input: ProtectedIdentityInput): Promise<ProtectedPoolPrediction>;
export declare function preflightProtectedReservation(a: ProtocolReadAdapter, b: VerifiedBundle, p: ProtectedPoolPrediction, launchFactory: Address): Promise<ProtectedReservationPreflight>;
export declare function preflightProtectedGraduation(a: ProtocolReadAdapter, b: VerifiedBundle, p: ProtectedPoolPrediction, effectiveCaller: Address): Promise<ProtectedGraduationPreflight>;
/** An INNER call, never an EOA transaction pretending to originate from a contract.
 * No partner/controller method or generic executor is assumed.
 */
export type ProtectedInnerCall = Readonly<{
    kind: 'contract-inner-call';
    chainId: bigint;
    requiredEffectiveCaller: Address;
    to: Address;
    abi: readonly string[];
    functionName: string;
    args: readonly unknown[];
    data: Hex;
    value: 0n;
}>;
export type ProtectedGraduationTerms = Readonly<{
    lpRecipient: Address;
    disposition: bigint;
    unlockTime: bigint;
    deadline: bigint;
    initialPriceReferenceX18?: bigint;
}>;
type Terms = Readonly<{
    lpRecipient: Address;
    disposition: bigint;
    unlockTime: bigint;
    deadline: bigint;
    initialPriceReferenceX18?: bigint;
}>;
export type ProtectedEventContext = Readonly<{
    bundle: VerifiedBundle;
    prediction: ProtectedPoolPrediction;
    launchFactory: Address;
    effectiveCaller: Address;
    event: 'ProtectedPoolReserved' | 'ProtectedPoolCreated' | 'ProtectedPoolGraduated';
    terms?: Terms;
    amount0?: bigint;
    amount1?: bigint;
    minimumShares?: bigint;
}>;
export declare function protectedEventContext(plan: object): ProtectedEventContext;
export declare function buildProtectedReservation(p: ProtectedReservationPreflight, codec: ProtocolCodec): ProtectedInnerCall;
export type PublicProtectedGraduationInput = ProtectedGraduationTerms & Readonly<{
    amountA: bigint;
    amountB: bigint;
    minimumShares: bigint;
    minimumPriceX18: bigint;
    maximumPriceX18: bigint;
    currentAllowanceA: bigint;
    currentAllowanceB: bigint;
    gasLimit?: bigint;
}>;
export type PublicProtectedGraduationPlan = Readonly<{
    execution: 'direct-eoa' | 'contract-inner';
    call: ProtocolCall | ProtectedInnerCall;
    approvals: readonly PublicTokenApprovalPlan[];
    approvalCalls: number;
    operationCalls: 1;
    steps: readonly Readonly<{
        kind: 'approval';
        call: PublicTokenApprovalPlan['calls'][number];
    } | {
        kind: 'graduation';
        call: ProtocolCall | ProtectedInnerCall;
    }>[];
}>;
export declare function buildPublicProtectedGraduation(p: ProtectedGraduationPreflight, input: PublicProtectedGraduationInput, codec: ProtocolCodec): PublicProtectedGraduationPlan;
export type PrivateProtectedGraduationInput = ProtectedGraduationTerms & Readonly<{
    amount0: bigint;
    amount1: bigint;
    currentAllowance0: bigint;
    currentAllowance1: bigint;
    gasLimit?: bigint;
}>;
export type ConfidentialProtectedPreparation = Readonly<{
    inputs: readonly LiquidityInputIntent[];
    approvals: readonly PrivateTokenApprovalPlan[];
    approvalInputs: readonly LiquidityInputIntent[];
    inputITs: 1;
    transactions: 1;
    approvalITs: number;
    approvalTransactions: number;
}>;
export declare function prepareConfidentialProtectedGraduation(p: ProtectedGraduationPreflight, input: PrivateProtectedGraduationInput): ConfidentialProtectedPreparation;
export declare function buildConfidentialProtectedGraduation(preparation: ConfidentialProtectedPreparation, bound: BoundConfidentialInput, codec: ProtocolCodec): ConfidentialProtectedPreparation & Readonly<{
    call: ProtocolCall;
}>;
/** Every reset/approval is separately signed for its token and INITIALIZER spender. */
export declare function buildProtectedTokenApproval(preparation: ConfidentialProtectedPreparation, index: number, bound: BoundConfidentialInput, codec: ProtocolCodec): ProtocolCall;
export type ProtectedGTGuidance = Readonly<{
    kind: 'transaction-scoped-gt-guidance';
    chainId: bigint;
    requiredEffectiveCaller: Address;
    to: Address;
    abi: readonly string[];
    functionName: 'initializeProtectedGT';
    selector: Hex;
    params: readonly unknown[];
    token0: Address;
    token1: Address;
    spender: Address;
    amountOrder: 'canonical-token0-token1';
    steps: readonly string[];
}>;
/** No GT values, EOA calldata or partner executor are created here. The contract obtains
 * its own transaction-scoped GT, approves, graduates and clears within its outer transaction.
 */
export declare function prepareProtectedGTGraduation(p: ProtectedGraduationPreflight, input: ProtectedGraduationTerms): ProtectedGTGuidance;
export {};
