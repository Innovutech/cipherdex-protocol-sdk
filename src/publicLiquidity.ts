// SPDX-License-Identifier: UNLICENSED
import {Address,Hex,ProtocolCodec,address,uint,field,optional,fail,equal} from './protocolData.js';
import {VerifiedBundle,VerifiedPool,requireBundle,requirePool} from './poolIdentity.js';
import {ProtocolCall,LiquidityContext,makeCall,deadline,gas} from './protocolExecution.js';
import {StandardPoolPrediction,requirePrediction,creationArgs} from './poolCreation.js';
import {requireLiquidityIntent,SignedLPPermit,permitArguments} from './lpPosition.js';
import {buildPublicTokenApprovalPlan,PublicTokenApprovalPlan,PublicTokenApprovalCall} from './tokenApproval.js';

export type DepositParams=Readonly<{amount0:bigint;amount1:bigint;minimumShares:bigint;minimumPriceX18:bigint;maximumPriceX18:bigint;recipient:Address;deadline:bigint}>;
export type RemoveLiquidityParams=Readonly<{shareAmount:bigint;minimumAmount0:bigint;minimumAmount1:bigint;recipient:Address;deadline:bigint}>;
export type NativeDepositParams=Readonly<{tokenAmount:bigint;minimumShares:bigint;minimumPriceX18:bigint;maximumPriceX18:bigint;recipient:Address;deadline:bigint}>;
export type NativeRemoveParams=Readonly<{shareAmount:bigint;minimumTokenAmount:bigint;minimumNativeAmount:bigint;recipient:Address;deadline:bigint}>;
export type PublicDepositInput=Readonly<{caller:Address;params:DepositParams;currentAllowance0:bigint;currentAllowance1:bigint;gasLimit?:bigint}>;
export type NativeDepositInput=Readonly<{caller:Address;params:NativeDepositParams;value:bigint;currentTokenAllowance:bigint;gasLimit?:bigint}>;
export type PublicRemovalInput=Readonly<{caller:Address;params:RemoveLiquidityParams;currentLPAllowance:bigint;gasLimit?:bigint}>;
export type NativeRemovalInput=Readonly<{caller:Address;params:NativeRemoveParams;currentLPAllowance:bigint;gasLimit?:bigint}>;
export type PublicLiquidityPlan=Readonly<{
 call:ProtocolCall;approvals:readonly PublicTokenApprovalPlan[];
 steps:readonly (Readonly<{kind:'approval';call:PublicTokenApprovalCall}>|Readonly<{kind:'operation';call:ProtocolCall}>)[];
 transactions:1;approvalTransactions:number;
}>;
function adapter(b:VerifiedBundle,native:boolean):Address{
 requireBundle(b);if(b.policy.mode!==0)fail('Public mode required');
 return (native?b.policy.nativeLiquidityRouter:b.policy.liquidityRouter)?.address??fail('Missing reviewed liquidity anchor');
}
function recipient(b:VerifiedBundle,value:unknown,pool:Address,target:Address,native:boolean):Address{
 const r=address(value),forbidden=[pool,target,...(native?[b.policy.wrappedNative!.address,b.policy.liquidityRouter!.address]:[])];
 if(forbidden.includes(r))fail('Invalid liquidity recipient');return r;
}
function nativeToken(b:VerifiedBundle,token0:Address,token1:Address,target:Address):Address{
 const wrapped=b.policy.wrappedNative?.address??fail('Missing wrapper anchor');
 if(token0!==wrapped&&token1!==wrapped)fail('Pool does not contain configured WCOTI');
 const token=token0===wrapped?token1:token0;
 if([wrapped,target,b.policy.liquidityRouter!.address].includes(token))fail('Invalid paired token');
 return token;
}
function approval(token:Address,spender:Address,amount:bigint,current:unknown):PublicTokenApprovalPlan{
 return buildPublicTokenApprovalPlan({token,spender,requiredAmount:amount,currentAllowance:uint(current)});
}
function plan(call:ProtocolCall,approvals:readonly PublicTokenApprovalPlan[]):PublicLiquidityPlan{
 const frozen=Object.freeze([...approvals]);
 const steps=Object.freeze([...frozen.flatMap(p=>p.calls.map(call=>Object.freeze({kind:'approval' as const,call}))),Object.freeze({kind:'operation' as const,call})]);
 return Object.freeze({call,approvals:frozen,steps,transactions:1,approvalTransactions:steps.length-1});
}
function deposit(b:VerifiedBundle,targetPool:VerifiedPool|StandardPoolPrediction,input:PublicDepositInput|NativeDepositInput,codec:ProtocolCodec,native:boolean,operation:0|1|2|3):PublicLiquidityPlan{
 const target=adapter(b,native),creation=operation===1||operation===2;
 let pool:Address,key:Hex,token0:Address,token1:Address,args:readonly unknown[]=[],candidates:readonly VerifiedPool[],prediction:StandardPoolPrediction|undefined;
 if(creation){
  prediction=targetPool as StandardPoolPrediction;requirePrediction(b,prediction);
  if(!!prediction.instanceNamespace!==(operation===2))fail('Wrong standard creation operation');
  if(prediction.existingPool)requireLiquidityIntent(b,prediction.existingPool,true);
  pool=prediction.predictedAddress;key=prediction.key;token0=prediction.token0;token1=prediction.token1;
  args=creationArgs(prediction);candidates=Object.freeze(prediction.existingPool?[prediction.existingPool]:[]);
 }else{
  const p=targetPool as VerifiedPool;requireLiquidityIntent(b,p,operation===0);
  pool=p.address;key=p.key;token0=p.token0;token1=p.token1;candidates=Object.freeze([p]);
 }
 const paired=native?nativeToken(b,token0,token1,target):undefined;
 const caller=address(field(input,'caller')),p=field(input,'params');
 const a0=uint(field(p,native?'tokenAmount':'amount0'),128,true),a1=native?uint(field(input,'value'),128,true):uint(field(p,'amount1'),128,true);
 const minShares=uint(field(p,'minimumShares')),minPrice=uint(field(p,'minimumPriceX18')),maxPrice=uint(field(p,'maximumPriceX18'));
 if(minPrice>maxPrice)fail('Invalid canonical price bounds');
 const recv=recipient(b,field(p,'recipient'),pool,target,native),time=deadline(b,field(p,'deadline'));
 const params=native?[a0,minShares,minPrice,maxPrice,recv,time]:[a0,a1,minShares,minPrice,maxPrice,recv,time];
 const names=native?['initializePoolNative','createAndInitializeStandardNative','createAndInitializeStandardInstanceNative','addLiquidityNative']:
 ['initializePool','createAndInitializeStandard','createAndInitializeStandardInstance','addLiquidity'];
 const callArgs=creation?(native?[paired,prediction!.feeBps,...(operation===2?[prediction!.instanceNamespace,prediction!.nonce]:[]),params]:[...args,params]):[pool,params];
 const label=native?'NativeLiquidityRouter':'LiquidityRouter';
 const info:LiquidityContext=Object.freeze({poolAddress:pool,key,label,result:'deposit',native,operation:BigInt(operation),
 eventName:native?'NativeLiquidityDeposited':'LiquidityDepositRouted',maximums:Object.freeze([a0,a1]),minimumShares:minShares,
 ...(creation?{creationArgs:args,instance:operation===2}:{})});
 const call=makeCall(codec,label,b,caller,target,names[operation],callArgs,native?a1:0n,
 {bundle:b,candidates,tokenIn:token0,tokenOut:token1,kind:'position',recipient:recv,liquidity:info},gas(input));
 const approvals=native?[approval(paired!,target,a0,field(input,'currentTokenAllowance'))]:
 [approval(token0,target,a0,field(input,'currentAllowance0')),approval(token1,target,a1,field(input,'currentAllowance1'))];
 return plan(call,approvals);
}
function removal(b:VerifiedBundle,p:VerifiedPool,input:PublicRemovalInput|NativeRemovalInput,codec:ProtocolCodec,native:boolean,permit?:SignedLPPermit):PublicLiquidityPlan{
 const target=adapter(b,native);requireLiquidityIntent(b,p,false);if(native)nativeToken(b,p.token0,p.token1,target);
 const caller=address(field(input,'caller')),params=field(input,'params'),shares=uint(field(params,'shareAmount'),256,true);
 const min0=uint(field(params,native?'minimumTokenAmount':'minimumAmount0')),min1=uint(field(params,native?'minimumNativeAmount':'minimumAmount1'));
 const recv=recipient(b,field(params,'recipient'),p.address,target,native),time=deadline(b,field(params,'deadline'));
 const current=uint(field(input,'currentLPAllowance')),label=native?'NativeLiquidityRouter':'LiquidityRouter';
 const suffix=permit?'WithPermit':'',name=(native?'removeLiquidityNative':'removeLiquidity')+suffix;
 const args=[p.address,[shares,min0,min1,recv,time],...(permit?permitArguments(permit,b,p,caller,target,shares):[])];
 const call=makeCall(codec,label,b,caller,target,name,args,0n,{bundle:b,candidates:Object.freeze([p]),tokenIn:p.token0,tokenOut:p.token1,kind:'position',recipient:recv,
 liquidity:Object.freeze({poolAddress:p.address,key:p.key,label,result:'removal',native,shareAmount:shares,minimums:Object.freeze([min0,min1]),
 eventName:native?'NativeLiquidityRemoved':'LiquidityRemovalRouted'})},gas(input));
 return plan(call,permit?[]:[approval(p.lpToken,target,shares,current)]);
}
export const buildInitializePool=(b:VerifiedBundle,p:VerifiedPool,i:PublicDepositInput,c:ProtocolCodec)=>deposit(b,p,i,c,false,0);
export const buildCreateAndInitializeStandard=(b:VerifiedBundle,p:StandardPoolPrediction,i:PublicDepositInput,c:ProtocolCodec)=>deposit(b,p,i,c,false,1);
export const buildCreateAndInitializeStandardInstance=(b:VerifiedBundle,p:StandardPoolPrediction,i:PublicDepositInput,c:ProtocolCodec)=>deposit(b,p,i,c,false,2);
export const buildAddLiquidity=(b:VerifiedBundle,p:VerifiedPool,i:PublicDepositInput,c:ProtocolCodec)=>deposit(b,p,i,c,false,3);
export const buildRemoveLiquidity=(b:VerifiedBundle,p:VerifiedPool,i:PublicRemovalInput,c:ProtocolCodec)=>removal(b,p,i,c,false);
export const buildRemoveLiquidityWithPermit=(b:VerifiedBundle,p:VerifiedPool,i:PublicRemovalInput,permit:SignedLPPermit,c:ProtocolCodec)=>removal(b,p,i,c,false,permit);
export const buildInitializePoolNative=(b:VerifiedBundle,p:VerifiedPool,i:NativeDepositInput,c:ProtocolCodec)=>deposit(b,p,i,c,true,0);
export const buildCreateAndInitializeStandardNative=(b:VerifiedBundle,p:StandardPoolPrediction,i:NativeDepositInput,c:ProtocolCodec)=>deposit(b,p,i,c,true,1);
export const buildCreateAndInitializeStandardInstanceNative=(b:VerifiedBundle,p:StandardPoolPrediction,i:NativeDepositInput,c:ProtocolCodec)=>deposit(b,p,i,c,true,2);
export const buildAddLiquidityNative=(b:VerifiedBundle,p:VerifiedPool,i:NativeDepositInput,c:ProtocolCodec)=>deposit(b,p,i,c,true,3);
export const buildRemoveLiquidityNative=(b:VerifiedBundle,p:VerifiedPool,i:NativeRemovalInput,c:ProtocolCodec)=>removal(b,p,i,c,true);
export const buildRemoveLiquidityNativeWithPermit=(b:VerifiedBundle,p:VerifiedPool,i:NativeRemovalInput,permit:SignedLPPermit,c:ProtocolCodec)=>removal(b,p,i,c,true,permit);
