// Pehchaan: counterparty check for NEAR agents that pay.
// Pure scoring logic + data fetchers. Used by the Worker (src/worker.js) and the agent wrapper.
export const DEFAULTS = {
  rpc: 'https://rpc.testnet.near.org',
  indexer: 'https://api-testnet.nearblocks.io/v1',
  newAccountDays: 7,
  recentCodeDays: 7,
  lowActivityTxns: 5,
};
const EMPTY_CODE = '11111111111111111111111111111111';
const NS_PER_DAY = 86400e9;

async function rpcViewAccount(cfg, accountId, fetchFn) {
  const r = await fetchFn(cfg.rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'pehchaan', method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: accountId } }),
  });
  const j = await r.json();
  if (j.error) {
    const name = j.error?.cause?.name;
    if (name === 'UNKNOWN_ACCOUNT') return { exists: false };
    throw new Error('rpc: ' + (j.error.message || name));
  }
  return { exists: true, codeHash: j.result.code_hash, amount: j.result.amount };
}

async function idx(cfg, path, fetchFn) {
  const r = await fetchFn(cfg.indexer + path, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('indexer ' + r.status + ' ' + path);
  return r.json();
}

// Collect raw signals. Every value comes from a live source; anything we can't read is null.
export async function gatherSignals(receiver, agent, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const f = opts.fetch || fetch;
  const now = opts.nowNs ?? BigInt(Date.now()) * 1000000n;
  const s = { receiver, agent: agent || null, source: { rpc: cfg.rpc, indexer: cfg.indexer } };
  const acct = await rpcViewAccount(cfg, receiver, f);
  s.exists = acct.exists;
  if (!acct.exists) return s;
  s.isContract = acct.codeHash !== EMPTY_CODE;
  s.codeHash = acct.codeHash;
  const safe = async (p) => { try { return await idx(cfg, p, f); } catch (e) { return { _err: String(e.message || e) }; } };
  const enc = encodeURIComponent(receiver);
  const [count, first, deps, prior] = await Promise.all([
    safe(`/account/${enc}/txns-only/count`),
    safe(`/account/${enc}/txns-only?per_page=1&order=asc`),
    s.isContract ? safe(`/account/${enc}/contract/deployments`) : Promise.resolve(null),
    agent ? safe(`/account/${enc}/txns-only/count?from=${encodeURIComponent(agent)}`) : Promise.resolve(null),
  ]);
  s.txnCount = count?.txns?.[0]?.count != null ? Number(count.txns[0].count) : null;
  const ts = first?.txns?.[0]?.block_timestamp;
  s.firstSeenDaysAgo = ts ? Number((now - BigInt(ts)) / BigInt(NS_PER_DAY)) : null;
  if (deps) {
    const list = deps.deployments || [];
    const latest = list.map(d => d.block_timestamp).filter(Boolean).sort().pop();
    s.codeChangedDaysAgo = latest ? Number((now - BigInt(latest)) / BigInt(NS_PER_DAY)) : null;
  }
  if (prior) s.priorTxnsFromAgent = prior?.txns?.[0]?.count != null ? Number(prior.txns[0].count) : null;
  s.indexerErrors = [count, first, deps, prior].filter(x => x && x._err).map(x => x._err);
  return s;
}

// A blocklisted account controls every sub-account under it (on NEAR only the parent can create one), so those match too.
// Top-level names (no dot) match exactly, so a single entry can't cover a whole namespace.
export function blocklistHit(receiver, blocklist = []) {
  return blocklist.find(b => receiver === b.account || (b.account.includes('.') && receiver.endsWith('.' + b.account)));
}

// Turn signals + blocklist into allow / warn / block with reasons. Deterministic, unit-tested.
export function score(signals, blocklist = [], opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const reasons = [];
  let verdict = 'allow';
  const bump = (v) => { const o = { allow: 0, warn: 1, block: 2 }; if (o[v] > o[verdict]) verdict = v; };
  const hit = blocklistHit(signals.receiver, blocklist);
  if (hit) {
    const via = hit.account === signals.receiver ? '' : ` (sub-account of ${hit.account}, which only that account could create)`;
    const why = `${hit.reason}${via} (evidence: ${hit.evidence}, reported by ${hit.reporter})`;
    if (hit.verified === false) { bump('warn'); reasons.push(`reported but unverified: ${why}`); }
    else { bump('block'); reasons.push(`on shared blocklist: ${why}`); }
  }
  if (signals.exists === false) { bump('warn'); reasons.push('account does not exist on chain yet'); }
  else {
    const unread = signals.indexerErrors || [];
    if (unread.length) { bump('warn'); reasons.push(`could not read ${unread.length} history signal(s), treated as unknown: ${unread.join('; ')}`); }
    if (signals.firstSeenDaysAgo == null) { if (!unread.length) { bump('warn'); reasons.push('no transaction history found'); } }
    else if (signals.firstSeenDaysAgo < cfg.newAccountDays) { bump('warn'); reasons.push(`new account: first seen ${signals.firstSeenDaysAgo} day(s) ago`); }
    if (signals.txnCount != null && signals.txnCount < cfg.lowActivityTxns) { bump('warn'); reasons.push(`low activity: ${signals.txnCount} transaction(s)`); }
    if (signals.isContract && signals.codeChangedDaysAgo != null && signals.codeChangedDaysAgo < cfg.recentCodeDays) {
      bump('warn'); reasons.push(`contract code changed ${signals.codeChangedDaysAgo} day(s) ago`);
    }
    if (signals.agent && signals.priorTxnsFromAgent === 0) reasons.push('first payment from this agent to this receiver');
    if (signals.agent && signals.priorTxnsFromAgent > 0) reasons.push(`${signals.priorTxnsFromAgent} earlier transaction(s) from this agent`);
    if (signals.isContract) reasons.push('receiver is a contract');
  }
  if (verdict === 'allow' && reasons.length === 0) reasons.push('established account, no risk signals');
  return { verdict, reasons };
}

export async function check(receiver, agent, blocklist, opts) {
  const signals = await gatherSignals(receiver, agent, opts);
  return { ...score(signals, blocklist, opts), signals };
}

export function validAccountId(id) {
  return typeof id === 'string' && id.length >= 2 && id.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id);
}
