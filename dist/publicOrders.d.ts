import { Address, Hex, BlockRef, ProtocolReadAdapter, ProtocolCodec } from './protocolData.js';
import { ProtocolPolicy, VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall } from './protocolExecution.js';
import { PublicTokenApprovalPlan, PublicTokenApprovalCall } from './tokenApproval.js';
import type { LPPermitIntent } from './lpPosition.js';
export declare const PUBLIC_ORDER_STATUS: Readonly<{
    NONE: 0n;
    OPEN: 1n;
    FILLED: 2n;
    CANCELLED: 3n;
}>;
export declare const PUBLIC_ORDER_SETTLEMENT: Readonly<{
    TOKEN: 0n;
    NATIVE_INPUT: 1n;
    NATIVE_OUTPUT: 2n;
}>;
/** Numeric policy bits keep historical meanings. They never identify pools. */
export declare const PUBLIC_ORDER_FEE_BITS: Readonly<{
    5: 1n;
    30: 2n;
    100: 4n;
    1: 8n;
}>;
export declare const PUBLIC_ORDER_ALL_FEES = 15n;
export type VerifiedOrderBook = Readonly<{
    kind: 'order-book';
    policy: ProtocolPolicy;
    block: BlockRef;
    trading: boolean;
    bundle?: VerifiedBundle;
}>;
export declare function requireOrderBook(b: VerifiedOrderBook, trading?: boolean): void;
/** Refund/read authentication: book runtime and stored reviewed identities only.
 * No claim that its router, factory, wrapper or recipient can currently execute. */
export declare function authenticatePublicOrderBook(a: ProtocolReadAdapter, input: ProtocolPolicy, atBlock?: bigint): Promise<VerifiedOrderBook>;
/** Trading also authenticates current factory/router bindings and the 16-pool cap. */
export declare function authenticatePublicOrderTrading(a: ProtocolReadAdapter, p: ProtocolPolicy, atBlock?: bigint): Promise<VerifiedOrderBook>;
export declare function publicOrderFeePolicy(v: unknown): bigint;
export declare function orderRecipient(b: VerifiedOrderBook, v: unknown): Address;
export type PublicOrderTerms = Readonly<{
    recipient: Address;
    expiry: bigint;
    feeTierPolicy: bigint;
    allowPartialFills: boolean;
    minimumFillAmount: bigint;
}>;
export type PublicOrderCreateParams = PublicOrderTerms & Readonly<{
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    minAmountOut: bigint;
    settlementMode: bigint;
}>;
export type PublicOrderAmendment = PublicOrderTerms & Readonly<{
    minAmountOutForRemaining: bigint;
}>;
export type PublicOrder = Readonly<{
    id: bigint;
    maker: Address;
    recipient: Address;
    tokenIn: Address;
    tokenOut: Address;
    remainingAmountIn: bigint;
    priceNumerator: bigint;
    priceDenominator: bigint;
    minimumFillAmount: bigint;
    remainingExecutionBounty: bigint;
    expiry: bigint;
    revision: bigint;
    feeTierPolicy: bigint;
    allowPartialFills: boolean;
    settlementMode: bigint;
}>;
export type PublicOrderSnapshot = Readonly<{
    book: VerifiedOrderBook;
    orderId: bigint;
    status: bigint;
    order: PublicOrder | null;
}>;
export declare function readPublicOrder(a: ProtocolReadAdapter, b: VerifiedOrderBook, id: bigint): Promise<PublicOrderSnapshot>;
export declare function readPublicOrderMinimumOutput(a: ProtocolReadAdapter, b: VerifiedOrderBook, s: PublicOrderSnapshot, amount: bigint): Promise<bigint>;
export declare function readPublicOrderAccounting(a: ProtocolReadAdapter, b: VerifiedOrderBook, caller: Address, tokens?: readonly Address[]): Promise<Readonly<{
    book: Readonly<{
        kind: "order-book";
        policy: ProtocolPolicy;
        block: BlockRef;
        trading: boolean;
        bundle?: VerifiedBundle;
    }>;
    caller: `0x${string}`;
    nextOrderId: bigint;
    openBounties: bigint;
    claimableBounties: bigint;
    claimableProceeds: bigint;
    callerBounty: bigint;
    callerProceeds: bigint;
    escrow: readonly Readonly<{
        token: `0x${string}`;
        amount: bigint;
    }>[];
}>>;
export type OrderCallContext = Readonly<{
    book: VerifiedOrderBook;
    operation: 'create' | 'amend' | 'topup' | 'fill' | 'cancel' | 'claim-bounty' | 'claim-proceeds' | 'sweep-token-surplus' | 'sweep-native-surplus';
    token?: Address;
    order?: PublicOrder;
    params?: PublicOrderCreateParams | PublicOrderAmendment;
    candidates?: readonly VerifiedPool[];
    amount?: bigint;
    recipient?: Address;
    bounty?: bigint;
}>;
export declare function orderCallContext(call: ProtocolCall): OrderCallContext;
export type PublicOrderPlan = Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: 'approval';
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: 'operation';
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare function buildCreatePublicOrder(a: ProtocolReadAdapter, b: VerifiedOrderBook, input: Readonly<{
    caller: Address;
    params: PublicOrderCreateParams;
    executionBounty: bigint;
    gasLimit?: bigint;
}>, codec: ProtocolCodec): Promise<PublicOrderPlan>;
export declare function buildAmendPublicOrder(b: VerifiedOrderBook, s: PublicOrderSnapshot, input: Readonly<{
    caller: Address;
    amendment: PublicOrderAmendment;
    gasLimit?: bigint;
}>, codec: ProtocolCodec): ProtocolCall;
export declare function buildIncreasePublicOrderBounty(b: VerifiedOrderBook, s: PublicOrderSnapshot, input: Readonly<{
    caller: Address;
    amount: bigint;
    gasLimit?: bigint;
}>, codec: ProtocolCodec): ProtocolCall;
export declare function buildCancelPublicOrder(b: VerifiedOrderBook, s: PublicOrderSnapshot, input: Readonly<{
    caller: Address;
    gasLimit?: bigint;
}>, codec: ProtocolCodec): ProtocolCall;
export declare function canFillPublicOrder(a: ProtocolReadAdapter, b: VerifiedOrderBook, s: PublicOrderSnapshot, amount: bigint, list: readonly VerifiedPool[]): Promise<Readonly<{
    book: Readonly<{
        kind: "order-book";
        policy: ProtocolPolicy;
        block: BlockRef;
        trading: boolean;
        bundle?: VerifiedBundle;
    }>;
    orderId: bigint;
    amountIn: bigint;
    canFill: boolean;
    selectedPool: Readonly<{
        address: Address;
        key: Hex;
        runtimeCodehash: Hex;
        lpToken: Address;
        lpRuntimeCodehash: Hex;
        token0: Address;
        token1: Address;
        decimals0: bigint;
        decimals1: bigint;
        feeBps: bigint;
        mode: import("./protocolData.js").Mode;
        kind: "default-standard" | "additional-standard" | "protected";
        standardInstanceId: Hex;
        protectedToken: Address;
        initialized: boolean;
        protectedCompleted: boolean;
        reservingLaunchFactory: Address;
        lifecycle: "initialized" | "empty-standard" | "bonding-reservation" | "completed-empty";
    }> | null;
    selectedFeeBps: bigint;
    expectedAmountOut: bigint;
    minimumAmountOut: bigint;
}>>;
export declare function buildFillPublicOrder(b: VerifiedOrderBook, s: PublicOrderSnapshot, input: Readonly<{
    caller: Address;
    amountIn: bigint;
    candidates: readonly VerifiedPool[];
    gasLimit?: bigint;
}>, codec: ProtocolCodec): ProtocolCall;
export declare const buildClaimPublicOrderNativeBounty: (a: ProtocolReadAdapter, b: VerifiedOrderBook, input: Readonly<{
    caller: Address;
    recipient: Address;
    gasLimit?: bigint;
}>, codec: ProtocolCodec) => Promise<Readonly<{
    chainId: bigint;
    from: Address;
    to: Address;
    abi: readonly string[];
    functionName: string;
    args: readonly unknown[];
    data: Hex;
    value: bigint;
    gasLimit?: bigint;
}>>;
export declare const buildClaimPublicOrderNativeProceeds: (a: ProtocolReadAdapter, b: VerifiedOrderBook, input: Readonly<{
    caller: Address;
    recipient: Address;
    gasLimit?: bigint;
}>, codec: ProtocolCodec) => Promise<Readonly<{
    chainId: bigint;
    from: Address;
    to: Address;
    abi: readonly string[];
    functionName: string;
    args: readonly unknown[];
    data: Hex;
    value: bigint;
    gasLimit?: bigint;
}>>;
export type PublicOrderPermitIntent = LPPermitIntent;
export type SignedPublicOrderPermit = Readonly<{
    intent: PublicOrderPermitIntent;
    v: bigint;
    r: Hex;
    s: Hex;
}>;
export interface PublicOrderPermitDomainAdapter {
    hashDomain(domain: PublicOrderPermitIntent['domain']): Hex;
}
/** Explicit token domain verified against DOMAIN_SEPARATOR, never inferred from
 * LP names or mandatory EIP-5267. Unsupported/reverting domains fail closed. */
export declare function preparePublicOrderPermit(a: ProtocolReadAdapter, p: PublicOrderPlan, input: Readonly<{
    name: string;
    version: string;
    permitDeadline: bigint;
}>, domainAdapter: PublicOrderPermitDomainAdapter): Promise<PublicOrderPermitIntent>;
/** Context/shape only; ECDSA and sufficient-allowance fallback remain on chain. */
export declare function bindPublicOrderPermit(intent: PublicOrderPermitIntent, input: Readonly<{
    v: bigint;
    r: Hex;
    s: Hex;
}>): SignedPublicOrderPermit;
export declare function buildCreatePublicOrderWithPermit(p: PublicOrderPlan, s: SignedPublicOrderPermit, codec: ProtocolCodec): PublicOrderPlan;
/** Permissionless surplus triggers. The fixed destination and liability exclusions
 * are enforced by the book, not selected by the caller. No route is required. */
export declare function buildSweepPublicOrderTokenSurplus(a: ProtocolReadAdapter, b: VerifiedOrderBook, input: Readonly<{
    caller: Address;
    token: Address;
    gasLimit?: bigint;
}>, codec: ProtocolCodec): Promise<ProtocolCall>;
export declare function buildSweepPublicOrderNativeSurplus(b: VerifiedOrderBook, input: Readonly<{
    caller: Address;
    gasLimit?: bigint;
}>, codec: ProtocolCodec): ProtocolCall;
