export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_HASH = ('0x' + '00'.repeat(32));
export const FEE_TIERS = Object.freeze([1n, 5n, 30n, 100n]);
export function fail(message) { throw new TypeError(message); }
export function field(value, key) {
    if (value === null || typeof value !== 'object')
        return fail('Expected own data record');
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d))
        return fail('Missing or accessor field: ' + key);
    return d.value;
}
export function optional(value, key) {
    if (value === null || typeof value !== 'object')
        return fail('Expected own data record');
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d)
        return undefined;
    if (!('value' in d))
        return fail('Accessor field: ' + key);
    return d.value;
}
export function array(value, max = 4096, exact) {
    if (!Array.isArray(value))
        return fail('Expected positional array');
    const n = field(value, 'length');
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > max || (exact !== undefined && n !== exact))
        return fail('Invalid array length');
    if (Reflect.ownKeys(value).length !== n + 1)
        return fail('Unexpected array fields');
    return Object.freeze(Array.from({ length: n }, (_, i) => field(value, String(i))));
}
export function uint(value, bits = 256, positive = false) {
    if (typeof value !== 'bigint' || value < 0n || value >= (1n << BigInt(bits)) || (positive && value === 0n))
        return fail('Invalid uint' + bits);
    return value;
}
export function address(value, allowZero = false) {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
        return fail('Invalid address');
    const a = value.toLowerCase();
    if ((!allowZero && a === ZERO_ADDRESS) || a === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
        return fail('Invalid contract/account address');
    return a;
}
export function hex(value, bytes, maxBytes = 65536) {
    if (typeof value !== 'string' || value.length > 2 + maxBytes * 2 || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value) || (bytes !== undefined && value.length !== 2 + bytes * 2))
        return fail('Invalid hex data');
    return value.toLowerCase();
}
export function hash(value, nonzero = false) { const h = hex(value, 32); if (nonzero && h === ZERO_HASH)
    fail('Zero hash'); return h; }
export function bool(value) { if (typeof value !== 'boolean')
    return fail('Invalid boolean'); return value; }
export function mode(value) { const n = uint(value, 8); if (n > 2n)
    fail('Unsupported privacy mode'); return Number(n); }
export function equal(a, b, label) { if (a !== b)
    fail('Mismatch: ' + label); }
export function block(value) { return Object.freeze({ number: uint(field(value, 'number')), hash: hash(field(value, 'hash'), true), timestamp: uint(field(value, 'timestamp'), 64) }); }
export function tuple(value, n) { return array(value, n, n); }
export function frozenRead(address, abi, functionName, args = []) { return Object.freeze({ address, abi, functionName, args: Object.freeze([...args]) }); }
export async function read(a, b, target, abi, name, args = []) { return array(await a.readContract(frozenRead(target, abi, name, args), b), 32); }
export async function one(a, b, target, abi, name, args = []) { const r = await read(a, b, target, abi, name, args); if (r.length !== 1)
    fail('Wrong single output arity'); return r[0]; }
export async function stable(a, chainId, b) {
    equal(uint(await a.readChainId(), 256, true), chainId, 'chain');
    const current = block(await a.readBlock(b.number));
    equal(current.number, b.number, 'provider block number');
    equal(current.hash, b.hash, 'provider block');
    equal(current.timestamp, b.timestamp, 'provider block timestamp');
}
export function freezeArgs(args) { return Object.freeze(args.map(v => Array.isArray(v) ? freezeArgs(array(v)) : v)); }
