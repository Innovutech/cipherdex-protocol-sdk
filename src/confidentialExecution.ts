// SPDX-License-Identifier: UNLICENSED
import {PROTOCOL_SELECTORS} from './protocolAbi.js';
import {buildPrivateTokenApprovalPlan,PrivateTokenApprovalPlan} from './tokenApproval.js';
import {Address,Hex,ProtocolCodec,address,uint,hash,hex,field,optional,equal,fail} from './protocolData.js';
import {VerifiedBundle,VerifiedPool,requireBundle,authenticatedCandidates} from './poolIdentity.js';
import {ProtocolCall,makeCall,deadline,recipient,gas} from './protocolExecution.js';
export type ConfidentialInputIntent=Readonly<{chainId:bigint;caller:Address;target:Address;selector:Hex;plaintext:bigint}>;
export type CallerCiphertext=Readonly<{ciphertextHigh:bigint;ciphertextLow:bigint}>;
export type OfficialIT=Readonly<{ciphertext:CallerCiphertext;signature:Hex}>;
export type BoundConfidentialInput=Readonly<{intent:ConfidentialInputIntent;input:OfficialIT}>;
export interface CotiEncryptionAdapter {encryptAndSign(intent:ConfidentialInputIntent):Promise<unknown>;}
export type ConfidentialQuoteInput=Readonly<{caller:Address;tokenIn:Address;tokenOut:Address;amountIn:bigint;candidates:readonly VerifiedPool[];requestId:Hex;deadline:bigint;gasLimit?:bigint}>;
export type ConfidentialSwapInput=Omit<ConfidentialQuoteInput,'requestId'> & Readonly<{minimumOut:bigint;recipient:Address}>;
type IntentContext={bundle:VerifiedBundle;candidates:readonly VerifiedPool[];tokenIn:Address;tokenOut:Address;deadline:bigint;requestId?:Hex;recipient?:Address;gasLimit?:bigint;amountIn:bigint;kind:'confidential-quote'|'confidential-swap'};
const intents=new WeakMap<object,IntentContext>(),inputs=new WeakSet<object>(),registered=new WeakSet<object>();
// Shared branding for ordered pool-bound fields; not a signature verifier.
export function registerConfidentialIntent(intent:ConfidentialInputIntent):ConfidentialInputIntent {registered.add(intent);return intent;}
export function requireBoundInput(bound:BoundConfidentialInput,intent:ConfidentialInputIntent):OfficialIT {
 if(!inputs.has(bound)||bound.intent!==intent)fail('Wrong plan or input field');return bound.input;
}
export function packConfidentialSwap(amountIn:bigint,minimumOut:bigint):bigint{return (uint(amountIn,128,true)<<128n)|uint(minimumOut,128);}
function prepare(b:VerifiedBundle,input:ConfidentialQuoteInput|ConfidentialSwapInput,quote:boolean):ConfidentialInputIntent{
 requireBundle(b);if(b.policy.mode===0)fail('Confidential mode required');
 const tin=address(field(input,'tokenIn')),tout=address(field(input,'tokenOut')),caller=address(field(input,'caller'));
 const candidates=authenticatedCandidates(b,tin,tout,field(input,'candidates') as readonly VerifiedPool[],quote?'quote':'swap');
 const amountIn=uint(field(input,'amountIn'),128,true),time=deadline(b,field(input,'deadline'));
 const requestId=quote?hash(field(input,'requestId'),true):undefined,recv=quote?undefined:recipient(b,field(input,'recipient'),candidates);
 const selectors=b.policy.mode===1?PROTOCOL_SELECTORS.ConfidentialRouter:PROTOCOL_SELECTORS.ObservableRouter;
 const selector=hex(quote?selectors.requestBestQuoteExactInput:selectors.swapBestExactInputIT,4);
 const intent=Object.freeze({chainId:b.policy.chainId,caller,target:b.policy.router.address,selector,plaintext:quote?amountIn:packConfidentialSwap(amountIn,uint(field(input,'minimumOut'),128))});
 intents.set(intent,{bundle:b,candidates,tokenIn:tin,tokenOut:tout,deadline:time,requestId,recipient:recv,gasLimit:gas(input),amountIn,kind:quote?'confidential-quote':'confidential-swap'});
 registered.add(intent);return intent;
}
export function prepareConfidentialQuote(b:VerifiedBundle,input:ConfidentialQuoteInput):ConfidentialInputIntent{return prepare(b,input,true);}
export function prepareConfidentialSwap(b:VerifiedBundle,input:ConfidentialSwapInput):ConfidentialInputIntent{return prepare(b,input,false);}
export function snapshotCiphertext(v:unknown):CallerCiphertext{return Object.freeze({ciphertextHigh:uint(field(v,'ciphertextHigh')),ciphertextLow:uint(field(v,'ciphertextLow'))});}
// Context checks do not cryptographically verify MPC signatures. The official client and chain do that.
export function bindConfidentialInput(intent:ConfidentialInputIntent,value:unknown):BoundConfidentialInput {
 if(!registered.has(intent))fail('Unknown signing intent');
 equal(uint(field(value,'chainId')),intent.chainId,'IT chain');equal(address(field(value,'caller')),intent.caller,'IT caller');
 equal(address(field(value,'target')),intent.target,'IT target');equal(hex(field(value,'selector'),4),intent.selector,'IT selector');
 const it=field(value,'input'),signature=hex(field(it,'signature'),undefined,4096);if(signature==='0x')fail('Empty IT signature');
 const result=Object.freeze({intent,input:Object.freeze({ciphertext:snapshotCiphertext(field(it,'ciphertext')),signature})});inputs.add(result);return result;
}
export async function encryptConfidentialInput(intent:ConfidentialInputIntent,adapter:CotiEncryptionAdapter):Promise<BoundConfidentialInput>{
 if(!registered.has(intent))fail('Unknown signing intent');
 const input=await adapter.encryptAndSign(intent);
 return bindConfidentialInput(intent,{chainId:intent.chainId,caller:intent.caller,target:intent.target,selector:intent.selector,input});
}
export type ConfidentialCallPlan=Readonly<{call:ProtocolCall;approval:PrivateTokenApprovalPlan|null;inputITs:1;transactions:1;approvalITs:number;approvalTransactions:number}>;
export function buildConfidentialCall(bound:BoundConfidentialInput,codec:ProtocolCodec,currentAllowance?:bigint):ConfidentialCallPlan{
 if(!inputs.has(bound))fail('Unbound IT');const intent=bound.intent,c=intents.get(intent)??fail('Not a routing input');
 const quote=c.kind==='confidential-quote',name=quote?'requestBestQuoteExactInput':'swapBestExactInputIT';
 const it=Object.freeze([Object.freeze([bound.input.ciphertext.ciphertextHigh,bound.input.ciphertext.ciphertextLow]),bound.input.signature]);
 const args=[c.tokenIn,c.tokenOut,it,c.candidates.map(p=>p.address),quote?c.requestId:c.recipient,c.deadline];
 const call=makeCall(codec,c.bundle.policy.mode===1?'ConfidentialRouter':'ObservableRouter',c.bundle,intent.caller,intent.target,name,args,0n,
 {bundle:c.bundle,candidates:c.candidates,tokenIn:c.tokenIn,tokenOut:c.tokenOut,kind:c.kind,requestId:c.requestId,recipient:c.recipient},c.gasLimit);
 const approval=quote?null:buildPrivateTokenApprovalPlan({token:c.tokenIn,spender:intent.target,requiredAmount:c.amountIn,currentAllowance:uint(currentAllowance)});
 return Object.freeze({call,approval,inputITs:1,transactions:1,approvalITs:approval?.plaintextAmounts.length??0,approvalTransactions:approval?.plaintextAmounts.length??0});
}
