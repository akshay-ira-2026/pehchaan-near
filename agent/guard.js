// Agent-side wrapper. The agent never calls sign() directly; it calls guardedPay().
// block -> refuse, never signs. warn -> asks a human, signs only on an explicit yes. allow -> signs.
export async function guardedPay({ agent, receiver, amountNear, checkUrl, sign, askHuman, log = console.log, fetchFn = fetch }) {
  const q = new URLSearchParams({ receiver, agent });
  let res;
  try { res = await (await fetchFn(`${checkUrl}/api/check?${q}`)).json(); }
  catch (e) { res = { verdict: 'warn', reasons: ['check service unreachable: ' + e.message] }; }
  log(`[guard] ${agent} -> ${receiver} ${amountNear} NEAR : ${String(res.verdict).toUpperCase()}`);
  for (const r of res.reasons || []) log(`[guard]   - ${r}`);
  if (res.verdict === 'block') { log('[guard] REFUSED: transaction not signed'); return { sent: false, verdict: 'block', reasons: res.reasons }; }
  if (res.verdict !== 'allow') {
    const ok = await askHuman(`Agent wants to pay ${amountNear} NEAR to ${receiver}. Warnings: ${(res.reasons||[]).join('; ')}. Approve?`);
    if (!ok) { log('[guard] human declined: not signed'); return { sent: false, verdict: res.verdict, reasons: res.reasons }; }
    log('[guard] human approved');
  }
  const tx = await sign({ receiver, amountNear });
  log(`[guard] signed: ${tx}`);
  return { sent: true, verdict: res.verdict, tx };
}
