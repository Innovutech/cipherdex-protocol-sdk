// SPDX-License-Identifier: UNLICENSED
import { PROTOCOL_ABIS, PROTOCOL_INTERFACE_IDS } from './protocolAbi.js';
import { address, hash, hex, uint, mode, bool, field, optional, array, tuple, equal, fail, block, one, read, stable, ZERO_ADDRESS, ZERO_HASH, FEE_TIERS } from './protocolData.js';
const bundles = new WeakSet(), poolBundles = new WeakMap();
const labels = ['Public', 'Confidential', 'Observable'];
export function abi(b, suffix) { return PROTOCOL_ABIS[labels[b.policy.mode] + suffix] ?? fail('Unknown ABI'); }
function interfaceId(label) { return hexId(PROTOCOL_INTERFACE_IDS[label]); }
function hexId(x) { if (typeof x !== 'string' || !/^0x[0-9a-f]{8}$/.test(x))
    return fail('Interface ID missing'); return x; }
export function requireBundle(b) { if (!bundles.has(b))
    fail('Unverified bundle'); }
export function requirePool(b, p) { requireBundle(b); if (poolBundles.get(p) !== b)
    fail('Pool not authenticated at this bundle/block'); }
function anchor(v) { return Object.freeze({ address: address(field(v, 'address')), runtimeCodehash: hash(field(v, 'runtimeCodehash'), true) }); }
// A namespace is only a 20-byte nonzero naming component, never an asset or authority.
export function namespaceAddress(v) { const result = hex(v, 20); if (result === ZERO_ADDRESS)
    fail('Zero instance namespace'); return result; }
export function normalizeProtocolPolicy(v) {
    const m = field(v, 'mode');
    if (m !== 0 && m !== 1 && m !== 2)
        fail('Invalid mode');
    const base = { chainId: uint(field(v, 'chainId'), 256, true), mode: m,
        factory: anchor(field(v, 'factory')), deployer: anchor(field(v, 'deployer')), vault: anchor(field(v, 'vault')),
        lpIssuer: anchor(field(v, 'lpIssuer')), registry: anchor(field(v, 'registry')), initializer: anchor(field(v, 'initializer')), router: anchor(field(v, 'router')) };
    const native = optional(v, 'nativeRouter'), wrapped = optional(v, 'wrappedNative');
    const liquidity = optional(v, 'liquidityRouter'), nativeLiquidity = optional(v, 'nativeLiquidityRouter'), orders = optional(v, 'orderBook');
    if (m !== 0 && [native, wrapped, liquidity, nativeLiquidity, orders].some(x => x !== undefined))
        fail('Public periphery anchors require public mode');
    if ((native !== undefined || nativeLiquidity !== undefined || orders !== undefined) && wrapped === undefined)
        fail('Native adapter requires wrapper anchor');
    if (wrapped !== undefined && native === undefined && nativeLiquidity === undefined && orders === undefined)
        fail('Wrapper requires a native adapter anchor');
    if (nativeLiquidity !== undefined && liquidity === undefined)
        fail('Native liquidity requires liquidity router anchor');
    const p = Object.freeze({ ...base, ...(m !== 0 ? { poolCreationCodehash: hash(field(v, 'poolCreationCodehash'), true) } : {}),
        ...(native !== undefined ? { nativeRouter: anchor(native) } : {}), ...(wrapped !== undefined ? { wrappedNative: anchor(wrapped) } : {}),
        ...(orders !== undefined ? { orderBook: anchor(orders) } : {}), ...(liquidity !== undefined ? { liquidityRouter: anchor(liquidity) } : {}), ...(nativeLiquidity !== undefined ? { nativeLiquidityRouter: anchor(nativeLiquidity) } : {}) });
    const addresses = [p.factory, p.deployer, p.vault, p.lpIssuer, p.registry, p.initializer, p.router, ...[p.nativeRouter, p.wrappedNative, p.liquidityRouter, p.nativeLiquidityRouter, p.orderBook].filter((x) => x !== undefined)].map(a => a.address);
    if (new Set(addresses).size !== addresses.length)
        fail('Conflicting deployment anchors');
    return p;
}
export async function verifyProtocolBundle(adapter, input, atBlock) {
    const p = normalizeProtocolPolicy(input);
    equal(uint(await adapter.readChainId(), 256, true), p.chainId, 'chain');
    const b = block(await adapter.readBlock(atBlock === undefined ? undefined : uint(atBlock)));
    if (atBlock !== undefined)
        equal(b.number, atBlock, 'requested block');
    const result = Object.freeze({ policy: p, block: b, quoteCap: p.mode === 0 ? 16 : 8, swapCap: p.mode === 0 ? 16 : 2 });
    const label = labels[p.mode], fabi = abi(result, 'Factory');
    const get = (a, aabi, n, args = []) => one(adapter, b, a, aabi, n, args);
    const at = (a) => checkCode(adapter, b, a.address, a.runtimeCodehash);
    async function identity(a, aabi, idLabel, m) {
        await at(a);
        equal(uint(await get(a.address, aabi, 'PROTOCOL_VERSION')), 1n, 'version');
        equal(mode(await get(a.address, aabi, 'PRIVACY_MODE')), m, 'mode');
        equal(bool(await get(a.address, aabi, 'supportsInterface', [interfaceId(idLabel)])), true, 'interface');
    }
    await identity(p.factory, fabi, label + 'Factory', p.mode);
    equal(bool(await get(p.factory.address, fabi, 'finalized')), true, 'factory finalization');
    for (const [name, a, suffix] of [['poolDeployer', p.deployer, 'Deployer'], ['feeVault', p.vault, 'Vault'], ['protectedInitializer', p.initializer, 'Initializer']]) {
        equal(address(await get(p.factory.address, fabi, name)), a.address, name);
        equal(hash(await get(p.factory.address, fabi, name + 'RuntimeCodehash')), a.runtimeCodehash, name + ' hash');
        const aabi = abi(result, suffix);
        await identity(a, aabi, label + suffix, p.mode);
        equal(address(await get(a.address, aabi, 'factory')), p.factory.address, 'reverse factory');
        equal(hash(await get(a.address, aabi, 'factoryRuntimeCodehash')), p.factory.runtimeCodehash, 'reverse factory hash');
    }
    for (const [name, a] of [['lpTokenFactory', p.lpIssuer], ['launchFactoryRegistry', p.registry]]) {
        await at(a);
        equal(address(await get(p.factory.address, fabi, name)), a.address, name);
        equal(hash(await get(p.factory.address, fabi, name + 'RuntimeCodehash')), a.runtimeCodehash, name + ' hash');
    }
    const lpAbi = p.mode === 0 ? PROTOCOL_ABIS.PublicLPIssuer : PROTOCOL_ABIS.PrivateLPIssuer;
    equal(uint(await get(p.lpIssuer.address, lpAbi, 'PROTOCOL_VERSION')), 1n, 'LP issuer version');
    if (p.mode === 0)
        equal(mode(await get(p.lpIssuer.address, lpAbi, 'PRIVACY_MODE')), 0, 'public LP issuer mode');
    await identity(p.registry, PROTOCOL_ABIS.Registry, 'Registry', 0);
    equal(address(await get(p.initializer.address, abi(result, 'Initializer'), 'launchFactoryRegistry')), p.registry.address, 'initializer registry');
    equal(hash(await get(p.initializer.address, abi(result, 'Initializer'), 'registryRuntimeCodehash')), p.registry.runtimeCodehash, 'initializer registry hash');
    if (p.mode !== 0) {
        equal(hash(await get(p.deployer.address, abi(result, 'Deployer'), 'poolCreationCodehash')), p.poolCreationCodehash, 'reviewed child code');
        equal(hash(await get(p.factory.address, fabi, 'poolCreationCodehash')), p.poolCreationCodehash, 'factory child code');
    }
    const rabi = abi(result, 'Router');
    await identity(p.router, rabi, label + 'Router', p.mode);
    equal(address(await get(p.router.address, rabi, 'factory')), p.factory.address, 'router factory');
    equal(hash(await get(p.router.address, rabi, 'factoryRuntimeCodehash')), p.factory.runtimeCodehash, 'router factory hash');
    if (p.mode === 0)
        equal(uint(await get(p.router.address, rabi, 'MAX_CANDIDATES')), 16n, 'public cap');
    else {
        equal(address(await get(p.factory.address, fabi, 'bestExecutionRouter')), p.router.address, 'bound router');
        equal(hash(await get(p.factory.address, fabi, 'bestExecutionRouterRuntimeCodehash')), p.router.runtimeCodehash, 'bound router hash');
        equal(uint(await get(p.router.address, rabi, 'MAX_QUOTE_CANDIDATES')), 8n, 'quote cap');
        equal(uint(await get(p.router.address, rabi, 'MAX_SWAP_CANDIDATES')), 2n, 'swap cap');
    }
    if (p.nativeRouter) {
        const n = p.nativeRouter, na = PROTOCOL_ABIS.NativeRouter;
        await identity(n, na, 'NativeRouter', 0);
        await at(p.wrappedNative);
        for (const [key, a] of [['factory', p.factory], ['bestExecutionRouter', p.router], ['wrappedNative', p.wrappedNative]]) {
            equal(address(await get(n.address, na, key)), a.address, 'native ' + key);
            equal(hash(await get(n.address, na, key + 'RuntimeCodehash')), a.runtimeCodehash, 'native ' + key + ' hash');
        }
    }
    if (p.liquidityRouter) {
        const l = p.liquidityRouter, la = PROTOCOL_ABIS.LiquidityRouter;
        await identity(l, la, 'LiquidityRouter', 0);
        equal(address(await get(l.address, la, 'factory')), p.factory.address, 'liquidity factory');
        equal(hash(await get(l.address, la, 'factoryRuntimeCodehash')), p.factory.runtimeCodehash, 'liquidity factory hash');
    }
    if (p.nativeLiquidityRouter) {
        const n = p.nativeLiquidityRouter, na = PROTOCOL_ABIS.NativeLiquidityRouter;
        await identity(n, na, 'NativeLiquidityRouter', 0);
        await at(p.wrappedNative);
        for (const [key, a] of [['factory', p.factory], ['liquidityRouter', p.liquidityRouter], ['wrappedNative', p.wrappedNative]]) {
            equal(address(await get(n.address, na, key)), a.address, 'native liquidity ' + key);
            equal(hash(await get(n.address, na, key + 'RuntimeCodehash')), a.runtimeCodehash, 'native liquidity ' + key + ' hash');
        }
    }
    if (p.orderBook) {
        await checkPublicOrderBook(adapter, b, p);
        await at(p.wrappedNative);
    }
    await stable(adapter, p.chainId, b);
    bundles.add(result);
    return result;
}
export async function checkCode(a, b, target, expected) {
    const code = await a.getCode(target, b);
    if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || code.length > 49154)
        fail('Invalid live runtime');
    equal(hash(a.hashRuntimeCode(code)), expected, 'live runtime');
}
export async function authenticatePool(a, b, target) {
    requireBundle(b);
    const p = address(target), f = b.policy.factory.address, fa = abi(b, 'Factory'), pa = abi(b, 'Pool');
    const get = (addr, ab, n, args = []) => one(a, b.block, addr, ab, n, args);
    equal(bool(await get(f, fa, 'isPool', [p])), true, 'canonical pool');
    const rec = tuple(await read(a, b.block, f, fa, 'poolRecord', [p]), 4);
    const key = hash(rec[0], true), runtimeCodehash = hash(rec[1], true), lpToken = address(rec[2]), lpRuntimeCodehash = hash(rec[3], true);
    await checkCode(a, b.block, p, runtimeCodehash);
    await checkCode(a, b.block, lpToken, lpRuntimeCodehash);
    equal(bool(await get(p, pa, 'supportsInterface', [interfaceId(labels[b.policy.mode] + 'Pool')])), true, 'pool interface');
    const i = tuple(await get(p, pa, 'poolIdentity'), 16);
    equal(address(i[0]), f, 'pool factory');
    const token0 = address(i[1]), token1 = address(i[2]), d0 = uint(i[3], 8), d1 = uint(i[4], 8);
    if (BigInt(token0) >= BigInt(token1) || d0 > 18n || d1 > 18n)
        fail('Invalid ordered tokens/decimals');
    equal(uint(i[5]), 10n ** (18n - d0), 'scale0');
    equal(uint(i[6]), 10n ** (18n - d1), 'scale1');
    const fee = uint(i[7]);
    if (!FEE_TIERS.includes(fee))
        fail('Unsupported fee tier');
    equal(uint(i[8]), 1n, 'pool version');
    equal(mode(i[9]), b.policy.mode, 'pool mode');
    const kind = uint(i[10], 8), protectedToken = address(i[11], true);
    equal(address(i[12]), b.policy.initializer.address, 'pool initializer');
    equal(address(i[13]), b.policy.vault.address, 'pool vault');
    equal(address(i[14]), b.policy.lpIssuer.address, 'pool issuer');
    equal(address(i[15]), lpToken, 'pool LP');
    const instance = hash(await get(f, fa, 'standardInstanceRecord', [p]));
    const launch = address(await get(f, fa, 'reservingLaunchFactory', [p]), true);
    if (kind > 1n || (kind === 0n && (protectedToken !== ZERO_ADDRESS || launch !== ZERO_ADDRESS)) ||
        (kind === 1n && (instance !== ZERO_HASH || launch === ZERO_ADDRESS || ![token0, token1].includes(protectedToken))))
        fail('Invalid kind/provenance');
    equal(address(await get(f, fa, 'getPool', [key])), p, 'key record');
    const words = [token0, token1, fee, 1n, BigInt(b.policy.mode), kind, protectedToken], types = ['address', 'address', 'uint256', 'uint256', 'uint8', 'uint8', 'address'];
    if (instance !== ZERO_HASH) {
        words.push(instance);
        types.push('bytes32');
    }
    equal(hash(a.hashAbiEncoded(Object.freeze(types), Object.freeze(words))), key, 'canonical seven/eight-word key');
    if (kind === 1n || instance === ZERO_HASH) {
        const args = kind === 1n ? [token0, token1, fee, protectedToken] : [token0, token1, fee];
        for (const [name, want, parse] of [[kind === 1n ? 'protectedPoolKey' : 'poolKey', key, hash], [kind === 1n ? 'protectedPoolFor' : 'poolFor', p, address], [kind === 1n ? 'predictProtectedPool' : 'predictPool', p, address]])
            equal(parse(await get(f, fa, name, args)), want, name);
    }
    const la = b.policy.mode === 0 ? PROTOCOL_ABIS.PublicLP : PROTOCOL_ABIS.PrivateLP;
    const lia = b.policy.mode === 0 ? PROTOCOL_ABIS.PublicLPIssuer : PROTOCOL_ABIS.PrivateLPIssuer;
    equal(address(await get(lpToken, la, 'pool')), p, 'LP pool');
    equal(address(await get(lpToken, la, 'issuingFactory')), b.policy.lpIssuer.address, 'LP issuing factory');
    equal(uint(await get(lpToken, la, 'PROTOCOL_VERSION')), 1n, 'LP version');
    equal(mode(await get(lpToken, la, 'PRIVACY_MODE')), b.policy.mode, 'LP mode');
    const prov = tuple(await read(a, b.block, b.policy.lpIssuer.address, lia, 'provenance', [lpToken]), 5);
    equal(address(prov[0]), p, 'issued pool');
    equal(address(prov[1]), p, 'issuer caller');
    equal(mode(prov[2]), b.policy.mode, 'issued mode');
    equal(uint(prov[3]), 1n, 'issued version');
    equal(hash(prov[4]), lpRuntimeCodehash, 'issued hash');
    equal(bool(await get(b.policy.lpIssuer.address, lia, 'isIssuedToken', [lpToken, p, p, BigInt(b.policy.mode), 1n, lpRuntimeCodehash])), true, 'LP provenance');
    const initialized = bool(await get(p, pa, 'initialized')), completed = bool(await get(p, pa, 'protectedInitializationCompleted'));
    if (kind === 1n && initialized && !completed)
        fail('Invalid protected lifecycle');
    const result = Object.freeze({ address: p, key, runtimeCodehash, lpToken, lpRuntimeCodehash, token0, token1, decimals0: d0, decimals1: d1, feeBps: fee, mode: b.policy.mode,
        kind: kind === 1n ? 'protected' : instance === ZERO_HASH ? 'default-standard' : 'additional-standard', standardInstanceId: instance, protectedToken, initialized, protectedCompleted: completed, reservingLaunchFactory: launch,
        lifecycle: initialized ? 'initialized' : kind === 0n ? 'empty-standard' : completed ? 'completed-empty' : 'bonding-reservation' });
    await stable(a, b.policy.chainId, b.block);
    poolBundles.set(result, b);
    return result;
}
export function authenticatedCandidates(b, tokenIn, tokenOut, pools, operation) {
    requireBundle(b);
    const tin = address(tokenIn), tout = address(tokenOut);
    if (tin === tout || tin === b.policy.router.address || tout === b.policy.router.address)
        fail('Invalid token pair');
    const list = array(pools, operation === 'quote' ? b.quoteCap : b.swapCap);
    if (!list.length)
        fail('Empty candidates');
    const seen = new Set();
    for (const value of list) {
        const p = value;
        requirePool(b, p);
        if (seen.has(p.address))
            fail('Duplicate candidate');
        seen.add(p.address);
        if (![p.token0, p.token1].includes(tin) || ![p.token0, p.token1].includes(tout))
            fail('Wrong candidate pair');
    }
    return Object.freeze([...list]);
}
export async function authenticateCandidates(a, b, tokenIn, tokenOut, addresses, operation = 'quote') {
    requireBundle(b);
    const input = array(addresses, operation === 'quote' ? b.quoteCap : b.swapCap).map(v => address(v));
    if (!input.length || new Set(input).size !== input.length)
        fail('Empty/duplicate candidates');
    const pools = [];
    for (const p of input)
        pools.push(await authenticatePool(a, b, p));
    return authenticatedCandidates(b, tokenIn, tokenOut, pools, operation);
}
export async function discoverConfidentialPools(a, b, tokenA, tokenB, requests = {}) {
    requireBundle(b);
    if (b.policy.mode === 0)
        fail('Public discovery takes an explicit off-chain list');
    const ta = address(tokenA), tb = address(tokenB);
    if (ta === tb)
        fail('Invalid pair');
    // Snapshot every request before the first asynchronous provider call.
    function fee(v) { const f = uint(v); if (!FEE_TIERS.includes(f))
        fail('Unsupported tier'); return f; }
    const protectedRequests = array(optional(requests, 'protected') ?? [], 4).map(r => {
        const protectedToken = address(field(r, 'protectedToken'));
        if (protectedToken !== ta && protectedToken !== tb)
            fail('Protected token is not a pair member');
        return Object.freeze({ feeBps: fee(field(r, 'feeBps')), protectedToken });
    });
    const instances = array(optional(requests, 'instances') ?? [], 8).map(r => Object.freeze({ feeBps: fee(field(r, 'feeBps')), instanceNamespace: namespaceAddress(field(r, 'instanceNamespace')), nonce: hash(field(r, 'nonce')) }));
    const rows = new Map();
    const f = b.policy.factory.address, fa = abi(b, 'Factory');
    async function lookup(name, args, origin) {
        const p = address(await one(a, b.block, f, fa, name, args), true);
        if (p === ZERO_ADDRESS)
            return;
        const verified = await authenticatePool(a, b, p);
        const [expected0, expected1] = BigInt(ta) < BigInt(tb) ? [ta, tb] : [tb, ta];
        equal(verified.token0, expected0, 'discovery token0');
        equal(verified.token1, expected1, 'discovery token1');
        equal(verified.feeBps, args[2], 'discovery fee');
        if (origin === 'requested-protected')
            equal(verified.protectedToken, args[3], 'discovery protected token');
        if (origin === 'explicit-instance') {
            equal(verified.kind, 'additional-standard', 'instance lookup');
            equal(hash(await one(a, b.block, f, fa, 'standardInstanceKey', args)), verified.key, 'instance key');
            equal(address(await one(a, b.block, f, fa, 'predictPoolInstance', args)), p, 'instance prediction');
        }
        else
            equal(verified.kind, origin === 'default' ? 'default-standard' : 'protected', 'discovery kind');
        const existing = rows.get(p);
        if (existing) {
            if (existing.origins.includes(origin))
                fail('Duplicate explicit discovery identity');
            existing.origins.push(origin);
        }
        else
            rows.set(p, { pool: verified, origins: [origin] });
    }
    for (const fee of FEE_TIERS)
        await lookup('poolFor', [ta, tb, fee], 'default');
    for (const r of protectedRequests)
        await lookup('protectedPoolFor', [ta, tb, r.feeBps, r.protectedToken], 'requested-protected');
    for (const r of instances)
        await lookup('poolForInstance', [ta, tb, r.feeBps, r.instanceNamespace, r.nonce], 'explicit-instance');
    await stable(a, b.policy.chainId, b.block);
    return Object.freeze({ entries: Object.freeze([...rows.values()].map(r => Object.freeze({ pool: r.pool, origins: Object.freeze(r.origins) }))), requiresSelection: rows.size > b.quoteCap });
}
/** INTERNAL shared check: stored dependency anchors, not live route availability. */
export async function checkPublicOrderBook(a, b, p) {
    if (p.mode !== 0 || !p.orderBook || !p.wrappedNative)
        fail('Public order book and wrapper anchors required');
    const book = p.orderBook, ab = PROTOCOL_ABIS.OrderBook;
    await checkCode(a, b, book.address, book.runtimeCodehash);
    const get = (name) => one(a, b, book.address, ab, name);
    equal(uint(await get('PROTOCOL_VERSION')), 1n, 'book version');
    equal(mode(await get('PRIVACY_MODE')), 0, 'book mode');
    equal(bool(await one(a, b, book.address, ab, 'supportsInterface', [interfaceId('OrderBook')])), true, 'book interface');
    for (const [name, anchor] of [['factory', p.factory], ['bestExecutionRouter', p.router], ['wrappedNative', p.wrappedNative]]) {
        equal(address(await get(name)), anchor.address, 'book ' + name);
        equal(hash(await get(name + 'RuntimeCodehash')), anchor.runtimeCodehash, 'book ' + name + ' hash');
    }
    const surplus = address(await get('surplusBeneficiary'));
    if ([book.address, p.factory.address, p.router.address, p.wrappedNative.address].includes(surplus))
        fail('Invalid active surplus destination');
}
