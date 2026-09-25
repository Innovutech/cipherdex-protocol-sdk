import { Address, Hex, ProtocolCodec } from './protocolData.js';
import { VerifiedBundle, VerifiedPool } from './poolIdentity.js';
import { ProtocolCall } from './protocolExecution.js';
import { ProtocolReceiptAdapter } from './protocolResults.js';
import { ProtectedInnerCall, ProtectedGTGuidance } from './protectedInitialization.js';
import { LPLockMetadata } from './lpPosition.js';
type ReservationFact = Readonly<{
    kind: 'reservation';
    eventName: 'ProtectedPoolReserved' | 'ProtectedPoolCreated';
    pool: Address;
    key: Hex;
    lpToken: Address;
    launchFactory: Address;
    protectedToken: Address;
}>;
type GraduationFact = Readonly<{
    kind: 'graduation';
    eventName: 'ProtectedPoolGraduated';
    pool: Address;
    key: Hex;
    lpToken: Address;
    launchFactory: Address;
    effectiveCaller: Address;
    protectedToken: Address;
    lpRecipient: Address;
    disposition: bigint;
    lockId: Hex;
}> & (Readonly<{
    amountsAvailable: false;
}> | Readonly<{
    amountsAvailable: true;
    amount0: bigint;
    amount1: bigint;
    mintedShares: bigint;
}>);
export type ProtectedEventFacts = ReservationFact | GraduationFact;
type State = Readonly<{
    bundle: VerifiedBundle;
    pool: VerifiedPool;
    lock?: LPLockMetadata;
}>;
export type ProtectedEventConfirmation = Readonly<{
    verification: 'canonical-event-and-state-only';
    outerExecutionVerified: false;
    transactionHash: Hex;
    facts: ProtectedEventFacts;
    atReceipt: State;
    current: State;
}>;
export type DirectProtectedGraduationResult = Readonly<{
    verification: 'exact-top-level-transaction-and-event';
    transactionHash: Hex;
    facts: GraduationFact;
    atReceipt: State;
    current: State;
}>;
/** Direct authorized-EOA path only: exact chain/from/to/data/value and receipt. */
export declare function parseProtectedGraduationReceipt(call: ProtocolCall, transactionHash: Hex, a: ProtocolReceiptAdapter, codec: ProtocolCodec): Promise<DirectProtectedGraduationResult>;
/** Receipt events prove canonical protocol facts, NOT the outer controller signature,
 * wrapper calldata, or every internal step. No traces, executor assumptions or GT reads.
 */
export declare function confirmProtectedEvent(expectation: ProtectedInnerCall | ProtectedGTGuidance, transactionHash: Hex, a: ProtocolReceiptAdapter, codec: ProtocolCodec): Promise<ProtectedEventConfirmation>;
export {};
