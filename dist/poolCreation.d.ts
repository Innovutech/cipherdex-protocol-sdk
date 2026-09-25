import { Address, Hex, ProtocolReadAdapter, ProtocolCodec } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall } from './protocolExecution.js';
export type StandardCreationInput = Readonly<{
    tokenA: Address;
    tokenB: Address;
    feeBps: bigint;
    instanceNamespace?: Address;
    nonce?: Hex;
}>;
/** An authenticated factory prediction is not an issued/authenticated pool. */
export type StandardPoolPrediction = Readonly<{
    predictedAddress: Address;
    key: Hex;
    tokenA: Address;
    tokenB: Address;
    token0: Address;
    token1: Address;
    feeBps: bigint;
    instanceNamespace?: Address;
    nonce?: Hex;
    existingPool?: VerifiedPool;
}>;
export declare function requirePrediction(b: VerifiedBundle, p: StandardPoolPrediction): void;
export declare function creationArgs(p: StandardPoolPrediction): readonly unknown[];
export declare function predictStandardPool(a: ProtocolReadAdapter, b: VerifiedBundle, input: StandardCreationInput): Promise<StandardPoolPrediction>;
export declare function buildStandardCreation(b: VerifiedBundle, p: StandardPoolPrediction, input: Readonly<{
    caller: Address;
    gasLimit?: bigint;
}>, codec: ProtocolCodec): ProtocolCall;
