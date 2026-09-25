// SPDX-License-Identifier: UNLICENSED
// Offline metadata only. No provider, signer, broadcaster, key or execution implementation.
import {Address,Hex,Mode,address,hash,uint,field,optional,array,equal,fail} from './protocolData.js';
import {ProtocolPolicy,DeploymentAnchor,normalizeProtocolPolicy} from './poolIdentity.js';

export const DEPLOYMENT_MANIFEST_SCHEMA = 'cipherdex.deployment-manifest/1' as const;
export const DEPLOYMENT_MANIFEST_LIMITS = Object.freeze({bytes:524288,depth:24,nodes:16000,actions:36,artifacts:28});
export type DeploymentEnvironment = 'local-simulator'|'coti-testnet'|'coti-mainnet';
export type ComponentId = 'registry'|'publicLpIssuer'|'privateLpIssuer'|'wrappedNative'|
 'mode0.vault'|'mode0.deployer'|'mode0.factory'|'mode0.initializer'|'mode0.router'|
 'mode1.vault'|'mode1.deployer'|'mode1.factory'|'mode1.initializer'|'mode1.router'|
 'mode2.vault'|'mode2.deployer'|'mode2.factory'|'mode2.initializer'|'mode2.router'|
 'public.liquidity'|'public.nativeSwap'|'public.nativeLiquidity'|'public.orders';
export type ArtifactId = ComponentId|'template.pool0'|'template.pool1'|'template.pool2'|'template.publicLp'|'template.privateLp';
export type ConstructorInput = Readonly<{name:string;type:string}>;
export type DeploymentArtifactRecord = Readonly<{
 id:ArtifactId;contractName:string;contextRoot:string;buildInfoId:string;sourceSha256:Hex;settingsSha256:Hex;abiHash:Hex;
 creationCodehash:Hex;runtimeTemplateCodehash:Hex;creationBytes:bigint;runtimeBytes:bigint;
 constructorInputs:readonly ConstructorInput[];constructorArgumentBytes:bigint|null;fullInitCodeBytes:bigint|null;
}>;
export type DeploymentBuildRecord = Readonly<{
 sourceCommit:string;sourceTreeClean:true;sourceTreeSha256:Hex;lockfileSha256:Hex;compilerPolicySha256:Hex;
 cleanBuildRecord:Readonly<{path:string;gitBlobSha256:Hex}>;
 compilerVersion:'0.8.28';nodeVersion:'24.16.0';npmVersion:'11.13.0';
 artifacts:readonly DeploymentArtifactRecord[];
}>;
export type InitialVaultRoles = Readonly<{mode:Mode;beneficiary:Address|null;feeAdministrator:Address|null;beneficiaryChangeDelay:bigint|null}>;
export type InitialOrderSurplusControl=Readonly<{kind:'rotatable-v1';administrator:Address|null;beneficiaryChangeDelay:bigint|null}>;
export type ObservedOrderSurplusControl=Readonly<{beneficiary:Address;administrator:Address;pendingBeneficiary:Address|null;pendingBeneficiaryActivationTime:bigint;pendingAdministrator:Address|null}>;
export type DeploymentConfiguration = Readonly<{
 environment:DeploymentEnvironment;chainId:bigint|null;deploymentCaller:Address|null;configurationCaller:Address|null;
 registryOwner:Address|null;vaults:readonly InitialVaultRoles[];surplusBeneficiary:Address|null;wrappedNative:DeploymentAnchor|null;orderSurplusControl?:InitialOrderSurplusControl;
}>;
export type ComponentReference = Readonly<{component:ComponentId}>;
export type PlanningArgument = Address|bigint|null|ComponentReference;
export type DeploymentAction = Readonly<{
 id:string;kind:'deploy'|'call';component:ComponentId;functionName:'constructor'|'bindFactory'|'bindProtectedInitializer'|'bindBestExecutionRouter'|'finalize';
 requiredCaller:Address|null;args:readonly PlanningArgument[];predecessors:readonly string[];status:'planned';
}>;
export type DraftDeploymentManifest = Readonly<{
 schema:typeof DEPLOYMENT_MANIFEST_SCHEMA;protocolVersion:1;kind:'draft';configuration:DeploymentConfiguration;
 build:DeploymentBuildRecord;actions:readonly DeploymentAction[];missingInputs:readonly string[];complete:boolean;
}>;
export type DeploymentBlock = Readonly<{number:bigint;hash:Hex;timestamp:bigint}>;
export type ObservedAction = Readonly<{
 actionId:string;status:'verified'|'failed'|'uncertain'|'not-observed';transactionHash:Hex|null;
 block:DeploymentBlock|null;transactionIndex:bigint|null;gasUsed:bigint|null;
 deployedAddress:Address|null;runtimeCodehash:Hex|null;initCodeHash:Hex|null;
}>;
export type ObservedComponent = Readonly<{
 id:ComponentId;address:Address;runtimeCodehash:Hex;deploymentActionId:string|null;
 creationCodehash:Hex|null;creationCodeLength:bigint|null;
}>;
export type ObservedDeploymentManifest = Readonly<{
 schema:typeof DEPLOYMENT_MANIFEST_SCHEMA;protocolVersion:1;kind:'observed';plan:DraftDeploymentManifest;
 observationEnvironment:DeploymentEnvironment;planDigest:Hex;atBlock:DeploymentBlock;
 actions:readonly ObservedAction[];components:readonly ObservedComponent[];
 mutableRoles:Readonly<{registryOwner:Address;pendingRegistryOwner:Address|null;vaults:readonly Readonly<{
  mode:Mode;beneficiary:Address;feeAdministrator:Address;pendingBeneficiary:Address|null;pendingFeeAdministrator:Address|null;
 }>[];orderSurplus?:ObservedOrderSurplusControl}>|null;result:'verified'|'incomplete';
}>;
export interface ManifestDigestAdapter {hashUtf8(canonicalText:string):unknown}
export type ManifestReview = Readonly<{expectedChainId:bigint;environment:DeploymentEnvironment;planDigest:Hex;observedDigest:Hex}>;

const prefixes=['CipherDEXPublic','CipherDEXConfidential','CipherDEXObservableConfidential'] as const;
const defs:Readonly<{id:ArtifactId;contractName:string;kind:'bootstrap'|'template'|'reused'}>[]=[
 {id:'registry',contractName:'CipherDEXLaunchFactoryRegistry',kind:'bootstrap'},
 {id:'publicLpIssuer',contractName:'CipherDEXPublicLPTokenFactory',kind:'bootstrap'},
 {id:'privateLpIssuer',contractName:'CipherDEXPrivateLPTokenFactory',kind:'bootstrap'},
 ...prefixes.flatMap((p,m)=>[
  ...[['vault','ProtocolFeeVault'],['deployer','CPMMDeployer'],['factory','CPMMFactory'],['initializer','ProtectedInitializer'],['router','BestExecutionRouter']].map(([key,suffix])=>({id:('mode'+m+'.'+key) as ArtifactId,contractName:p+suffix,kind:'bootstrap' as const})),
  {id:('template.pool'+m) as ArtifactId,contractName:p+'CPMM',kind:'template' as const},
 ]),
 {id:'public.liquidity',contractName:'CipherDEXPublicLiquidityRouter',kind:'bootstrap'},
 {id:'public.nativeSwap',contractName:'CipherDEXPublicBestExecutionNativeRouter',kind:'bootstrap'},
 {id:'public.nativeLiquidity',contractName:'CipherDEXPublicNativeRouter',kind:'bootstrap'},
 {id:'public.orders',contractName:'CipherDEXPublicLimitOrderBook',kind:'bootstrap'},
 {id:'template.publicLp',contractName:'CipherDEXPublicLPToken',kind:'template'},
 {id:'template.privateLp',contractName:'CipherDEXPrivateLPToken',kind:'template'},
 {id:'wrappedNative',contractName:'WrappedNativeToken',kind:'reused'},
];
export const DEPLOYMENT_INVENTORY=Object.freeze(defs.map(d=>Object.freeze(d)));
function exact(v:unknown,keys:readonly string[]):void {
 if(v===null||typeof v!=='object'||Array.isArray(v))fail('Expected manifest record');
 const own=Reflect.ownKeys(v);if(own.some(k=>typeof k!=='string')||own.length!==keys.length||keys.some(k=>!own.includes(k)))fail('Unknown/missing manifest fields');
 for(const k of keys)field(v,k);
}
function text(v:unknown,max=200):string {if(typeof v!=='string'||v.length===0||v.length>max||/[^\x20-\x7e]/.test(v))fail('Invalid metadata text');return v;}
function environment(v:unknown):DeploymentEnvironment {if(!['local-simulator','coti-testnet','coti-mainnet'].includes(v as string))fail('Invalid deployment environment');return v as DeploymentEnvironment;}
function nullable<T>(v:unknown,f:(x:unknown)=>T):T|null {return v===null?null:f(v);}
function component(v:unknown):ComponentId {if(!defs.some(d=>d.id===v&&d.kind!=='template'))fail('Unknown component');return v as ComponentId;}
function recBlock(v:unknown):DeploymentBlock {exact(v,['number','hash','timestamp']);return Object.freeze({number:uint(field(v,'number')),hash:hash(field(v,'hash'),true),timestamp:uint(field(v,'timestamp'),64)});}
function modeNumber(v:unknown):Mode {if(v!==0&&v!==1&&v!==2)fail('Invalid mode');return v;}
function anchor(v:unknown):DeploymentAnchor {exact(v,['address','runtimeCodehash']);return Object.freeze({address:address(field(v,'address')),runtimeCodehash:hash(field(v,'runtimeCodehash'),true)});}
function config(v:unknown):DeploymentConfiguration {
 const hasSurplus=Object.hasOwn(v as object,'orderSurplusControl');
 exact(v,['environment','chainId','deploymentCaller','configurationCaller','registryOwner','vaults','surplusBeneficiary','wrappedNative',...(hasSurplus?['orderSurplusControl']:[])]);
 let orderSurplusControl:InitialOrderSurplusControl|undefined;
 if(hasSurplus){const x=field(v,'orderSurplusControl');exact(x,['kind','administrator','beneficiaryChangeDelay']);equal(field(x,'kind'),'rotatable-v1','order surplus format');orderSurplusControl=Object.freeze({kind:'rotatable-v1',administrator:nullable(field(x,'administrator'),address),beneficiaryChangeDelay:nullable(field(x,'beneficiaryChangeDelay'),v=>uint(v,64,true))});}
 const vaults=array(field(v,'vaults'),3,3).map((r,i)=>{
  exact(r,['mode','beneficiary','feeAdministrator','beneficiaryChangeDelay']);equal(modeNumber(field(r,'mode')),i,'ordered vault mode');
  return Object.freeze({mode:i as Mode,beneficiary:nullable(field(r,'beneficiary'),address),feeAdministrator:nullable(field(r,'feeAdministrator'),address),
   beneficiaryChangeDelay:nullable(field(r,'beneficiaryChangeDelay'),x=>uint(x,64,true))});
 });
 const deploymentEnvironment=environment(field(v,'environment')),chainId=nullable(field(v,'chainId'),x=>uint(x,256,true));
 // Named network IDs follow the existing reviewed hardhat.config.ts. They are
 // consistency constraints, never defaults or evidence of a deployed environment.
 if(chainId!==null&&((deploymentEnvironment==='coti-mainnet'&&chainId!==2632500n)||(deploymentEnvironment==='coti-testnet'&&chainId!==7082400n)))fail('Named COTI network/chain mismatch');
 return Object.freeze({environment:deploymentEnvironment,chainId,
  deploymentCaller:nullable(field(v,'deploymentCaller'),address),configurationCaller:nullable(field(v,'configurationCaller'),address),registryOwner:nullable(field(v,'registryOwner'),address),
  vaults:Object.freeze(vaults),surplusBeneficiary:nullable(field(v,'surplusBeneficiary'),address),wrappedNative:nullable(field(v,'wrappedNative'),anchor),...(orderSurplusControl?{orderSurplusControl}:{})});
}
function build(v:unknown):DeploymentBuildRecord {
 exact(v,['sourceCommit','sourceTreeClean','sourceTreeSha256','lockfileSha256','compilerPolicySha256','cleanBuildRecord','compilerVersion','nodeVersion','npmVersion','artifacts']);
 const cleanRecord=field(v,'cleanBuildRecord');exact(cleanRecord,['path','gitBlobSha256']);
 const cleanPath=text(field(cleanRecord,'path'));if(!/^evidence\/[a-zA-Z0-9_./-]+\.json$/.test(cleanPath)||cleanPath.split('/').includes('..'))fail('Invalid clean-build evidence path');
 const cleanBuildRecord=Object.freeze({path:cleanPath,gitBlobSha256:hash(field(cleanRecord,'gitBlobSha256'),true)});
 const commit=text(field(v,'sourceCommit'),40);if(!/^[0-9a-f]{40}$/.test(commit))fail('Full source commit required');
 equal(field(v,'sourceTreeClean'),true,'clean source');equal(field(v,'compilerVersion'),'0.8.28','compiler');equal(field(v,'nodeVersion'),'24.16.0','Node pin');equal(field(v,'npmVersion'),'11.13.0','npm pin');
 const artifacts=array(field(v,'artifacts'),28,28).map((r,i)=>{
  exact(r,['id','contractName','contextRoot','buildInfoId','sourceSha256','settingsSha256','abiHash','creationCodehash','runtimeTemplateCodehash','creationBytes','runtimeBytes','constructorInputs','constructorArgumentBytes','fullInitCodeBytes']);
  const d=defs[i];equal(field(r,'id'),d.id,'artifact inventory/order');equal(field(r,'contractName'),d.contractName,'artifact name');
  const inputs=array(field(r,'constructorInputs'),16).map(x=>{exact(x,['name','type']);const type=text(field(x,'type'),32);if(!/^(address|uint(8|64|128|256)|string)$/.test(type))fail('Unsupported constructor type');return Object.freeze({name:text(field(x,'name'),80),type});});
  const creationBytes=uint(field(r,'creationBytes'),32,true),runtimeBytes=uint(field(r,'runtimeBytes'),32,true);
  const constructorArgumentBytes=nullable(field(r,'constructorArgumentBytes'),x=>uint(x,32)),fullInitCodeBytes=nullable(field(r,'fullInitCodeBytes'),x=>uint(x,32,true));
  if(d.kind==='reused'){if(constructorArgumentBytes!==null||fullInitCodeBytes!==null)fail('Reused wrapper constructor inputs are historical, not guessed');}
  else{equal(constructorArgumentBytes,32n*BigInt(inputs.length),'full constructor argument bytes');equal(fullInitCodeBytes,creationBytes+constructorArgumentBytes!,'full init code');if(fullInitCodeBytes!>49152n)fail('Full init code size bound');}
  if(runtimeBytes>24576n||creationBytes>49152n)fail('Artifact size bound');
  const contextRoot=text(field(r,'contextRoot'));if(contextRoot!=='contracts/'+d.contractName+'.sol')fail('Wrong artifact compilation root');
  return Object.freeze({id:d.id,contractName:d.contractName,contextRoot,buildInfoId:text(field(r,'buildInfoId')),
   sourceSha256:hash(field(r,'sourceSha256'),true),settingsSha256:hash(field(r,'settingsSha256'),true),abiHash:hash(field(r,'abiHash'),true),
   creationCodehash:hash(field(r,'creationCodehash'),true),runtimeTemplateCodehash:hash(field(r,'runtimeTemplateCodehash'),true),creationBytes,runtimeBytes,constructorInputs:Object.freeze(inputs),constructorArgumentBytes,fullInitCodeBytes});
 });
 return Object.freeze({sourceCommit:commit,sourceTreeClean:true,cleanBuildRecord,sourceTreeSha256:hash(field(v,'sourceTreeSha256'),true),lockfileSha256:hash(field(v,'lockfileSha256'),true),
  compilerPolicySha256:hash(field(v,'compilerPolicySha256'),true),compilerVersion:'0.8.28',nodeVersion:'24.16.0',npmVersion:'11.13.0',artifacts:Object.freeze(artifacts)});
}
const ref=(id:string):ComponentReference=>Object.freeze({component:component(id)});
function actions(c:DeploymentConfiguration,b:DeploymentBuildRecord):readonly DeploymentAction[] {
 const out:DeploymentAction[]=[];
 function add(kind:'deploy'|'call',id:ComponentId,name:DeploymentAction['functionName'],args:readonly PlanningArgument[]){
  const actionId=kind==='deploy'?'deploy:'+id:name+':'+id;
  // A fixed total order is deliberately conservative: no nonce allocation or parallel executor.
  out.push(Object.freeze({id:actionId,kind,component:id,functionName:name,requiredCaller:kind==='deploy'?c.deploymentCaller:c.configurationCaller,
   args:Object.freeze(args),predecessors:Object.freeze(out.length?[out[out.length-1].id]:[]),status:'planned'}));
  if(kind==='deploy'){
   const a=b.artifacts.find(x=>x.id===id)!;
   if(a.constructorInputs.length!==args.length||a.constructorInputs.some(i=>i.type==='string'))fail('Constructor ABI argument shape mismatch');
   if(a.creationBytes+32n*BigInt(args.length)>49152n)fail('Full init code including arguments exceeds bound');
  }
 }
 add('deploy','registry','constructor',[c.registryOwner]);add('deploy','publicLpIssuer','constructor',[]);add('deploy','privateLpIssuer','constructor',[]);
 for(const m of [0,1,2] as const){
  const p='mode'+m,roles=c.vaults[m],id=(x:string)=>component(p+'.'+x);
  add('deploy',id('vault'),'constructor',[roles.beneficiary,c.configurationCaller,roles.feeAdministrator,roles.beneficiaryChangeDelay]);
  add('deploy',id('deployer'),'constructor',[c.configurationCaller]);
  const issuer=ref(m===0?'publicLpIssuer':'privateLpIssuer');
  add('deploy',id('factory'),'constructor',m===0?[issuer,ref(p+'.vault'),ref('registry'),ref(p+'.deployer')]:[ref(p+'.vault'),issuer,ref('registry'),ref(p+'.deployer')]);
  add('call',id('deployer'),'bindFactory',[ref(p+'.factory')]);add('call',id('vault'),'bindFactory',[ref(p+'.factory')]);
  add('deploy',id('initializer'),'constructor',[ref(p+'.factory'),ref('registry')]);
  add('call',id('factory'),'bindProtectedInitializer',[ref(p+'.initializer')]);
  if(m!==0){add('deploy',id('router'),'constructor',[ref(p+'.factory')]);add('call',id('factory'),'bindBestExecutionRouter',[ref(p+'.router')]);}
  add('call',id('factory'),'finalize',[]);
 }
 add('deploy','mode0.router','constructor',[ref('mode0.factory')]);
 add('deploy','public.liquidity','constructor',[ref('mode0.factory')]);
 add('deploy','public.nativeSwap','constructor',[ref('mode0.factory'),ref('mode0.router'),ref('wrappedNative')]);
 add('deploy','public.nativeLiquidity','constructor',[ref('mode0.factory'),ref('public.liquidity'),ref('wrappedNative')]);
 add('deploy','public.orders','constructor',[ref('mode0.factory'),ref('mode0.router'),ref('wrappedNative'),c.surplusBeneficiary,...(c.orderSurplusControl?[c.orderSurplusControl.administrator,c.orderSurplusControl.beneficiaryChangeDelay]:[])]);
 return Object.freeze(out);
}
/** Missing explicit inputs are retained as null; complete planning never substitutes zero. */
export function createDeploymentDraft(configuration:DeploymentConfiguration,buildRecord:DeploymentBuildRecord):DraftDeploymentManifest {
 const b=build(buildRecord),input=config(configuration),order=b.artifacts.find(a=>a.id==='public.orders')!;
 const rotating=order.constructorInputs.length===6;
 if(!rotating&&order.constructorInputs.length!==4)fail('Unsupported order constructor format');
 if(!rotating&&input.orderSurplusControl)fail('Surplus control format requires six-argument order artifact');
 const c=rotating&&!input.orderSurplusControl?config({...input,orderSurplusControl:{kind:'rotatable-v1',administrator:null,beneficiaryChangeDelay:null}}):input,missing:string[]=[];
 if(c.orderSurplusControl)for(const k of ['administrator','beneficiaryChangeDelay'] as const)if(c.orderSurplusControl[k]===null)missing.push('orderSurplusControl.'+k);
 for(const k of ['chainId','deploymentCaller','configurationCaller','registryOwner','surplusBeneficiary','wrappedNative'] as const)if(c[k]===null)missing.push(k);
 for(const v of c.vaults)for(const k of ['beneficiary','feeAdministrator','beneficiaryChangeDelay'] as const)if(v[k]===null)missing.push('vaults.'+v.mode+'.'+k);
 return Object.freeze({schema:DEPLOYMENT_MANIFEST_SCHEMA,protocolVersion:1,kind:'draft',configuration:c,build:b,actions:actions(c,b),missingInputs:Object.freeze(missing),complete:missing.length===0});
}
export function requireCompleteDeploymentDraft(input:DraftDeploymentManifest):DraftDeploymentManifest {
 const p=validateDeploymentManifest(input);if(p.kind!=='draft'||!p.complete)fail('Unresolved required deployment inputs');return p;
}
function canonical(v:unknown):string {
 let nodes=0;
 function encode(x:unknown,depth:number):string {
  if(++nodes>16000||depth>24)fail('Manifest structural bound');
  if(x===null)return 'null';if(typeof x==='bigint')return '{"$uint":'+JSON.stringify(uint(x).toString())+'}';
  if(typeof x==='boolean')return x?'true':'false';
  if(typeof x==='number'){if(!Number.isSafeInteger(x)||x<0)fail('Invalid metadata number');return String(x);}
  if(typeof x==='string'){if(x.length>4096)fail('Manifest text bound');return JSON.stringify(x);}
  if(Array.isArray(x))return '['+array(x,4096).map(y=>encode(y,depth+1)).join(',')+']';
  if(!x||typeof x!=='object')return fail('Invalid manifest data');
  const keys=Reflect.ownKeys(x);if(keys.some(k=>typeof k!=='string')||keys.includes('$uint'))fail('Reserved/invalid record key');
  return '{'+(keys as string[]).sort().map(k=>JSON.stringify(k)+':'+encode(field(x,k),depth+1)).join(',')+'}';
 }
 const result=encode(v,0);if(result.length>524288||/[^\x00-\x7f]/.test(result))fail('Manifest byte bound/encoding');return result;
}
function same(a:unknown,b:unknown,label:string){equal(canonical(a),canonical(b),label);}
export function validateDeploymentManifest(input:unknown):DraftDeploymentManifest|ObservedDeploymentManifest {
 equal(field(input,'schema'),DEPLOYMENT_MANIFEST_SCHEMA,'manifest schema');equal(field(input,'protocolVersion'),1,'protocol version');
 if(field(input,'kind')==='draft'){
  exact(input,['schema','protocolVersion','kind','configuration','build','actions','missingInputs','complete']);
  const expected=createDeploymentDraft(field(input,'configuration') as DeploymentConfiguration,field(input,'build') as DeploymentBuildRecord);
  same(field(input,'actions'),expected.actions,'fixed bootstrap order/arguments');same(field(input,'missingInputs'),expected.missingInputs,'missing inputs');
  equal(field(input,'complete'),expected.complete,'draft completeness');return expected;
 }
 equal(field(input,'kind'),'observed','manifest kind');
 exact(input,['schema','protocolVersion','kind','plan','observationEnvironment','planDigest','atBlock','actions','components','mutableRoles','result']);
 const p=requireCompleteDeploymentDraft(field(input,'plan') as DraftDeploymentManifest),env=environment(field(input,'observationEnvironment'));
 equal(env,p.configuration.environment,'observation environment');const at=recBlock(field(input,'atBlock'));
 const rows=array(field(input,'actions'),36,36).map((r,i)=>{
  exact(r,['actionId','status','transactionHash','block','transactionIndex','gasUsed','deployedAddress','runtimeCodehash','initCodeHash']);
  const actionId=text(field(r,'actionId'));equal(actionId,p.actions[i].id,'observed action order');
  const status=field(r,'status');if(!['verified','failed','uncertain','not-observed'].includes(status as string))fail('Unknown action status');
  const out={actionId,status:status as ObservedAction['status'],transactionHash:nullable(field(r,'transactionHash'),x=>hash(x,true)),block:nullable(field(r,'block'),recBlock),
   transactionIndex:nullable(field(r,'transactionIndex'),x=>uint(x)),gasUsed:nullable(field(r,'gasUsed'),x=>uint(x,256,true)),
   deployedAddress:nullable(field(r,'deployedAddress'),address),runtimeCodehash:nullable(field(r,'runtimeCodehash'),x=>hash(x,true)),initCodeHash:nullable(field(r,'initCodeHash'),x=>hash(x,true))};
  if(status==='verified'){
   if(!out.transactionHash||!out.block||out.transactionIndex===null||out.gasUsed===null)fail('Verified action lacks mined evidence');
   if(out.block.number>at.number)fail('Receipt after readback block');
   if(p.actions[i].kind==='deploy'){if(!out.deployedAddress||!out.runtimeCodehash||!out.initCodeHash)fail('Deployment lacks actual address/code');}
   else if(out.deployedAddress!==null||out.runtimeCodehash!==null||out.initCodeHash!==null)fail('Call is not deployment');
  }else if(out.deployedAddress!==null||out.runtimeCodehash!==null||out.initCodeHash!==null)fail('Unverified address is not a deployed component');
  return Object.freeze(out);
 });
 const seenTx=new Set<Hex>();let prior:ObservedAction|null=null;
 for(const row of rows){
  if(row.transactionHash){if(seenTx.has(row.transactionHash))fail('Duplicate transaction');seenTx.add(row.transactionHash);}
  if(row.status==='verified'){
   if(prior&&(row.block!.number<prior.block!.number||(row.block!.number===prior.block!.number&&row.transactionIndex!<=prior.transactionIndex!)))fail('Predecessor receipt ordering');
   prior=row;
  }
 }
 const comps=array(field(input,'components'),23).map(r=>{
  exact(r,['id','address','runtimeCodehash','deploymentActionId','creationCodehash','creationCodeLength']);
  const id=component(field(r,'id')),a=address(field(r,'address')),runtimeCodehash=hash(field(r,'runtimeCodehash'),true),
   dep=nullable(field(r,'deploymentActionId'),text),creationCodehash=nullable(field(r,'creationCodehash'),x=>hash(x,true)),creationCodeLength=nullable(field(r,'creationCodeLength'),x=>uint(x,32,true));
  if(id==='wrappedNative'){same({address:a,runtimeCodehash},p.configuration.wrappedNative,'reviewed reused wrapper');if(dep!==null||creationCodehash!==null||creationCodeLength!==null)fail('Wrapper is reused, not a bootstrap deployment');}
  else {const row=rows.find(x=>x.actionId===dep);if(dep!=='deploy:'+id||row?.status!=='verified'||row.deployedAddress!==a||row.runtimeCodehash!==runtimeCodehash)fail('Component lacks matching verified deployment');}
  if(/^mode[12]\.deployer$/.test(id)){
   const pool=p.build.artifacts.find(x=>x.id==='template.pool'+id[4])!;equal(creationCodehash,pool.creationCodehash,'sealed child creation commitment');equal(creationCodeLength,pool.creationBytes,'child creation length');
  }else if(creationCodehash!==null||creationCodeLength!==null)fail('Unexpected child commitment');
  return Object.freeze({id,address:a,runtimeCodehash,deploymentActionId:dep,creationCodehash,creationCodeLength});
 });
 if(new Set(comps.map(x=>x.id)).size!==comps.length||new Set(comps.map(x=>x.address)).size!==comps.length)fail('Duplicate/conflicting components');
 const roles=field(input,'mutableRoles');if(roles!==null)exact(roles,['registryOwner','pendingRegistryOwner','vaults',...(p.configuration.orderSurplusControl?['orderSurplus']:[])]);
 let orderSurplus:ObservedOrderSurplusControl|undefined;
 if(roles!==null&&p.configuration.orderSurplusControl){const x=field(roles,'orderSurplus');exact(x,['beneficiary','administrator','pendingBeneficiary','pendingBeneficiaryActivationTime','pendingAdministrator']);const pendingBeneficiary=nullable(field(x,'pendingBeneficiary'),address),pendingBeneficiaryActivationTime=uint(field(x,'pendingBeneficiaryActivationTime'),64);if((pendingBeneficiary===null)!==(pendingBeneficiaryActivationTime===0n))fail('Inconsistent observed surplus proposal');orderSurplus=Object.freeze({beneficiary:address(field(x,'beneficiary')),administrator:address(field(x,'administrator')),pendingBeneficiary,pendingBeneficiaryActivationTime,pendingAdministrator:nullable(field(x,'pendingAdministrator'),address)});}
 const vaults=roles===null?[]:array(field(roles,'vaults'),3,3).map((r,i)=>{
  exact(r,['mode','beneficiary','feeAdministrator','pendingBeneficiary','pendingFeeAdministrator']);equal(modeNumber(field(r,'mode')),i,'mutable mode');
  return Object.freeze({mode:i as Mode,beneficiary:address(field(r,'beneficiary')),feeAdministrator:address(field(r,'feeAdministrator')),
   pendingBeneficiary:nullable(field(r,'pendingBeneficiary'),address),pendingFeeAdministrator:nullable(field(r,'pendingFeeAdministrator'),address)});
 });
 const result=field(input,'result');if(result!=='verified'&&result!=='incomplete')fail('Invalid observation result');
 const complete=rows.every(r=>r.status==='verified')&&comps.length===23;
 if(result==='verified'&&(!complete||roles===null))fail('Incomplete/uncertain record cannot be verified');
 return Object.freeze({schema:DEPLOYMENT_MANIFEST_SCHEMA,protocolVersion:1,kind:'observed',plan:p,observationEnvironment:env,planDigest:hash(field(input,'planDigest'),true),atBlock:at,
  actions:Object.freeze(rows),components:Object.freeze(comps),mutableRoles:roles===null?null:Object.freeze({registryOwner:address(field(roles,'registryOwner')),pendingRegistryOwner:nullable(field(roles,'pendingRegistryOwner'),address),vaults:Object.freeze(vaults),...(orderSurplus?{orderSurplus}:{})}),result});
}
export function serializeDeploymentManifest(input:DraftDeploymentManifest|ObservedDeploymentManifest):string {return canonical(validateDeploymentManifest(input))+'\n';}
/** Canonical-only parsing rejects duplicate keys, lossy numbers and ambiguous encodings. */
export function parseDeploymentManifest(raw:string):DraftDeploymentManifest|ObservedDeploymentManifest {
 if(typeof raw!=='string'||raw.length>524289)fail('Manifest byte bound');
 let parsed:unknown;try{parsed=JSON.parse(raw,(k,v)=>{
  if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.hasOwn(v,'$uint')){
   if(Object.keys(v).length!==1||typeof v.$uint!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(v.$uint))fail('Invalid bigint encoding');return uint(BigInt(v.$uint));
  }return v;
 });}catch {return fail('Invalid manifest JSON');}
 const result=validateDeploymentManifest(parsed);equal(serializeDeploymentManifest(result),raw,'canonical manifest encoding');return result;
}
export function deploymentManifestDigest(input:DraftDeploymentManifest|ObservedDeploymentManifest,adapter:ManifestDigestAdapter):Hex {
 return hash(adapter.hashUtf8(serializeDeploymentManifest(input)),true);
}
/** Independent reviewed digests are required. This returns an UNAUTHENTICATED policy;
 * the integration must still call verifyProtocolBundle against its reviewed provider.
 * Local simulator observations can only produce local-simulator policies. */
export function protocolPolicyFromObserved(input:ObservedDeploymentManifest,requestedMode:Mode,review:ManifestReview,digester:ManifestDigestAdapter):ProtocolPolicy {
 const r=validateDeploymentManifest(input);if(r.kind!=='observed'||r.result!=='verified')fail('Verified observation required');
 const m=modeNumber(requestedMode);exact(review,['expectedChainId','environment','planDigest','observedDigest']);
 equal(r.plan.configuration.chainId,uint(field(review,'expectedChainId'),256,true),'reviewed chain');equal(r.observationEnvironment,environment(field(review,'environment')),'reviewed environment');
 equal(deploymentManifestDigest(r.plan,digester),r.planDigest,'record plan digest');equal(r.planDigest,hash(field(review,'planDigest'),true),'independent plan review');
 equal(deploymentManifestDigest(r,digester),hash(field(review,'observedDigest'),true),'independent observed review');
 const get=(id:ComponentId):DeploymentAnchor=>{const c=r.components.find(x=>x.id===id)??fail('Missing component');return Object.freeze({address:c.address,runtimeCodehash:c.runtimeCodehash});};
 const p='mode'+m,id=(key:string)=>component(p+'.'+key);
 return normalizeProtocolPolicy({chainId:r.plan.configuration.chainId!,mode:m,factory:get(id('factory')),deployer:get(id('deployer')),vault:get(id('vault')),
  lpIssuer:get(m===0?'publicLpIssuer':'privateLpIssuer'),registry:get('registry'),initializer:get(id('initializer')),router:get(id('router')),
  ...(m!==0?{poolCreationCodehash:r.components.find(x=>x.id===id('deployer'))!.creationCodehash!}:{
   wrappedNative:get('wrappedNative'),nativeRouter:get('public.nativeSwap'),liquidityRouter:get('public.liquidity'),nativeLiquidityRouter:get('public.nativeLiquidity'),orderBook:get('public.orders')})});
}
