const path = require('path');
const root = process.cwd();
const hts = require('../lib/protocol/harness-token-scale.cjs');
console.log('HARNESS_TOKEN_SCALE:', JSON.stringify(hts));
const { singleReadFit, contractTokenCount, contractSizeBytes } = require('../lib/protocol/contract-read-coverage.cjs');
for (const f of ['CLAUDE_LEAD.md','CLAUDE_ADAM.md','CLAUDE_EXEC.md','CLAUDE_CORE.md','CLAUDE_SOLOMON.md','CLAUDE_PLAN.md']) {
  let fit;
  try { fit = singleReadFit(root, f); } catch (e) { fit = { ERR: e.message }; }
  console.log(f.padEnd(20), JSON.stringify(fit));
}
