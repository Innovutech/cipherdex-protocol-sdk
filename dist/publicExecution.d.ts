import { EVM_NATIVE_ASSET_ADDRESS } from './nativeAsset.js';
import { PublicTokenApprovalPlan } from './tokenApproval.js';
import { Address, ProtocolCodec, ProtocolReadAdapter } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall, SwapInput } from './protocolExecution.js';
export type PublicQuoteInput = Readonly<{
    caller: Address;
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    candidates: readonly VerifiedPool[];
}>;
export declare function buildPublicQuote(b: VerifiedBundle, input: PublicQuoteInput, codec: ProtocolCodec): ProtocolCall;
export declare function parsePublicQuote(call: ProtocolCall, decoded: unknown): Readonly<{
    selectedPool: VerifiedPool;
    amountOut: bigint;
}>;
export declare function readPublicQuote(call: ProtocolCall, adapter: ProtocolReadAdapter): Promise<Readonly<{
    selectedPool: VerifiedPool;
    amountOut: bigint;
}>>;
export type PublicSwapInput = Omit<SwapInput, 'tokenIn' | 'tokenOut'> & Readonly<{
    tokenIn: string;
    tokenOut: string;
}>;
export type PublicSwapPlan = Readonly<{
    call: ProtocolCall;
    approval: PublicTokenApprovalPlan | null;
    swapTransactions: 1;
    approvalTransactions: number;
}>;
export declare function buildPublicSwap(b: VerifiedBundle, input: PublicSwapInput, codec: ProtocolCodec): PublicSwapPlan;
export { EVM_NATIVE_ASSET_ADDRESS };
