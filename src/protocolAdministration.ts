// SPDX-License-Identifier: UNLICENSED
// Replacement protocol administration and fee calls. No executor or signing code.
import {PROTOCOL_ABIS,PROTOCOL_INTERFACE_IDS} from './protocolAbi.js';
import {Address,Hex,BlockRef,ProtocolReadAdapter,ProtocolCodec,address,hex,hash,uint,bool,tuple,equal,fail,block,one,read,stable,ZERO_ADDRESS,ZERO_HASH} from './protocolData.js';
import {ProtocolPolicy,VerifiedBundle,VerifiedPool,normalizeProtocolPolicy,checkCode,requirePool,abi} from './poolIdentity.js';
import {VerifiedOrderBook,requireOrderBook,orderRecipient} from './publicOrders.js';
import {ProtocolCall,encodeProtocolCall} from './protocolExecution.js';

export type VerifiedFeeVault=Readonly<{kind:'fee-vault';policy:ProtocolPolicy;block:BlockRef;factoryBound:boolean}>;
export type VerifiedLaunchRegistry=Readonly<{kind:'launch-registry';policy:ProtocolPolicy;block:BlockRef}>;
type Target=VerifiedFeeVault|VerifiedLaunchRegistry|VerifiedOrderBook;
const vaults=new WeakSet<object>(),registries=new WeakSet<object>();
const vaultLabels=['PublicVault','ConfidentialVault','ObservableVault'] as const;
export function requireFeeVault(v:VerifiedFeeVault):void{if(!vaults.has(v))fail('Unverified fee vault');}
export function requireLaunchRegistry(r:VerifiedLaunchRegistry):void{if(!registries.has(r))fail('Unverified launch registry');}
function requireTarget(t:Target):void{if(!vaults.has(t)&&!registries.has(t))requireOrderBook(t as VerifiedOrderBook);}
export function feeVaultAbi(v:VerifiedFeeVault):readonly string[]{requireFeeVault(v);return PROTOCOL_ABIS[vaultLabels[v.policy.mode]];}
async function start(a:ProtocolReadAdapter,p:ProtocolPolicy,height?:bigint):Promise<BlockRef>{
 equal(uint(await a.readChainId(),256,true),p.chainId,'administration chain');
 const at=block(await a.readBlock(height===undefined?undefined:uint(height)));
 if(height!==undefined)equal(at.number,height,'administration block');return at;
}
/** Target identity and stored factory commitment only. A bound factory/router
 * need not currently work for beneficiary controls or vault sweeps. */
export async function authenticateFeeVault(a:ProtocolReadAdapter,input:ProtocolPolicy,height?:bigint):Promise<VerifiedFeeVault>{
 const policy=normalizeProtocolPolicy(input),at=await start(a,policy,height),v=policy.vault,label=vaultLabels[policy.mode],va=PROTOCOL_ABIS[label];
 await checkCode(a,at,v.address,v.runtimeCodehash);
 const get=(n:string,args:readonly unknown[]=[])=>one(a,at,v.address,va,n,args);
 equal(uint(await get('PROTOCOL_VERSION')),1n,'vault version');equal(uint(await get('PRIVACY_MODE'),8),BigInt(policy.mode),'vault mode');
 for(const id of [PROTOCOL_INTERFACE_IDS[label],PROTOCOL_INTERFACE_IDS.FeeBeneficiaryControl])
  equal(bool(await get('supportsInterface',[hex(id,4)])),true,'vault interface');
 const factory=address(await get('factory'),true),committed=hash(await get('factoryRuntimeCodehash'));
 if(factory===ZERO_ADDRESS)equal(committed,ZERO_HASH,'unbound factory hash');
 else{equal(factory,policy.factory.address,'stored vault factory');equal(committed,policy.factory.runtimeCodehash,'stored vault factory hash');}
 await stable(a,policy.chainId,at);
 const result=Object.freeze({kind:'fee-vault' as const,policy,block:at,factoryBound:factory!==ZERO_ADDRESS});vaults.add(result);return result;
}
/** The one shared registry reports mode 0 even when the policy's pool mode is 1/2. */
export async function authenticateLaunchRegistry(a:ProtocolReadAdapter,input:ProtocolPolicy,height?:bigint):Promise<VerifiedLaunchRegistry>{
 const policy=normalizeProtocolPolicy(input),at=await start(a,policy,height),r=policy.registry;
 await checkCode(a,at,r.address,r.runtimeCodehash);
 const get=(n:string,args:readonly unknown[]=[])=>one(a,at,r.address,PROTOCOL_ABIS.Registry,n,args);
 equal(uint(await get('PROTOCOL_VERSION')),1n,'registry version');equal(uint(await get('PRIVACY_MODE'),8),0n,'shared registry mode');
 equal(bool(await get('supportsInterface',[hex(PROTOCOL_INTERFACE_IDS.Registry,4)])),true,'registry interface');
 await stable(a,policy.chainId,at);
 const result=Object.freeze({kind:'launch-registry' as const,policy,block:at});registries.add(result);return result;
}
export type FeeControlState=Readonly<{vault:VerifiedFeeVault;beneficiary:Address;beneficiaryChangeDelay:bigint;feeAdministrator:Address;pendingBeneficiary:Address;pendingBeneficiaryActivationTime:bigint;pendingFeeAdministrator:Address;deploymentConfigurator:Address}>;
export type LaunchRegistryState=Readonly<{registry:VerifiedLaunchRegistry;owner:Address;pendingOwner:Address}>;
const states=new WeakMap<object,Target>();
export async function readFeeControls(a:ProtocolReadAdapter,v:VerifiedFeeVault):Promise<FeeControlState>{
 requireFeeVault(v);const get=(n:string)=>one(a,v.block,v.policy.vault.address,feeVaultAbi(v),n);
 const beneficiary=address(await get('beneficiary')),beneficiaryChangeDelay=uint(await get('beneficiaryChangeDelay'),64,true),
 feeAdministrator=address(await get('feeAdministrator')),pendingBeneficiary=address(await get('pendingBeneficiary'),true),
 pendingBeneficiaryActivationTime=uint(await get('pendingBeneficiaryActivationTime'),64),pendingFeeAdministrator=address(await get('pendingFeeAdministrator'),true),
 deploymentConfigurator=address(await get('deploymentConfigurator'));
 if([beneficiary,feeAdministrator,pendingBeneficiary,pendingFeeAdministrator,deploymentConfigurator].includes(v.policy.vault.address))fail('Invalid vault role address');
 if((pendingBeneficiary===ZERO_ADDRESS)!==(pendingBeneficiaryActivationTime===0n))fail('Inconsistent beneficiary proposal');
 await stable(a,v.policy.chainId,v.block);
 const s=Object.freeze({vault:v,beneficiary,beneficiaryChangeDelay,feeAdministrator,pendingBeneficiary,pendingBeneficiaryActivationTime,pendingFeeAdministrator,deploymentConfigurator});states.set(s,v);return s;
}
export async function readLaunchRegistryState(a:ProtocolReadAdapter,r:VerifiedLaunchRegistry):Promise<LaunchRegistryState>{
 requireLaunchRegistry(r);
 const owner=address(await one(a,r.block,r.policy.registry.address,PROTOCOL_ABIS.Registry,'owner')),
 pendingOwner=address(await one(a,r.block,r.policy.registry.address,PROTOCOL_ABIS.Registry,'pendingOwner'),true);
 if(owner===r.policy.registry.address||pendingOwner===r.policy.registry.address)fail('Invalid registry owner');
 await stable(a,r.policy.chainId,r.block);const s=Object.freeze({registry:r,owner,pendingOwner});states.set(s,r);return s;
}
export type LaunchFactoryApproval=Readonly<{registry:VerifiedLaunchRegistry;launchFactory:Address;enabled:boolean;recordedRuntimeCodehash:Hex;currentlyApproved:boolean;observedCode:Hex;observedRuntimeCodehash:Hex}>;
const approvals=new WeakMap<object,VerifiedLaunchRegistry>();
export async function readLaunchFactoryApproval(a:ProtocolReadAdapter,r:VerifiedLaunchRegistry,factory:Address):Promise<LaunchFactoryApproval>{
 requireLaunchRegistry(r);const launchFactory=address(factory),v=tuple(await read(a,r.block,r.policy.registry.address,PROTOCOL_ABIS.Registry,'approval',[launchFactory]),2);
 const enabled=bool(v[0]),recordedRuntimeCodehash=hash(v[1],enabled),
 currentlyApproved=bool(await one(a,r.block,r.policy.registry.address,PROTOCOL_ABIS.Registry,'isApprovedLaunchFactory',[launchFactory])),
 observedCode=hex(await a.getCode(launchFactory,r.block),undefined,24576),observedRuntimeCodehash=hash(a.hashRuntimeCode(observedCode));
 equal(currentlyApproved,enabled&&observedCode!=='0x'&&observedRuntimeCodehash===recordedRuntimeCodehash,'current launch approval');
 await stable(a,r.policy.chainId,r.block);
 const s=Object.freeze({registry:r,launchFactory,enabled,recordedRuntimeCodehash,currentlyApproved,observedCode,observedRuntimeCodehash});approvals.set(s,r);return s;
}
export type AdministrationCaller=Readonly<{target:Target;effectiveCaller:Address;callerKind:'eoa'|'contract'}>;
const callers=new WeakSet<object>();
export async function prepareAdministrationCaller(a:ProtocolReadAdapter,t:Target,caller:Address):Promise<AdministrationCaller>{
 requireTarget(t);const effectiveCaller=address(caller),callerKind=hex(await a.getCode(effectiveCaller,t.block))==='0x'?'eoa' as const:'contract' as const;
 await stable(a,t.policy.chainId,t.block);const c=Object.freeze({target:t,effectiveCaller,callerKind});callers.add(c);return c;
}
function feeCaller(c:AdministrationCaller,s?:FeeControlState):VerifiedFeeVault{
 if(!callers.has(c)||c.target.kind!=='fee-vault')fail('Unverified vault caller');const v=c.target;requireFeeVault(v);
 if(s&&states.get(s)!==v)fail('Fee state belongs to another target/block');return v;
}
function registryCaller(c:AdministrationCaller,s:LaunchRegistryState):VerifiedLaunchRegistry{
 if(!callers.has(c)||c.target.kind!=='launch-registry')fail('Unverified registry caller');const r=c.target;requireLaunchRegistry(r);
 if(states.get(s)!==r)fail('Registry state belongs to another target/block');return r;
}
export type AdministrationInnerCall=Readonly<{kind:'contract-inner-call';chainId:bigint;requiredEffectiveCaller:Address;to:Address;abi:readonly string[];functionName:string;args:readonly unknown[];data:Hex;value:0n;gasLimit?:bigint}>;
export type AdministrationPlan=
 |Readonly<{kind:'direct';call:ProtocolCall;operationTransactions:1;approvalTransactions:0;itInputs:0;paidMpc:boolean}>
 |Readonly<{kind:'contract-inner';call:AdministrationInnerCall;operationCalls:1;outerTransactions:'integration-specific';approvalTransactions:0;itInputs:0;paidMpc:boolean}>;
type VaultOperation='propose-beneficiary'|'cancel-beneficiary'|'accept-beneficiary'|'propose-administrator'|'accept-administrator'|'sweep';
type RegistryOperation='approve-launch'|'revoke-launch'|'transfer-owner'|'accept-owner';
export type AdministrationContext=
 |Readonly<{kind:'vault';operation:VaultOperation;vault:VerifiedFeeVault;proposed?:Address;token?:Address}>
 |Readonly<{kind:'registry';operation:RegistryOperation;registry:VerifiedLaunchRegistry;proposed?:Address;approval?:LaunchFactoryApproval}>
 |Readonly<{kind:'book';operation:SurplusOperation;book:VerifiedOrderBook;proposed?:Address}>
 |Readonly<{kind:'collect';operation:'collect';bundle:VerifiedBundle;pool:VerifiedPool;side:bigint;token:Address}>;
const calls=new WeakMap<object,AdministrationContext>();
export function administrationCallContext(c:ProtocolCall):AdministrationContext{return calls.get(c)??fail('Unverified direct administration call; inner execution is not supported by this parser');}
function plan(codec:ProtocolCodec,label:keyof typeof PROTOCOL_ABIS,chainId:bigint,caller:Address,callerKind:'eoa'|'contract',to:Address,name:string,args:readonly unknown[],context:AdministrationContext,paidMpc:boolean,gasLimit?:bigint):AdministrationPlan{
 const call=encodeProtocolCall(codec,label,chainId,caller,to,name,args,0n,gasLimit);
 if(callerKind==='contract'){
  const inner=Object.freeze({kind:'contract-inner-call' as const,chainId,requiredEffectiveCaller:caller,to:call.to,abi:call.abi,functionName:name,args:call.args,data:call.data,value:0n as const,...(call.gasLimit===undefined?{}:{gasLimit:call.gasLimit})});
  return Object.freeze({kind:'contract-inner',call:inner,operationCalls:1,outerTransactions:'integration-specific',approvalTransactions:0,itInputs:0,paidMpc});
 }
 calls.set(call,Object.freeze(context));return Object.freeze({kind:'direct',call,operationTransactions:1,approvalTransactions:0,itInputs:0,paidMpc});
}
function vaultPlan(c:AdministrationCaller,operation:VaultOperation,name:string,args:readonly unknown[],codec:ProtocolCodec,extra:{proposed?:Address;token?:Address}={},gasLimit?:bigint){
 const v=feeCaller(c);return plan(codec,vaultLabels[v.policy.mode],v.policy.chainId,c.effectiveCaller,c.callerKind,v.policy.vault.address,name,args,{kind:'vault',operation,vault:v,...extra},operation==='sweep'&&v.policy.mode!==0,gasLimit);
}
export function buildProposeBeneficiary(c:AdministrationCaller,s:FeeControlState,proposed:Address,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 const v=feeCaller(c,s),p=address(proposed);equal(c.effectiveCaller,s.feeAdministrator,'fee administrator');
 if(p===v.policy.vault.address||p===s.beneficiary)fail('Invalid proposed beneficiary');
 uint(v.block.timestamp+s.beneficiaryChangeDelay,64);return vaultPlan(c,'propose-beneficiary','proposeBeneficiary',[p],codec,{proposed:p},gasLimit);
}
export function buildCancelBeneficiaryProposal(c:AdministrationCaller,s:FeeControlState,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 feeCaller(c,s);equal(c.effectiveCaller,s.feeAdministrator,'fee administrator');if(s.pendingBeneficiary===ZERO_ADDRESS)fail('No pending beneficiary');
 return vaultPlan(c,'cancel-beneficiary','cancelBeneficiaryProposal',[],codec,{},gasLimit);
}
export function buildAcceptBeneficiary(c:AdministrationCaller,s:FeeControlState,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 const v=feeCaller(c,s);if(s.pendingBeneficiary===ZERO_ADDRESS)fail('No pending beneficiary');equal(c.effectiveCaller,s.pendingBeneficiary,'pending beneficiary');
 if(v.block.timestamp<s.pendingBeneficiaryActivationTime)fail('Beneficiary activation not ready');return vaultPlan(c,'accept-beneficiary','acceptBeneficiary',[],codec,{},gasLimit);
}
export function buildProposeFeeAdministrator(c:AdministrationCaller,s:FeeControlState,proposed:Address,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 const v=feeCaller(c,s),p=address(proposed);equal(c.effectiveCaller,s.feeAdministrator,'fee administrator');
 if(p===v.policy.vault.address||p===s.feeAdministrator)fail('Invalid proposed fee administrator');return vaultPlan(c,'propose-administrator','proposeFeeAdministrator',[p],codec,{proposed:p},gasLimit);
}
export function buildAcceptFeeAdministrator(c:AdministrationCaller,s:FeeControlState,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 feeCaller(c,s);if(s.pendingFeeAdministrator===ZERO_ADDRESS)fail('No pending fee administrator');equal(c.effectiveCaller,s.pendingFeeAdministrator,'pending fee administrator');
 return vaultPlan(c,'accept-administrator','acceptFeeAdministrator',[],codec,{},gasLimit);
}
async function tokenCode(a:ProtocolReadAdapter,v:VerifiedFeeVault,token:Address):Promise<Address>{
 requireFeeVault(v);const t=address(token);if(hex(await a.getCode(t,v.block))==='0x')fail('Token has no deployed code');return t;
}
/** No approval, IT or amount/recipient override. Readiness is not simulated. */
export async function buildSweepProtocolFees(a:ProtocolReadAdapter,c:AdministrationCaller,token:Address,codec:ProtocolCodec,gasLimit?:bigint):Promise<AdministrationPlan>{
 const v=feeCaller(c),t=await tokenCode(a,v,token);await stable(a,v.policy.chainId,v.block);
 return vaultPlan(c,'sweep','sweep',[t],codec,{token:t},gasLimit);
}
export async function buildCollectProtocolFees(a:ProtocolReadAdapter,b:VerifiedBundle,p:VerifiedPool,caller:Address,side:bigint,codec:ProtocolCodec,gasLimit?:bigint):Promise<AdministrationPlan>{
 requirePool(b,p);const n=uint(side,8),who=address(caller);if(n>1n)fail('Invalid fee side');
 const kind=hex(await a.getCode(who,b.block))==='0x'?'eoa' as const:'contract' as const;
 await stable(a,b.policy.chainId,b.block);const label=(['PublicPool','ConfidentialPool','ObservablePool'] as const)[b.policy.mode];
 return plan(codec,label,b.policy.chainId,who,kind,p.address,'collectProtocolFees',[n],{kind:'collect',operation:'collect',bundle:b,pool:p,side:n,token:n===0n?p.token0:p.token1},b.policy.mode!==0,gasLimit);
}
export async function readPublicProtocolFeeAccounting(a:ProtocolReadAdapter,v:VerifiedFeeVault,token:Address){
 requireFeeVault(v);if(v.policy.mode!==0)fail('Public accounting is unavailable for confidential vaults');const t=await tokenCode(a,v,token);
 const x=tuple(await read(a,v.block,v.policy.vault.address,feeVaultAbi(v),'accountingState',[t]),4),accounted=uint(x[0]),rawBalance=uint(x[1]),surplus=uint(x[2]),deficit=uint(x[3]);
 equal(surplus,rawBalance>=accounted?rawBalance-accounted:0n,'public fee surplus');equal(deficit,accounted>rawBalance?accounted-rawBalance:0n,'public fee deficit');
 equal(uint(await one(a,v.block,v.policy.vault.address,feeVaultAbi(v),'accountedFees',[t])),accounted,'accounted fees');
 await stable(a,v.policy.chainId,v.block);return Object.freeze({vault:v,token:t,accounted,rawBalance,surplus,deficit});
}
export type ConfidentialSweepReadiness=Readonly<{vault:VerifiedFeeVault;token:Address;epochCount:bigint;nextEpochIndex:bigint;nextSweepAt:bigint;minimumSweepDelay:bigint;epochSeconds:bigint;minimumAggregatedSwaps:bigint;maximumSweepEpochs:bigint;inspectedEpochCount:bigint;matureEpochs:readonly Readonly<{index:bigint;epoch:bigint;swapCount:bigint}>[];aggregatedSwapCount:bigint;temporallyEligible:boolean;countEligible:boolean;metadataEligible:boolean;amount:'unknown';backingAndExecution:'unproven'}>;
/** Bounded PUBLIC metadata, not a fresh MPC quote or a payout amount. */
export async function readConfidentialSweepReadiness(a:ProtocolReadAdapter,v:VerifiedFeeVault,token:Address):Promise<ConfidentialSweepReadiness>{
 requireFeeVault(v);if(v.policy.mode===0)fail('Confidential epoch metadata requires mode 1 or 2');const t=await tokenCode(a,v,token),va=feeVaultAbi(v);
 const get=(n:string,args:readonly unknown[]=[])=>one(a,v.block,v.policy.vault.address,va,n,args);
 const minimumSweepDelay=uint(await get('MIN_CONFIDENTIAL_SWEEP_DELAY'),64,true),epochSeconds=uint(await get('CONFIDENTIAL_EPOCH_SECONDS'),64,true),
 minimumAggregatedSwaps=uint(await get('MIN_CONFIDENTIAL_AGGREGATED_SWAPS'),64,true),maximumSweepEpochs=uint(await get('MAX_CONFIDENTIAL_SWEEP_EPOCHS'),256,true);
 equal(minimumSweepDelay,86400n,'reviewed sweep delay');equal(epochSeconds,86400n,'reviewed epoch length');equal(minimumAggregatedSwaps,8n,'reviewed aggregation threshold');equal(maximumSweepEpochs,32n,'reviewed epoch bound');
 const epochCount=uint(await get('epochCount',[t])),nextEpochIndex=uint(await get('nextEpochIndex',[t])),nextSweepAt=uint(await get('nextSweepAt',[t]),64);
 if(nextEpochIndex>epochCount)fail('Epoch cursor exceeds history');
 const boundedEnd=uint(nextEpochIndex+maximumSweepEpochs),end=boundedEnd<epochCount?boundedEnd:epochCount,currentEpoch=v.block.timestamp/epochSeconds;
 const matureEpochs:Readonly<{index:bigint;epoch:bigint;swapCount:bigint}>[]=[];let aggregatedSwapCount=0n,inspectedEpochCount=0n,first:bigint|undefined,previous:bigint|undefined;
 for(let index=nextEpochIndex;index<end;index++){
  const epoch=uint(await get('epochAt',[t,index]),64);inspectedEpochCount++;
  if(first===undefined)first=epoch;if(previous!==undefined&&epoch<=previous)fail('Noncanonical epoch ordering');previous=epoch;
  if(epoch+2n>currentEpoch)break;
  const swapCount=uint(await get('swapCountByEpoch',[t,epoch]),64);aggregatedSwapCount=uint(aggregatedSwapCount+swapCount,64);
  matureEpochs.push(Object.freeze({index,epoch,swapCount}));
 }
 equal(nextSweepAt,first===undefined?0n:uint((first+2n)*epochSeconds,64),'next sweep metadata');
 const temporallyEligible=matureEpochs.length>0,countEligible=aggregatedSwapCount>=minimumAggregatedSwaps;
 await stable(a,v.policy.chainId,v.block);
 return Object.freeze({vault:v,token:t,epochCount,nextEpochIndex,nextSweepAt,minimumSweepDelay,epochSeconds,minimumAggregatedSwaps,maximumSweepEpochs,inspectedEpochCount,matureEpochs:Object.freeze(matureEpochs),aggregatedSwapCount,temporallyEligible,countEligible,metadataEligible:temporallyEligible&&countEligible,amount:'unknown',backingAndExecution:'unproven'});
}
function registryPlan(c:AdministrationCaller,s:LaunchRegistryState,operation:RegistryOperation,name:string,args:readonly unknown[],codec:ProtocolCodec,extra:{proposed?:Address;approval?:LaunchFactoryApproval}={},gasLimit?:bigint){
 const r=registryCaller(c,s);return plan(codec,'Registry',r.policy.chainId,c.effectiveCaller,c.callerKind,r.policy.registry.address,name,args,{kind:'registry',operation,registry:r,...extra},false,gasLimit);
}
export function buildApproveLaunchFactory(c:AdministrationCaller,s:LaunchRegistryState,approval:LaunchFactoryApproval,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 const r=registryCaller(c,s);equal(c.effectiveCaller,s.owner,'registry owner');
 if(approvals.get(approval)!==r)fail('Approval observation belongs to another target/block');
 if(approval.launchFactory===r.policy.registry.address||approval.observedCode==='0x')fail('Invalid launch factory');
 // Its observed hash is review information, not an argument/on-chain guard.
 return registryPlan(c,s,'approve-launch','approveLaunchFactory',[approval.launchFactory],codec,{approval},gasLimit);
}
export function buildRevokeLaunchFactory(c:AdministrationCaller,s:LaunchRegistryState,approval:LaunchFactoryApproval,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 const r=registryCaller(c,s);equal(c.effectiveCaller,s.owner,'registry owner');if(approvals.get(approval)!==r)fail('Approval observation belongs to another target/block');
 if(!approval.enabled)fail('Launch factory not approved');return registryPlan(c,s,'revoke-launch','revokeLaunchFactory',[approval.launchFactory],codec,{approval},gasLimit);
}
export function buildTransferRegistryOwnership(c:AdministrationCaller,s:LaunchRegistryState,newOwner:Address,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 const r=registryCaller(c,s),p=address(newOwner);equal(c.effectiveCaller,s.owner,'registry owner');if(p===r.policy.registry.address)fail('Invalid registry owner');
 return registryPlan(c,s,'transfer-owner','transferOwnership',[p],codec,{proposed:p},gasLimit);
}
export function buildAcceptRegistryOwnership(c:AdministrationCaller,s:LaunchRegistryState,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 registryCaller(c,s);if(s.pendingOwner===ZERO_ADDRESS)fail('No pending registry owner');equal(c.effectiveCaller,s.pendingOwner,'pending registry owner');
 return registryPlan(c,s,'accept-owner','acceptOwnership',[],codec,{},gasLimit);
}

export type SurplusControlState=Readonly<{book:VerifiedOrderBook;surplusBeneficiary:Address;surplusAdministrator:Address;pendingSurplusAdministrator:Address;surplusBeneficiaryChangeDelay:bigint;pendingSurplusBeneficiary:Address;pendingSurplusBeneficiaryActivationTime:bigint}>;
type SurplusOperation='propose-surplus-beneficiary'|'cancel-surplus-beneficiary'|'accept-surplus-beneficiary'|'propose-surplus-administrator'|'accept-surplus-administrator';
/** Target-only snapshot. Current roles never replace independently reviewed code/dependency anchors. */
export async function readSurplusControls(a:ProtocolReadAdapter,b:VerifiedOrderBook):Promise<SurplusControlState>{
 requireOrderBook(b);const get=(n:string)=>one(a,b.block,b.policy.orderBook!.address,PROTOCOL_ABIS.OrderBook,n);
 const surplusBeneficiary=orderRecipient(b,await get('surplusBeneficiary')),surplusAdministrator=address(await get('surplusAdministrator')),
 pendingSurplusAdministrator=address(await get('pendingSurplusAdministrator'),true),surplusBeneficiaryChangeDelay=uint(await get('surplusBeneficiaryChangeDelay'),64,true),
 pendingSurplusBeneficiary=address(await get('pendingSurplusBeneficiary'),true),pendingSurplusBeneficiaryActivationTime=uint(await get('pendingSurplusBeneficiaryActivationTime'),64);
 if([surplusAdministrator,pendingSurplusAdministrator].includes(b.policy.orderBook!.address))fail('Invalid surplus administrator');
 if(pendingSurplusBeneficiary!==ZERO_ADDRESS)orderRecipient(b,pendingSurplusBeneficiary);
 if((pendingSurplusBeneficiary===ZERO_ADDRESS)!==(pendingSurplusBeneficiaryActivationTime===0n))fail('Inconsistent surplus proposal');
 await stable(a,b.policy.chainId,b.block);const s=Object.freeze({book:b,surplusBeneficiary,surplusAdministrator,pendingSurplusAdministrator,surplusBeneficiaryChangeDelay,pendingSurplusBeneficiary,pendingSurplusBeneficiaryActivationTime});states.set(s,b);return s;
}
function surplusCaller(c:AdministrationCaller,s:SurplusControlState):VerifiedOrderBook{
 if(!callers.has(c)||c.target.kind!=='order-book')fail('Unverified surplus caller');requireOrderBook(c.target);
 if(states.get(s)!==c.target)fail('Surplus state belongs to another target/block');return c.target;
}
function surplusPlan(c:AdministrationCaller,s:SurplusControlState,operation:SurplusOperation,name:string,args:readonly unknown[],codec:ProtocolCodec,proposed?:Address,gasLimit?:bigint):AdministrationPlan{
 const b=surplusCaller(c,s);return plan(codec,'OrderBook',b.policy.chainId,c.effectiveCaller,c.callerKind,b.policy.orderBook!.address,name,args,{kind:'book',operation,book:b,...(proposed?{proposed}:{})},false,gasLimit);
}
export function buildProposeSurplusBeneficiary(c:AdministrationCaller,s:SurplusControlState,proposed:Address,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 const b=surplusCaller(c,s),p=orderRecipient(b,proposed);equal(c.effectiveCaller,s.surplusAdministrator,'surplus administrator');if(p===s.surplusBeneficiary)fail('Unchanged surplus beneficiary');
 uint(b.block.timestamp+s.surplusBeneficiaryChangeDelay,64);return surplusPlan(c,s,'propose-surplus-beneficiary','proposeSurplusBeneficiary',[p],codec,p,gasLimit);
}
export function buildCancelSurplusBeneficiaryProposal(c:AdministrationCaller,s:SurplusControlState,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 surplusCaller(c,s);equal(c.effectiveCaller,s.surplusAdministrator,'surplus administrator');if(s.pendingSurplusBeneficiary===ZERO_ADDRESS)fail('No pending surplus beneficiary');
 return surplusPlan(c,s,'cancel-surplus-beneficiary','cancelSurplusBeneficiaryProposal',[],codec,undefined,gasLimit);
}
export function buildAcceptSurplusBeneficiary(c:AdministrationCaller,s:SurplusControlState,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 const b=surplusCaller(c,s);if(s.pendingSurplusBeneficiary===ZERO_ADDRESS)fail('No pending surplus beneficiary');equal(c.effectiveCaller,s.pendingSurplusBeneficiary,'pending surplus beneficiary');
 if(b.block.timestamp<s.pendingSurplusBeneficiaryActivationTime)fail('Surplus activation not ready');return surplusPlan(c,s,'accept-surplus-beneficiary','acceptSurplusBeneficiary',[],codec,undefined,gasLimit);
}
export function buildProposeSurplusAdministrator(c:AdministrationCaller,s:SurplusControlState,proposed:Address,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 const b=surplusCaller(c,s),p=address(proposed);equal(c.effectiveCaller,s.surplusAdministrator,'surplus administrator');if(p===b.policy.orderBook!.address||p===s.surplusAdministrator)fail('Invalid surplus administrator');
 return surplusPlan(c,s,'propose-surplus-administrator','proposeSurplusAdministrator',[p],codec,p,gasLimit);
}
export function buildAcceptSurplusAdministrator(c:AdministrationCaller,s:SurplusControlState,codec:ProtocolCodec,gasLimit?:bigint):AdministrationPlan{
 surplusCaller(c,s);if(s.pendingSurplusAdministrator===ZERO_ADDRESS)fail('No pending surplus administrator');equal(c.effectiveCaller,s.pendingSurplusAdministrator,'pending surplus administrator');
 return surplusPlan(c,s,'accept-surplus-administrator','acceptSurplusAdministrator',[],codec,undefined,gasLimit);
}
