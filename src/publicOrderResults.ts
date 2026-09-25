// SPDX-License-Identifier: UNLICENSED
import {PROTOCOL_ABIS,PROTOCOL_EVENT_TOPICS} from './protocolAbi.js';
import {Address,Hex,ProtocolCodec,address,uint,bool,hash,hex,tuple,equal,fail,stable,one} from './protocolData.js';
import {ProtocolCall} from './protocolExecution.js';
import {ProtocolReceiptAdapter,verifyMinedTransaction} from './protocolResults.js';
import {authenticatePool,VerifiedPool} from './poolIdentity.js';
import {VerifiedOrderBook,PublicOrderSnapshot,PublicOrderCreateParams,PublicOrderAmendment,orderCallContext,orderRecipient,authenticatePublicOrderBook,authenticatePublicOrderTrading,readPublicOrder,publicOrderFeePolicy} from './publicOrders.js';

export type NativeOrderDelivery=Readonly<{beneficiary:Address;amount:bigint;disposition:'zero'|'paid'|'credited'}>;
export type PublicOrderFacts=
 |Readonly<{operation:'sweep-token-surplus';token:Address;beneficiary:Address;amount:bigint}>
 |Readonly<{operation:'sweep-native-surplus';beneficiary:Address;amount:bigint}>
 |Readonly<{operation:'create';orderId:bigint;maker:Address;params:PublicOrderCreateParams;executionBounty:bigint}>
 |Readonly<{operation:'amend';orderId:bigint;maker:Address;revision:bigint;amendment:PublicOrderAmendment}>
 |Readonly<{operation:'topup';orderId:bigint;maker:Address;amount:bigint;remainingExecutionBounty:bigint}>
 |Readonly<{operation:'fill';orderId:bigint;maker:Address;filler:Address;recipient:Address;selectedPool:VerifiedPool;selectedFeeBps:bigint;amountIn:bigint;amountOut:bigint;minimumAmountOut:bigint;remainingAmountIn:bigint;executionBounty:bigint;settlementMode:bigint}>
 |Readonly<{operation:'cancel';orderId:bigint;maker:Address;returnedAmountIn:bigint;returnedExecutionBounty:bigint;settlementMode:bigint}>
 |Readonly<{operation:'claim-bounty'|'claim-proceeds';beneficiary:Address;recipient:Address;amount:bigint}>;
export type VerifiedPublicOrderResult=Readonly<{transactionHash:Hex;book:VerifiedOrderBook;facts:PublicOrderFacts;nativeBounty?:NativeOrderDelivery;nativeProceeds?:NativeOrderDelivery;endOfReceiptBlock?:PublicOrderSnapshot;endOfReceiptBlockSurplusBeneficiary?:Address}>;
const shapes={
 TokenSurplusSwept:[3,3,32],NativeSurplusSwept:[2,2,32],
 OrderCreated:[13,4,320],OrderAmended:[9,3,224],OrderBountyIncreased:[4,3,64],
 OrderFilled:[12,4,288],OrderCancelled:[5,3,96],
 NativeBountyCredited:[3,3,32],NativeProceedsCredited:[3,3,32],NativeBountyClaimed:[3,3,32],NativeProceedsClaimed:[3,3,32],
} as const;
/** Strict direct top-level evidence only. A receipt is not return data or proof
 * of an outer smart-wallet/controller call. End-of-block state is a separate
 * snapshot: later transactions in that block may amend/fill/cancel the order. */
export async function parsePublicOrderReceipt(call:ProtocolCall,transactionHash:Hex,a:ProtocolReceiptAdapter,codec:ProtocolCodec):Promise<VerifiedPublicOrderResult>{
 const c=orderCallContext(call),old=c.book,m=await verifyMinedTransaction(call.chainId,old.block.number,transactionHash,a);
 equal(m.tx.from,call.from,'order transaction caller');equal(m.tx.to,call.to,'order transaction target');
 equal(m.tx.data,call.data,'order transaction calldata');equal(m.tx.value,call.value,'order transaction value');
 const trading=!['cancel','claim-bounty','claim-proceeds','sweep-token-surplus','sweep-native-surplus'].includes(c.operation);
 const book=await(trading?authenticatePublicOrderTrading(a,old.policy,m.at.number):authenticatePublicOrderBook(a,old.policy,m.at.number));
 const eventName=({'sweep-token-surplus':'TokenSurplusSwept','sweep-native-surplus':'NativeSurplusSwept',create:'OrderCreated',amend:'OrderAmended',topup:'OrderBountyIncreased',fill:'OrderFilled',cancel:'OrderCancelled','claim-bounty':'NativeBountyClaimed','claim-proceeds':'NativeProceedsClaimed'} as const)[c.operation];
 const topics=PROTOCOL_EVENT_TOPICS.OrderBook as Readonly<Record<string,string>>;
 const logs=m.logs.filter(l=>l.address===call.to),used=new Set<object>();
 function event(name:keyof typeof shapes,required=true):readonly unknown[]|undefined{
  const hits=logs.filter(l=>l.topics[0]===topics[name]);if(hits.length!==1){if(!required&&hits.length===0)return undefined;return fail('Missing or ambiguous '+name);}
  const l=hits[0],[arity,indexed,bytes]=shapes[name];if(l.topics.length!==indexed)fail('Malformed order topics');
  hex(l.data,bytes);used.add(l);return tuple(codec.decodeEventLog(PROTOCOL_ABIS.OrderBook,name,l),arity);
 }
 const v=event(eventName)!,o=c.order;
 let endOfReceiptBlockSurplusBeneficiary:Address|undefined;
 let facts:PublicOrderFacts,id:bigint|undefined,bounty:NativeOrderDelivery|undefined,proceeds:NativeOrderDelivery|undefined;
 function delivery(name:'NativeBountyCredited'|'NativeProceedsCredited',beneficiary:Address,amount:bigint):NativeOrderDelivery{
  const e=event(name,false);
  if(e){if(amount===0n)fail('Unexpected zero credit');equal(uint(e[0]),id,'credit order');equal(address(e[1]),beneficiary,'credit owner');equal(uint(e[2],256,true),amount,'credit amount');}
  return Object.freeze({beneficiary,amount,disposition:amount===0n?'zero':e?'credited':'paid'});
 }
 if(c.operation==='sweep-token-surplus'||c.operation==='sweep-native-surplus'){
  endOfReceiptBlockSurplusBeneficiary=orderRecipient(book,await one(a,m.at,call.to,PROTOCOL_ABIS.OrderBook,'surplusBeneficiary'));
  // The authenticated event is the historical payout; a later transaction may rotate the getter.
  if(c.operation==='sweep-token-surplus'){
   const token=address(v[0]),beneficiary=orderRecipient(book,v[1]);equal(token,c.token,'surplus token');
   facts=Object.freeze({operation:c.operation,token,beneficiary,amount:uint(v[2],256,true)});
  }else{
   const beneficiary=orderRecipient(book,v[0]);facts=Object.freeze({operation:c.operation,beneficiary,amount:uint(v[1],256,true)});
  }
 }else if(c.operation==='create'){
  const p=c.params as PublicOrderCreateParams;id=uint(v[0],256,true);equal(address(v[1]),call.from,'created maker');
  equal(address(v[2]),p.tokenIn,'created input');equal(address(v[3]),p.tokenOut,'created output');equal(address(v[4]),p.recipient,'created recipient');
  equal(uint(v[5]),p.amountIn,'created amount');equal(uint(v[6]),p.minAmountOut,'created minimum');equal(uint(v[7],64),p.expiry,'created expiry');
  equal(publicOrderFeePolicy(v[8]),p.feeTierPolicy,'created policy');equal(bool(v[9]),p.allowPartialFills,'created partial policy');
  const minimumFillAmount=uint(v[10],256,true);equal(minimumFillAmount,p.allowPartialFills?p.minimumFillAmount:p.amountIn,'created fill minimum');
  equal(uint(v[11]),c.bounty,'created bounty');equal(uint(v[12],8),p.settlementMode,'created settlement');
  facts=Object.freeze({operation:'create',orderId:id,maker:call.from,params:Object.freeze({...p,minimumFillAmount}),executionBounty:c.bounty!});
 }else if(c.operation==='claim-bounty'||c.operation==='claim-proceeds'){
  equal(address(v[0]),call.from,'claim owner');equal(address(v[1]),c.recipient,'claim recipient');
  facts=Object.freeze({operation:c.operation,beneficiary:call.from,recipient:c.recipient!,amount:uint(v[2],256,true)});
 }else{
  id=uint(v[0],256,true);equal(id,o!.id,'event order');equal(address(v[1]),o!.maker,'event maker');
  if(c.operation==='amend'){
   const p=c.params as PublicOrderAmendment;
   const revision=uint(v[2],32,true),recipient=orderRecipient(book,v[3]),minAmountOutForRemaining=uint(v[4],256,true),expiry=uint(v[5],64),feeTierPolicy=publicOrderFeePolicy(v[6]),allowPartialFills=bool(v[7]),minimumFillAmount=uint(v[8],256,true);
   equal(recipient,p.recipient,'amended recipient');equal(minAmountOutForRemaining,p.minAmountOutForRemaining,'amended minimum');equal(expiry,p.expiry,'amended expiry');
   equal(feeTierPolicy,p.feeTierPolicy,'amended policy');equal(allowPartialFills,p.allowPartialFills,'amended partial');
   if(allowPartialFills||p.minimumFillAmount!==0n)equal(minimumFillAmount,p.minimumFillAmount,'amended fill minimum');
   facts=Object.freeze({operation:'amend',orderId:id,maker:o!.maker,revision,amendment:Object.freeze({recipient,minAmountOutForRemaining,expiry,feeTierPolicy,allowPartialFills,minimumFillAmount})});
  }else if(c.operation==='topup'){
   const amount=uint(v[2],256,true),remainingExecutionBounty=uint(v[3]);equal(amount,c.amount,'bounty topup');if(remainingExecutionBounty<amount)fail('Invalid bounty remainder');
   facts=Object.freeze({operation:'topup',orderId:id,maker:o!.maker,amount,remainingExecutionBounty});
  }else if(c.operation==='fill'){
   equal(address(v[2]),call.from,'fill caller');const recipient=orderRecipient(book,v[3]),selected=address(v[4]);
   if(!c.candidates!.some(p=>p.address===selected))fail('Fill winner outside candidates');
   const selectedPool=await authenticatePool(a,book.bundle!,selected),selectedFeeBps=uint(v[5]);
   equal(selectedFeeBps,selectedPool.feeBps,'fill fee');if(![selectedPool.token0,selectedPool.token1].includes(o!.tokenIn)||![selectedPool.token0,selectedPool.token1].includes(o!.tokenOut))fail('Fill pair changed');
   const amountIn=uint(v[6],256,true),amountOut=uint(v[7],256,true),minimumAmountOut=uint(v[8],256,true),remainingAmountIn=uint(v[9]),executionBounty=uint(v[10]),settlementMode=uint(v[11],8);
   equal(amountIn,c.amount,'fill input');equal(settlementMode,o!.settlementMode,'fill settlement');if(amountOut<minimumAmountOut)fail('Fill below event minimum');
   // Current terms are enforced by the book at execution, not a preflight revision.
   facts=Object.freeze({operation:'fill',orderId:id,maker:o!.maker,filler:call.from,recipient,selectedPool,selectedFeeBps,amountIn,amountOut,minimumAmountOut,remainingAmountIn,executionBounty,settlementMode});
   bounty=delivery('NativeBountyCredited',call.from,executionBounty);
   if(settlementMode===2n)proceeds=delivery('NativeProceedsCredited',recipient,amountOut);
  }else{
   const returnedAmountIn=uint(v[2],256,true),returnedExecutionBounty=uint(v[3]),settlementMode=uint(v[4],8);equal(settlementMode,o!.settlementMode,'cancel settlement');equal(call.from,o!.maker,'cancel owner');
   facts=Object.freeze({operation:'cancel',orderId:id,maker:o!.maker,returnedAmountIn,returnedExecutionBounty,settlementMode});
   bounty=delivery('NativeBountyCredited',call.from,returnedExecutionBounty);
   if(settlementMode===1n)proceeds=delivery('NativeProceedsCredited',call.from,returnedAmountIn);
  }
 }
 // Other canonical lifecycle/credit events in this top-level operation are ambiguous.
 for(const l of logs)if(Object.keys(topics).some(n=>topics[n]===l.topics[0])&&!used.has(l))fail('Unexpected order lifecycle or credit event');
 const endOfReceiptBlock=id===undefined?undefined:await readPublicOrder(a,book,id);
 await stable(a,call.chainId,m.at);
 return Object.freeze({transactionHash:m.txHash,book,facts,...(endOfReceiptBlockSurplusBeneficiary?{endOfReceiptBlockSurplusBeneficiary}:{}),...(bounty?{nativeBounty:bounty}:{}),...(proceeds?{nativeProceeds:proceeds}:{}),...(endOfReceiptBlock?{endOfReceiptBlock}:{})});
}
