import { Address, Hex, ProtocolCodec } from './protocolData.js';
import { ProtocolCall } from './protocolExecution.js';
import { ProtocolReceiptAdapter } from './protocolResults.js';
import { VerifiedPool } from './poolIdentity.js';
import { VerifiedOrderBook, PublicOrderSnapshot, PublicOrderCreateParams, PublicOrderAmendment } from './publicOrders.js';
export type NativeOrderDelivery = Readonly<{
    beneficiary: Address;
    amount: bigint;
    disposition: 'zero' | 'paid' | 'credited';
}>;
export type PublicOrderFacts = Readonly<{
    operation: 'sweep-token-surplus';
    token: Address;
    beneficiary: Address;
    amount: bigint;
}> | Readonly<{
    operation: 'sweep-native-surplus';
    beneficiary: Address;
    amount: bigint;
}> | Readonly<{
    operation: 'create';
    orderId: bigint;
    maker: Address;
    params: PublicOrderCreateParams;
    executionBounty: bigint;
}> | Readonly<{
    operation: 'amend';
    orderId: bigint;
    maker: Address;
    revision: bigint;
    amendment: PublicOrderAmendment;
}> | Readonly<{
    operation: 'topup';
    orderId: bigint;
    maker: Address;
    amount: bigint;
    remainingExecutionBounty: bigint;
}> | Readonly<{
    operation: 'fill';
    orderId: bigint;
    maker: Address;
    filler: Address;
    recipient: Address;
    selectedPool: VerifiedPool;
    selectedFeeBps: bigint;
    amountIn: bigint;
    amountOut: bigint;
    minimumAmountOut: bigint;
    remainingAmountIn: bigint;
    executionBounty: bigint;
    settlementMode: bigint;
}> | Readonly<{
    operation: 'cancel';
    orderId: bigint;
    maker: Address;
    returnedAmountIn: bigint;
    returnedExecutionBounty: bigint;
    settlementMode: bigint;
}> | Readonly<{
    operation: 'claim-bounty' | 'claim-proceeds';
    beneficiary: Address;
    recipient: Address;
    amount: bigint;
}>;
export type VerifiedPublicOrderResult = Readonly<{
    transactionHash: Hex;
    book: VerifiedOrderBook;
    facts: PublicOrderFacts;
    nativeBounty?: NativeOrderDelivery;
    nativeProceeds?: NativeOrderDelivery;
    endOfReceiptBlock?: PublicOrderSnapshot;
    endOfReceiptBlockSurplusBeneficiary?: Address;
}>;
/** Strict direct top-level evidence only. A receipt is not return data or proof
 * of an outer smart-wallet/controller call. End-of-block state is a separate
 * snapshot: later transactions in that block may amend/fill/cancel the order. */
export declare function parsePublicOrderReceipt(call: ProtocolCall, transactionHash: Hex, a: ProtocolReceiptAdapter, codec: ProtocolCodec): Promise<VerifiedPublicOrderResult>;
