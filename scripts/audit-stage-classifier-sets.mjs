#!/usr/bin/env node
/**
 * SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-4
 *
 * Read-only static audit for other hand-maintained stage-classifier sets/arrays
 * across lib/eva, lib/governance, scripts, and src.
 *
 * Hard cut-off: if N>2 findings (excluding the just-removed DECISION_CREATING_STAGES
 * + the new FALLBACK_DECISION_CREATING_STAGES) OR any cross-repo (EHG UI) finding,
 * defer all refactors to a follow-up SD and record the SD key in sd_metadata.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOTS = ['lib/eva', 'lib/governance', 'scripts', 'src'];
const EXCLUDE_FILE_NAMES = new Set([
  // Our own SD's deliverables — not drift.
  'chairman-decision-watcher.js',
  'chairman-decision-watcher-lookup.test.js',
  'decision-creating-set-parity.test.js',
  '20260513_stage_creates_decision_rpc.sql',
  'audit-stage-classifier-sets.mjs',
  'backfill-chairman-decisions-missing-rows.mjs',
]);

const PATTERNS = [
  // const FOO_STAGES = new Set([3,5,...])
  { re: /new Set\(\[\s*(?:\d+\s*,\s*){2,}\d+\s*,?\s*\]\)/g, label: 'Set-of-stage-numbers' },
  // const FOO_STAGES = [3,5,...]
  { re: /const\s+\w*STAGES\w*\s*=\s*\[\s*(?:\d+\s*,\s*){2,}\d+\s*,?\s*\]/g, label: 'array-of-stage-numbers' },
  // const FOO_STAGES = new Set([...]) with multi-line
  { re: /[A-Z][A-Z0-9_]*STAGES[A-Z0-9_]*\s*=\s*new Set\(\[/g, label: 'stages-set-decl' },
];

const EXCLUDE_DIR_NAMES = new Set(['archive', 'one-off', 'tests', 'node_modules', 'dist', 'build']);

async function walk(dir, repoRoot, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
      if (EXCLUDE_DIR_NAMES.has(e.name)) continue;
      await walk(path.join(dir, e.name), repoRoot, out);
    } else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (!['.js', '.mjs', '.ts', '.tsx', '.jsx', '.cjs'].includes(ext)) continue;
      if (EXCLUDE_FILE_NAMES.has(e.name)) continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(repoRoot, full).replaceAll('\\', '/');
      let content;
      try {
        content = await fs.readFile(full, 'utf8');
      } catch {
        continue;
      }
      for (const { re, label } of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(content))) {
          // Get line number for the match
          const before = content.slice(0, m.index);
          const line = before.split('\n').length;
          // Skip if the match is just a literal `[1, 2, 3]` style array used for
          // non-stage data — heuristic: must be near "stage" keyword in same file
          // OR pattern label is stage-explicit.
          const isStageExplicit = label === 'stages-set-decl' || /stage/i.test(content.slice(Math.max(0, m.index - 80), m.index + 80));
          if (!isStageExplicit) continue;
          out.push({ file: rel, line, snippet: m[0].slice(0, 120), pattern: label });
        }
      }
    }
  }
}

async function main() {
  const repoRoot = process.cwd();
  const findings = [];
  for (const r of ROOTS) {
    await walk(path.join(repoRoot, r), repoRoot, findings);
  }

  // Dedupe by file + line
  const seen = new Set();
  const unique = findings.filter(f => {
    const key = `${f.file}:${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const summary = {
    sd_key: 'SD-LEO-REFAC-GATE-DECISION-CREATION-001',
    audit_ran_at: new Date().toISOString(),
    roots_scanned: ROOTS,
    patterns_count: PATTERNS.length,
    findings_count: unique.length,
    findings: unique,
    cutoff_breached: unique.length > 2,
    fr4_followup_sd: unique.length > 2 ? '<TBD — file new SD>' : null,
    certification: unique.length === 0 ? 'NO_OTHER_DRIFT' : (unique.length <= 2 ? 'WITHIN_TOLERANCE' : 'DEFER_TO_FOLLOWUP'),
  };

  console.log(JSON.stringify(summary, null, 2));

  // Persist to sd_metadata for the SD (best-effort; non-fatal if DB unavailable)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const dotenv = await import('dotenv');
    dotenv.config();
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: cur } = await s
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', 'SD-LEO-REFAC-GATE-DECISION-CREATION-001')
      .single();
    const newMeta = { ...(cur?.metadata || {}), fr4_audit_findings: summary };
    await s
      .from('strategic_directives_v2')
      .update({ metadata: newMeta })
      .eq('sd_key', 'SD-LEO-REFAC-GATE-DECISION-CREATION-001');
    console.error('\n[AUDIT] Persisted fr4_audit_findings to sd_metadata.');
  } catch (err) {
    console.error(`\n[AUDIT] Could not persist to sd_metadata: ${err.message}`);
  }
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
