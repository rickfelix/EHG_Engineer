#!/usr/bin/env node
// scripts/michael-rules-render.mjs — writes docs/michael/generated/RULES.md and CLOSURES.md for the
// CHAIRMAN'S REVIEW ONLY. SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-2, spec §2 "Prose for
// review only"). The folder is gitignored; the seat never reads these files (it loads rows via
// scripts/michael-rules-load.mjs). Inert (writes the "not applied yet" stub, exit 0) until the
// chairman applies the migration.
//
// Usage: node scripts/michael-rules-render.mjs [--out-dir docs/michael/generated] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs } from '../lib/michael/db.mjs';
import { loadRulesAndClosures, renderRulesMarkdown, renderClosuresMarkdown } from '../lib/michael/rules.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'docs', 'michael', 'generated');

/**
 * Render both files. deps: { sb, outDir?, now?, writeFile? }. Returns { ok, tables_absent, files, counts }.
 */
export async function runRulesRender({ sb, outDir = DEFAULT_OUT_DIR, now = new Date(), writeFile = null } = {}) {
  const result = await loadRulesAndClosures(sb, { now });
  const rulesMd = renderRulesMarkdown(result.rules, { now, tablesAbsent: result.tables_absent });
  const closuresMd = renderClosuresMarkdown(result.closures, { now, tablesAbsent: result.tables_absent });
  const write = writeFile || ((p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf8'); });
  const files = { rules: path.join(outDir, 'RULES.md'), closures: path.join(outDir, 'CLOSURES.md') };
  write(files.rules, rulesMd);
  write(files.closures, closuresMd);
  return {
    ok: result.errors.length === 0,
    tables_absent: result.tables_absent,
    files,
    counts: { rules: result.rules.length, closures: result.closures.length },
    errors: result.errors,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sb = createMichaelClient();
  const outDir = typeof args['out-dir'] === 'string' ? path.resolve(args['out-dir']) : DEFAULT_OUT_DIR;
  const r = await runRulesRender({ sb, outDir });
  if (args.json) console.log(JSON.stringify(r));
  else console.log(`[MICHAEL-RULES-RENDER] wrote ${r.files.rules} (${r.counts.rules} rules) and ${r.files.closures} (${r.counts.closures} closures)${r.tables_absent ? ' — tables not applied yet (stub)' : ''}`);
  process.exitCode = r.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-RULES-RENDER] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
