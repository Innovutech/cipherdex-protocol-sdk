// SPDX-License-Identifier: UNLICENSED
// Getter-free adapter snapshots. Decoders return positional arrays, never library Result objects.
export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
export const ZERO_HASH = ('0x'+'00'.repeat(32)) as Hex;
export const FEE_TIERS = Object.freeze([1n,5n,30n,100n]);
export type Mode = 0|1|2;
export type BlockRef = Readonly<{number:bigint;hash:Hex;timestamp:bigint}>;
export type ContractRead = Readonly<{address:Address;abi:readonly string[];functionName:string;args:readonly unknown[]}>;
export interface ProtocolReadAdapter {
 readChainId():Promise<unknown>;
 readBlock(number?:bigint):Promise<unknown>;
 getCode(address:Address,block:BlockRef):Promise<unknown>;
 hashRuntimeCode(code:Hex):Hex;
 // Reviewed canonical ABI encoder + Keccak adapter, not SDK cryptography.
 hashAbiEncoded(types:readonly string[],values:readonly unknown[]):Hex;
 readContract(call:ContractRead,block:BlockRef):Promise<unknown>;
}
export interface ProtocolCodec {
 encodeFunctionData(abi:readonly string[],functionName:string,args:readonly unknown[]):unknown;
 decodeEventLog(abi:readonly string[],eventName:string,log:Readonly<{topics:readonly Hex[];data:Hex}>):unknown;
}
export function fail(message:string):never {throw new TypeError(message);}
export function field(value:unknown,key:string):unknown {
 if(value===null||typeof value!=='object')return fail('Expected own data record');
 const d=Object.getOwnPropertyDescriptor(value,key);
 if(!d||!('value' in d))return fail('Missing or accessor field: '+key);return d.value;
}
export function optional(value:unknown,key:string):unknown {
 if(value===null||typeof value!=='object')return fail('Expected own data record');
 const d=Object.getOwnPropertyDescriptor(value,key);if(!d)return undefined;
 if(!('value' in d))return fail('Accessor field: '+key);return d.value;
}
export function array(value:unknown,max=4096,exact?:number):readonly unknown[] {
 if(!Array.isArray(value))return fail('Expected positional array');
 const n=field(value,'length');
 if(typeof n!=='number'||!Number.isInteger(n)||n<0||n>max||(exact!==undefined&&n!==exact))return fail('Invalid array length');
 if(Reflect.ownKeys(value).length!==n+1)return fail('Unexpected array fields');
 return Object.freeze(Array.from({length:n},(_,i)=>field(value,String(i))));
}
export function uint(value:unknown,bits=256,positive=false):bigint {
 if(typeof value!=='bigint'||value<0n||value>=(1n<<BigInt(bits))||(positive&&value===0n))return fail('Invalid uint'+bits);return value;
}
export function address(value:unknown,allowZero=false):Address {
 if(typeof value!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(value))return fail('Invalid address');
 const a=value.toLowerCase() as Address;
 if((!allowZero&&a===ZERO_ADDRESS)||a==='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')return fail('Invalid contract/account address');return a;
}
export function hex(value:unknown,bytes?:number,maxBytes=65536):Hex {
 if(typeof value!=='string'||value.length>2+maxBytes*2||!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)||(bytes!==undefined&&value.length!==2+bytes*2))return fail('Invalid hex data');return value.toLowerCase() as Hex;
}
export function hash(value:unknown,nonzero=false):Hex {const h=hex(value,32);if(nonzero&&h===ZERO_HASH)fail('Zero hash');return h;}
export function bool(value:unknown):boolean {if(typeof value!=='boolean')return fail('Invalid boolean');return value;}
export function mode(value:unknown):Mode {const n=uint(value,8);if(n>2n)fail('Unsupported privacy mode');return Number(n) as Mode;}
export function equal(a:unknown,b:unknown,label:string):void {if(a!==b)fail('Mismatch: '+label);}
export function block(value:unknown):BlockRef {return Object.freeze({number:uint(field(value,'number')),hash:hash(field(value,'hash'),true),timestamp:uint(field(value,'timestamp'),64)});}
export function tuple(value:unknown,n:number):readonly unknown[] {return array(value,n,n);}
export function frozenRead(address:Address,abi:readonly string[],functionName:string,args:readonly unknown[]=[]):ContractRead {return Object.freeze({address,abi,functionName,args:Object.freeze([...args])});}
export async function read(a:ProtocolReadAdapter,b:BlockRef,target:Address,abi:readonly string[],name:string,args:readonly unknown[]=[]):Promise<readonly unknown[]> {return array(await a.readContract(frozenRead(target,abi,name,args),b),32);}
export async function one(a:ProtocolReadAdapter,b:BlockRef,target:Address,abi:readonly string[],name:string,args:readonly unknown[]=[]):Promise<unknown>{const r=await read(a,b,target,abi,name,args);if(r.length!==1)fail('Wrong single output arity');return r[0];}
export async function stable(a:ProtocolReadAdapter,chainId:bigint,b:BlockRef):Promise<void>{
 equal(uint(await a.readChainId(),256,true),chainId,'chain');
 const current=block(await a.readBlock(b.number));
 equal(current.number,b.number,'provider block number');equal(current.hash,b.hash,'provider block');equal(current.timestamp,b.timestamp,'provider block timestamp');
}
export function freezeArgs(args:readonly unknown[]):readonly unknown[]{return Object.freeze(args.map(v=>Array.isArray(v)?freezeArgs(array(v)):v));}
