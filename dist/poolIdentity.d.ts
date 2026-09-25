import { Address, Hex, Mode, BlockRef, ProtocolReadAdapter } from './protocolData.js';
export type DeploymentAnchor = Readonly<{
    address: Address;
    runtimeCodehash: Hex;
}>;
export type ProtocolPolicy = Readonly<{
    chainId: bigint;
    mode: Mode;
    factory: DeploymentAnchor;
    deployer: DeploymentAnchor;
    vault: DeploymentAnchor;
    lpIssuer: DeploymentAnchor;
    registry: DeploymentAnchor;
    initializer: DeploymentAnchor;
    router: DeploymentAnchor;
    poolCreationCodehash?: Hex;
    nativeRouter?: DeploymentAnchor;
    wrappedNative?: DeploymentAnchor;
    liquidityRouter?: DeploymentAnchor;
    nativeLiquidityRouter?: DeploymentAnchor;
    orderBook?: DeploymentAnchor;
}>;
export type VerifiedBundle = Readonly<{
    policy: ProtocolPolicy;
    block: BlockRef;
    quoteCap: 16 | 8;
    swapCap: 16 | 2;
}>;
export type VerifiedPool = Readonly<{
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
    mode: Mode;
    kind: 'default-standard' | 'additional-standard' | 'protected';
    standardInstanceId: Hex;
    protectedToken: Address;
    initialized: boolean;
    protectedCompleted: boolean;
    reservingLaunchFactory: Address;
    lifecycle: 'initialized' | 'empty-standard' | 'bonding-reservation' | 'completed-empty';
}>;
export declare function abi(b: VerifiedBundle, suffix: string): readonly string[];
export declare function requireBundle(b: VerifiedBundle): void;
export declare function requirePool(b: VerifiedBundle, p: VerifiedPool): void;
export declare function namespaceAddress(v: unknown): Address;
export declare function normalizeProtocolPolicy(v: ProtocolPolicy): ProtocolPolicy;
export declare function verifyProtocolBundle(adapter: ProtocolReadAdapter, input: ProtocolPolicy, atBlock?: bigint): Promise<VerifiedBundle>;
export declare function checkCode(a: ProtocolReadAdapter, b: BlockRef, target: Address, expected: Hex): Promise<void>;
export declare function authenticatePool(a: ProtocolReadAdapter, b: VerifiedBundle, target: Address): Promise<VerifiedPool>;
export declare function authenticatedCandidates(b: VerifiedBundle, tokenIn: Address, tokenOut: Address, pools: readonly VerifiedPool[], operation: 'quote' | 'swap'): readonly VerifiedPool[];
export declare function authenticateCandidates(a: ProtocolReadAdapter, b: VerifiedBundle, tokenIn: Address, tokenOut: Address, addresses: readonly Address[], operation?: 'quote' | 'swap'): Promise<readonly VerifiedPool[]>;
export type DiscoveryEntry = Readonly<{
    pool: VerifiedPool;
    origins: readonly ('default' | 'requested-protected' | 'explicit-instance')[];
}>;
export type ConfidentialDiscovery = Readonly<{
    entries: readonly DiscoveryEntry[];
    requiresSelection: boolean;
}>;
export declare function discoverConfidentialPools(a: ProtocolReadAdapter, b: VerifiedBundle, tokenA: Address, tokenB: Address, requests?: Readonly<{
    protected?: readonly Readonly<{
        feeBps: bigint;
        protectedToken: Address;
    }>[];
    instances?: readonly Readonly<{
        feeBps: bigint;
        instanceNamespace: Address;
        nonce: Hex;
    }>[];
}>): Promise<ConfidentialDiscovery>;
/** INTERNAL shared check: stored dependency anchors, not live route availability. */
export declare function checkPublicOrderBook(a: ProtocolReadAdapter, b: BlockRef, p: ProtocolPolicy): Promise<void>;
