export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export declare const ZERO_ADDRESS: Address;
export declare const ZERO_HASH: Hex;
export declare const FEE_TIERS: readonly bigint[];
export type Mode = 0 | 1 | 2;
export type BlockRef = Readonly<{
    number: bigint;
    hash: Hex;
    timestamp: bigint;
}>;
export type ContractRead = Readonly<{
    address: Address;
    abi: readonly string[];
    functionName: string;
    args: readonly unknown[];
}>;
export interface ProtocolReadAdapter {
    readChainId(): Promise<unknown>;
    readBlock(number?: bigint): Promise<unknown>;
    getCode(address: Address, block: BlockRef): Promise<unknown>;
    hashRuntimeCode(code: Hex): Hex;
    hashAbiEncoded(types: readonly string[], values: readonly unknown[]): Hex;
    readContract(call: ContractRead, block: BlockRef): Promise<unknown>;
}
export interface ProtocolCodec {
    encodeFunctionData(abi: readonly string[], functionName: string, args: readonly unknown[]): unknown;
    decodeEventLog(abi: readonly string[], eventName: string, log: Readonly<{
        topics: readonly Hex[];
        data: Hex;
    }>): unknown;
}
export declare function fail(message: string): never;
export declare function field(value: unknown, key: string): unknown;
export declare function optional(value: unknown, key: string): unknown;
export declare function array(value: unknown, max?: number, exact?: number): readonly unknown[];
export declare function uint(value: unknown, bits?: number, positive?: boolean): bigint;
export declare function address(value: unknown, allowZero?: boolean): Address;
export declare function hex(value: unknown, bytes?: number, maxBytes?: number): Hex;
export declare function hash(value: unknown, nonzero?: boolean): Hex;
export declare function bool(value: unknown): boolean;
export declare function mode(value: unknown): Mode;
export declare function equal(a: unknown, b: unknown, label: string): void;
export declare function block(value: unknown): BlockRef;
export declare function tuple(value: unknown, n: number): readonly unknown[];
export declare function frozenRead(address: Address, abi: readonly string[], functionName: string, args?: readonly unknown[]): ContractRead;
export declare function read(a: ProtocolReadAdapter, b: BlockRef, target: Address, abi: readonly string[], name: string, args?: readonly unknown[]): Promise<readonly unknown[]>;
export declare function one(a: ProtocolReadAdapter, b: BlockRef, target: Address, abi: readonly string[], name: string, args?: readonly unknown[]): Promise<unknown>;
export declare function stable(a: ProtocolReadAdapter, chainId: bigint, b: BlockRef): Promise<void>;
export declare function freezeArgs(args: readonly unknown[]): readonly unknown[];
