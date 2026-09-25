import { Address, Hex, ProtocolCodec } from './protocolData.js';
import { ProtocolCall } from './protocolExecution.js';
import { ProtocolReceiptAdapter } from './protocolResults.js';
import { SurplusControlState, FeeControlState, LaunchRegistryState, LaunchFactoryApproval } from './protocolAdministration.js';
export type AdministrationFacts = Readonly<{
    operation: 'propose-beneficiary';
    administrator: Address;
    previousBeneficiary: Address;
    proposedBeneficiary: Address;
    activationTime: bigint;
}> | Readonly<{
    operation: 'cancel-beneficiary';
    administrator: Address;
    cancelledBeneficiary: Address;
}> | Readonly<{
    operation: 'accept-beneficiary';
    previousBeneficiary: Address;
    newBeneficiary: Address;
}> | Readonly<{
    operation: 'propose-administrator';
    administrator: Address;
    proposedAdministrator: Address;
}> | Readonly<{
    operation: 'accept-administrator';
    previousAdministrator: Address;
    newAdministrator: Address;
}> | Readonly<{
    operation: 'propose-surplus-beneficiary';
    administrator: Address;
    previousBeneficiary: Address;
    proposedBeneficiary: Address;
    activationTime: bigint;
}> | Readonly<{
    operation: 'cancel-surplus-beneficiary';
    administrator: Address;
    cancelledBeneficiary: Address;
}> | Readonly<{
    operation: 'accept-surplus-beneficiary';
    previousBeneficiary: Address;
    newBeneficiary: Address;
}> | Readonly<{
    operation: 'propose-surplus-administrator';
    administrator: Address;
    proposedAdministrator: Address;
}> | Readonly<{
    operation: 'accept-surplus-administrator';
    previousAdministrator: Address;
    newAdministrator: Address;
}> | Readonly<{
    operation: 'approve-launch';
    launchFactory: Address;
    recordedRuntimeCodehash: Hex;
    observedPreflightRuntimeCodehash: Hex;
    preflightHashMatched: boolean;
}> | Readonly<{
    operation: 'revoke-launch';
    launchFactory: Address;
}> | Readonly<{
    operation: 'transfer-owner';
    previousOwner: Address;
    proposedOwner: Address;
}> | Readonly<{
    operation: 'accept-owner';
    previousOwner: Address;
    newOwner: Address;
}> | Readonly<{
    operation: 'sweep';
    mode: 0;
    token: Address;
    beneficiary: Address;
    amount: bigint;
}> | Readonly<{
    operation: 'sweep';
    mode: 1 | 2;
    token: Address;
    beneficiary: Address;
    aggregatedSwapCount: bigint;
    amount: 'unavailable';
}> | Readonly<{
    operation: 'collect';
    mode: 0;
    pool: Address;
    vault: Address;
    token: Address;
    amount: bigint;
}> | Readonly<{
    operation: 'collect';
    mode: 1 | 2;
    pool: Address;
    vault: Address;
    token: Address;
    epoch: bigint;
    aggregatedSwapCount: bigint;
    amount: 'unavailable';
}>;
export type VerifiedAdministrationResult = Readonly<{
    transactionHash: Hex;
    facts: AdministrationFacts;
    endOfReceiptBlock: Readonly<{
        feeControls?: FeeControlState;
        surplusControls?: SurplusControlState;
        registry?: LaunchRegistryState;
        launchApproval?: LaunchFactoryApproval;
    }>;
}>;
/** Direct top-level operation evidence only. Later transactions in the same block
 * can alter the separately returned state. An inner/controller call is rejected. */
export declare function parseAdministrationReceipt(call: ProtocolCall, transactionHash: Hex, a: ProtocolReceiptAdapter, codec: ProtocolCodec): Promise<VerifiedAdministrationResult>;
