// SPDX-License-Identifier: UNLICENSED
import {EVM_NATIVE_ASSET_ADDRESS,isEvmNativeAssetAddress} from './nativeAsset.js';
import {buildPublicTokenApprovalPlan,PublicTokenApprovalPlan} from './tokenApproval.js';
import {Address,ProtocolCodec,ProtocolReadAdapter,address,uint,field,tuple,equal,fail,read,stable} from './protocolData.js';
import {VerifiedBundle,VerifiedPool,requireBundle,authenticatedCandidates} from './poolIdentity.js';
import {ProtocolCall,SwapInput,makeCall,context,deadline,recipient,gas,winner} from './protocolExecution.js';
export type PublicQuoteInput=Readonly<{caller:Address;tokenIn:string;tokenOut:string;amountIn:bigint;candidates:readonly VerifiedPool[]}>;
function pair(b:VerifiedBundle,input:PublicQuoteInput){
 requireBundle(b);if(b.policy.mode!==0)fail('Public mode required');
 function token(v:unknown){if(typeof v==='string'&&isEvmNativeAssetAddress(v)){if(!b.policy.wrappedNative)fail('Native deployment anchors required');return{native:true,address:b.policy.wrappedNative.address};}return{native:false,address:address(v)};}
 const tin=token(field(input,'tokenIn')),tout=token(field(input,'tokenOut'));
 if(tin.address===tout.address||tin.native&&tout.native)fail('Invalid native/token pair');
 if(tin.native||tout.native){
  if(!b.policy.nativeRouter)fail('Reviewed native swap adapter anchor required');
  const paired=tin.native?tout.address:tin.address;
  if([b.policy.nativeRouter!.address,b.policy.router.address,b.policy.wrappedNative!.address].includes(paired))fail('Invalid native paired token');
 }
 return{tin,tout};
}
export function buildPublicQuote(b:VerifiedBundle,input:PublicQuoteInput,codec:ProtocolCodec):ProtocolCall {
 const {tin,tout}=pair(b,input),caller=address(field(input,'caller')),amount=uint(field(input,'amountIn'),256,true);
 const candidates=authenticatedCandidates(b,tin.address,tout.address,field(input,'candidates') as readonly VerifiedPool[],'quote');
 return makeCall(codec,'PublicRouter',b,caller,b.policy.router.address,'quoteBestExactInput',[tin.address,tout.address,amount,candidates.map(p=>p.address)],0n,
 {bundle:b,candidates,tokenIn:tin.address,tokenOut:tout.address,kind:'public-quote',amountIn:amount});
}
export function parsePublicQuote(call:ProtocolCall,decoded:unknown):Readonly<{selectedPool:VerifiedPool;amountOut:bigint}>{
 equal(context(call).kind,'public-quote','quote plan');const v=tuple(decoded,2);
 return Object.freeze({selectedPool:winner(call,v[0]),amountOut:uint(v[1],256,true)});
}
export async function readPublicQuote(call:ProtocolCall,adapter:ProtocolReadAdapter){
 const c=context(call);equal(c.kind,'public-quote','read plan');
 const result=parsePublicQuote(call,await read(adapter,c.bundle.block,call.to,call.abi,call.functionName,call.args));
 await stable(adapter,call.chainId,c.bundle.block);return result;
}
export type PublicSwapInput=Omit<SwapInput,'tokenIn'|'tokenOut'> & Readonly<{tokenIn:string;tokenOut:string}>;
export type PublicSwapPlan=Readonly<{call:ProtocolCall;approval:PublicTokenApprovalPlan|null;swapTransactions:1;approvalTransactions:number}>;
export function buildPublicSwap(b:VerifiedBundle,input:PublicSwapInput,codec:ProtocolCodec):PublicSwapPlan {
 const {tin,tout}=pair(b,input),caller=address(field(input,'caller')),amount=uint(field(input,'amountIn'),256,true),minimum=uint(field(input,'minimumOut'));
 const candidates=authenticatedCandidates(b,tin.address,tout.address,field(input,'candidates') as readonly VerifiedPool[],'swap');
 const native=tin.native||tout.native,to=native?b.policy.nativeRouter!.address:b.policy.router.address;
 const recv=recipient(b,field(input,'recipient'),candidates,native),time=deadline(b,field(input,'deadline')),list=candidates.map(p=>p.address);
 const name=tin.native?'swapExactNativeForToken':tout.native?'swapExactTokenForNative':'swapBestExactInput';
 const args=tin.native?[tout.address,minimum,list,recv,time]:tout.native?[tin.address,amount,minimum,list,recv,time]:[tin.address,tout.address,amount,minimum,list,recv,time];
 const call=makeCall(codec,native?'NativeRouter':'PublicRouter',b,caller,to,name,args,tin.native?amount:0n,
 {bundle:b,candidates,tokenIn:tin.address,tokenOut:tout.address,kind:tin.native?'native-input':tout.native?'native-output':'public-swap',recipient:recv,amountIn:amount,minimumOut:minimum},gas(input));
 const approval=tin.native?null:buildPublicTokenApprovalPlan({token:tin.address,spender:to,requiredAmount:amount,currentAllowance:uint(field(input,'currentAllowance'))});
 return Object.freeze({call,approval,swapTransactions:1,approvalTransactions:approval?.calls.length??0});
}
export {EVM_NATIVE_ASSET_ADDRESS};
