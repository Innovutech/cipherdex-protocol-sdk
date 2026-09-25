// SPDX-License-Identifier: UNLICENSED
import {PROTOCOL_ABIS,PROTOCOL_EVENT_TOPICS} from './protocolAbi.js';
import {Address,Hex,ProtocolCodec,address,hash,hex,uint,field,tuple,equal,fail,stable,ZERO_HASH} from './protocolData.js';
import {VerifiedBundle,VerifiedPool,authenticatePool,verifyProtocolBundle} from './poolIdentity.js';
import {ProtocolCall,context} from './protocolExecution.js';
import {ProtocolReceiptAdapter,verifyReceiptTransaction,verifyMinedReceipt} from './protocolResults.js';
import {ProtectedInnerCall,ProtectedGTGuidance,ProtectedEventContext,protectedEventContext} from './protectedInitialization.js';
import {LPLockMetadata,readLPLock} from './lpPosition.js';

type ReservationFact=Readonly<{
 kind:'reservation';eventName:'ProtectedPoolReserved'|'ProtectedPoolCreated';
 pool:Address;key:Hex;lpToken:Address;launchFactory:Address;protectedToken:Address;
}>;
type GraduationFact=Readonly<{
 kind:'graduation';eventName:'ProtectedPoolGraduated';pool:Address;key:Hex;lpToken:Address;
 launchFactory:Address;effectiveCaller:Address;protectedToken:Address;lpRecipient:Address;
 disposition:bigint;lockId:Hex;
}>&(Readonly<{amountsAvailable:false}>|Readonly<{amountsAvailable:true;amount0:bigint;amount1:bigint;mintedShares:bigint}>);
export type ProtectedEventFacts=ReservationFact|GraduationFact;
type State=Readonly<{bundle:VerifiedBundle;pool:VerifiedPool;lock?:LPLockMetadata}>;
export type ProtectedEventConfirmation=Readonly<{
 verification:'canonical-event-and-state-only';outerExecutionVerified:false;transactionHash:Hex;
 facts:ProtectedEventFacts;atReceipt:State;current:State;
}>;
export type DirectProtectedGraduationResult=Readonly<{
 verification:'exact-top-level-transaction-and-event';transactionHash:Hex;
 facts:GraduationFact;atReceipt:State;current:State;
}>;

/** Direct authorized-EOA path only: exact chain/from/to/data/value and receipt. */
export async function parseProtectedGraduationReceipt(call:ProtocolCall,transactionHash:Hex,a:ProtocolReceiptAdapter,codec:ProtocolCodec):Promise<DirectProtectedGraduationResult>{
 context(call);const expected=protectedEventContext(call);
 if(expected.event!=='ProtectedPoolGraduated')fail('Not a direct graduation plan');
 const evidence=await verifyReceiptTransaction(call,transactionHash,a);
 const result=await confirm(expected,evidence,a,codec);
 if(result.facts.kind!=='graduation')fail('Wrong direct result kind');
 return Object.freeze({...result,facts:result.facts,verification:'exact-top-level-transaction-and-event' as const});
}
/** Receipt events prove canonical protocol facts, NOT the outer controller signature,
 * wrapper calldata, or every internal step. No traces, executor assumptions or GT reads.
 */
export async function confirmProtectedEvent(expectation:ProtectedInnerCall|ProtectedGTGuidance,transactionHash:Hex,a:ProtocolReceiptAdapter,codec:ProtocolCodec):Promise<ProtectedEventConfirmation>{
 const expected=protectedEventContext(expectation),kind=field(expectation,'kind');
 if(kind!=='contract-inner-call'&&kind!=='transaction-scoped-gt-guidance')fail('Expected inner-call/GT event context');
 const result=await confirm(expected,await verifyMinedReceipt(expected.bundle,transactionHash,a),a,codec);
 return Object.freeze({...result,verification:'canonical-event-and-state-only' as const,outerExecutionVerified:false as const});
}
type Mined=Awaited<ReturnType<typeof verifyMinedReceipt>>;
async function confirm(e:ProtectedEventContext,mined:Mined,a:ProtocolReceiptAdapter,codec:ProtocolCodec){
 const {current:b,at,logs,txHash}=mined,graduated=e.event==='ProtectedPoolGraduated';
 const label=graduated?(['PublicInitializer','ConfidentialInitializer','ObservableInitializer'] as const)[b.policy.mode]:
  (['PublicFactory','ConfidentialFactory','ObservableFactory'] as const)[b.policy.mode];
 const emitter=graduated?b.policy.initializer.address:b.policy.factory.address;
 const topic=(PROTOCOL_EVENT_TOPICS[label] as Readonly<Record<string,string>>)[e.event];
 if(!topic)fail('Missing compiled protected event');
 // Unrelated pools may be mentioned by an outer transaction; do not accept ambiguity for THIS identity.
 const indexedIdentity=graduated?'0x'+e.prediction.predictedAddress.slice(2).padStart(64,'0'):e.prediction.key;
 const named=logs.filter(l=>l.address===emitter&&l.topics[0]===topic);
 for(const l of named){equal(l.topics.length,4,'protected indexed event arity');hex(l.data,(!graduated||b.policy.mode===0?7:4)*32);}
 const matches=named.filter(l=>l.topics[1]===indexedIdentity);
 if(matches.length!==1)fail('Missing or ambiguous canonical protected event');
 const d=tuple(codec.decodeEventLog(PROTOCOL_ABIS[label],e.event,matches[0]),!graduated||b.policy.mode===0?10:7);
 const p=await authenticatePool(a,b,e.prediction.predictedAddress);
 validateIdentity(p,e);
 let facts:ProtectedEventFacts,lock: LPLockMetadata|undefined;
 if(!graduated){
  equal(hash(d[0]),p.key,'reservation event key');equal(address(d[1]),p.protectedToken,'reservation protected token');
  equal(address(d[2]),e.launchFactory,'reservation stored factory');
  equal(address(d[3]),p.token0,'reservation token0');equal(address(d[4]),p.token1,'reservation token1');
  equal(uint(d[5]),p.feeBps,'reservation fee');equal(address(d[6]),p.address,'reservation pool');
  equal(address(d[7]),p.lpToken,'reservation LP');equal(hash(d[8]),p.runtimeCodehash,'reservation pool hash');equal(hash(d[9]),p.lpRuntimeCodehash,'reservation LP hash');
  // Reservation was empty when emitted. End-of-block/latest lifecycle is reported separately:
  // a later graduation in the same outer transaction or block does not erase that fact.
  facts=Object.freeze({kind:'reservation',eventName:e.event as ReservationFact['eventName'],pool:p.address,key:p.key,lpToken:p.lpToken,launchFactory:e.launchFactory,protectedToken:p.protectedToken});
 }else{
  const t=e.terms??fail('Missing frozen graduation terms'),pub=b.policy.mode===0;
  equal(address(d[0]),p.address,'graduation pool');equal(address(d[1]),e.launchFactory,'graduation stored factory');
  equal(address(d[2]),e.effectiveCaller,'graduation effective caller');equal(address(d[3]),p.protectedToken,'graduation protected token');
  equal(address(d[4]),t.lpRecipient,'graduation recipient');
  equal(uint(d[pub?8:5],8),t.disposition,'graduation disposition');
  const lockId=hash(d[pub?9:6],t.disposition!==0n);
  if(t.disposition===0n)equal(lockId,ZERO_HASH,'direct disposition lock');
  if(at.timestamp>t.deadline||(t.disposition===1n&&t.unlockTime<=at.timestamp))fail('Graduation event outside operation lifetime');
  if(!p.protectedCompleted)fail('Graduation completion absent');
  const amounts=pub?Object.freeze({amountsAvailable:true as const,amount0:uint(d[5],128,true),amount1:uint(d[6],128,true),mintedShares:uint(d[7],256,true)}):Object.freeze({amountsAvailable:false as const});
  if(amounts.amountsAvailable){
   equal(amounts.amount0,e.amount0,'canonical graduation amount0');equal(amounts.amount1,e.amount1,'canonical graduation amount1');
   if(amounts.mintedShares<e.minimumShares!)fail('Graduation shares below minimum');
  }
  facts=Object.freeze({kind:'graduation',eventName:'ProtectedPoolGraduated',pool:p.address,key:p.key,lpToken:p.lpToken,launchFactory:e.launchFactory,
   effectiveCaller:e.effectiveCaller,protectedToken:p.protectedToken,lpRecipient:t.lpRecipient,disposition:t.disposition,lockId,...amounts});
  if(t.disposition!==0n){lock=await readLPLock(a,b,p,lockId);validateLock(lock,e,amounts.amountsAvailable?amounts.mintedShares:undefined);}
 }
 await stable(a,b.policy.chainId,at);
 const latest=await verifyProtocolBundle(a,b.policy);
 if(latest.block.number<at.number)fail('Current state predates receipt');
 const pool=await authenticatePool(a,latest,p.address);validateIdentity(pool,e);
 let currentLock:LPLockMetadata|undefined;
 if(facts.kind==='graduation'&&facts.disposition!==0n){
  currentLock=await readLPLock(a,latest,pool,facts.lockId);
  validateLock(currentLock,e,facts.amountsAvailable?facts.mintedShares:undefined);
 }
 await stable(a,latest.policy.chainId,latest.block);await stable(a,b.policy.chainId,at);
 return Object.freeze({transactionHash:txHash,facts,atReceipt:Object.freeze({bundle:b,pool:p,...(lock?{lock}:{})}),
  current:Object.freeze({bundle:latest,pool,...(currentLock?{lock:currentLock}:{})})});
}
function validateIdentity(p:VerifiedPool,e:ProtectedEventContext):void{
 equal(p.kind,'protected','result kind');equal(p.key,e.prediction.key,'result key');
 equal(p.token0,e.prediction.token0,'result token0');equal(p.token1,e.prediction.token1,'result token1');
 equal(p.feeBps,e.prediction.feeBps,'result fee');equal(p.protectedToken,e.prediction.protectedToken,'result protected token');
 equal(p.reservingLaunchFactory,e.launchFactory,'result reserving factory');
 // No current registry approval check: completed pools and historical reservations remain canonical after revocation.
}
function validateLock(lock:LPLockMetadata,e:ProtectedEventContext,shares?:bigint):void{
 const t=e.terms!;equal(lock.owner,t.lpRecipient,'graduation lock owner');
 equal(lock.unlockTime,t.unlockTime,'graduation lock lifetime');equal(lock.permanent,t.disposition===2n,'graduation lock disposition');
 if(shares!==undefined)equal(lock.amount,shares,'graduation locked shares');
 // Active may be false after a legitimate later unlock; report current metadata, not an invented historical balance.
}
