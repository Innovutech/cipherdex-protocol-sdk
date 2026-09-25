// SPDX-License-Identifier: UNLICENSED
import {PROTOCOL_ABIS,PROTOCOL_EVENT_TOPICS} from './protocolAbi.js';
import {Address,Hex,ProtocolCodec,address,uint,hash,hex,bool,tuple,equal,fail,one,stable} from './protocolData.js';
import {VerifiedBundle,VerifiedPool,authenticatePool,abi,namespaceAddress} from './poolIdentity.js';
import {ProtocolCall,context} from './protocolExecution.js';
import {ProtocolReceiptAdapter,CotiDecryptionAdapter,verifyReceiptTransaction} from './protocolResults.js';
import {CallerCiphertext} from './confidentialExecution.js';

type ResultBase=Readonly<{transactionHash:Hex;bundle:VerifiedBundle;pool:VerifiedPool;caller:Address}>;
type Outcome=
 Readonly<{kind:'creation';newCreationEvent:boolean}>|
 Readonly<{kind:'public-deposit';amount0:bigint;amount1:bigint;mintedShares:bigint}>|
 Readonly<{kind:'native-deposit';tokenUsed:bigint;nativeUsed:bigint;mintedShares:bigint}>|
 Readonly<{kind:'public-removal';amount0:bigint;amount1:bigint;shareAmount:bigint}>|
 Readonly<{kind:'native-removal';tokenAmount:bigint;nativeAmount:bigint;shareAmount:bigint}>|
 Readonly<{kind:'private-success';amountsAvailable:false}>|
 Readonly<{kind:'public-claim';side:bigint;amount:bigint}>|
 Readonly<{kind:'ciphertexts';ciphertexts:Readonly<Record<string,CallerCiphertext>>;requestId?:Hex;side?:bigint}>|
 Readonly<{kind:'lock';lockId:Hex;unlockTime:bigint;permanent:boolean;shareAmount?:bigint}>|
 Readonly<{kind:'unlock';lockId:Hex}>;
export type VerifiedLiquidityResult=ResultBase&Outcome;
const encryptedResults=new WeakSet<object>();
function ciphertext(v:unknown):CallerCiphertext{const a=tuple(v,2);return Object.freeze({ciphertextHigh:uint(a[0]),ciphertextLow:uint(a[1])});}
/** Strict direct top-level execution only. Receipts do not contain Solidity return data. */
export async function parseLiquidityReceipt(call:ProtocolCall,transactionHash:Hex,a:ProtocolReceiptAdapter,codec:ProtocolCodec):Promise<VerifiedLiquidityResult>{
 const c=context(call),info=c.liquidity;
 if(c.kind!=='position'||!info?.eventName)fail('No liquidity result for this call');
 const {txHash,current,at,logs}=await verifyReceiptTransaction(call,transactionHash,a);
 const pool=await authenticatePool(a,current,info.poolAddress);
 equal(pool.key,info.key,'result pool key');equal(pool.token0,c.tokenIn,'result token0');equal(pool.token1,c.tokenOut,'result token1');
 if(info.creationArgs){
  const f=current.policy.factory.address,fa=abi(current,'Factory'),args=info.creationArgs;
  for(const [name,want,parse] of [[info.instance?'standardInstanceKey':'poolKey',pool.key,hash],
   [info.instance?'poolForInstance':'poolFor',pool.address,address],[info.instance?'predictPoolInstance':'predictPool',pool.address,address]] as const){
   equal(parse(await one(a,at,f,fa,name,args)),want,'receipt creation mapping');
  }
  equal(pool.kind,info.instance?'additional-standard':'default-standard','receipt standard kind');
 }
 const label=info.label,topic=(PROTOCOL_EVENT_TOPICS[label] as Readonly<Record<string,string>>)[info.eventName];
 if(!topic)fail('Missing generated event topic');
 const matches=logs.filter(l=>l.address===call.to&&l.topics[0]===topic);
 if(matches.length>1||(!matches.length&&!(info.result==='creation'&&info.instance)))fail('Missing or ambiguous liquidity result');
 function decoded(topics:number,bytes:number,count:number):readonly unknown[]{
  if(matches.length!==1)fail('Missing event');
  const log=matches[0];equal(log.topics.length,topics,'indexed event arity');hex(log.data,bytes);
  return tuple(codec.decodeEventLog(PROTOCOL_ABIS[label],info!.eventName!,log),count);
 }
 let outcome:Outcome;
 if(info.result==='creation'){
  if(matches.length){
   const d=decoded(4,info.instance?256:160,info.instance?11:8);
   equal(hash(d[0]),pool.key,'created key');equal(address(d[1]),pool.token0,'created token0');equal(address(d[2]),pool.token1,'created token1');
   equal(uint(d[3]),pool.feeBps,'created fee');equal(address(d[4]),pool.address,'created pool');equal(address(d[5]),pool.lpToken,'created LP');
   equal(hash(d[6]),pool.runtimeCodehash,'created pool hash');equal(hash(d[7]),pool.lpRuntimeCodehash,'created LP hash');
   if(info.instance){equal(hash(d[8]),pool.standardInstanceId,'created instance');equal(namespaceAddress(d[9]),info.creationArgs![3],'namespace');equal(hash(d[10]),info.creationArgs![4],'nonce');}
  }
  outcome={kind:'creation',newCreationEvent:matches.length===1};
 }else if(info.result==='deposit'){
  const d=decoded(4,128,7);equal(address(d[0]),call.from,'deposit payer');equal(address(d[1]),pool.address,'deposit pool');
  equal(address(d[2]),c.recipient,'LP recipient');equal(uint(d[3],8),info.operation,'explicit deposit operation');
  const a0=uint(d[4],256,true),a1=uint(d[5],256,true),shares=uint(d[6],256,true);
  if(a0>info.maximums![0]||a1>info.maximums![1]||shares<info.minimumShares!)fail('Deposit result exceeds requested bounds');
  if(info.operation!==3n){equal(a0,info.maximums![0],'exact initialization first amount');equal(a1,info.maximums![1],'exact initialization second amount');}
  outcome=info.native?{kind:'native-deposit',tokenUsed:a0,nativeUsed:a1,mintedShares:shares}:{kind:'public-deposit',amount0:a0,amount1:a1,mintedShares:shares};
 }else if(info.result==='removal'){
  const d=decoded(4,96,6);equal(address(d[0]),call.from,'withdrawal owner');equal(address(d[1]),pool.address,'withdrawal pool');equal(address(d[2]),c.recipient,'output recipient');
  equal(uint(d[3]),info.shareAmount,'burned owner shares');const a0=uint(d[4]),a1=uint(d[5]);
  if((a0===0n&&a1===0n)||a0<info.minimums![0]||a1<info.minimums![1])fail('Removal below minimum');
  outcome=info.native?{kind:'native-removal',tokenAmount:a0,nativeAmount:a1,shareAmount:info.shareAmount!}:{kind:'public-removal',amount0:a0,amount1:a1,shareAmount:info.shareAmount!};
 }else if(info.result==='success'){
  const d=decoded(3,0,2);equal(address(d[0]),call.from,'private operation caller');equal(address(d[1]),c.recipient,'private operation recipient');
  outcome={kind:'private-success',amountsAvailable:false};
 }else if(info.result==='claim'){
  const pub=current.policy.mode===0,d=decoded(4,pub?32:64,4);
  equal(address(d[0]),call.from,'fee owner');equal(address(d[1]),c.recipient,'fee recipient');equal(uint(d[2],8),info.side,'fee side');
  outcome=pub?{kind:'public-claim',side:info.side!,amount:uint(d[3])}:{kind:'ciphertexts',side:info.side!,ciphertexts:Object.freeze({amount:ciphertext(d[3])})};
 }else if(info.result==='lock'){
  const pub=current.policy.mode===0,d=decoded(3,pub?96:64,pub?5:4),id=hash(d[0],true);
  equal(address(d[1]),call.from,'lock owner');
  if(pub)equal(uint(d[2]),info.shareAmount,'locked shares');
  equal(uint(d[pub?3:2],64),info.unlockTime,'lock expiry');equal(bool(d[pub?4:3]),info.permanent,'permanent lock');
  outcome={kind:'lock',lockId:id,unlockTime:info.unlockTime!,permanent:info.permanent!,...(pub?{shareAmount:info.shareAmount}: {})};
 }else if(info.result==='unlock'){
  const d=decoded(3,0,2);equal(hash(d[0]),info.lockId,'unlock ID');equal(address(d[1]),call.from,'unlock owner');
  outcome={kind:'unlock',lockId:info.lockId!};
 }else{
  const accounting=info.eventName==='PrivateLPAccountingResult',add=info.eventName==='ConfidentialLiquidityQuoteResult',position=info.eventName==='ConfidentialPositionResult';
  const d=decoded(accounting?2:add?4:3,position?256:192,accounting?4:add||position?6:5);
  equal(address(d[0]),call.from,'read owner');
  if(!accounting)equal(hash(d[1]),info.requestId,'read request ID');
  if(add)equal(bool(d[2]),info.token0Specified,'specified token side');
  const names=accounting?['claimable0','claimable1','lockedPrincipal']:add?['acceptedAmount','counterpartAmount','mintedShares']:position?['shares','amount0','amount1','priceX18']:['shares','amount0','amount1'];
  const offset=accounting?1:add?3:2;
  const ciphertexts=Object.freeze(Object.fromEntries(names.map((name,i)=>[name,ciphertext(d[offset+i])])));
  outcome={kind:'ciphertexts',ciphertexts,...(accounting?{}:{requestId:info.requestId})};
 }
 await stable(a,call.chainId,at);
 const result=Object.freeze({transactionHash:txHash,bundle:current,pool,caller:call.from,...outcome});
 if(outcome.kind==='ciphertexts')encryptedResults.add(result);
 return result;
}
export async function decryptLiquidityResult(result:VerifiedLiquidityResult,fieldName:string,adapter:CotiDecryptionAdapter):Promise<bigint>{
 if(!encryptedResults.has(result)||result.kind!=='ciphertexts')fail('Unverified encrypted liquidity result');
 const descriptor=Object.getOwnPropertyDescriptor(result.ciphertexts,fieldName);
 if(!descriptor||!('value'in descriptor))fail('Unknown ciphertext result field');
 return uint(await adapter.decryptResult(Object.freeze({chainId:result.bundle.policy.chainId,caller:result.caller,ciphertext:descriptor.value})));
}
