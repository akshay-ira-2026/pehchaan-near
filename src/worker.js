import { check, validAccountId } from './check.js';
import { SEED } from './blocklist.js';
import PAGE from './page.js';

const J = (o, s = 200) => new Response(JSON.stringify(o, null, 2), { status: s,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

async function loadBlocklist(env) {
  const list = [...SEED];
  if (env.REPORTS) {
    const keys = await env.REPORTS.list({ limit: 1000 });
    for (const k of keys.keys) { const v = await env.REPORTS.get(k.name, 'json'); if (v) list.push(v); }
  }
  return list;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } });
    if (url.pathname === '/' ) return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (url.pathname === '/api/check') {
      const receiver = (url.searchParams.get('receiver') || '').trim().toLowerCase();
      const agent = (url.searchParams.get('agent') || '').trim().toLowerCase() || null;
      if (!validAccountId(receiver)) return J({ error: 'receiver must be a NEAR account id' }, 400);
      if (agent && !validAccountId(agent)) return J({ error: 'agent must be a NEAR account id' }, 400);
      try { return J(await check(receiver, agent, await loadBlocklist(env))); }
      catch (e) { return J({ verdict: 'warn', reasons: ['could not read chain data: ' + e.message] }, 502); }
    }
    if (url.pathname === '/api/blocklist') return J({ entries: await loadBlocklist(env) });
    if (url.pathname === '/api/report' && req.method === 'POST') {
      if (!env.REPORTS) return J({ error: 'reports store not configured' }, 503);
      let b; try { b = await req.json(); } catch { return J({ error: 'json body required' }, 400); }
      if (!validAccountId(b.account)) return J({ error: 'account must be a NEAR account id' }, 400);
      if (!b.evidence || !/^https?:\/\//.test(b.evidence)) return J({ error: 'evidence must be a link (tx explorer, post)' }, 400);
      if (!validAccountId(b.reporter || '')) return J({ error: 'reporter must be a NEAR account id' }, 400);
      const entry = { account: b.account, reason: String(b.reason || 'reported').slice(0, 200), evidence: b.evidence.slice(0, 300), reporter: b.reporter, at: new Date().toISOString() };
      await env.REPORTS.put(`r:${b.account}:${b.reporter}`, JSON.stringify(entry));
      return J({ ok: true, entry });
    }
    return J({ error: 'not found' }, 404);
  },
};
