#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-3): SessionStart stale-docs warning.
 *
 * Warns (does NOT block) when the generated CLAUDE_*.md family is stale vs the
 * leo_protocol_sections DB — turning the CLAUDE.md "version check / if stale, regenerate"
 * step into a real, automated detector. Silent when clean.
 *
 * Hard contract: FAIL-OPEN. This hook must never block, hang, or pollute session start —
 * any error (missing DB creds, transient failure, timeout) is swallowed and it exits 0.
 * Gated by LEO_DOC_DRIFT_WARN (default ON; set to 'off' to silence).
 */
const path = require('node:path');

async function run() {
  if (String(process.env.LEO_DOC_DRIFT_WARN || '').toLowerCase() === 'off') return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..');
  const { computeDrift } = require(path.join(projectDir, 'scripts', 'check-claude-md-drift.cjs'));

  // Time-box the DB round-trip so a slow/hanging query never delays session start.
  const withTimeout = (p, ms) => Promise.race([
    p,
    new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('drift-check timeout')), ms); if (t.unref) t.unref(); }),
  ]);

  const r = await withTimeout(computeDrift({ baseDir: projectDir }), 8000);
  if (r && r.drift) {
    const n = (r.changed?.length || 0) + (r.added?.length || 0) + (r.removed?.length || 0);
    const files = (r.staleFiles || []).filter(Boolean).join(', ');
    console.log(
      `[PROTOCOL DRIFT] ${n} leo_protocol_sections change(s) not regenerated — generated CLAUDE_*.md are STALE` +
      `${files ? ` (${files})` : ''}. Fix: node scripts/generate-claude-md-from-db.js`
    );
  }
}

run()
  .catch(() => { /* fail-open: a drift-check failure must never disrupt session start */ })
  .finally(() => process.exit(0));
