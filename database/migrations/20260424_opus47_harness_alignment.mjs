#!/usr/bin/env node
/**
 * Migration: Opus 4.7 Harness Alignment — Module A hedge audit
 * SD: SD-LEO-FIX-PLAN-OPUS-HARNESS-001
 * Date: 2026-04-24
 *
 * Targets 3 leo_protocol_sections rows (id=209 session_prologue,
 * id=276 lead_operations, id=291 plan_multi_perspective). Each
 * replacement is surgical (exact-match) and the script throws
 * with a before/after hash pair if any find-string is absent.
 *
 * Run:
 *   node database/migrations/20260424_opus47_harness_alignment.mjs        (apply)
 *   node database/migrations/20260424_opus47_harness_alignment.mjs --dry  (preview)
 *
 * Idempotent: re-running after apply is a no-op because the new
 * strings no longer match the old ones.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry');

const A1_FIND = '1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate varies by SD type (60-90%, typically 85%)';
const A1_REPLACE = '1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate: 85%. SD-type overrides (60-90% range) require documented justification per CLAUDE_LEAD.md.';

const A2_FIND = `2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
> Why: Sub-agents run formal, database-backed gate checks stored in \`sub_agent_execution_results\`. Handoff gates query this table — without sub-agent runs, gates block regardless of actual code quality.`;
const A2_REPLACE = `2. **Sub-agent evidence required at every handoff** - Invoke required agents via the Task tool before running \`handoff.js execute\`. Each agent writes to \`sub_agent_execution_results\`; handoff blocks with \`SUBAGENT_EVIDENCE_MISSING\` if no fresh row exists for the current phase. Manual DB checks are not evidence.
> Why: Gates query \`sub_agent_execution_results\` for formal, database-backed validation. Opus 4.7 defaults to fewer sub-agent spawns — this rule makes invocation a hard requirement, not a best practice. Prompt-level "should use sub-agents" is not enforceable; the row is.`;

const A3_FIND = '5. **Small PRs** - ≤100 LOC ideal; up to 400 LOC with justification per tiered PR Size Guidelines';
const A3_REPLACE = '5. **Small PRs** - ≤100 LOC target. Exceed only with documented justification (max 400 LOC) per tiered PR Size Guidelines.';

const A4_FIND = 'Consider using /quick-fix to reduce overhead.';
const A4_REPLACE = 'Use /quick-fix to reduce overhead.';

const A5_FIND = 'Before creating a PRD, consider launching multiple `Plan` agents to explore different approaches:';
const A5_REPLACE = 'Before creating a PRD, launch `Plan` agents to explore different approaches when the criteria below apply. Skip only for trivial bug fixes, typo changes, or single-approach tasks where the design is unambiguous:';

// B1: auto_proceed_router section (id=567) — replace the inlined pause-points
// block with a pointer to the new "Canonical Pause Points — THE ONLY REASONS TO
// STOP" block emitted at the top of CLAUDE.md by generateRouter().
const B1_FIND = `**Canonical Pause Points** (applies to AUTO-PROCEED, Continue Autonomously, and Orchestrator STOP):
1. **Orchestrator completion** — after all children complete, pause for /learn review (only when Chaining is OFF; see SD Continuation Truth Table)
2. **Blocking error requiring human decision** — e.g., merge conflicts, ambiguous requirements escalated from EXEC
3. **Test failures after 2 retry attempts** — auto-retry exhausted, RCA sub-agent invoked before pause
4. **All children blocked** — no ready work remains, human decision required
5. **Critical security or data-loss scenario** — includes DB/code status mismatch (code shipped but DB shows incomplete)

**NOT pause triggers**: scope size, "substantial" upcoming work, decomposition into children, PRD creation, large refactors, phase boundaries, or any "warrants confirmation" rationalization. If your reason is not on the five-point list above, KEEP WORKING. Asking "want me to continue or pause here?" at a phase transition is a protocol violation.
> Why: Confirmation-fishing is the most common AUTO-PROCEED failure mode. Naming it explicitly as a violation prevents the LLM from treating asking as a safe default when uncertain.`;
const B1_REPLACE = `**Canonical Pause Points**: see the enumerated list near the top of this file (section "Canonical Pause Points — THE ONLY REASONS TO STOP"). Those five points are the complete set; all other transitions continue under AUTO-PROCEED.`;

const PLANS = [
  { id: 209, label: 'session_prologue', replacements: [
    { key: 'A1', find: A1_FIND, replace: A1_REPLACE },
    { key: 'A2', find: A2_FIND, replace: A2_REPLACE },
    { key: 'A3', find: A3_FIND, replace: A3_REPLACE },
  ]},
  { id: 276, label: 'lead_operations',  replacements: [
    { key: 'A4', find: A4_FIND, replace: A4_REPLACE },
  ]},
  { id: 291, label: 'plan_multi_perspective', replacements: [
    { key: 'A5', find: A5_FIND, replace: A5_REPLACE },
  ]},
  { id: 567, label: 'auto_proceed_router', replacements: [
    { key: 'B1', find: B1_FIND, replace: B1_REPLACE },
  ]},
];

const sha8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

async function main() {
  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log(`[migration:opus47] mode=${DRY_RUN ? 'DRY' : 'APPLY'} date=2026-04-24`);

  let applied = 0, skipped = 0, failed = 0;

  for (const plan of PLANS) {
    const { data: row, error } = await s.from('leo_protocol_sections').select('id, title, content').eq('id', plan.id).single();
    if (error || !row) {
      console.error(`[${plan.label} id=${plan.id}] FETCH FAILED:`, error?.message || 'not found');
      failed++;
      continue;
    }

    const before = row.content;
    const beforeHash = sha8(before);
    let content = before;
    const applyLog = [];

    for (const r of plan.replacements) {
      if (content.includes(r.find)) {
        content = content.replace(r.find, r.replace);
        applyLog.push({ key: r.key, action: 'APPLIED' });
      } else if (content.includes(r.replace)) {
        applyLog.push({ key: r.key, action: 'ALREADY_MIGRATED' });
      } else {
        applyLog.push({ key: r.key, action: 'NOT_FOUND' });
      }
    }

    const afterHash = sha8(content);
    const notFound = applyLog.filter(l => l.action === 'NOT_FOUND');
    if (notFound.length > 0) {
      console.error(`[${plan.label} id=${plan.id}] MISSING SOURCE STRINGS:`, notFound.map(l => l.key).join(', '));
      console.error(`  before hash: ${beforeHash}`);
      failed++;
      continue;
    }

    const anyApplied = applyLog.some(l => l.action === 'APPLIED');
    console.log(`[${plan.label} id=${plan.id}] ${beforeHash} -> ${afterHash}`);
    for (const l of applyLog) console.log(`  ${l.key}: ${l.action}`);

    if (!anyApplied) { skipped++; continue; }

    if (DRY_RUN) {
      console.log('  (dry) would UPDATE leo_protocol_sections');
      applied++;
      continue;
    }

    const { error: uerr } = await s.from('leo_protocol_sections').update({ content }).eq('id', plan.id);
    if (uerr) {
      console.error(`  UPDATE FAILED:`, uerr.message);
      failed++;
    } else {
      console.log(`  UPDATE OK`);
      applied++;
    }
  }

  console.log(`\n[migration:opus47] summary — applied=${applied} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
