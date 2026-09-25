import { Address, Hex, BlockRef, ProtocolReadAdapter, ProtocolCodec } from './protocolData.js';
import { ProtocolPolicy, VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { VerifiedOrderBook } from './publicOrders.js';
import { ProtocolCall } from './protocolExecution.js';
export type VerifiedFeeVault = Readonly<{
    kind: 'fee-vault';
    policy: ProtocolPolicy;
    block: BlockRef;
    factoryBound: boolean;
}>;
export type VerifiedLaunchRegistry = Readonly<{
    kind: 'launch-registry';
    policy: ProtocolPolicy;
    block: BlockRef;
}>;
type Target = VerifiedFeeVault | VerifiedLaunchRegistry | VerifiedOrderBook;
export declare function requireFeeVault(v: VerifiedFeeVault): void;
export declare function requireLaunchRegistry(r: VerifiedLaunchRegistry): void;
export declare function feeVaultAbi(v: VerifiedFeeVault): readonly string[];
/** Target identity and stored factory commitment only. A bound factory/router
 * need not currently work for beneficiary controls or vault sweeps. */
export declare function authenticateFeeVault(a: ProtocolReadAdapter, input: ProtocolPolicy, height?: bigint): Promise<VerifiedFeeVault>;
/** The one shared registry reports mode 0 even when the policy's pool mode is 1/2. */
export declare function authenticateLaunchRegistry(a: ProtocolReadAdapter, input: ProtocolPolicy, height?: bigint): Promise<VerifiedLaunchRegistry>;
export type FeeControlState = Readonly<{
    vault: VerifiedFeeVault;
    beneficiary: Address;
    beneficiaryChangeDelay: bigint;
    feeAdministrator: Address;
    pendingBeneficiary: Address;
    pendingBeneficiaryActivationTime: bigint;
    pendingFeeAdministrator: Address;
    deploymentConfigurator: Address;
}>;
export type LaunchRegistryState = Readonly<{
    registry: VerifiedLaunchRegistry;
    owner: Address;
    pendingOwner: Address;
}>;
export declare function readFeeControls(a: ProtocolReadAdapter, v: VerifiedFeeVault): Promise<FeeControlState>;
export declare function readLaunchRegistryState(a: ProtocolReadAdapter, r: VerifiedLaunchRegistry): Promise<LaunchRegistryState>;
export type LaunchFactoryApproval = Readonly<{
    registry: VerifiedLaunchRegistry;
    launchFactory: Address;
    enabled: boolean;
    recordedRuntimeCodehash: Hex;
    currentlyApproved: boolean;
    observedCode: Hex;
    observedRuntimeCodehash: Hex;
}>;
export declare function readLaunchFactoryApproval(a: ProtocolReadAdapter, r: VerifiedLaunchRegistry, factory: Address): Promise<LaunchFactoryApproval>;
export type AdministrationCaller = Readonly<{
    target: Target;
    effectiveCaller: Address;
    callerKind: 'eoa' | 'contract';
}>;
export declare function prepareAdministrationCaller(a: ProtocolReadAdapter, t: Target, caller: Address): Promise<AdministrationCaller>;
export type AdministrationInnerCall = Readonly<{
    kind: 'contract-inner-call';
    chainId: bigint;
    requiredEffectiveCaller: Address;
    to: Address;
    abi: readonly string[];
    functionName: string;
    args: readonly unknown[];
    data: Hex;
    value: 0n;
    gasLimit?: bigint;
}>;
export type AdministrationPlan = Readonly<{
    kind: 'direct';
    call: ProtocolCall;
    operationTransactions: 1;
    approvalTransactions: 0;
    itInputs: 0;
    paidMpc: boolean;
}> | Readonly<{
    kind: 'contract-inner';
    call: AdministrationInnerCall;
    operationCalls: 1;
    outerTransactions: 'integration-specific';
    approvalTransactions: 0;
    itInputs: 0;
    paidMpc: boolean;
}>;
type VaultOperation = 'propose-beneficiary' | 'cancel-beneficiary' | 'accept-beneficiary' | 'propose-administrator' | 'accept-administrator' | 'sweep';
type RegistryOperation = 'approve-launch' | 'revoke-launch' | 'transfer-owner' | 'accept-owner';
export type AdministrationContext = Readonly<{
    kind: 'vault';
    operation: VaultOperation;
    vault: VerifiedFeeVault;
    proposed?: Address;
    token?: Address;
}> | Readonly<{
    kind: 'registry';
    operation: RegistryOperation;
    registry: VerifiedLaunchRegistry;
    proposed?: Address;
    approval?: LaunchFactoryApproval;
}> | Readonly<{
    kind: 'book';
    operation: SurplusOperation;
    book: VerifiedOrderBook;
    proposed?: Address;
}> | Readonly<{
    kind: 'collect';
    operation: 'collect';
    bundle: VerifiedBundle;
    pool: VerifiedPool;
    side: bigint;
    token: Address;
}>;
export declare function administrationCallContext(c: ProtocolCall): AdministrationContext;
export declare function buildProposeBeneficiary(c: AdministrationCaller, s: FeeControlState, proposed: Address, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildCancelBeneficiaryProposal(c: AdministrationCaller, s: FeeControlState, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildAcceptBeneficiary(c: AdministrationCaller, s: FeeControlState, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildProposeFeeAdministrator(c: AdministrationCaller, s: FeeControlState, proposed: Address, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildAcceptFeeAdministrator(c: AdministrationCaller, s: FeeControlState, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
/** No approval, IT or amount/recipient override. Readiness is not simulated. */
export declare function buildSweepProtocolFees(a: ProtocolReadAdapter, c: AdministrationCaller, token: Address, codec: ProtocolCodec, gasLimit?: bigint): Promise<AdministrationPlan>;
export declare function buildCollectProtocolFees(a: ProtocolReadAdapter, b: VerifiedBundle, p: VerifiedPool, caller: Address, side: bigint, codec: ProtocolCodec, gasLimit?: bigint): Promise<AdministrationPlan>;
export declare function readPublicProtocolFeeAccounting(a: ProtocolReadAdapter, v: VerifiedFeeVault, token: Address): Promise<Readonly<{
    vault: Readonly<{
        kind: "fee-vault";
        policy: ProtocolPolicy;
        block: BlockRef;
        factoryBound: boolean;
    }>;
    token: `0x${string}`;
    accounted: bigint;
    rawBalance: bigint;
    surplus: bigint;
    deficit: bigint;
}>>;
export type ConfidentialSweepReadiness = Readonly<{
    vault: VerifiedFeeVault;
    token: Address;
    epochCount: bigint;
    nextEpochIndex: bigint;
    nextSweepAt: bigint;
    minimumSweepDelay: bigint;
    epochSeconds: bigint;
    minimumAggregatedSwaps: bigint;
    maximumSweepEpochs: bigint;
    inspectedEpochCount: bigint;
    matureEpochs: readonly Readonly<{
        index: bigint;
        epoch: bigint;
        swapCount: bigint;
    }>[];
    aggregatedSwapCount: bigint;
    temporallyEligible: boolean;
    countEligible: boolean;
    metadataEligible: boolean;
    amount: 'unknown';
    backingAndExecution: 'unproven';
}>;
/** Bounded PUBLIC metadata, not a fresh MPC quote or a payout amount. */
export declare function readConfidentialSweepReadiness(a: ProtocolReadAdapter, v: VerifiedFeeVault, token: Address): Promise<ConfidentialSweepReadiness>;
export declare function buildApproveLaunchFactory(c: AdministrationCaller, s: LaunchRegistryState, approval: LaunchFactoryApproval, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildRevokeLaunchFactory(c: AdministrationCaller, s: LaunchRegistryState, approval: LaunchFactoryApproval, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildTransferRegistryOwnership(c: AdministrationCaller, s: LaunchRegistryState, newOwner: Address, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildAcceptRegistryOwnership(c: AdministrationCaller, s: LaunchRegistryState, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export type SurplusControlState = Readonly<{
    book: VerifiedOrderBook;
    surplusBeneficiary: Address;
    surplusAdministrator: Address;
    pendingSurplusAdministrator: Address;
    surplusBeneficiaryChangeDelay: bigint;
    pendingSurplusBeneficiary: Address;
    pendingSurplusBeneficiaryActivationTime: bigint;
}>;
type SurplusOperation = 'propose-surplus-beneficiary' | 'cancel-surplus-beneficiary' | 'accept-surplus-beneficiary' | 'propose-surplus-administrator' | 'accept-surplus-administrator';
/** Target-only snapshot. Current roles never replace independently reviewed code/dependency anchors. */
export declare function readSurplusControls(a: ProtocolReadAdapter, b: VerifiedOrderBook): Promise<SurplusControlState>;
export declare function buildProposeSurplusBeneficiary(c: AdministrationCaller, s: SurplusControlState, proposed: Address, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildCancelSurplusBeneficiaryProposal(c: AdministrationCaller, s: SurplusControlState, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildAcceptSurplusBeneficiary(c: AdministrationCaller, s: SurplusControlState, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildProposeSurplusAdministrator(c: AdministrationCaller, s: SurplusControlState, proposed: Address, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export declare function buildAcceptSurplusAdministrator(c: AdministrationCaller, s: SurplusControlState, codec: ProtocolCodec, gasLimit?: bigint): AdministrationPlan;
export {};
