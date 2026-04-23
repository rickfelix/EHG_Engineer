#!/usr/bin/env node
/**
 * Protocol Consistency Linter — CLI entry point.
 *
 * Subcommands:
 *   audit                     Run the linter against live leo_protocol_sections,
 *                             persist to leo_lint_run_history + _violations,
 *                             exit non-zero on any severity=block violation.
 *                             Flags: --skip-lint --skip-reason "<text>"
 *                             Flags: --json
 *   test                      Fixture-driven verification — every rule must
 *                             fire on positive fixture and stay silent on
 *                             negative fixture. No DB write.
 *   promote <rule-id>         Flip a rule from warn -> block. Requires 2+
 *                             regen runs on record with zero violations for
 *                             the rule.
 *   review                    List rules with zero violations in the last 90
 *                             days (retirement candidates).
 *
 * SD-PROTOCOL-LINTER-001, slice 4/n.
 */

import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { runProtocolLint } from './engine.mjs';
import { loadRules } from './rule-loader.mjs';
import { getActiveProtocol } from '../modules/claude-md-generator/db-queries.js';
import {
  startRun,
  recordRun,
  checkBypassRateLimit,
  promoteRule,
  reviewRetirementCandidates
} from './audit-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    process.exit(2);
  }
  return createClient(url, key);
}

function extractFlagValue(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  const next = argv[idx + 1];
  if (next == null || next.startsWith('--')) return '';
  return next;
}

async function runAudit(argv) {
  const json = argv.includes('--json');
  const supabase = getSupabase();

  // Bypass path
  const skipLint = argv.includes('--skip-lint');
  if (skipLint) {
    const reason = extractFlagValue(argv, '--skip-reason');
    if (!reason) {
      console.error('--skip-lint requires --skip-reason "<text>"');
      return 1;
    }
    const check = await checkBypassRateLimit({ supabase, reason, initiator: 'cli' });
    if (!check.allowed) {
      console.error(`Bypass budget exhausted: ${check.used}/${check.budget} used in the last 7 days.`);
      return 1;
    }
    if (json) console.log(JSON.stringify({ bypassed: true, reason, used: check.used, budget: check.budget }));
    else console.log(`[protocol-lint] bypassed (${check.used}/${check.budget} this week). reason: ${reason}`);
    return 0;
  }

  // Normal audit
  const rules = await loadRules();
  const protocol = await getActiveProtocol(supabase);
  const sections = protocol?.sections || [];

  const runId = await startRun({ supabase, trigger: 'audit', initiator: 'cli' });
  const result = await runProtocolLint({ mode: 'audit', ctx: { sections }, rules });
  await recordRun({ supabase, runId, rules, result });

  if (json) {
    console.log(JSON.stringify({ run_id: runId, ...result }, null, 2));
  } else {
    printReport(result, runId);
  }
  return result.passed ? 0 : 1;
}

async function runTest() {
  const rules = await loadRules();
  const ruleIds = [...new Set(rules.map(r => r.id))];
  const files = await readdir(FIXTURES_DIR);

  let failures = 0;
  for (const id of ruleIds) {
    for (const kind of ['positive', 'negative']) {
      const name = `${id}.${kind}.json`;
      if (!files.includes(name)) {
        console.log(`  FAIL: missing ${name}`);
        failures++;
        continue;
      }
      const ctx = JSON.parse(await readFile(join(FIXTURES_DIR, name), 'utf8'));
      const result = await runProtocolLint({ ctx, rules });
      const hits = result.violations.filter(v => v.rule_id === id);
      if (kind === 'positive' && hits.length === 0) {
        console.log(`  FAIL: ${name} expected violations, got 0`);
        failures++;
      } else if (kind === 'negative' && hits.length > 0) {
        console.log(`  FAIL: ${name} expected 0 violations, got ${hits.length}`);
        failures++;
      } else {
        console.log(`  OK:   ${name}`);
      }
    }
  }
  console.log(`\n${failures === 0 ? '✅ ALL FIXTURES PASS' : '❌ ' + failures + ' FIXTURE FAILURE(S)'}`);
  return failures === 0 ? 0 : 1;
}

async function runPromote(argv) {
  const ruleId = argv.find(a => /^LINT-[A-Z]+-\d{3}$/.test(a));
  if (!ruleId) {
    console.error('Usage: protocol:lint:promote <RULE-ID>  (e.g., LINT-PHRASE-001)');
    return 2;
  }
  const supabase = getSupabase();
  const outcome = await promoteRule({ supabase, ruleId });
  if (outcome.promoted) {
    console.log(`✅ ${ruleId} promoted to severity=block`);
    return 0;
  }
  console.error(`❌ ${ruleId} not promoted: ${outcome.reason}`);
  return 1;
}

async function runReview(argv) {
  const daysArg = extractFlagValue(argv, '--days');
  const days = daysArg ? Number.parseInt(daysArg, 10) : 90;
  const supabase = getSupabase();
  const candidates = await reviewRetirementCandidates({ supabase, days });
  if (candidates.length === 0) {
    console.log(`No retirement candidates (no rules with zero violations over the last ${days} days).`);
    return 0;
  }
  console.log(`Retirement candidates (zero violations in the last ${days} days):`);
  for (const c of candidates) {
    console.log(`  ${c.rule_id} [${c.severity}] — ${c.description}`);
  }
  return 0;
}

function printReport(result, runId) {
  const total = result.violations.length;
  const blocking = result.critical_count;
  const warn = total - blocking;

  console.log(`[protocol-lint] run_id=${runId}`);
  console.log(`[protocol-lint] ${result.rules_evaluated} rule(s) evaluated in ${result.duration_ms}ms`);

  if (total === 0) {
    console.log('[protocol-lint] ✅ Clean — no violations.');
    return;
  }
  if (blocking > 0) console.log(`[protocol-lint] 🛑 ${blocking} blocking violation(s):`);
  for (const v of result.violations.filter(v => v.severity === 'block')) {
    console.log(`  [block] ${v.rule_id}  section=${v.section_id ?? '-'}  ${v.message}`);
  }
  if (warn > 0) console.log(`[protocol-lint] ⚠️  ${warn} warning(s):`);
  for (const v of result.violations.filter(v => v.severity === 'warn')) {
    console.log(`  [warn]  ${v.rule_id}  section=${v.section_id ?? '-'}  ${v.message}`);
  }
}

function printUsage() {
  console.log(`Usage: node scripts/protocol-lint/cli.mjs <subcommand>

Subcommands:
  audit                     Run linter, persist to DB. Flags: --json --skip-lint --skip-reason "text"
  test                      Fixture-driven verification (no DB write)
  promote <RULE-ID>         Promote rule from warn -> block (requires clean regen history)
  review [--days N]         List rules with 0 violations in last N days (default 90)
`);
}

async function main() {
  const [sub, ...argv] = process.argv.slice(2);
  switch (sub) {
    case 'audit':   return await runAudit(argv);
    case 'test':    return await runTest();
    case 'promote': return await runPromote(argv);
    case 'review':  return await runReview(argv);
    default:        printUsage(); return sub == null ? 0 : 2;
  }
}

main().then(code => process.exit(code ?? 0), err => { console.error(err); process.exit(1); });
