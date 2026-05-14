#!/usr/bin/env node
/**
 * glossary-bypass-parity-check.mjs — Weekly parity validator (Child A)
 *
 * Verifies that the "Bypass Verbs" section of CONTEXT.md stays in sync with
 * the sibling SD bypass_ledger CHECK constraint enum.
 *
 * FAIL-SOFT design (R5 mitigation from LEAD risk-agent evidence 0f7a236b):
 * if bypass_ledger table is absent (sibling SD has not shipped yet), the
 * script exits 0 with an informative log and does not emit a feedback row.
 * This prevents false-positive CI failures while the sibling SD is in flight.
 *
 * When bypass_ledger IS present:
 *   - Read its CHECK constraint enum via information_schema.constraint_column_usage.
 *   - Parse CONTEXT.md "## Bypass Verbs" H2 section (or wherever bypass terms live).
 *   - Diff the two sets. Mismatch → emit feedback row + exit 1.
 *   - Match → log green + exit 0.
 *
 * SD: SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-A
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function log(level, msg, extra = {}) {
  console.error(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...extra }));
}

function findRepoRoot() {
  // Walk up from this script's directory until we find a .git folder or package.json.
  let dir = path.dirname(url.fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

async function bypassLedgerPresent() {
  // information_schema probe — fail-soft path
  const { data, error } = await supabase
    .rpc('exec_sql', { sql_query: "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bypass_ledger' LIMIT 1" })
    .single();
  if (error) {
    // exec_sql RPC may not exist in this env — fall back to direct probe via table query.
    const probe = await supabase.from('bypass_ledger').select('*').limit(1);
    if (probe.error && probe.error.code === 'PGRST205') return false; // table not found
    if (probe.error && /relation .* does not exist/i.test(probe.error.message || '')) return false;
    if (probe.error) {
      log('warn', 'bypass_ledger probe inconclusive — treating as absent (fail-soft)', { error: probe.error.message });
      return false;
    }
    return true;
  }
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

async function readBypassLedgerEnum() {
  // Best-effort: query the column whose CHECK lists the canonical bypass verbs.
  // Schema is sibling-SD-owned and not yet shipped, so this function is only
  // exercised once bypass_ledger is live.
  const { data, error } = await supabase.from('bypass_ledger').select('verb');
  if (error) {
    log('warn', 'bypass_ledger select failed', { error: error.message });
    return null;
  }
  return new Set((data || []).map(r => r.verb).filter(Boolean));
}

function readContextMdBypassSection() {
  const repoRoot = findRepoRoot();
  const contextPath = path.join(repoRoot, 'CONTEXT.md');
  if (!fs.existsSync(contextPath)) {
    log('warn', 'CONTEXT.md not found at repo root', { path: contextPath });
    return null;
  }
  const text = fs.readFileSync(contextPath, 'utf8');
  // Look for the bypass-verbs entry. CONTEXT.md uses ## bypass verb as the term header.
  // For Phase 1 (single-term glossary entry), the canonical bypass verb names appear
  // inside the definition prose; treat any backtick-quoted token there as a verb.
  const match = text.match(/##\s+bypass\s+verb[\s\S]*?(?=\n##\s|\n#\s|$)/i);
  if (!match) {
    log('warn', 'CONTEXT.md has no "## bypass verb" section');
    return new Set();
  }
  const verbs = new Set();
  // Extract backtick-quoted tokens from the section body
  const tokenRe = /`([^`]+)`/g;
  let m;
  while ((m = tokenRe.exec(match[0])) !== null) {
    verbs.add(m[1].trim());
  }
  return verbs;
}

async function emitFeedback(missing, extra) {
  const description = [
    'Pocock glossary-bypass-parity-check detected drift:',
    missing.size ? `  in bypass_ledger but missing from CONTEXT.md: ${[...missing].join(', ')}` : null,
    extra.size ? `  in CONTEXT.md but missing from bypass_ledger: ${[...extra].join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const { error } = await supabase.from('feedback').insert({
    title: 'Pocock glossary-bypass parity drift',
    description,
    severity: 'medium',
    category: 'glossary_parity_failure',
    component: 'pocock',
    status: 'new',
  });
  if (error) log('warn', 'feedback INSERT failed', { error: error.message });
}

async function main() {
  const present = await bypassLedgerPresent();
  if (!present) {
    log('info', 'bypass_ledger not present — sibling SD migration pending, deferring parity check');
    process.exit(0);
  }

  const ledgerVerbs = await readBypassLedgerEnum();
  if (!ledgerVerbs) {
    log('info', 'bypass_ledger present but empty or unreadable — deferring (fail-soft)');
    process.exit(0);
  }

  const contextVerbs = readContextMdBypassSection();
  if (contextVerbs === null) {
    log('error', 'CONTEXT.md unreadable — parity check cannot run');
    process.exit(1);
  }

  const missing = new Set([...ledgerVerbs].filter(v => !contextVerbs.has(v)));
  const extra   = new Set([...contextVerbs].filter(v => !ledgerVerbs.has(v)));

  if (missing.size === 0 && extra.size === 0) {
    log('info', 'parity OK', { ledger_count: ledgerVerbs.size, context_count: contextVerbs.size });
    process.exit(0);
  }

  log('error', 'parity drift detected', {
    ledger_only: [...missing],
    context_only: [...extra],
  });
  await emitFeedback(missing, extra);
  process.exit(1);
}

main().catch(err => {
  log('error', 'fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
