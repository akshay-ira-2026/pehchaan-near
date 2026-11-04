// Hits live NEAR testnet RPC + NearBlocks. Run: node test/live.test.mjs
import { check } from '../src/check.js';
import { SEED } from '../src/blocklist.js';
import assert from 'node:assert/strict';
const a = await check('guest-book.testnet', '3ugen.testnet', SEED);
console.log('guest-book', a.verdict, a.reasons, a.signals.txnCount, a.signals.firstSeenDaysAgo, a.signals.priorTxnsFromAgent);
assert.notEqual(a.verdict, 'block'); assert.ok(a.signals.exists); assert.ok(a.signals.isContract);
const b = await check('not-made-yet-zz9.testnet', null, SEED);
console.log('missing', b.verdict, b.reasons); assert.equal(b.verdict, 'warn');
const c = await check('pehchaan-drainer-demo.testnet', null, SEED);
console.log('drainer', c.verdict, c.reasons); assert.equal(c.verdict, 'block');
console.log('live ok');
