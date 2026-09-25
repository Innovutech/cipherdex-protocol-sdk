// SPDX-License-Identifier: UNLICENSED
// Replacement protocol v1. The historical package root is a separate migration surface.
export {PROTOCOL_ABIS,PROTOCOL_SELECTORS,PROTOCOL_EVENT_TOPICS,PROTOCOL_INTERFACE_IDS} from './protocolAbi.js';
export {FEE_TIERS} from './protocolData.js';
export type {Address,Hex,Mode,BlockRef,ContractRead,ProtocolReadAdapter,ProtocolCodec} from './protocolData.js';
export {verifyProtocolBundle,authenticatePool,authenticateCandidates,discoverConfidentialPools} from './poolIdentity.js';
export type {DeploymentAnchor,ProtocolPolicy,VerifiedBundle,VerifiedPool,DiscoveryEntry,ConfidentialDiscovery} from './poolIdentity.js';
export {buildPublicQuote,readPublicQuote,parsePublicQuote,buildPublicSwap,EVM_NATIVE_ASSET_ADDRESS} from './publicExecution.js';
export type {PublicQuoteInput,PublicSwapInput,PublicSwapPlan} from './publicExecution.js';
export type {ProtocolCall} from './protocolExecution.js';
export {prepareConfidentialQuote,prepareConfidentialSwap,packConfidentialSwap,bindConfidentialInput,encryptConfidentialInput,buildConfidentialCall} from './confidentialExecution.js';
export type {ConfidentialInputIntent,CallerCiphertext,OfficialIT,BoundConfidentialInput,CotiEncryptionAdapter,ConfidentialQuoteInput,ConfidentialSwapInput,ConfidentialCallPlan} from './confidentialExecution.js';
export {parseProtocolReceipt,decryptProtocolResult} from './protocolResults.js';
export type {ProtocolReceiptAdapter,CotiDecryptionAdapter,VerifiedPublicResult,VerifiedConfidentialResult} from './protocolResults.js';
export {buildPublicTokenApprovalPlan,buildPrivateTokenApprovalPlan,PUBLIC_ERC20_APPROVAL_ABI} from './tokenApproval.js';
export type {PublicTokenApprovalCall,PublicTokenApprovalPlan,PrivateTokenApprovalPlan,TokenApprovalPlanInput,TokenApprovalMode} from './tokenApproval.js';
export {classifyCipherDexExecutionError,preflightCipherDexTransaction} from './executionError.js';

export {predictStandardPool,buildStandardCreation} from './poolCreation.js';
export type {StandardCreationInput,StandardPoolPrediction} from './poolCreation.js';
export {buildInitializePool,buildCreateAndInitializeStandard,buildCreateAndInitializeStandardInstance,buildAddLiquidity,buildRemoveLiquidity,buildRemoveLiquidityWithPermit,
 buildInitializePoolNative,buildCreateAndInitializeStandardNative,buildCreateAndInitializeStandardInstanceNative,buildAddLiquidityNative,buildRemoveLiquidityNative,buildRemoveLiquidityNativeWithPermit} from './publicLiquidity.js';
export type {DepositParams,RemoveLiquidityParams,NativeDepositParams,NativeRemoveParams,PublicDepositInput,NativeDepositInput,PublicRemovalInput,NativeRemovalInput,PublicLiquidityPlan} from './publicLiquidity.js';
export {packLiquidityPair,prepareConfidentialInitialization,prepareConfidentialAddition,prepareConfidentialRemoval,prepareConfidentialLock,
 prepareAddLiquidityQuote,prepareRemoveLiquidityQuote,buildConfidentialLiquidity,buildConfidentialLiquidityApproval} from './confidentialLiquidity.js';
export type {LiquidityInputIntent,ConfidentialLiquidityPreparation,ConfidentialLiquidityCallPlan,PrivateInitializationInput,PrivateAdditionInput,PrivateRemovalInput} from './confidentialLiquidity.js';
export {buildClaimLPFees,buildPublicLockShares,buildUnlockShares,buildRequestMyPosition,buildRequestMyAccounting,readPublicLPPosition,readLPLock,prepareLPPermit,bindLPPermit} from './lpPosition.js';
export type {OwnerCallInput,PublicLPPosition,LPLockMetadata,LPPermitIntent,SignedLPPermit} from './lpPosition.js';
export {parseLiquidityReceipt,decryptLiquidityResult} from './protocolLiquidityResults.js';
export type {VerifiedLiquidityResult} from './protocolLiquidityResults.js';
export {predictProtectedPool,preflightProtectedReservation,preflightProtectedGraduation,buildProtectedReservation,buildPublicProtectedGraduation,
 prepareConfidentialProtectedGraduation,buildConfidentialProtectedGraduation,buildProtectedTokenApproval,prepareProtectedGTGraduation} from './protectedInitialization.js';
export type {ProtectedIdentityInput,ProtectedPoolPrediction,ProtectedReservationPreflight,ProtectedGraduationPreflight,ProtectedInnerCall,ProtectedGraduationTerms,
 PublicProtectedGraduationInput,PublicProtectedGraduationPlan,PrivateProtectedGraduationInput,ConfidentialProtectedPreparation,ProtectedGTGuidance} from './protectedInitialization.js';
export {parseProtectedGraduationReceipt,confirmProtectedEvent} from './protectedResults.js';
export type {ProtectedEventFacts,ProtectedEventConfirmation,DirectProtectedGraduationResult} from './protectedResults.js';

export {PUBLIC_ORDER_STATUS,PUBLIC_ORDER_SETTLEMENT,PUBLIC_ORDER_FEE_BITS,PUBLIC_ORDER_ALL_FEES,authenticatePublicOrderBook,authenticatePublicOrderTrading,publicOrderFeePolicy,readPublicOrder,readPublicOrderMinimumOutput,readPublicOrderAccounting,buildCreatePublicOrder,buildAmendPublicOrder,buildIncreasePublicOrderBounty,buildCancelPublicOrder,canFillPublicOrder,buildFillPublicOrder,buildClaimPublicOrderNativeBounty,buildClaimPublicOrderNativeProceeds,preparePublicOrderPermit,bindPublicOrderPermit,buildCreatePublicOrderWithPermit} from './publicOrders.js';
export type {VerifiedOrderBook,PublicOrderTerms,PublicOrderCreateParams,PublicOrderAmendment,PublicOrder,PublicOrderSnapshot,PublicOrderPlan,PublicOrderPermitIntent,SignedPublicOrderPermit,PublicOrderPermitDomainAdapter} from './publicOrders.js';
export {parsePublicOrderReceipt} from './publicOrderResults.js';
export type {NativeOrderDelivery,PublicOrderFacts,VerifiedPublicOrderResult} from './publicOrderResults.js';

export {authenticateFeeVault,authenticateLaunchRegistry,readFeeControls,readLaunchRegistryState,readLaunchFactoryApproval,prepareAdministrationCaller,
 buildProposeBeneficiary,buildCancelBeneficiaryProposal,buildAcceptBeneficiary,buildProposeFeeAdministrator,buildAcceptFeeAdministrator,
 buildCollectProtocolFees,buildSweepProtocolFees,readPublicProtocolFeeAccounting,readConfidentialSweepReadiness,
 buildApproveLaunchFactory,buildRevokeLaunchFactory,buildTransferRegistryOwnership,buildAcceptRegistryOwnership} from './protocolAdministration.js';
export type {VerifiedFeeVault,VerifiedLaunchRegistry,FeeControlState,LaunchRegistryState,LaunchFactoryApproval,AdministrationCaller,AdministrationInnerCall,AdministrationPlan,ConfidentialSweepReadiness} from './protocolAdministration.js';
export {parseAdministrationReceipt} from './administrationResults.js';
export type {AdministrationFacts,VerifiedAdministrationResult} from './administrationResults.js';
export {buildSweepPublicOrderTokenSurplus,buildSweepPublicOrderNativeSurplus} from './publicOrders.js';

// Offline replacement deployment metadata; protocol version remains 1.
export {DEPLOYMENT_MANIFEST_SCHEMA,DEPLOYMENT_MANIFEST_LIMITS,DEPLOYMENT_INVENTORY,createDeploymentDraft,requireCompleteDeploymentDraft,validateDeploymentManifest,serializeDeploymentManifest,parseDeploymentManifest,deploymentManifestDigest,protocolPolicyFromObserved} from './deploymentManifest.js';
export type {DeploymentEnvironment,ComponentId,ArtifactId,ConstructorInput,DeploymentArtifactRecord,DeploymentBuildRecord,InitialVaultRoles,InitialOrderSurplusControl,ObservedOrderSurplusControl,DeploymentConfiguration,ComponentReference,PlanningArgument,DeploymentAction,DraftDeploymentManifest,DeploymentBlock,ObservedAction,ObservedComponent,ObservedDeploymentManifest,ManifestDigestAdapter,ManifestReview} from './deploymentManifest.js';

export {readSurplusControls,buildProposeSurplusBeneficiary,buildCancelSurplusBeneficiaryProposal,buildAcceptSurplusBeneficiary,buildProposeSurplusAdministrator,buildAcceptSurplusAdministrator} from './protocolAdministration.js';
export type {SurplusControlState} from './protocolAdministration.js';
