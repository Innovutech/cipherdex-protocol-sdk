import { Address, Hex, ProtocolReadAdapter, ProtocolCodec } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall, LiquidityContext } from './protocolExecution.js';
export declare function requireLiquidityIntent(b: VerifiedBundle, p: VerifiedPool, initialize: boolean): void;
export declare function poolRecipient(p: VerifiedPool, value: unknown, forbidden?: readonly Address[]): Address;
export declare function lockTerms(b: VerifiedBundle, input: unknown): Readonly<{
    unlockTime: bigint;
    permanent: boolean;
    deadline: bigint;
}>;
export declare function positionCall(b: VerifiedBundle, p: VerifiedPool, caller: Address, name: string, args: readonly unknown[], codec: ProtocolCodec, info: Omit<LiquidityContext, 'poolAddress' | 'key' | 'label'>, options?: Readonly<{
    recipient?: Address;
    gasLimit?: bigint;
    lp?: boolean;
}>): ProtocolCall;
export type OwnerCallInput = Readonly<{
    caller: Address;
    gasLimit?: bigint;
}>;
export declare function buildClaimLPFees(b: VerifiedBundle, p: VerifiedPool, input: OwnerCallInput & Readonly<{
    side: bigint;
    recipient: Address;
}>, codec: ProtocolCodec): ProtocolCall;
export declare function buildPublicLockShares(b: VerifiedBundle, p: VerifiedPool, input: OwnerCallInput & Readonly<{
    shareAmount: bigint;
    unlockTime: bigint;
    permanent: boolean;
    deadline: bigint;
}>, codec: ProtocolCodec): ProtocolCall;
export declare function buildUnlockShares(b: VerifiedBundle, p: VerifiedPool, input: OwnerCallInput & Readonly<{
    lockId: Hex;
}>, codec: ProtocolCodec): ProtocolCall;
export declare function buildRequestMyPosition(b: VerifiedBundle, p: VerifiedPool, input: OwnerCallInput & Readonly<{
    requestId: Hex;
    deadline: bigint;
}>, codec: ProtocolCodec): ProtocolCall;
export declare function buildRequestMyAccounting(b: VerifiedBundle, p: VerifiedPool, input: OwnerCallInput, codec: ProtocolCodec): ProtocolCall;
export type PublicLPPosition = Readonly<{
    pool: VerifiedPool;
    owner: Address;
    shares: bigint;
    totalShares: bigint;
    lockedPrincipal: bigint;
    previewClaim0: bigint;
    previewClaim1: bigint;
}>;
export declare function readPublicLPPosition(a: ProtocolReadAdapter, b: VerifiedBundle, p: VerifiedPool, owner: Address): Promise<PublicLPPosition>;
export type LPLockMetadata = Readonly<{
    lockId: Hex;
    owner: Address;
    unlockTime: bigint;
    permanent: boolean;
    active: boolean;
    amount?: bigint;
}>;
export declare function readLPLock(a: ProtocolReadAdapter, b: VerifiedBundle, p: VerifiedPool, lockId: Hex): Promise<LPLockMetadata>;
export type LPPermitIntent = Readonly<{
    domain: Readonly<{
        name: string;
        version: string;
        chainId: bigint;
        verifyingContract: Address;
    }>;
    types: Readonly<{
        Permit: readonly Readonly<{
            name: string;
            type: string;
        }>[];
    }>;
    message: Readonly<{
        owner: Address;
        spender: Address;
        value: bigint;
        nonce: bigint;
        deadline: bigint;
    }>;
    domainSeparator: Hex;
}>;
export type SignedLPPermit = Readonly<{
    intent: LPPermitIntent;
    v: bigint;
    r: Hex;
    s: Hex;
}>;
export declare function prepareLPPermit(a: ProtocolReadAdapter, b: VerifiedBundle, p: VerifiedPool, input: Readonly<{
    caller: Address;
    shareAmount: bigint;
    permitDeadline: bigint;
    native?: boolean;
}>): Promise<LPPermitIntent>;
/** The reviewed wallet signs the exact intent. The SDK checks context/shape, not ECDSA. */
export declare function bindLPPermit(intent: LPPermitIntent, signature: Readonly<{
    v: bigint;
    r: Hex;
    s: Hex;
}>): SignedLPPermit;
export declare function permitArguments(permit: SignedLPPermit, b: VerifiedBundle, p: VerifiedPool, caller: Address, spender: Address, shares: bigint): readonly unknown[];
