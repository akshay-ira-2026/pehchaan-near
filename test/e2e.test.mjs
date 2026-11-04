// End-to-end through the Worker with a fake chain and an in-memory KV. No network.
import worker from '../src/worker.js';
import { check } from '../src/check.js';
import assert from 'node:assert/strict';
const DAY_NS = 86400000n * 1000000n;
const chain = async (url) => {
  const u = String(url);
  if (u.includes('rpc')) return new Response(JSON.stringify({ result: { code_hash: '11111111111111111111111111111111', amount: '1' } }));
  if (u.includes('/count')) return new Response(JSON.stringify({ txns: [{ count: '500' }] }));
  return new Response(JSON.stringify({ txns: [{ block_timestamp: String(BigInt(Date.now()) * 1000000n - 900n * DAY_NS) }] }));
};
globalThis.fetch = chain;
const store = new Map();
const REPORTS = { put: async (k, v) => store.set(k, v), get: async (k) => JSON.parse(store.get(k)), list: async () => ({ keys: [...store.keys()].map(name => ({ name })) }) };
const env = { REPORTS };
const ask = async (r) => (await worker.fetch(new Request('https://x/api/check?receiver=' + r), env)).json();

const before = await ask('honest-shop.testnet');
assert.equal(before.verdict, 'allow');
await worker.fetch(new Request('https://x/api/report', { method: 'POST', body: JSON.stringify({ account: 'honest-shop.testnet', reason: 'scam', evidence: 'https://example.com/fake', reporter: 'attacker.testnet' }) }), env);
const after = await ask('honest-shop.testnet');
console.log('poisoning: one anonymous report turns', before.verdict, '->', after.verdict);
assert.notEqual(after.verdict, 'block', 'an unverified report must not block an honest account');

const down = async (url) => String(url).includes('rpc') ? chain(url) : new Response('rate limited', { status: 429 });
const r = await check('old-account.testnet', null, [], { fetch: down });
console.log('indexer outage reasons:', r.reasons);
assert.ok(!r.reasons.some(x => /no transaction history/.test(x)), 'an indexer outage must not be reported as an empty history');
assert.equal(r.verdict, 'warn');
console.log('e2e ok');
