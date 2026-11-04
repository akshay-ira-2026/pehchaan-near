# Working on Pehchaan (for any coding agent)

Adapted from pstack by Lauren Tan (poteto), MIT: https://github.com/cursor/plugins/tree/main/pstack

1. Restate the goal and the smallest change that meets it before touching code.
2. Name the data shape first. Verdicts are `allow` < `warn` < `block`; signals we couldn't read are `null` plus an entry in `indexerErrors`, never a guess.
3. Guards live at the boundaries (`src/worker.js`, `agent/guard.js`). `score()` stays pure and deterministic.
4. Fail safe: anything unknown or unreachable becomes `warn`, never `allow`. Only reviewed seed entries can `block`.
5. Prove it works on the real artifact: `npm test`, then `npm run test:live`, then `node demo/attack.mjs`. A finding counts only if a run shows it.
6. Before review: subtract before you add, no dead code, no comments that restate the code.
