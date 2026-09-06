#!/usr/bin/env node
// scripts/michael-rules-load.mjs — the seat's rules reader (/michael Step 4): ROWS, never prose.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-2). Inert (exit 0, empty rows, tables_absent=true)
// until the chairman applies 20260906_michael_tables.sql.
//
// Usage (absolute path from the repo root, never cd-and-run):
//   node scripts/michael-rules-load.mjs [--json] [--domain gmail] [--include-superseded]
import { isMainModule } from '../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs } from '../lib/michael/db.mjs';
import { loadRulesAndClosures } from '../lib/michael/rules.mjs';

/** Pure: the human rendering of the load result (one line per rule/closure). */
export function renderLoad(result) {
  const out = [];
  if (result.tables_absent) out.push('[MICHAEL-RULES] michael_* tables not applied yet — 0 rules, 0 closures (inert).');
  out.push(`[MICHAEL-RULES] ${result.rules.length} rule(s), ${result.closures.length} live closure(s)`);
  for (const r of result.rules) {
    out.push(`  ${r.domain}/${r.rule_key} [${r.status}${r.auto_apply ? `, auto:${r.auto_apply_verb}` : ''}] ${r.rule_text}`);
  }
  for (const c of result.closures) out.push(`  closure ${c.closure_key} (${c.topic}): ${c.closure_text}`);
  for (const e of result.errors || []) out.push(`  error: ${e}`);
  return out;
}

export async function runRulesLoad({ sb, argv = [], now = new Date() } = {}) {
  const args = parseArgs(argv);
  const result = await loadRulesAndClosures(sb, {
    domain: typeof args.domain === 'string' ? args.domain : null,
    includeSuperseded: Boolean(args['include-superseded']),
    now,
  });
  return { ...result, ok: result.errors.length === 0 };
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const sb = createMichaelClient();
  const result = await runRulesLoad({ sb, argv });
  if (json) console.log(JSON.stringify(result));
  else for (const line of renderLoad(result)) console.log(line);
  process.exitCode = result.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-RULES] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
