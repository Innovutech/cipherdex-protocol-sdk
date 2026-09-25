import { Address, Hex, Mode } from './protocolData.js';
import { ProtocolPolicy, DeploymentAnchor } from './poolIdentity.js';
export declare const DEPLOYMENT_MANIFEST_SCHEMA: "cipherdex.deployment-manifest/1";
export declare const DEPLOYMENT_MANIFEST_LIMITS: Readonly<{
    bytes: 524288;
    depth: 24;
    nodes: 16000;
    actions: 36;
    artifacts: 28;
}>;
export type DeploymentEnvironment = 'local-simulator' | 'coti-testnet' | 'coti-mainnet';
export type ComponentId = 'registry' | 'publicLpIssuer' | 'privateLpIssuer' | 'wrappedNative' | 'mode0.vault' | 'mode0.deployer' | 'mode0.factory' | 'mode0.initializer' | 'mode0.router' | 'mode1.vault' | 'mode1.deployer' | 'mode1.factory' | 'mode1.initializer' | 'mode1.router' | 'mode2.vault' | 'mode2.deployer' | 'mode2.factory' | 'mode2.initializer' | 'mode2.router' | 'public.liquidity' | 'public.nativeSwap' | 'public.nativeLiquidity' | 'public.orders';
export type ArtifactId = ComponentId | 'template.pool0' | 'template.pool1' | 'template.pool2' | 'template.publicLp' | 'template.privateLp';
export type ConstructorInput = Readonly<{
    name: string;
    type: string;
}>;
export type DeploymentArtifactRecord = Readonly<{
    id: ArtifactId;
    contractName: string;
    contextRoot: string;
    buildInfoId: string;
    sourceSha256: Hex;
    settingsSha256: Hex;
    abiHash: Hex;
    creationCodehash: Hex;
    runtimeTemplateCodehash: Hex;
    creationBytes: bigint;
    runtimeBytes: bigint;
    constructorInputs: readonly ConstructorInput[];
    constructorArgumentBytes: bigint | null;
    fullInitCodeBytes: bigint | null;
}>;
export type DeploymentBuildRecord = Readonly<{
    sourceCommit: string;
    sourceTreeClean: true;
    sourceTreeSha256: Hex;
    lockfileSha256: Hex;
    compilerPolicySha256: Hex;
    cleanBuildRecord: Readonly<{
        path: string;
        gitBlobSha256: Hex;
    }>;
    compilerVersion: '0.8.28';
    nodeVersion: '24.16.0';
    npmVersion: '11.13.0';
    artifacts: readonly DeploymentArtifactRecord[];
}>;
export type InitialVaultRoles = Readonly<{
    mode: Mode;
    beneficiary: Address | null;
    feeAdministrator: Address | null;
    beneficiaryChangeDelay: bigint | null;
}>;
export type InitialOrderSurplusControl = Readonly<{
    kind: 'rotatable-v1';
    administrator: Address | null;
    beneficiaryChangeDelay: bigint | null;
}>;
export type ObservedOrderSurplusControl = Readonly<{
    beneficiary: Address;
    administrator: Address;
    pendingBeneficiary: Address | null;
    pendingBeneficiaryActivationTime: bigint;
    pendingAdministrator: Address | null;
}>;
export type DeploymentConfiguration = Readonly<{
    environment: DeploymentEnvironment;
    chainId: bigint | null;
    deploymentCaller: Address | null;
    configurationCaller: Address | null;
    registryOwner: Address | null;
    vaults: readonly InitialVaultRoles[];
    surplusBeneficiary: Address | null;
    wrappedNative: DeploymentAnchor | null;
    orderSurplusControl?: InitialOrderSurplusControl;
}>;
export type ComponentReference = Readonly<{
    component: ComponentId;
}>;
export type PlanningArgument = Address | bigint | null | ComponentReference;
export type DeploymentAction = Readonly<{
    id: string;
    kind: 'deploy' | 'call';
    component: ComponentId;
    functionName: 'constructor' | 'bindFactory' | 'bindProtectedInitializer' | 'bindBestExecutionRouter' | 'finalize';
    requiredCaller: Address | null;
    args: readonly PlanningArgument[];
    predecessors: readonly string[];
    status: 'planned';
}>;
export type DraftDeploymentManifest = Readonly<{
    schema: typeof DEPLOYMENT_MANIFEST_SCHEMA;
    protocolVersion: 1;
    kind: 'draft';
    configuration: DeploymentConfiguration;
    build: DeploymentBuildRecord;
    actions: readonly DeploymentAction[];
    missingInputs: readonly string[];
    complete: boolean;
}>;
export type DeploymentBlock = Readonly<{
    number: bigint;
    hash: Hex;
    timestamp: bigint;
}>;
export type ObservedAction = Readonly<{
    actionId: string;
    status: 'verified' | 'failed' | 'uncertain' | 'not-observed';
    transactionHash: Hex | null;
    block: DeploymentBlock | null;
    transactionIndex: bigint | null;
    gasUsed: bigint | null;
    deployedAddress: Address | null;
    runtimeCodehash: Hex | null;
    initCodeHash: Hex | null;
}>;
export type ObservedComponent = Readonly<{
    id: ComponentId;
    address: Address;
    runtimeCodehash: Hex;
    deploymentActionId: string | null;
    creationCodehash: Hex | null;
    creationCodeLength: bigint | null;
}>;
export type ObservedDeploymentManifest = Readonly<{
    schema: typeof DEPLOYMENT_MANIFEST_SCHEMA;
    protocolVersion: 1;
    kind: 'observed';
    plan: DraftDeploymentManifest;
    observationEnvironment: DeploymentEnvironment;
    planDigest: Hex;
    atBlock: DeploymentBlock;
    actions: readonly ObservedAction[];
    components: readonly ObservedComponent[];
    mutableRoles: Readonly<{
        registryOwner: Address;
        pendingRegistryOwner: Address | null;
        vaults: readonly Readonly<{
            mode: Mode;
            beneficiary: Address;
            feeAdministrator: Address;
            pendingBeneficiary: Address | null;
            pendingFeeAdministrator: Address | null;
        }>[];
        orderSurplus?: ObservedOrderSurplusControl;
    }> | null;
    result: 'verified' | 'incomplete';
}>;
export interface ManifestDigestAdapter {
    hashUtf8(canonicalText: string): unknown;
}
export type ManifestReview = Readonly<{
    expectedChainId: bigint;
    environment: DeploymentEnvironment;
    planDigest: Hex;
    observedDigest: Hex;
}>;
export declare const DEPLOYMENT_INVENTORY: readonly Readonly<Readonly<{
    id: ArtifactId;
    contractName: string;
    kind: "bootstrap" | "template" | "reused";
}>>[];
/** Missing explicit inputs are retained as null; complete planning never substitutes zero. */
export declare function createDeploymentDraft(configuration: DeploymentConfiguration, buildRecord: DeploymentBuildRecord): DraftDeploymentManifest;
export declare function requireCompleteDeploymentDraft(input: DraftDeploymentManifest): DraftDeploymentManifest;
export declare function validateDeploymentManifest(input: unknown): DraftDeploymentManifest | ObservedDeploymentManifest;
export declare function serializeDeploymentManifest(input: DraftDeploymentManifest | ObservedDeploymentManifest): string;
/** Canonical-only parsing rejects duplicate keys, lossy numbers and ambiguous encodings. */
export declare function parseDeploymentManifest(raw: string): DraftDeploymentManifest | ObservedDeploymentManifest;
export declare function deploymentManifestDigest(input: DraftDeploymentManifest | ObservedDeploymentManifest, adapter: ManifestDigestAdapter): Hex;
/** Independent reviewed digests are required. This returns an UNAUTHENTICATED policy;
 * the integration must still call verifyProtocolBundle against its reviewed provider.
 * Local simulator observations can only produce local-simulator policies. */
export declare function protocolPolicyFromObserved(input: ObservedDeploymentManifest, requestedMode: Mode, review: ManifestReview, digester: ManifestDigestAdapter): ProtocolPolicy;
