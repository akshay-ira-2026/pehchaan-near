// Seed entries for the shared blocklist. The demo entry is a name we reserved for the attack demo;
// it is not a real third party. Live reports are added through POST /api/report (kept in KV when bound).
export const SEED = [
  { account: 'pehchaan-drainer-demo.testnet', reason: 'demo drainer used in the prompt-injection attack demo',
    evidence: 'https://github.com/akshay-ira-2026/pehchaan-near/blob/main/demo/attack.mjs', reporter: 'pehchaan-maintainer' },
];
