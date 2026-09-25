import { Address, ProtocolCodec } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall } from './protocolExecution.js';
import { StandardPoolPrediction } from './poolCreation.js';
import { SignedLPPermit } from './lpPosition.js';
import { PublicTokenApprovalPlan, PublicTokenApprovalCall } from './tokenApproval.js';
export type DepositParams = Readonly<{
    amount0: bigint;
    amount1: bigint;
    minimumShares: bigint;
    minimumPriceX18: bigint;
    maximumPriceX18: bigint;
    recipient: Address;
    deadline: bigint;
}>;
export type RemoveLiquidityParams = Readonly<{
    shareAmount: bigint;
    minimumAmount0: bigint;
    minimumAmount1: bigint;
    recipient: Address;
    deadline: bigint;
}>;
export type NativeDepositParams = Readonly<{
    tokenAmount: bigint;
    minimumShares: bigint;
    minimumPriceX18: bigint;
    maximumPriceX18: bigint;
    recipient: Address;
    deadline: bigint;
}>;
export type NativeRemoveParams = Readonly<{
    shareAmount: bigint;
    minimumTokenAmount: bigint;
    minimumNativeAmount: bigint;
    recipient: Address;
    deadline: bigint;
}>;
export type PublicDepositInput = Readonly<{
    caller: Address;
    params: DepositParams;
    currentAllowance0: bigint;
    currentAllowance1: bigint;
    gasLimit?: bigint;
}>;
export type NativeDepositInput = Readonly<{
    caller: Address;
    params: NativeDepositParams;
    value: bigint;
    currentTokenAllowance: bigint;
    gasLimit?: bigint;
}>;
export type PublicRemovalInput = Readonly<{
    caller: Address;
    params: RemoveLiquidityParams;
    currentLPAllowance: bigint;
    gasLimit?: bigint;
}>;
export type NativeRemovalInput = Readonly<{
    caller: Address;
    params: NativeRemoveParams;
    currentLPAllowance: bigint;
    gasLimit?: bigint;
}>;
export type PublicLiquidityPlan = Readonly<{
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
export declare const buildInitializePool: (b: VerifiedBundle, p: VerifiedPool, i: PublicDepositInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildCreateAndInitializeStandard: (b: VerifiedBundle, p: StandardPoolPrediction, i: PublicDepositInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildCreateAndInitializeStandardInstance: (b: VerifiedBundle, p: StandardPoolPrediction, i: PublicDepositInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildAddLiquidity: (b: VerifiedBundle, p: VerifiedPool, i: PublicDepositInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildRemoveLiquidity: (b: VerifiedBundle, p: VerifiedPool, i: PublicRemovalInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildRemoveLiquidityWithPermit: (b: VerifiedBundle, p: VerifiedPool, i: PublicRemovalInput, permit: SignedLPPermit, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildInitializePoolNative: (b: VerifiedBundle, p: VerifiedPool, i: NativeDepositInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildCreateAndInitializeStandardNative: (b: VerifiedBundle, p: StandardPoolPrediction, i: NativeDepositInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildCreateAndInitializeStandardInstanceNative: (b: VerifiedBundle, p: StandardPoolPrediction, i: NativeDepositInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildAddLiquidityNative: (b: VerifiedBundle, p: VerifiedPool, i: NativeDepositInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildRemoveLiquidityNative: (b: VerifiedBundle, p: VerifiedPool, i: NativeRemovalInput, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
export declare const buildRemoveLiquidityNativeWithPermit: (b: VerifiedBundle, p: VerifiedPool, i: NativeRemovalInput, permit: SignedLPPermit, c: ProtocolCodec) => Readonly<{
    call: ProtocolCall;
    approvals: readonly PublicTokenApprovalPlan[];
    steps: readonly (Readonly<{
        kind: "approval";
        call: PublicTokenApprovalCall;
    }> | Readonly<{
        kind: "operation";
        call: ProtocolCall;
    }>)[];
    transactions: 1;
    approvalTransactions: number;
}>;
