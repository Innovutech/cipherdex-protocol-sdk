// SPDX-License-Identifier: UNLICENSED
import { PROTOCOL_ABIS, PROTOCOL_EVENT_TOPICS } from './protocolAbi.js';
import { address, hash, hex, uint, tuple, equal, fail, one, stable } from './protocolData.js';
import { authenticatePublicOrderBook, orderRecipient } from './publicOrders.js';
import { verifyMinedTransaction } from './protocolResults.js';
import { verifyProtocolBundle, authenticatePool } from './poolIdentity.js';
import { administrationCallContext, authenticateFeeVault, authenticateLaunchRegistry, readFeeControls, readLaunchRegistryState, readLaunchFactoryApproval, feeVaultAbi, readSurplusControls } from './protocolAdministration.js';
const controlNames = {
    'propose-beneficiary': 'BeneficiaryChangeProposed', 'cancel-beneficiary': 'BeneficiaryChangeCancelled', 'accept-beneficiary': 'BeneficiaryChanged',
    'propose-administrator': 'FeeAdministratorTransferProposed', 'accept-administrator': 'FeeAdministratorTransferred',
};
const registryNames = { 'approve-launch': 'LaunchFactoryApproved', 'revoke-launch': 'LaunchFactoryRevoked', 'transfer-owner': 'OwnershipTransferStarted', 'accept-owner': 'OwnershipTransferred' };
/** Direct top-level operation evidence only. Later transactions in the same block
 * can alter the separately returned state. An inner/controller call is rejected. */
export async function parseAdministrationReceipt(call, transactionHash, a, codec) {
    const c = administrationCallContext(call), old = c.kind === 'collect' ? c.bundle : c.kind === 'vault' ? c.vault : c.kind === 'book' ? c.book : c.registry;
    const m = await verifyMinedTransaction(call.chainId, old.block.number, transactionHash, a);
    equal(m.tx.from, call.from, 'administration transaction caller');
    equal(m.tx.to, call.to, 'administration transaction target');
    equal(m.tx.data, call.data, 'administration transaction calldata');
    equal(m.tx.value, 0n, 'administration transaction value');
    const consumed = new Set();
    function event(label, emitter, name, arity, topicCount, dataBytes) {
        const topics = PROTOCOL_EVENT_TOPICS[label], topic = topics[name] ?? fail('Missing projected administration event');
        const matches = m.logs.filter(l => l.address === emitter && l.topics[0] === topic);
        if (matches.length !== 1)
            fail('Missing or ambiguous ' + name);
        const l = matches[0];
        if (l.topics.length !== topicCount)
            fail('Malformed administration topics');
        hex(l.data, dataBytes);
        consumed.add(l);
        return tuple(codec.decodeEventLog(PROTOCOL_ABIS[label], name, l), arity);
    }
    function noAdditional(label, emitter) {
        const topics = new Set(Object.values(PROTOCOL_EVENT_TOPICS[label]));
        if (m.logs.some(l => l.address === emitter && topics.has(l.topics[0]) && !consumed.has(l)))
            fail('Unexpected administration event');
    }
    let facts, state;
    if (c.kind === 'vault') {
        const v = await authenticateFeeVault(a, c.vault.policy, m.at.number), s = await readFeeControls(a, v), label = ['PublicVault', 'ConfidentialVault', 'ObservableVault'][v.policy.mode];
        const account = (value) => { const p = address(value); if (p === v.policy.vault.address)
            fail('Invalid vault event role'); return p; };
        if (c.operation === 'sweep') {
            const name = v.policy.mode === 0 ? 'ProtocolFeesSwept' : 'ConfidentialFeesSwept', e = event(label, call.to, name, 3, 3, 32);
            const token = address(e[0]), beneficiary = account(e[1]);
            equal(token, c.token, 'swept token');
            if (v.policy.mode === 0)
                facts = Object.freeze({ operation: 'sweep', mode: 0, token, beneficiary, amount: uint(e[2], 256, true) });
            else {
                const count = uint(e[2], 64, true), minimum = uint(await one(a, m.at, v.policy.vault.address, feeVaultAbi(v), 'MIN_CONFIDENTIAL_AGGREGATED_SWAPS'), 64, true);
                if (count < minimum)
                    fail('Sweep event count below threshold');
                facts = Object.freeze({ operation: 'sweep', mode: v.policy.mode, token, beneficiary, aggregatedSwapCount: count, amount: 'unavailable' });
            }
        }
        else {
            const name = controlNames[c.operation], proposal = c.operation === 'propose-beneficiary', e = event(label, call.to, name, proposal ? 4 : 2, proposal ? 4 : 3, proposal ? 32 : 0);
            if (c.operation === 'propose-beneficiary') {
                const administrator = account(e[0]), previousBeneficiary = account(e[1]), proposedBeneficiary = account(e[2]), activationTime = uint(e[3], 64);
                equal(administrator, call.from, 'proposing administrator');
                equal(proposedBeneficiary, c.proposed, 'proposed beneficiary');
                if (previousBeneficiary === proposedBeneficiary)
                    fail('Unchanged beneficiary proposal');
                equal(activationTime, uint(m.at.timestamp + s.beneficiaryChangeDelay, 64), 'actual activation time');
                facts = Object.freeze({ operation: c.operation, administrator, previousBeneficiary, proposedBeneficiary, activationTime });
            }
            else if (c.operation === 'cancel-beneficiary') {
                const administrator = account(e[0]), cancelledBeneficiary = account(e[1]);
                equal(administrator, call.from, 'cancelling administrator');
                facts = Object.freeze({ operation: c.operation, administrator, cancelledBeneficiary });
            }
            else if (c.operation === 'accept-beneficiary') {
                const previousBeneficiary = account(e[0]), newBeneficiary = account(e[1]);
                equal(newBeneficiary, call.from, 'accepting beneficiary');
                if (previousBeneficiary === newBeneficiary)
                    fail('Unchanged beneficiary acceptance');
                facts = Object.freeze({ operation: c.operation, previousBeneficiary, newBeneficiary });
            }
            else if (c.operation === 'propose-administrator') {
                const administrator = account(e[0]), proposedAdministrator = account(e[1]);
                equal(administrator, call.from, 'proposing administrator');
                equal(proposedAdministrator, c.proposed, 'proposed administrator');
                if (administrator === proposedAdministrator)
                    fail('Unchanged administrator proposal');
                facts = Object.freeze({ operation: c.operation, administrator, proposedAdministrator });
            }
            else {
                const previousAdministrator = account(e[0]), newAdministrator = account(e[1]);
                equal(newAdministrator, call.from, 'accepting administrator');
                if (previousAdministrator === newAdministrator)
                    fail('Unchanged administrator acceptance');
                facts = Object.freeze({ operation: c.operation, previousAdministrator, newAdministrator });
            }
        }
        noAdditional(label, call.to);
        state = Object.freeze({ feeControls: s });
    }
    else if (c.kind === 'book') {
        const b = await authenticatePublicOrderBook(a, c.book.policy, m.at.number), s = await readSurplusControls(a, b);
        const names = { 'propose-surplus-beneficiary': 'SurplusBeneficiaryChangeProposed', 'cancel-surplus-beneficiary': 'SurplusBeneficiaryChangeCancelled', 'accept-surplus-beneficiary': 'SurplusBeneficiaryChanged', 'propose-surplus-administrator': 'SurplusAdministratorTransferProposed', 'accept-surplus-administrator': 'SurplusAdministratorTransferred' };
        const proposal = c.operation === 'propose-surplus-beneficiary', e = event('OrderBook', call.to, names[c.operation], proposal ? 4 : 2, proposal ? 4 : 3, proposal ? 32 : 0);
        const admin = (v) => { const x = address(v); if (x === call.to)
            fail('Invalid surplus event administrator'); return x; };
        if (c.operation === 'propose-surplus-beneficiary') {
            const administrator = admin(e[0]), previousBeneficiary = orderRecipient(b, e[1]), proposedBeneficiary = orderRecipient(b, e[2]), activationTime = uint(e[3], 64);
            equal(administrator, call.from, 'proposing surplus administrator');
            equal(proposedBeneficiary, c.proposed, 'proposed surplus beneficiary');
            if (previousBeneficiary === proposedBeneficiary)
                fail('Unchanged surplus proposal');
            equal(activationTime, uint(m.at.timestamp + s.surplusBeneficiaryChangeDelay, 64), 'actual surplus activation');
            facts = Object.freeze({ operation: c.operation, administrator, previousBeneficiary, proposedBeneficiary, activationTime });
        }
        else if (c.operation === 'cancel-surplus-beneficiary') {
            const administrator = admin(e[0]), cancelledBeneficiary = orderRecipient(b, e[1]);
            equal(administrator, call.from, 'cancelling surplus administrator');
            facts = Object.freeze({ operation: c.operation, administrator, cancelledBeneficiary });
        }
        else if (c.operation === 'accept-surplus-beneficiary') {
            const previousBeneficiary = orderRecipient(b, e[0]), newBeneficiary = orderRecipient(b, e[1]);
            equal(newBeneficiary, call.from, 'accepting surplus beneficiary');
            if (previousBeneficiary === newBeneficiary)
                fail('Unchanged surplus acceptance');
            facts = Object.freeze({ operation: c.operation, previousBeneficiary, newBeneficiary });
        }
        else if (c.operation === 'propose-surplus-administrator') {
            const administrator = admin(e[0]), proposedAdministrator = admin(e[1]);
            equal(administrator, call.from, 'proposing surplus administrator');
            equal(proposedAdministrator, c.proposed, 'proposed surplus administrator');
            if (administrator === proposedAdministrator)
                fail('Unchanged surplus administrator');
            facts = Object.freeze({ operation: c.operation, administrator, proposedAdministrator });
        }
        else {
            const previousAdministrator = admin(e[0]), newAdministrator = admin(e[1]);
            equal(newAdministrator, call.from, 'accepting surplus administrator');
            if (previousAdministrator === newAdministrator)
                fail('Unchanged surplus administrator');
            facts = Object.freeze({ operation: c.operation, previousAdministrator, newAdministrator });
        }
        noAdditional('OrderBook', call.to);
        state = Object.freeze({ surplusControls: s });
    }
    else if (c.kind === 'registry') {
        const r = await authenticateLaunchRegistry(a, c.registry.policy, m.at.number), s = await readLaunchRegistryState(a, r), name = registryNames[c.operation];
        const approval = c.operation === 'approve-launch', revocation = c.operation === 'revoke-launch';
        const e = event('Registry', call.to, name, revocation ? 1 : 2, approval || revocation ? 2 : 3, approval ? 32 : 0);
        let observed;
        const account = (value) => { const p = address(value); if (p === r.policy.registry.address)
            fail('Invalid registry event account'); return p; };
        if (approval) {
            const launchFactory = account(e[0]), recordedRuntimeCodehash = hash(e[1], true);
            equal(launchFactory, c.approval.launchFactory, 'approved launch factory');
            facts = Object.freeze({ operation: 'approve-launch', launchFactory, recordedRuntimeCodehash, observedPreflightRuntimeCodehash: c.approval.observedRuntimeCodehash, preflightHashMatched: recordedRuntimeCodehash === c.approval.observedRuntimeCodehash });
            observed = await readLaunchFactoryApproval(a, r, launchFactory);
        }
        else if (revocation) {
            const launchFactory = account(e[0]);
            equal(launchFactory, c.approval.launchFactory, 'revoked launch factory');
            facts = Object.freeze({ operation: 'revoke-launch', launchFactory });
            observed = await readLaunchFactoryApproval(a, r, launchFactory);
        }
        else if (c.operation === 'transfer-owner') {
            const previousOwner = account(e[0]), proposedOwner = account(e[1]);
            equal(previousOwner, call.from, 'transferring owner');
            equal(proposedOwner, c.proposed, 'proposed registry owner');
            facts = Object.freeze({ operation: c.operation, previousOwner, proposedOwner });
        }
        else {
            const previousOwner = account(e[0]), newOwner = account(e[1]);
            equal(newOwner, call.from, 'accepting registry owner');
            facts = Object.freeze({ operation: 'accept-owner', previousOwner, newOwner });
        }
        noAdditional('Registry', call.to);
        state = Object.freeze({ registry: s, ...(observed ? { launchApproval: observed } : {}) });
    }
    else {
        const b = await verifyProtocolBundle(a, c.bundle.policy, m.at.number), p = await authenticatePool(a, b, c.pool.address), v = await authenticateFeeVault(a, b.policy, m.at.number);
        equal(p.key, c.pool.key, 'collected pool key');
        equal(p.lpToken, c.pool.lpToken, 'collected LP provenance');
        const label = ['PublicPool', 'ConfidentialPool', 'ObservablePool'][b.policy.mode], vaultLabel = ['PublicVault', 'ConfidentialVault', 'ObservableVault'][b.policy.mode];
        const e = event(label, p.address, 'ProtocolFeesCollected', 3, 3, 32), token = address(e[0]), vault = address(e[1]);
        equal(token, c.token, 'collected token');
        equal(vault, b.policy.vault.address, 'collection vault');
        if (b.policy.mode === 0) {
            const amount = uint(e[2], 256, true), d = event(vaultLabel, vault, 'ProtocolFeesDeposited', 3, 3, 32);
            equal(address(d[0]), p.address, 'deposit pool');
            equal(address(d[1]), token, 'deposit token');
            equal(uint(d[2]), amount, 'deposited public fees');
            facts = Object.freeze({ operation: 'collect', mode: 0, pool: p.address, vault, token, amount });
        }
        else {
            const count = uint(e[2], 32, true), d = event(vaultLabel, vault, 'ConfidentialFeesDeposited', 4, 4, 32), epoch = uint(d[2], 64);
            equal(address(d[0]), token, 'deposit token');
            equal(address(d[1]), p.address, 'deposit pool');
            equal(uint(d[3], 32, true), count, 'deposited swap count');
            const seconds = uint(await one(a, m.at, vault, feeVaultAbi(v), 'CONFIDENTIAL_EPOCH_SECONDS'), 64, true);
            equal(epoch, m.at.timestamp / seconds, 'deposit epoch');
            facts = Object.freeze({ operation: 'collect', mode: b.policy.mode, pool: p.address, vault, token, epoch, aggregatedSwapCount: count, amount: 'unavailable' });
        }
        noAdditional(label, p.address);
        noAdditional(vaultLabel, vault);
        state = Object.freeze({ feeControls: await readFeeControls(a, v) });
    }
    await stable(a, call.chainId, m.at);
    return Object.freeze({ transactionHash: m.txHash, facts, endOfReceiptBlock: state });
}
