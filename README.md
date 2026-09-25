# CipherDEX Protocol SDK

Standalone SDK for CipherDEX Protocol / CipherDEX Protocol Core. On-chain protocol version remains **1**, with modes **0/1/2**. The package name and entry points are unchanged:

- Current contracts: `@cipherdex/protocol-sdk/protocol`.
- Historical APIs: `@cipherdex/protocol-sdk`.

The runtime has **no dependencies**. Committed `dist/` contains JavaScript and TypeScript declarations; installation does not compile Solidity or load operator configuration. Applications supply their own reviewed provider, ABI/hash and official COTI cryptography adapters. Builders prepare calls; they do not send transactions.

## Install from GitHub

Pin a reviewed full commit SHA rather than a moving branch:

```sh
npm install --ignore-scripts --save-exact 'git+https://github.com/Innovutech/cipherdex-protocol-sdk.git#<full-commit-sha>'
```

Commit your application's lockfile. The package remains `private: true`, which blocks npm registry publication but allows Git and local-tarball installation. Nothing is published to npm. The existing `0.1.0` package version alone does not identify a snapshot.

```ts
import {
  parseDeploymentManifest,
  protocolPolicyFromObserved,
  verifyProtocolBundle,
  PROTOCOL_ABIS,
} from '@cipherdex/protocol-sdk/protocol';
```

Obtain the exact reviewed deployment manifest and independent trust anchors separately. This SDK does not ship deployment records or treat an arbitrary manifest's own hashes as trusted. Parsing a manifest alone does not authenticate a deployment. Use the helpers documented below with your injected adapters.

## Development

Pinned development tools: Node **24.16.0**, npm **11.13.0**, TypeScript **5.9.3**. TypeScript is a development dependency only.

```sh
npm ci --ignore-scripts
npm run typecheck
npm run test:dist
# When intentionally changing SDK source:
npm run build
# Optional local package; does not publish:
npm pack --ignore-scripts
```

The SDK source and all 60 distribution files originate from protocol repository snapshot `6adef7d1921a2556f099738198acc56e6e3d3c1c` without API changes. This repository starts with its own history. Protocol contracts, compiled Solidity artifacts, deployment/evidence records, funded runners, credentials and recovery journals are not included. ABI fragments/selectors/topics already exported by the SDK are included.

## License notices

Existing file-level notices are preserved, including `SPDX-License-Identifier: UNLICENSED` where present. Making this SDK repository readable does not replace those notices with an open-source license or change the protocol contracts' publication status.

## Current CipherDEX Protocol entry: `@cipherdex/protocol-sdk/protocol`

This dependency-free entry point supports protocol version 1, modes **0/1/2**
and fixed fees **1/5/30/100 bps**. Mode 2 is the observable confidential mode.
The historical package root below retains its existing selectors and semantics.
The subpath separates current and historical contract interfaces; it does not
introduce a protocol version. Deployments are identified by reviewed manifest,
source commit, factory/address, mode and codehash. There is no deployment guessing,
selector fallback, automatic transaction submission or publication.

`PROTOCOL_ABIS`, `PROTOCOL_SELECTORS`, `PROTOCOL_EVENT_TOPICS` and
`PROTOCOL_INTERFACE_IDS` are generated from compiled replacement artifacts and
Solidity's own-interface selectors. The projection includes exact tuple names,
indexed events, errors, mutability and returns, including the contract-only GT
swap ABI. It does not ship Solidity, compiler inputs or a cryptographic runtime.

### Authentication and discovery

Supply a `ProtocolPolicy` with the expected chain ID and independently reviewed
addresses/live runtime Keccak hashes for the factory, router, deployer, vault,
LP issuer, launch registry and initializer. Confidential policies also anchor the
reviewed child creation hash. Public native swaps additionally require the accepted
native swap adapter and existing WCOTI address/hash. Native liquidity uses its
separate adapter; native standing orders require only the book/WCOTI anchors
described below. Never populate a production policy
by trusting hashes read from arbitrary addresses. Build-record artifact-template
SHA-256 hashes are not live deployment Keccak256 anchors. The current observed Mainnet manifest and independently reviewed digests are
linked above; no deployment is hardcoded into the runtime.

`verifyProtocolBundle(adapter, policy, blockNumber?)` checks finalization,
interfaces/version/mode, all relevant forward/reverse hashes and bindings and
actual caps. Only confidential routers require a reverse factory binding. The
shared launch registry reports mode 0; the shared private LP issuer has no global
mode getter. The wrapper has no invented ERC-165 or CipherDEX version requirement.

The supplied `ProtocolReadAdapter` uses a reviewed RPC implementation, runtime
Keccak and canonical ABI encoding/Keccak. It must return plain positional arrays
of decoded outputs (including an outer array for a single tuple), bigint integers,
plain block/transaction/receipt records and raw logs. It must bind every code and
contract read to the supplied block. EIP-1898 block hashes are preferred; a
number-based adapter must preserve the requested block and detect reorganization.
The SDK checks chain/block identity again at the end. This is a consistent view
from a trusted provider, not independent consensus proof. The test ethers adapter
in `test/helpers/SDKProtocol.ts` demonstrates normalization, not production
provider selection or a manifest.

`authenticatePool` checks full factory `isPool`, the nonzero issued record,
live pool/LP hashes, exact identity/scales/fees, seven/eight-word key encoding,
key lookup, default/protected prediction and exact LP pool/issuer/mode/version/hash
provenance. Additional-instance IDs belong to factory records; namespace/nonce
identify an instance and grant no authority. Unknown zero records are rejected.
Returned lifecycle distinguishes empty standard pools, empty bonding reservations,
initialized pools and completed protected pools after full exit. Revoked launch
approval does not exclude a completed protected pool. Discovery grants no
initialization/graduation permission.

Public discovery uses `authenticateCandidates` on an explicit off-chain-selected
list. Confidential `discoverConfidentialPools` queries four defaults first,
then at most four requested pair-member protected identities and eight explicit
namespace/nonce instances. These are bounded discovery requests, not a limit on
pool existence. It returns every found requested identity with its origin,
including empty reservations. If more than eight results are found,
`requiresSelection` requires the caller to choose a visible subset; no pool is
silently removed and no quote is sent automatically. Explicit candidate
authentication can select any eight canonical pools without including defaults.
An instance known only by address can be authenticated with `authenticatePool`
on the same bundle and included explicitly alongside discovered defaults; no
namespace/nonce preimage is required for candidate authentication.
No reserves, depth, cached ranking, project preference or factory-wide scan is
returned. Default-first is a suggestion, never contract eligibility or ranking.

Authentication objects are frozen and process-local; cloning or deserializing
them does not recreate trust. Reauthenticate at a current provider block when
preparing a new action. A stale snapshot does not reserve state; contracts validate
again at execution.

### Public quotes and swaps

- `buildPublicQuote(bundle, input, codec)` creates the actual address-array
  `quoteBestExactInput` read call. `readPublicQuote` performs the pinned read;
  `parsePublicQuote` checks the positional `(selectedPool, amountOut)` result
  and authenticated winner membership.
- `buildPublicSwap` selects the existing token/token or native adapter method,
  with explicit minimum, recipient and uint64 deadline. Public amounts are uint256.
  Address-array quote/swap limits are 16; duplicates and wrong pair/mode are rejected.
- The client native sentinel maps to configured WCOTI for quotation and paired
  contract calls. Native input sends exactly `amountIn` as value with no token
  approval. Token/token approves the best router; token/native approves the native
  adapter. WCOTI can also be an ordinary token/token input. No selected-pool approval.
- Approval plans reuse the existing exact-by-default helper: sufficient allowance
  needs no transaction; insufficient zero allowance needs one approval; insufficient
  nonzero allowance needs a zero reset then approval. Swaps remain a separate
  transaction. No automatic unlimited approval or wallet batching.

### Standard creation, liquidity and LP positions (Phase 4B)

The same replacement entry builds explicit standard creation, public/native liquidity,
private pool liquidity and caller-owned LP claim/lock/read plans. It sends nothing
and creates no automatic batch or follow-up read.

Optional reviewed public anchors are `liquidityRouter` (token liquidity) and
`nativeLiquidityRouter` (native liquidity), plus `wrappedNative` for the latter.
`nativeRouter` remains the **swap** adapter. Hash/interface/version/mode and exact
factory/router/wrapper links are checked. Existing token swaps require neither new
liquidity anchor. The integration supplies existing WCOTI; no wrapper is deployed.

- `predictStandardPool` checks factory keys/lookups/predictions and canonical seven/
  eight-word encoding through the reviewed hash adapter. Its frozen prediction is
  **not a VerifiedPool**. Namespace is naming only; a zero bytes32 nonce is valid.
- `buildStandardCreation` uses default `createPool` (duplicate rejection) or
  additional `createPoolInstance` (idempotent). Receipt parsing authenticates the
  issued pool/LP/key at the mined block; an instance retry may emit no new event.
- `buildInitializePool`, `buildCreateAndInitializeStandard`,
  `buildCreateAndInitializeStandardInstance`, `buildAddLiquidity`,
  `buildRemoveLiquidity` and `buildRemoveLiquidityWithPermit` match the token
  adapter. The six native equivalents use the native adapter; its permit builder
  is `buildRemoveLiquidityNativeWithPermit`.
- Deposit/removal `params` match actual structs. Native deposits take SDK `value`,
  sent once as `msg.value`. Initialization inputs are exact; addition inputs are
  maxima. Token amounts/minima are always canonical token0/token1, even with
  reversed creation arguments. Native fields/results use token/native units, but
  price bounds still mean normalized **token1/token0 priceX18**.
- Public plans return ordered `steps`, `approvals`, `call`, one operation
  `transactions`, and separate `approvalTransactions`. Sufficient allowances are
  reused; insufficient nonzero allowances reset before exact approval. Deposit
  tokens approve the adapter actually called. Native value needs no approval.
  Refunds go to caller; LP mints directly to the selected recipient.
- Removal uses caller -> actual adapter LP allowance and direct owner burn.
  Finite/infinite remainders, fee/carry ownership and locks retain contract
  semantics. There is no LP custody, fee forwarding or automatic fee unwrapping.
- `prepareLPPermit` reads the authenticated LP's EIP-712 domain/nonce/separator.
  A reviewed wallet signs that frozen intent; `bindLPPermit` binds the signature.
  Owner is caller, spender is the adapter, value is shareAmount. Permit and operation
  deadlines are distinct. Permit grants allowance, not recipient/operation authority.
  Prior/expired/invalid permits can continue only through the contract's sufficient
  existing allowance fallback. The SDK does not verify ECDSA or fabricate contract-
  wallet permits; contract holders use ordinary approval.
- Initialization never becomes addition, and addition never initializes. Bonding
  reservations reject ordinary initialization; completed protected pools remain
  usable after revocation and full exit. Failed operations cannot revoke earlier
  approvals mined in separate transactions.

Confidential EOAs create/confirm the deployed pool first, then prepare its packed
initialization IT. There is no counterfactual/forwarded IT or atomic EOA claim.

| Preparation / call | Operation ITs | Operation transactions |
| --- | ---: | ---: |
| `prepareConfidentialInitialization` | 1 packed amount0 / amount1 | 1 |
| `prepareConfidentialAddition` | 4: packed maxima, minimumShares, minPriceX18, maxPriceX18 | 1 |
| `prepareConfidentialRemoval` | 2: shares, packed min0 / min1 | 1 |
| `prepareConfidentialLock` | 1 shares | 1 |
| `buildUnlockShares`, `buildClaimLPFees` | 0 | 1 |
| `prepareAddLiquidityQuote`, `prepareRemoveLiquidityQuote` | 1 each | 1 paid read each |
| `buildRequestMyPosition`, `buildRequestMyAccounting` | 0 | 1 paid read each |

`packLiquidityPair` uses high128 token0 / low128 token1 with bigint bounds; price
inputs remain uint256. Mode 2 initialization/reseeding alone needs an explicit
nonzero public `initialPriceReferenceX18`: not an extra IT, minimum or bucket
substitute. Ordinary addition/removal carry no opening reference.

Preparations contain ordered frozen `inputs` bound to caller/pool/selector/field/
public arguments. Use the existing official encryption adapter or
`bindConfidentialInput` per field, then `buildConfidentialLiquidity`. Bound objects
from another preparation/field reject. This bookkeeping cannot independently verify
MPC signatures or prove a ciphertext encrypts the advertised plaintext. Never log
or persist keys or sensitive signing inputs.

Deposit `approvalInputs` are separate token-approve intents with **pool** spender.
Bind each and use `buildConfidentialLiquidityApproval` for its separate approval/
reset transaction. Two-token deposits may need 0–4 extra approval ITs/transactions.
Direct private removal/lock/claim needs no LP approval. GT ABIs are for self-funded
contracts only; no EOA GT builder, GT persistence or arbitrary payer exists.

`readPublicLPPosition` uses actual shares/supply, `previewClaim` and locked principal;
`readLPLock` exposes existing public metadata. Snapshots do not guarantee future
claims. `buildPublicLockShares`, `buildUnlockShares` and `buildClaimLPFees` call the
pool for the actual caller. Private position/accounting reads are paid transactions,
not arbitrary-owner AES/GT queries. LP `requestMyAccounting()` has neither request ID
nor deadline in its ABI. Positive-owner checks remain authoritative in the pool.

`parseLiquidityReceipt` reuses strict chain/success/hash/from/to/calldata/value and
block/provenance checks, then checks the exact emitter/caller/recipient/request ID
where present. Public events yield used amounts/shares or outputs, including valid
single-zero-sided removal. Native recipients may forward/rewrap their payment.

**Private initialization/addition/removal amounts exist only in Solidity return
data, not success events.** Their receipt result gives verified success/identity
with `amountsAvailable: false`. No fabricated amount/ciphertext, static-call
substitution or automatic extra transaction is used. An explicit existing owner
read can refresh position for the separate transaction cost above.
`decryptLiquidityResult` accepts only verified event-backed read/claim ciphertexts
and an official decryption adapter. Token approvals are not liquidity result events.

Receipt support requires direct top-level execution. Contract-owner call planning
and ordinary approval work, but an outer smart-wallet sender does not establish
nested pool-call provenance. Nested receipt support is separately scoped. Local
MPC tests establish encoding/logic only, not fresh funded COTI execution.

Protected launch and public-order workflows are documented below. The current Mainnet manifest is complete. Integrated SDK transaction validation
and separate security/inventory/legal/publication decisions remain. No cached shortlist or multi-transaction
search is added.

### Protected reservation and graduation (Phase 4C)

`predictProtectedPool` and the two protected preflights authenticate exact identity,
empty reservation, shared-registry approval/live factory hash and strict launch-token
responses. The stored factory graduates directly without reading its optional
`authorizedInitializer`; another caller must equal that current nonzero getter.

`buildProtectedReservation` returns an **INNER contract call**, with required effective
launch-factory caller and no EOA `from`. Its controller/outer method is integration-specific.
`buildPublicProtectedGraduation` distinguishes direct authorized EOA transactions from
contract inner calls, with separate exact/sufficient/reset approvals to the initializer.
Public amountA/B follow supplied token order; price bounds stay canonical token1/token0.

`prepareConfidentialProtectedGraduation` / `buildConfidentialProtectedGraduation` use
one initializer-bound packed canonical amount0|amount1 IT in one EOA transaction.
`buildProtectedTokenApproval` handles separate token-bound reset/approval ITs with
INITIALIZER spender. Mode 2 alone requires the public nonzero opening reference.
`prepareProtectedGTGraduation` exports exact ABI/params and own-fund contract guidance;
it never creates/persists GT or pretends a contract's inner call is EOA-sendable.

`parseProtectedGraduationReceipt` requires exact top-level transaction provenance.
`confirmProtectedEvent` instead returns explicitly limited canonical-event/state proof:
it does **not** verify an outer controller signature, partner calldata or all internal
steps. Actual reservation events are Mode-0 `ProtectedPoolReserved` and Mode-1/2
`ProtectedPoolCreated`; graduation uses `ProtectedPoolGraduated`. Historical facts,
receipt-block state and current lifecycle/lock metadata are separate.

Private graduation receipts expose no minted-share ciphertext or amounts; results say
`amountsAvailable: false`. A separately requested owner read is an extra paid transaction.
Adapters must strictly validate raw launch bool/address responses before positional
normalization, including exact 32-byte length, bool 0/1 and address high bits.
Preflight is a snapshot, not lasting authorization. Completed pools remain usable
after revocation; failed graduation preserves the earlier empty reservation.

See the separately maintained protocol Phase 4C results for
exact call/input counts, result guarantees and validation status.

### Confidential quote and IT swap workflow

`prepareConfidentialQuote` takes caller, pair, positive uint128 amount, authenticated
candidates, nonzero bytes32 request ID and uint64 deadline. It returns one ephemeral
encryption/signing intent bound to the exact chain/caller/router/selector.

`prepareConfidentialSwap` takes an explicit recipient and uint128 minimum instead
of request ID and packs **high128 amountIn | low128 minimumOut** into one intent.
`packConfidentialSwap` checks both bounds; there is no truncation or floating math.

Use `encryptConfidentialInput(intent, officialAdapter)` with the official COTI
client, or `bindConfidentialInput(intent, contextualClientResult)` for an input
already produced by that client. Context checks reject mismatched chain/caller/
target/selector, but do not independently verify MPC signatures. The official
client and contract perform cryptographic validation. Keep intents/plaintext,
keys and input data out of logs and persistence. The SDK never loads AES keys.

`buildConfidentialCall(boundInput, codec, currentAllowance?)` produces exactly
one transaction to the existing endpoint:

| Operation | Candidate limit | Input ITs | Operation transactions |
| --- | ---: | ---: | ---: |
| Regular or deeper quote, same endpoint | 8 | 1 amount IT | 1 paid quote |
| IT swap | 2 | 1 packed IT | 1 swap |

No sessions, continuations, cache, extra endpoint or multi-transaction search.
A large quote's authenticated winner can be passed explicitly to a separate
one-pool swap with a **fresh** packed IT and caller-approved minimum. Execution
re-quotes; prior output/bucket is not a guaranteed execution price or a minimum.

Private token approval/reset amounts are returned separately by the unchanged
approval helper. Each needed step requires its own official-client token-bound
approval IT and transaction: zero, one or two steps depending on existing
allowance. Use the exported `PrivateApproval` ABI/selector, token target, caller
and router spender, not a pool-bound or forwarded router IT. The quote plan has
no approval or spending authority. GT is transaction-scoped contract data;
there is no GT encryption/persistence or EOA execution builder.

Optional caller `gasLimit` is preserved; **no legacy 30M default** is applied.
The prior capacity report measured eight-candidate quote transactions up to
78,157,083 gas (mode 1) and 76,662,615 (mode 2), under its 81M acceptance ceiling
and at-most-90M test envelope. Those are fixture measurements, not estimates for
every state or a network maximum. This SDK phase performs no funded execution.

### Results and trust boundary

`parseProtocolReceipt(call, transactionHash, receiptAdapter, codec)` checks the
chain, successful mined transaction/receipt hashes and block, exact top-level
from/to/calldata/value, current anchored bundle/candidate provenance, raw emitter,
indexed identities, caller/request ID/recipient, unique result and winner
membership. Native adapter events encode native assets as address zero. Actual
public output comes from the routed event; a receipt is not transaction return
data. Malformed positional objects/accessors, failed/mismatched/ambiguous evidence
are rejected before any decryption.

Confidential results retain only opaque caller ciphertext.
`decryptProtocolResult` accepts only an authenticated result and an official
decryption adapter. There is no per-candidate plaintext output. The caller learns
the selected route and their encrypted/decrypted best output; this is best among
supplied candidates, not global optimality, fair-price assurance or zero inference.

The strict receipt path authenticates a direct top-level call. Nested smart-wallet/
contract execution needs a separately reviewed transaction provenance adapter;
it is not accepted by pretending an outer sender equals the router's caller.
Plans accept contract addresses, but this phase supplies no wallet, relayer or
contract-call execution framework. No automatic polling or sending occurs.

Administration is documented in Phase 4E below. Deployment preparation and
Mainnet bootstrap are complete; use the current manifest linked above. Confidential orders remain deferred. Existing
Mainnet WCOTI reuse and final security/inventory/legal/release gates remain.
The package retains `private: true` to prevent npm registry publication; existing file-level license notices remain unchanged.


### Public standing orders (Phase 4D API)

The replacement module is publicOrders.ts; the historical publicLimitOrder.ts
and package root retain their old contract semantics. Current deployment/audit status is recorded above; the Phase 4D report retains
its historical verification limitations. Builders do not authorize publication.

Add independently reviewed orderBook and wrappedNative address/runtime-hash
anchors to a Mode-0 policy. Native orders need WCOTI, not a native swap adapter.
authenticatePublicOrderTrading verifies the current factory/router and 16-pool
cap in addition to the book's immutable identities. authenticatePublicOrderBook
checks the reviewed book and its stored factory/router/wrapper addresses/hashes
without requiring live routing; use this narrower branded context for reads,
cancellation and credit claims. It does not promise that a broken wrapper can
unwrap a cancelled native-input order or that a recipient will accept a claim.

| SDK operation | Current book endpoint |
| --- | --- |
| buildCreatePublicOrder / buildCreatePublicOrderWithPermit | createOrder / createOrderWithPermit |
| buildAmendPublicOrder | amendOrder |
| buildIncreasePublicOrderBounty | increaseExecutionBounty |
| canFillPublicOrder | canFillOrder (view) |
| buildFillPublicOrder | fillOrder |
| buildCancelPublicOrder | cancelOrder |
| buildClaimPublicOrderNativeBounty / buildClaimPublicOrderNativeProceeds | claimNativeBounty / claimNativeProceeds |
| readPublicOrder | orderStatus AND getOrder |
| readPublicOrderMinimumOutput | minimumOutputFor |
| readPublicOrderAccounting | nextOrderId, token escrow, aggregate native liabilities and caller credits |
| parsePublicOrderReceipt | authenticated lifecycle/payment/credit events |

Builders return frozen explicit calls; creation also returns ordered exact
approval/reset steps. Nothing sends, batches, polls, fills automatically or
chooses candidates. Amounts, policy masks, enum values, revisions and deadlines
are bigint; the operation call contains the actual ABI tuple/array ordering.

Token mode (0) rejects WCOTI on either side. NativeInput (1) uses WCOTI input and
value = amountIn + executionBounty, with zero approval transactions. NativeOutput
(2) uses WCOTI output and value = executionBounty. Token/NativeOutput input approval
is caller -> BOOK, never the router/pool/native adapter. Sufficient allowance
needs no approval; insufficient nonzero allowance plans reset then exact approve.
Each operation is one transaction; approvals are separate (normally zero, one or
two transactions). These public orders need zero ITs. Bounties are native units,
not an output minimum. The native sentinel is mapped only for the explicitly
selected native side. Order pairs stored on chain always use WCOTI.

Input permits fix caller/book/amountIn and use a distinct permit deadline.
preparePublicOrderPermit requires the token's explicit name/version and a reviewed
domain-hash adapter, compares that domain with the actual DOMAIN_SEPARATOR and
reads nonces at the authenticated block. Unsupported domains fail rather than
assuming an LP name, version or EIP-5267. bindPublicOrderPermit checks context and
shape, not ECDSA. A signature is tied to its SDK creation plan; the contract still
enforces its existing failed-permit/sufficient-allowance fallback. A permit does
not sign the order recipient, price or other order terms. Contracts use ordinary
approval and their own integration-specific execution. A from field does not
allow an EOA to impersonate a contract. NativeInput has no permit workflow.

Fee-policy bits 1/2/4/8 mean 5/30/100/1 bps. Mask 7 excludes 1 bps; mask 8 selects
only 1 bps; mask 15 allows all. Orders are pair-level: creation needs no pool or
quote. Preview/fill take an explicit authenticated list of 1-16 current pools.
Use authenticatePool or authenticateCandidates with the trading context's bundle.
Default, additional and completed protected pools are eligible under the same
tier policy; namespace and launch revocation confer no routing preference.
Empty pools follow the router's skip behavior. No enumeration or shortlist is
created. The quote is best only among supplied usable candidates.

canFillPublicOrder returns the actual preview, including a selected pool with
canFill=false when output is below the order minimum. Malformed live-order
candidates, invalid provenance or adapter failures remain errors. It uses
minimumOutputFor as the authoritative ceiling-price calculation. Partial fills
keep their price ratio until amendment; the final small remainder can be filled.
No SDK AMM/fee/bounty arithmetic substitutes for contract execution.

Read orderStatus separately: filled/cancelled orders delete their getOrder payload.
Expiry does not revoke maker cancellation rights. Amend/topup/cancel remain
maker-only; fillers do not gain recipient or amendment authority. Fills carry no
invented expectedRevision argument. Terms may change between a preview and mining;
the contract checks its then-current terms and price. A failed fill remains a
failed transaction, not an SDK retry or fallback.

parsePublicOrderReceipt requires a successful, canonical, exact top-level
transaction (chain/hash/from/to/calldata/value), the authenticated book emitter
and unambiguous correctly shaped events. It returns actual event facts separately
from endOfReceiptBlock state; later transactions in the same block may have
changed that state. Native outcomes explicitly distinguish paid, credited and
zero. A credit belongs to the event's recipient/filler/maker and requires a
separate caller-authorized claim. Paid means the authenticated contract's payment
succeeded, not that the recipient retained the native value; forwarding and
rewrapping are valid. Nested controller/smart-wallet transactions do not satisfy
this top-level parser merely because their inner event looks right. Provider,
codec and raw ABI/log completeness remain trusted-adapter responsibilities.

Phase 4D added no surplus-sweep or administration builders; those follow in Phase 4E
below. Confidential orders, executors, keepers, deployment and Mainnet remain out of scope. Existing WCOTI is
reused; no wrapper is deployed by the SDK.

### Administration and protocol fees (Phase 4E API)

These are existing protocol-v1 operations. No call is sent automatically. The
current Mainnet vault/order delays are 172800 seconds; applications read immutable
delays and mutable roles from their authenticated targets. This SDK supplies no
wallet/controller executor or deployment authorization.

Authenticate with independently reviewed policy anchors, then read the current
role snapshot and observe the effective caller at that same provider block:

```ts
const vault = await authenticateFeeVault(rpc, reviewedPolicy);
const controls = await readFeeControls(rpc, vault);
const caller = await prepareAdministrationCaller(rpc, vault, callerAddress);
const plan = buildProposeBeneficiary(caller, controls, proposedAddress, codec);
```

A direct plan has one operation transaction, zero ITs and zero user approvals.
A contract-role plan is an INNER call with requiredEffectiveCaller and no from
field; its outer controller call is integration-specific. A plan does not prove
control of the caller's signing key. Refresh stale snapshots before later work.

| Surface | Existing methods / semantics |
| --- | --- |
| Fee controls | buildProposeBeneficiary, buildCancelBeneficiaryProposal, buildAcceptBeneficiary, buildProposeFeeAdministrator, buildAcceptFeeAdministrator |
| Permissionless collection | buildCollectProtocolFees(rpc, bundle, pool, caller, side, codec); side 0n/1n means canonical token0/token1 |
| Permissionless vault payout | buildSweepProtocolFees(rpc, callerContext, token, codec); no amount or recipient override |
| Public accounting | readPublicProtocolFeeAccounting; actual accounted/raw/surplus/deficit values |
| Confidential readiness | readConfidentialSweepReadiness; bounded public metadata, unknown private amount and unproven backing/execution |
| Registry | authenticateLaunchRegistry, readLaunchRegistryState, readLaunchFactoryApproval; buildApproveLaunchFactory, buildRevokeLaunchFactory, buildTransferRegistryOwnership, buildAcceptRegistryOwnership |
| Order surplus | buildSweepPublicOrderTokenSurplus and buildSweepPublicOrderNativeSurplus, using the existing target-only book context |
| Results | parseAdministrationReceipt for direct fee/registry/collection calls; parsePublicOrderReceipt for order surplus |

Target-only vault and registry checks authenticate live target code/interface/
version/mode and stored reviewed commitments, without requiring a healthy router.
An unbound vault is labelled factoryBound=false. Collection uses complete existing
bundle/pool/LP provenance. The one shared registry reports mode 0 in every bundle.

Administrator, beneficiary, configurator and registry owner are separate roles;
one wallet may deliberately hold several. Only the current fee administrator
proposes/cancels. Pending roles gain no early authority. Beneficiary acceptance
requires the delay; replacement restarts it. Administrator succession preserves
a pending beneficiary proposal. Proposals/transfers themselves move no fees.
Exact activation is an event/receipt fact, not a preflight-time prediction.

Confidential readiness inspects at most MAX_CONFIDENTIAL_SWEEP_EPOCHS (32) entries
starting at nextEpochIndex. It follows the mature prefix, epoch + 2 <= current
epoch with 86,400-second epochs, and checked uint64 count summation. It reports
temporal eligibility and the eight-swap count threshold separately. Neither is
a payout guarantee. Collection and sweep are separate explicit transactions,
each with zero ITs/approvals; private settlement still executes paid MPC. There
is no amount/recipient override, private balance oracle, GT deposit builder or
automatic collection/sweep loop.

Registry approval records codehash at execution. readLaunchFactoryApproval shows
the observed preflight code/hash for review; that hash is not an ABI guard on the
approval call. Receipt results report the actual recorded hash and whether it
matched the earlier observation. No launch ERC-165 or token-authority inference
is added. Revocation blocks future reservations/unfinished graduation, not
ordinary completed-pool use. No renounce builder is exposed.

Order surplus remains payable only to the book's active surplusBeneficiary after
contract-enforced liability exclusions. Its delayed beneficiary acceptance and
two-step surplus administration are independent of the fee vaults. Use
readSurplusControls with the existing target-only authenticated book, then
buildProposeSurplusBeneficiary, buildCancelSurplusBeneficiaryProposal,
buildAcceptSurplusBeneficiary, buildProposeSurplusAdministrator or
buildAcceptSurplusAdministrator. These operations require no IT or token approval;
each direct operation is one transaction. Contract roles produce an inner call
requiring that contract's own execution path. parseAdministrationReceipt verifies
direct control events and returns current state separately. Sweep results retain
the event's historical beneficiary and expose endOfReceiptBlockSurplusBeneficiary
separately, since another transaction in that block may rotate the recipient.

Revised order deployments append explicit administrator and positive uint64 delay
arguments. Manifest configuration uses orderSurplusControl with kind rotatable-v1;
missing values remain draft-only. Historical four-argument records retain their
exact representation and cannot stand in for the revised constructor. Initial
roles are deployment facts; current order proposals and roles are mutable readback.
Surplus builders select neither amount nor destination and require no route.
They introduce no caller approvals or ITs.

Receipt parsing remains strict direct top-level verification: chain, success,
mined block/hash, caller/target/calldata/value, authenticated emitter, exact event
shape and unambiguous context. Contract inner plans cannot use that parser to
claim nested controller verification. Public payouts come from events; private
fee results contain identities/counts with amount unavailable. Operation facts
are separate from endOfReceiptBlock state, which can include later transactions.

See the separately maintained protocol administration results
for that phase’s verification outcomes. Mainnet bootstrap is now complete;
integrated transaction validation and security/inventory/legal/publication
boundaries remain separate. Eight-pool single-transaction quotes and
separate packed swaps remain; no cached shortlist or search continuations.

## Offline replacement deployment metadata (Phase 5A)

The `@cipherdex/protocol-sdk/protocol` entry also exports
`createDeploymentDraft`, `requireCompleteDeploymentDraft`,
`validateDeploymentManifest`, `serializeDeploymentManifest`,
`parseDeploymentManifest`, `deploymentManifestDigest` and
`protocolPolicyFromObserved`. This is schema version 1 and protocol version 1,
not a legacy migration layer or a transaction executor.

Drafts require explicit roles, per-vault delays, chain and reviewed existing WCOTI.
They distinguish 22 bootstrap deployments/14 calls from five pool/LP templates.
Unresolved inputs are null; predicted/referenced addresses are not confirmed code.
Unsigned bigint values serialize losslessly and deterministically. Digests identify
bytes; they grant no authorization and are not their own independent trust anchor.

Observed LOCAL records stay local. Incomplete/failed/uncertain records cannot yield
an SDK policy. A complete record needs independently reviewed plan/record digests,
expected chain/environment and subsequent `verifyProtocolBundle` live checks.
Initial roles are historical facts; mutable role readback is separate. No pool
initialization, token mint, launch approval or wrapper replacement is part of
bootstrap. Mainnet bootstrap used authenticated funded execution, documented
separately. Reuse its observed WCOTI commitment, not synthetic local fixtures.

The development-only `scripts/cipherdex-generation-plan.ts` and
`scripts/cipherdex-generation-preflight.ts` expose artifact/encoding/readback
functions for reviewed adapters. They have no execution CLI, signer, broadcaster,
RPC-provider construction or secret loader. Contract-role outputs require an
integration-specific inner call; no generic wallet/controller ABI is assumed.
Deployment planning reports and observed manifests are maintained separately from this SDK.
The Phase 5A report is historical. Current deployment/audit status is linked above.

## Historical package root: `@cipherdex/protocol-sdk`

Everything below describes the unchanged historical root and its historical
deployments only. Its strategy/bitmap selectors, unsupported legacy mode-2 label,
quote transport/caps, create-or-add semantics and planning helpers do **not**
describe the replacement `/protocol` entry point. Do not mix their ABIs.

The SDK surface is intentionally dependency-free. Discovery objects use the
versioned `DISCLOSURE_SCHEMA_VERSION` contract and must be rejected when the
version is unknown. It exports stable ABI
fragments and public pool-discovery types for dashboards, launchpads and third
parties. `privacyMode` is explicit: `0` is transparent public settlement and
`1` is amount-confidential settlement with private LP accounting. `2` is a
reserved, explicitly unsupported fully-confidential recipient/identity mode;
clients must reject it rather than infer support. Public pool users can use the
factory-gated quoter, exact-input router and atomic create-or-add liquidity
router ABI fragments. Confidential pool
discovery reports `encrypted-transaction-event-v1`: current COTI testnet requires
paid MPC transactions because fresh MPC execution is rejected under `eth_call`.
Paid per-pool transactions are the only proven primary exact-quote transport.
The confidential router can evaluate up to the complete nine-slot canonical
fee/strategy namespace in one paid quote transaction. Atomic best execution is
limited to three candidates because only that execution bound has funded COTI
gas evidence. Larger quote sets require live-runtime measurement before release.
Per-pool transactions remain direct protocol operations rather than being
mislabeled as a fallback.

The SDK also exports exact-by-default public and private token approval planning,
canonical confidential-operation signature/transaction steps, and optional
EIP-5792 v2 wallet-call preparation. Every sufficient existing allowance is
reused in either approval mode. When approval is required, exact/unlimited selects
the new target and an insufficient nonzero allowance produces an ordered zero
reset first. The private planner returns plaintext amounts for the application to
encrypt with the official COTI SDK; CipherDEX never handles AES keys or
ciphertexts. Capability parsing, batching and status normalization are
dependency-free and provider-agnostic: clients query their connected wallet, use
a prepared batch only when supported, and retain sequential execution as the
fallback. Partial non-atomic batches involving approvals are marked for explicit
allowance review. The SDK never signs, sends, polls or persists wallet requests.

Confidential operation transaction steps are explicitly marked and prepared
wallet calls preserve an optional `gasLimit`. When the wallet reports atomic
batching as `supported` or `ready`, the SDK retains standard EIP-5792 atomic
execution without adding per-call gas metadata; the wallet owns the combined
execution gas. For non-atomic confidential batches with explicit limits, the SDK
uses `wallet_sendCalls` only when the active chain, or global `0x0`, advertises
`org.ciphertrade.callGasLimit: { supported: true }`. Each applicable call then
carries `{ gasLimit: "0x..." }` inside that call-level capability. Otherwise the
plan remains sequential with the original bigint limits intact. Ordinary
batching without confidential gas limits is unchanged, and the SDK never emits
the nonstandard EIP-5792 `gas` field.

`classifyCipherDexExecutionError` recognizes the protocol's exact
`TransferAmountMismatch()` selector through bounded, getter-free nested error
inspection and returns a stable `token-transfer-amount-mismatch` issue with
operation context. `preflightCipherDexTransaction` wraps a provider-specific
gas estimator: known transfer-semantics failures become a structured gate,
while unrelated RPC or execution failures remain exceptions. Applications own
localized wording and token capability policy; the SDK does not hardcode token
addresses or assume a tax-token classification remains permanent.

`PUBLIC_BEST_EXECUTION_ROUTER_ABI`,
`PUBLIC_BEST_EXECUTION_NATIVE_ROUTER_ABI` and
`PUBLIC_CPMM_LIMIT_ORDER_BOOK_ABI` expose the public routed-order periphery.
`PUBLIC_ROUTE_CANDIDATE` maps the approved `5`, `30`, and `100` bps pools to a
typed three-bit policy. The create, permit-create, amend and fill builders
validate and freeze wallet-call arguments without signing or submitting them.
Create builders accept the standard native-asset sentinel plus the reviewed
WCOTI address. They map native input/output to an immutable settlement mode,
replace the sentinel with WCOTI only in contract calldata, include native input
in transaction value, and reject direct WCOTI token-mode orders. Native-input
orders require no approval or permit; native-output orders approve only the
ordinary input token. Receipt parsers return the authenticated settlement mode
so applications can render COTI rather than WCOTI.
`publicLimitOrderMinimumOutput` and `publicLimitOrderBountyForFill` mirror the
contract's ceiling price and proportional/final-remainder bounty calculations.
Strict receipt-evidence parsers reject failed, mismatched or ambiguous logs
before returning creation, amendment, fill or cancellation results. Supply
receipts from a trusted provider bound to the reviewed chain and deployment; the
parsers do not establish chain consensus independently. Read the current
remaining amount immediately before building an amendment; the contract remains
authoritative if another transaction changes state first.

`buildPublicBestExecutionQuoteCall` prepares a gasless `eth_call` preview against
the existing public best-execution router. Pass its decoded tuple through
`parsePublicBestExecutionQuoteResult` before displaying the selected pool, fee
tier and expected output. `buildPublicBestExactInputSwapExecution` then selects the
ordinary best router for token pairs or the immutable native best-execution
adapter for COTI input/output. The confirmed transaction reselects the best
allowed pool atomically; the preview does not pin it. Use
`parsePublicBestExecutionSwapResult` to authenticate the actual route. Native
results require matching events from both the adapter and underlying router.
The convenience API rejects direct WCOTI so applications render and settle
native COTI at the user boundary.

`buildConfidentialCandidateBitmap` derives the active bitmap from the standard
class plus the factory's finalized registered strategy count.
`partitionConfidentialQuoteCandidateBitmap` deterministically groups that bitmap
when a live chain cannot fit one larger paid quote. Each group requires a fresh
request ID and encrypted input. `buildConfidentialQuoteOperationPlan` accepts the
resulting batch count so signing UI can present the real number of signatures and
transactions instead of hiding them.

`PUBLIC_CPMM_LIQUIDITY_ROUTER_ABI` and
`buildPublicCreateOrAddLiquidityCall` cover atomic public pool creation/seeding
and proportional joins. Public pools expose transferable permit-enabled LP
tokens. `buildPublicLpPermitTypedData` prepares the EIP-2612 signature, while
`buildPublicLiquidityRemovalExecution` selects allowance or permit removal and
native or ERC-20 output without signing or sending anything.

For an existing public pool, use `previewPublicProportionalLiquidity` with the
current effective reserves, total LP shares, a typed `"token0" | "token1"`
specified side and its raw-unit amount. The helper mirrors the pool's
full-precision `mulDiv` behavior: shares round down and accepted token amounts
round up. The two submitted amounts are maxima, not promised deposits; the
liquidity router refunds excess. After confirmation,
`parsePublicLiquidityRoutedResult` authenticates the successful transaction,
reviewed router and provider before returning the pool, creation flag, actual
amounts, minted shares and refunds.

`isEvmNativeAssetAddress` recognizes the standard `0xEeee...` UI/RPC sentinel.
`resolvePublicPoolAsset` maps that sentinel to the reviewed WCOTI address for
pool lookup. `buildPublicSwapExecution`,
`buildPublicNativeLiquidityAddExecution`, and the removal builder select the
factory-bound native router when wrapping or unwrapping is required. The
sentinel is never a contract address, approval target, or canonical pool asset.
`parseNativeLiquidityAddedResult` authenticates both the native-router event and
its nested public-liquidity-router event before returning actual native/token
amounts, minted shares, creation state and derived refunds.

`buildConfidentialLiquidityQuoteCall` and
`buildConfidentialAddLiquidityQuoteOperationPlan` cover the paid private
liquidity preview. The preview takes one encrypted side and returns the accepted
specified amount, counterpart and expected shares encrypted for the caller; it
does not reserve state or replace the bounded `addLiquidity` settlement call.
`parseConfidentialAddLiquidityQuoteResult` authenticates the typed event boundary
and maps its specified/counterpart ciphertexts to token0/token1. Decryption stays
in the connected wallet integration; the SDK never receives an AES key.

For every existing pool, users specify one side and the application derives the
other proportionally. Editing either displayed amount invalidates a confidential
preview: generate a new request ID, new function-bound ciphertext and new paid
preview before confirmation. Only new-pool initialization treats both amounts
as the initial price ratio. In every flow, the confirmed router events are
authoritative; a local preview is presentation and slippage-planning data, not
settlement evidence.

The SDK exposes shape parsers and semantic guards for privacy-minimal lock and
launchpad migration records. Shape or semantic validity is not chain
authentication. Integrations must use `verifyLaunchpadMigrationMetadata` with a
reviewed deployment policy and an RPC-backed adapter before treating indexed
migration metadata as protocol evidence. The verifier authenticates the
successful transaction and exact emitter logs, configured factory/migrator
binding, canonical pool, immutable pool metadata and current public `lockInfo`.
Migrator provenance is read from the expected initialization strategy itself;
there is no factory-global launch adapter to conflate independent strategy
classes.
Those records contain only public pool/participant identity, disposition, lock
timing and lock identifiers; they do not contain private share amounts,
reserves, balances or encrypted payloads. Confidential pool discovery contains
identity and immutable configuration only.

See `docs/INTEGRATION_EXAMPLE.md` for discovery, current routing gates, public
execution and launchpad indexing boundaries.

Authoritative production addresses, deployment transactions, runtime codehashes,
compiler settings and exact source commit are published in the reviewed
`deployments/coti-mainnet-b99c41abc031754990d4efcaaf1baa6754b3bb1e.json`
record. Integrations must pin and validate that manifest's factories, routers,
fee vault and protocol versions rather than copying address constants into
multiple SDK modules. Historical `coti-testnet-<commit>.json` manifests remain
test evidence only and are not production registries.

Private amounts, reserves, balances and LP positions are not represented in the
discovery schema. The confidential pool instead exposes paid, owner-targeted
position results. `decryptConfidentialPositionResult` authenticates the exact
chain, verified pool, caller, calldata, request ID, successful receipt and unique
result event before decrypting active, removal-preview or locked-position values.
`readConfidentialActiveShares` adapts the existing no-MPC `myShares` ciphertext,
while `readConfidentialTokenAllowance` selects the owner ciphertext from the
official private-token allowance response. Integrations supply COTI decryption
adapters; the SDK never receives or stores an AES key. Factory-created
confidential pools expose a pool-bound `PrivateLPToken`; its ABI fragment is
available for encrypted LP transfers and approvals, while aggregate
`totalSupply()` must not be used as a private-supply oracle.

Discovery schema version 1 also binds every pool to the immutable protocol-version-1
fee policy and fee vault. Integrations can present the complete total fee and
its LP/protocol split without exposing accrued confidential amounts. The SDK's
`calculateCipherDEXV1FeeBreakdown` mirrors pool integer rounding; it does not add
any native-COTI swap fee. A confidential quote/settlement must not be submitted
when its calculated `protocolFee` is zero because that pool mode rejects
zero-accrual dust swaps to protect aggregate collection batching. Public pools
do not need that privacy-specific restriction. Use
`minimumCipherDEXV1ConfidentialInput` to determine the raw-unit floor for an
approved confidential fee tier. See `docs/FEE_ECONOMICS.md`.

`isConfidentialLockDiscoveryShape` and
`isLaunchpadMigrationMetadataShape` only parse exact untrusted JSON shapes.
`isConfidentialLockDiscovery` and `isLaunchpadMigrationMetadata` additionally
reject impossible disposition, lock-ID and unlock-time combinations, but still
do not prove that an event happened on-chain. Only
`verifyLaunchpadMigrationMetadata` returns process-local verified migration
evidence. It authenticates the successful receipt, exact expected-migrator
events, canonical factory/pool state and current lock state. It intentionally
does not require the migration call to be the top-level transaction, so an
ERC-1271 account may execute through its wallet or entry-point contract without
being rejected as false provenance.

`isConfidentialPoolDiscovery` validates only the untrusted JSON shape. Before
trusting a discovery record, callers must run
`verifyConfidentialPoolDiscovery` with the expected factory, fee vault and
protocol version, plus the expected private LP-token factory and its reviewed
runtime codehash, through an RPC-backed adapter. The verifier proves deployed
code, factory membership, canonical lookup, immutable pool metadata, the
factory's helper address/codehash constant, helper runtime codehash, LP-token
code, and exact `(pool, token, canonicalFactory)` issuance attestation before it
returns a process-local verified value. The current protocol uses
`private-erc20-cpmm-v1` and includes the initialization strategy, strategy class,
standard/launch-protected class and initialized state. Canonical lookup is for
the complete key `(ordered pair, fee tier, privacy mode, protocol version,
initialization strategy)`. Only verified, initialized records may enter quote
selection.

The confidential factory exposes `isCompatiblePrivateToken` as a structural
check over deployed code, the official COTI `IPrivateERC20` ERC-165 identifier
and supported decimals. The discovery verifier requires the adapter's
`isFactoryPrivateTokenCompatible` check for both assets. This is not a token
approval, reputation or economic-safety signal: any compatible external token
may create a pool, while malicious or broken semantics remain an external-token
trust risk. Exact runtime-codehash verification remains required for
CipherDEX-owned helpers, factories, routers and initialization strategies.

Current COTI nodes reject MPC precompile execution under `eth_call`; raw stored
ciphertext `OnBoard` is the first isolated failing primitive, and pre-stored
encrypted constants do not remove that requirement. Verify the configured
router with `verifyConfidentialBestExecutionRouter` before using it. Then use
`getConfidentialBestExecutionEncryptionBinding` with the official COTI wallet,
followed by `buildVerifiedConfidentialBestQuoteTransaction` or
`buildVerifiedConfidentialBestSwapTransaction`. Result events must be bound to
that verified emitter, expected caller and request ID before
`decryptConfidentialBestExecutionResult` is called. Verification is chain-bound,
and decryption requires the adapter to fetch the authentic submitted transaction
and successful receipt by the expected transaction hash, then verify the exact
submitted calldata, router result log and a fresh canonical-pool lookup. Application code cannot
provide a caller-authored transaction or receipt as provenance evidence.

Addresses and runtime codehashes supplied to router verification must come from
the reviewed deployment record, not an indexer response. The RPC adapter is an
explicit trusted chain-data boundary. If one RPC is not trusted, use the wallet
provider or an independent quorum; a single adversarial RPC can fabricate a
self-consistent chain view and is outside what ordinary JSON-RPC reads can prove.

A walletless backend can operate a dedicated non-custodial COTI quote identity
and submit one fresh router-bound best-quote request. That identity must not hold
user funds or sign swaps. Paid per-pool quote transactions remain the proven
primary direct operation; the SDK does not turn caller-authored decrypted
outputs into execution-grade route evidence. Integrators must disclose quote
latency/cost, use fresh router/swap-selector-bound inputs for execution, and
never substitute zero minimum output or a public reserve approximation.

The default best quote covers the three standard fee tiers. Candidate-aware paid
quotes accept at most `MAX_CONFIDENTIAL_QUOTE_CANDIDATES` (nine), while atomic
swaps accept at most `MAX_CONFIDENTIAL_ATOMIC_SWAP_CANDIDATES` (three). Do not use
`ALL_CONFIDENTIAL_CANDIDATE_BITMAP` unless the factory actually has all three
pool classes; inactive strategy bits are invalid rather than empty candidates.

Launch integrations should encrypt all five private inputs for the exact migrator
and selector, then sign `LAUNCHPAD_MIGRATION_EIP712_TYPES` once with the creator.
That authorization binds the strategy, caller, pair/decimals, fee tier, ordered
encrypted inputs, deadline and LP disposition. The migration atomically creates
and initializes the protected pool; there is no launch-authority precommit.
Discovery must distinguish a standard pool (`initializationStrategy` zero, class
0) from an initialized protected pool and must not route uninitialized pools.

## Observable confidential pools

Privacy mode `2` keeps reserves, depth, balances, LP positions, liquidity amounts,
swap amounts and exact quote results confidential while intentionally publishing a
quantized normalized token1-per-token0 price whenever a swap crosses a 50-bps bucket.
Mode `1` remains fully separate and exposes no reserve-derived public state.

Use `OBSERVABLE_CONFIDENTIAL_FACTORY_ABI` for discovery and verify the same canonical
key `(ordered pair, fee tier, privacy mode, protocol version, initialization strategy)`.
The factory reuses the deployed `PrivateLPTokenFactory`, but has its own immutable
factory-bound deployer, strategy registry, router and confidential-only fee vault.

`parseObservablePriceObservation` authenticates the emitter, event topic, indexed
sequence and ABI values. `classifyObservablePriceFreshness` requires an explicit
maximum age. Sampling and publication occur in the same successful swap. The public
`swapsSincePublicObservation` counter records swaps that remained within the current
bucket. Since a crossing cannot be predicted from public state, integrations must use
the publication-capable gas envelope for every mode-2 swap.

`estimateObservableSwapOutput` applies token decimals and the advertised input fee
to the public bucket. Its result always has `authoritative: false` and
`excludesPriceImpact: true`. It is suitable for charts and immediate indicative UI,
never for encrypted `minOut`, settlement, or exact route ranking. Obtain the existing
paid encrypted quote after the user enters an amount.

`OBSERVABLE_MIN_CONFIDENTIAL_AGGREGATED_SWAPS` and
`OBSERVABLE_CONFIDENTIAL_FEE_VAULT_ABI` expose the immutable eight-swap fee sweep
policy. A matured same-token aggregate below eight has no rescue or early-sweep
path and can remain unavailable until later same-token activity. Integrations must
not present `nextConfidentialSweepAt` as a guarantee that a sub-threshold epoch is
sweepable at that timestamp.

Observable launches additionally sign the public `initialPriceReferenceX18` using
`OBSERVABLE_LAUNCHPAD_MIGRATION_EIP712_TYPES` and the distinct
`CipherDEX Observable Launchpad Migrator` domain. Initialization verifies the
confidential actual price is within the bounded range before publishing its first
50-bps bucket. Empty `createPool` calls do not set this reference. Standard pools use
`initializeLiquidity` to commit the public reference atomically with the first private
deposit; later joins use `addLiquidity`. A full exit clears the reference and current
observation state so a later initialization supplies a fresh reference.
