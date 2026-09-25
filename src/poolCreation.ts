// SPDX-License-Identifier: UNLICENSED
import {Address,Hex,ProtocolReadAdapter,ProtocolCodec,address,uint,hash,hex,field,optional,equal,fail,one,stable,ZERO_ADDRESS,FEE_TIERS} from './protocolData.js';
import {VerifiedBundle,VerifiedPool,requireBundle,authenticatePool,namespaceAddress,abi} from './poolIdentity.js';
import {ProtocolCall,makeCall} from './protocolExecution.js';

export type StandardCreationInput=Readonly<{tokenA:Address;tokenB:Address;feeBps:bigint;instanceNamespace?:Address;nonce?:Hex}>;
/** An authenticated factory prediction is not an issued/authenticated pool. */
export type StandardPoolPrediction=Readonly<{
 predictedAddress:Address;key:Hex;tokenA:Address;tokenB:Address;token0:Address;token1:Address;feeBps:bigint;
 instanceNamespace?:Address;nonce?:Hex;existingPool?:VerifiedPool;
}>;
const predictions=new WeakMap<object,VerifiedBundle>();
export function requirePrediction(b:VerifiedBundle,p:StandardPoolPrediction):void {
 requireBundle(b);if(predictions.get(p)!==b)fail('Prediction not authenticated at this bundle/block');
}
export function creationArgs(p:StandardPoolPrediction):readonly unknown[] {
 return Object.freeze([p.tokenA,p.tokenB,p.feeBps,...(p.instanceNamespace?[p.instanceNamespace,p.nonce!]:[])]);
}
export async function predictStandardPool(a:ProtocolReadAdapter,b:VerifiedBundle,input:StandardCreationInput):Promise<StandardPoolPrediction>{
 requireBundle(b);
 const tokenA=address(field(input,'tokenA')),tokenB=address(field(input,'tokenB')),feeBps=uint(field(input,'feeBps'));
 if(tokenA===tokenB||!FEE_TIERS.includes(feeBps))fail('Invalid standard pair/tier');
 const rawNamespace=optional(input,'instanceNamespace'),rawNonce=optional(input,'nonce');
 if((rawNamespace===undefined)!==(rawNonce===undefined))fail('Instance requires namespace and bytes32 nonce');
 const instanceNamespace=rawNamespace===undefined?undefined:namespaceAddress(rawNamespace),nonce=rawNonce===undefined?undefined:hash(rawNonce);
 const args=Object.freeze([tokenA,tokenB,feeBps,...(instanceNamespace?[instanceNamespace,nonce!]:[])]);
 const get=(name:string)=>one(a,b.block,b.policy.factory.address,abi(b,'Factory'),name,args);
 const key=hash(await get(instanceNamespace?'standardInstanceKey':'poolKey'),true);
 const ordered=BigInt(tokenA)<BigInt(tokenB)?[tokenA,tokenB]:[tokenB,tokenA];
 const instanceId=instanceNamespace?hash(a.hashAbiEncoded(Object.freeze(['address','bytes32']),Object.freeze([instanceNamespace,nonce!])),true):undefined;
 const keyTypes=['address','address','uint256','uint256','uint8','uint8','address',...(instanceId?['bytes32']:[])];
 const keyValues=[...ordered,feeBps,1n,BigInt(b.policy.mode),0n,ZERO_ADDRESS,...(instanceId?[instanceId]:[])];
 equal(hash(a.hashAbiEncoded(Object.freeze(keyTypes),Object.freeze(keyValues))),key,'predicted canonical key');
 const predictedAddress=address(await get(instanceNamespace?'predictPoolInstance':'predictPool'));
 const existing=address(await get(instanceNamespace?'poolForInstance':'poolFor'),true);
 let existingPool:VerifiedPool|undefined;
 if(existing!==ZERO_ADDRESS){
  equal(existing,predictedAddress,'creation prediction');existingPool=await authenticatePool(a,b,existing);
  equal(existingPool.key,key,'creation key');
  equal(existingPool.kind,instanceNamespace?'additional-standard':'default-standard','creation kind');
 }else if(hex(await a.getCode(predictedAddress,b.block))!=='0x')fail('Occupied unrecorded prediction');
 const [token0,token1]=BigInt(tokenA)<BigInt(tokenB)?[tokenA,tokenB]:[tokenB,tokenA];
 if(existingPool){equal(existingPool.token0,token0,'creation token0');equal(existingPool.token1,token1,'creation token1');equal(existingPool.feeBps,feeBps,'creation fee');}
 await stable(a,b.policy.chainId,b.block);
 const result=Object.freeze({predictedAddress,key,tokenA,tokenB,token0,token1,feeBps,
 ...(instanceNamespace?{instanceNamespace,nonce}:{}),...(existingPool?{existingPool}:{})});
 predictions.set(result,b);return result;
}
export function buildStandardCreation(b:VerifiedBundle,p:StandardPoolPrediction,input:Readonly<{caller:Address;gasLimit?:bigint}>,codec:ProtocolCodec):ProtocolCall{
 requirePrediction(b,p);if(!p.instanceNamespace&&p.existingPool)fail('Default pool already exists');
 const caller=address(field(input,'caller')),g=optional(input,'gasLimit');
 const label=(['PublicFactory','ConfidentialFactory','ObservableFactory'] as const)[b.policy.mode];
 return makeCall(codec,label,b,caller,b.policy.factory.address,p.instanceNamespace?'createPoolInstance':'createPool',creationArgs(p),0n,
 {bundle:b,candidates:Object.freeze([]),tokenIn:p.token0,tokenOut:p.token1,kind:'position',
 liquidity:Object.freeze({poolAddress:p.predictedAddress,key:p.key,label,result:'creation',creationArgs:creationArgs(p),instance:!!p.instanceNamespace,
 eventName:p.instanceNamespace?'StandardPoolInstanceCreated':'StandardPoolCreated'})},g===undefined?undefined:uint(g,256,true));
}
