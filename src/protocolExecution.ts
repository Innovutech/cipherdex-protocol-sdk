// SPDX-License-Identifier: UNLICENSED
import {PROTOCOL_ABIS,PROTOCOL_SELECTORS} from './protocolAbi.js';
import {Address,Hex,ProtocolCodec,address,hex,uint,field,optional,fail,equal,freezeArgs} from './protocolData.js';
import {VerifiedBundle,VerifiedPool,requireBundle,authenticatedCandidates} from './poolIdentity.js';
export type ProtocolCall=Readonly<{chainId:bigint;from:Address;to:Address;abi:readonly string[];functionName:string;args:readonly unknown[];data:Hex;value:bigint;gasLimit?:bigint}>;
export type CallContext=Readonly<{bundle:VerifiedBundle;candidates:readonly VerifiedPool[];tokenIn:Address;tokenOut:Address;kind:'public-quote'|'public-swap'|'native-input'|'native-output'|'confidential-quote'|'confidential-swap'|'position';recipient?:Address;requestId?:Hex;amountIn?:bigint;minimumOut?:bigint;liquidity?:LiquidityContext}>;
export type LiquidityContext=Readonly<{
 poolAddress:Address;key:Hex;label:keyof typeof PROTOCOL_ABIS;eventName?:string;
 result:'creation'|'deposit'|'removal'|'success'|'ciphertexts'|'lock'|'unlock'|'claim';
 creationArgs?:readonly unknown[];instance?:boolean;native?:boolean;operation?:bigint;
 maximums?:readonly bigint[];minimums?:readonly bigint[];minimumShares?:bigint;shareAmount?:bigint;
 requestId?:Hex;token0Specified?:boolean;side?:bigint;lockId?:Hex;unlockTime?:bigint;permanent?:boolean;
}>;
const contexts=new WeakMap<object,CallContext>();
export function context(call:ProtocolCall):CallContext{return contexts.get(call)??fail('Unverified call plan');}
export function makeCall(codec:ProtocolCodec,label:keyof typeof PROTOCOL_ABIS,b:VerifiedBundle,from:Address,to:Address,functionName:string,args:readonly unknown[],value:bigint,ctx:CallContext,gasLimit?:bigint):ProtocolCall{
 requireBundle(b);const call=encodeProtocolCall(codec,label,b.policy.chainId,from,to,functionName,args,value,gasLimit);
 contexts.set(call,Object.freeze(ctx));return call;
}
/** INTERNAL encoding primitive; public builders separately brand authentication. */
export function encodeProtocolCall(codec:ProtocolCodec,label:keyof typeof PROTOCOL_ABIS,chainId:bigint,from:Address,to:Address,functionName:string,args:readonly unknown[],value:bigint,gasLimit?:bigint):ProtocolCall{
 const normalized=freezeArgs(args),abi=PROTOCOL_ABIS[label];
 const data=hex(codec.encodeFunctionData(abi,functionName,normalized));
 const selector=(PROTOCOL_SELECTORS[label] as Readonly<Record<string,string>>)[functionName];
 if(!selector||data.slice(0,10)!==selector)fail('Codec returned wrong selector');
 const call=Object.freeze({chainId:uint(chainId,256,true),from:address(from),to:address(to),abi,functionName,args:normalized,data,value:uint(value),...(gasLimit===undefined?{}:{gasLimit:uint(gasLimit,256,true)})});
 return call;
}
export type SwapInput=Readonly<{caller:Address;tokenIn:Address;tokenOut:Address;amountIn:bigint;minimumOut:bigint;candidates:readonly VerifiedPool[];recipient:Address;deadline:bigint;currentAllowance:bigint;gasLimit?:bigint}>;
export function deadline(b:VerifiedBundle,v:unknown):bigint {const t=uint(v,64);if(t<b.block.timestamp)fail('Expired at authenticated block');return t;}
export function recipient(b:VerifiedBundle,v:unknown,candidates:readonly VerifiedPool[],native=false):Address {
 // A multi-candidate winner is not known yet; the contract rejects its own address at settlement.
 const r=address(v),forbidden=[b.policy.router.address,...(candidates.length===1?[candidates[0].address]:[])];
 if(native)forbidden.push(b.policy.nativeRouter!.address,b.policy.wrappedNative!.address);
 if(forbidden.includes(r))fail('Invalid recipient');return r;
}
export function gas(input:unknown):bigint|undefined {const g=optional(input,'gasLimit');return g===undefined?undefined:uint(g,256,true);}
export function winner(call:ProtocolCall,value:unknown):VerifiedPool {const w=address(value);return context(call).candidates.find(p=>p.address===w)??fail('Winner not in authenticated candidates');}
