// SPDX-License-Identifier: UNLICENSED
import {PROTOCOL_ABIS,PROTOCOL_SELECTORS} from './protocolAbi.js';
import {Address,Hex,ProtocolCodec,address,uint,hash,hex,bool,field,optional,array,fail,freezeArgs} from './protocolData.js';
import {VerifiedBundle,VerifiedPool,requirePool} from './poolIdentity.js';
import {ProtocolCall,LiquidityContext,makeCall,deadline,gas} from './protocolExecution.js';
import {ConfidentialInputIntent,BoundConfidentialInput,registerConfidentialIntent,requireBoundInput} from './confidentialExecution.js';
import {PrivateTokenApprovalPlan,buildPrivateTokenApprovalPlan} from './tokenApproval.js';
import {OwnerCallInput,requireLiquidityIntent,poolRecipient,lockTerms,positionCall} from './lpPosition.js';

export type LiquidityInputIntent=ConfidentialInputIntent&Readonly<{fieldName:string;fieldIndex:number;publicArguments:readonly unknown[]}>;
export type ConfidentialLiquidityPreparation=Readonly<{
 inputs:readonly LiquidityInputIntent[];approvals:readonly PrivateTokenApprovalPlan[];
 approvalInputs:readonly LiquidityInputIntent[];inputITs:number;transactions:1;approvalITs:number;approvalTransactions:number;
}>;
type Prepared=Readonly<{bundle:VerifiedBundle;pool:VerifiedPool;caller:Address;name:string;argsAfterInputs:readonly unknown[];
 receipt:Omit<LiquidityContext,'poolAddress'|'key'|'label'>;recipient?:Address;gasLimit?:bigint}>;
const preparations=new WeakMap<object,Prepared>();
export function packLiquidityPair(amount0:bigint,amount1:bigint):bigint{return(uint(amount0,128)<<128n)|uint(amount1,128);}
function itArgs(bound:BoundConfidentialInput,intent:ConfidentialInputIntent):readonly unknown[]{
 const v=requireBoundInput(bound,intent);return Object.freeze([Object.freeze([v.ciphertext.ciphertextHigh,v.ciphertext.ciphertextLow]),v.signature]);
}
function prepare(b:VerifiedBundle,p:VerifiedPool,input:OwnerCallInput,name:string,fields:readonly Readonly<[string,bigint]>[],publicArgs:readonly unknown[],
 receipt:Prepared['receipt'],funding?:Readonly<{amount0:bigint;amount1:bigint;allowance0:bigint;allowance1:bigint}>,recipient?:Address):ConfidentialLiquidityPreparation{
 requirePool(b,p);if(b.policy.mode===0)fail('Confidential mode required');
 const caller=address(field(input,'caller')),args=freezeArgs(publicArgs),label=b.policy.mode===1?'ConfidentialPool':'ObservablePool';
 const selector=hex((PROTOCOL_SELECTORS[label] as Readonly<Record<string,string>>)[name],4);
 const make=(target:Address,selector:Hex,fieldName:string,fieldIndex:number,plaintext:bigint,publicArguments:readonly unknown[])=>{
  const intent=Object.freeze({chainId:b.policy.chainId,caller,target,selector,plaintext,fieldName,fieldIndex,publicArguments});
  registerConfidentialIntent(intent);return intent;
 };
 const inputs=Object.freeze(fields.map(([name,amount],i)=>make(p.address,selector,name,i,uint(amount),args)));
 const approvals=Object.freeze(funding?[
  buildPrivateTokenApprovalPlan({token:p.token0,spender:p.address,requiredAmount:funding.amount0,currentAllowance:funding.allowance0}),
  buildPrivateTokenApprovalPlan({token:p.token1,spender:p.address,requiredAmount:funding.amount1,currentAllowance:funding.allowance1}),
 ]:[]);
 const approvalInputs=Object.freeze(approvals.flatMap((a,side)=>a.plaintextAmounts.map((amount,i)=>
  make(a.token as Address,hex(PROTOCOL_SELECTORS.PrivateApproval.approve,4),'token'+side+'Approval'+i,i,amount,Object.freeze([p.address])))));
 const result=Object.freeze({inputs,approvals,approvalInputs,inputITs:inputs.length,transactions:1 as const,approvalITs:approvalInputs.length,approvalTransactions:approvalInputs.length});
 preparations.set(result,Object.freeze({bundle:b,pool:p,caller,name,argsAfterInputs:args,receipt:Object.freeze(receipt),recipient,gasLimit:gas(input)}));return result;
}
export type PrivateInitializationInput=OwnerCallInput&Readonly<{amount0:bigint;amount1:bigint;recipient:Address;deadline:bigint;initialPriceReferenceX18?:bigint;currentAllowance0:bigint;currentAllowance1:bigint}>;
export function prepareConfidentialInitialization(b:VerifiedBundle,p:VerifiedPool,input:PrivateInitializationInput):ConfidentialLiquidityPreparation{
 requireLiquidityIntent(b,p,true);
 const a0=uint(field(input,'amount0'),128,true),a1=uint(field(input,'amount1'),128,true),recv=poolRecipient(p,field(input,'recipient')),time=deadline(b,field(input,'deadline'));
 const reference=optional(input,'initialPriceReferenceX18');
 if(b.policy.mode===1&&reference!==undefined)fail('Mode 1 has no opening reference');
 const publicArgs=[...(b.policy.mode===2?[uint(reference,256,true)]:[]),recv,time];
 return prepare(b,p,input,'initializeStandardIT',[['packedAmounts',packLiquidityPair(a0,a1)]],publicArgs,
 {result:'success',eventName:'StandardPoolInitialized'},{amount0:a0,amount1:a1,allowance0:uint(field(input,'currentAllowance0')),allowance1:uint(field(input,'currentAllowance1'))},recv);
}
export type PrivateAdditionInput=OwnerCallInput&Readonly<{amount0Maximum:bigint;amount1Maximum:bigint;minimumShares:bigint;minimumPriceX18:bigint;maximumPriceX18:bigint;recipient:Address;deadline:bigint;currentAllowance0:bigint;currentAllowance1:bigint}>;
export function prepareConfidentialAddition(b:VerifiedBundle,p:VerifiedPool,input:PrivateAdditionInput):ConfidentialLiquidityPreparation{
 requireLiquidityIntent(b,p,false);
 const a0=uint(field(input,'amount0Maximum'),128,true),a1=uint(field(input,'amount1Maximum'),128,true),min=uint(field(input,'minimumShares'));
 const minPrice=uint(field(input,'minimumPriceX18')),maxPrice=uint(field(input,'maximumPriceX18'));if(minPrice>maxPrice)fail('Invalid canonical price bounds');
 const recv=poolRecipient(p,field(input,'recipient')),time=deadline(b,field(input,'deadline'));
 return prepare(b,p,input,'addLiquidityIT',[['packedMaximums',packLiquidityPair(a0,a1)],['minimumShares',min],['minimumPriceX18',minPrice],['maximumPriceX18',maxPrice]],[recv,time],
 {result:'success',eventName:'LiquidityAdded'},{amount0:a0,amount1:a1,allowance0:uint(field(input,'currentAllowance0')),allowance1:uint(field(input,'currentAllowance1'))},recv);
}
export type PrivateRemovalInput=OwnerCallInput&Readonly<{shareAmount:bigint;minimumAmount0:bigint;minimumAmount1:bigint;recipient:Address;deadline:bigint}>;
export function prepareConfidentialRemoval(b:VerifiedBundle,p:VerifiedPool,input:PrivateRemovalInput):ConfidentialLiquidityPreparation{
 requireLiquidityIntent(b,p,false);
 const shares=uint(field(input,'shareAmount'),128,true),mins=packLiquidityPair(uint(field(input,'minimumAmount0'),128),uint(field(input,'minimumAmount1'),128));
 const recv=poolRecipient(p,field(input,'recipient')),time=deadline(b,field(input,'deadline'));
 return prepare(b,p,input,'removeLiquidityIT',[['shares',shares],['packedMinimums',mins]],[recv,time],{result:'success',eventName:'LiquidityRemoved'},undefined,recv);
}
export function prepareConfidentialLock(b:VerifiedBundle,p:VerifiedPool,input:OwnerCallInput&Readonly<{shareAmount:bigint;unlockTime:bigint;permanent:boolean;deadline:bigint}>):ConfidentialLiquidityPreparation{
 requirePool(b,p);const terms=lockTerms(b,input);
 return prepare(b,p,input,'lockSharesIT',[['shares',uint(field(input,'shareAmount'),128,true)]],[terms.unlockTime,terms.permanent,terms.deadline],
 {result:'lock',eventName:'LiquidityLocked',unlockTime:terms.unlockTime,permanent:terms.permanent});
}
export function prepareAddLiquidityQuote(b:VerifiedBundle,p:VerifiedPool,input:OwnerCallInput&Readonly<{specifiedAmount:bigint;token0Specified:boolean;requestId:Hex;deadline:bigint}>):ConfidentialLiquidityPreparation{
 requireLiquidityIntent(b,p,false);
 const token0Specified=bool(field(input,'token0Specified')),requestId=hash(field(input,'requestId'),true),time=deadline(b,field(input,'deadline'));
 return prepare(b,p,input,'requestAddLiquidityQuote',[['specifiedAmount',uint(field(input,'specifiedAmount'),128,true)]],[token0Specified,requestId,time],
 {result:'ciphertexts',eventName:'ConfidentialLiquidityQuoteResult',requestId,token0Specified});
}
export function prepareRemoveLiquidityQuote(b:VerifiedBundle,p:VerifiedPool,input:OwnerCallInput&Readonly<{shareAmount:bigint;requestId:Hex;deadline:bigint}>):ConfidentialLiquidityPreparation{
 requireLiquidityIntent(b,p,false);
 const requestId=hash(field(input,'requestId'),true),time=deadline(b,field(input,'deadline'));
 return prepare(b,p,input,'requestRemoveLiquidityQuote',[['shares',uint(field(input,'shareAmount'),128,true)]],[requestId,time],
 {result:'ciphertexts',eventName:'ConfidentialRemovalQuoteResult',requestId});
}
export type ConfidentialLiquidityCallPlan=ConfidentialLiquidityPreparation&Readonly<{call:ProtocolCall}>;
export function buildConfidentialLiquidity(preparation:ConfidentialLiquidityPreparation,bound:readonly BoundConfidentialInput[],codec:ProtocolCodec):ConfidentialLiquidityCallPlan{
 const p=preparations.get(preparation)??fail('Unknown liquidity preparation'),inputs=array(bound,4,preparation.inputs.length);
 const args=[...inputs.map((v,i)=>itArgs(v as BoundConfidentialInput,preparation.inputs[i])),...p.argsAfterInputs];
 const call=positionCall(p.bundle,p.pool,p.caller,p.name,args,codec,p.receipt,{recipient:p.recipient,gasLimit:p.gasLimit});
 return Object.freeze({...preparation,call});
}
/** Each approval/reset is a separate token-bound IT transaction, never a pool input. */
export function buildConfidentialLiquidityApproval(preparation:ConfidentialLiquidityPreparation,index:number,bound:BoundConfidentialInput,codec:ProtocolCodec):ProtocolCall{
 const p=preparations.get(preparation)??fail('Unknown liquidity preparation');
 if(!Number.isInteger(index)||index<0||index>=preparation.approvalInputs.length)fail('Invalid approval index');
 const intent=preparation.approvalInputs[index],args=[p.pool.address,itArgs(bound,intent)];
 return makeCall(codec,'PrivateApproval',p.bundle,p.caller,intent.target,'approve',args,0n,
 {bundle:p.bundle,candidates:Object.freeze([p.pool]),tokenIn:p.pool.token0,tokenOut:p.pool.token1,kind:'position'});
}
