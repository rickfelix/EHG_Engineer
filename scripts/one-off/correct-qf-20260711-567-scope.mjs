#!/usr/bin/env node
/**
 * Corrects QF-20260711-567's title/description before escalation.
 *
 * QF-20260711-567 was auto-promoted from retrospective 3fe2f41a-2148-407c-9719-
 * abaa2dee64ed (SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001) BEFORE QF-20260711-253's
 * promote-retro-action-items.mjs fix landed, so its title/description show the
 * "(no text)" placeholder bug for all 3 high-priority action items.
 *
 * Investigation (Explore agent, 2026-07-11) resolved each of the 3 items:
 * 1. "Run the full live smoke test against a real venture" (EXEC) — operational
 *    verification task, not a code change. Folded into the escalated SD's
 *    acceptance criteria rather than a standalone deliverable.
 * 2. "Wire a real Stage 17 entry-point call site for generateArchetypeVariants()/
 *    generateArchetypesForAllScreens()" (EXEC) — CONFIRMED still true: zero live
 *    callers anywhere in the repo (lib/eva/stage-17/archetype-generator.js:58,153),
 *    Stage 17's actual worker (lib/eva/stage-handlers/s17.js) still carries a
 *    stale "GVOS composer is the live path" comment contradicting the retro's
 *    claim these need wiring — a genuine architectural ambiguity requiring
 *    LEAD/PLAN scoping, not an EXEC-level ≤50 LOC quick-fix. This is the item
 *    the escalated SD exists to resolve.
 * 3. "Urgently verify whether refinement.js's live 4-variant writeArtifact() loop
 *    is affected by the same dedup-collision bug" (PLAN) — MOOT: independently
 *    fixed same-day by QF-20260706-090 (commit 13e6deff762), 87 minutes after
 *    the retro flagged it. lib/eva/stage-17/refinement.js:129 already sets
 *    metadata.screenId. Zero stage_17_refined rows exist fleet-wide either way
 *    (the "pick 1 of 4" feature has never run in production, not degraded to 1).
 *
 * Run once: node scripts/one-off/correct-qf-20260711-567-scope.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const title = 'Resolve Stage 17 archetype-generator wiring ambiguity (SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001 retro)';

const description = [
  'Retrospective 3fe2f41a-2148-407c-9719-abaa2dee64ed (SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001)',
  'flagged 3 high-priority action items. This SD scopes only item 2 below; items 1 and 3',
  'were resolved without a code change (see disposition).',
  '',
  '1. [RESOLVED, folded into acceptance criteria — not a separate deliverable] "Run the',
  '   full live smoke test against a real venture" (owner: EXEC) — generateArchetypeVariants()/',
  '   generateArchetypesForAllScreens() were verified via mocked unit tests only. This SD\'s',
  '   own acceptance criteria must include a live smoke run once wiring lands.',
  '',
  '2. [THIS SD] "Wire a real Stage 17 entry-point call site for generateArchetypeVariants()/',
  '   generateArchetypesForAllScreens()" (owner: EXEC). Confirmed via code investigation',
  '   (2026-07-11): both functions (lib/eva/stage-17/archetype-generator.js:58,153) have',
  '   ZERO live callers anywhere in the repo — only their own test file calls them. Stage 17\'s',
  '   actual worker (lib/eva/stage-handlers/s17.js, execute() lines 181-185) calls gvosLock/',
  '   docGen/seedDraftVision only; docGen carries a stale comment "legacy archetype-generator',
  '   invocation removed - GVOS composer is the live path" (from pre-restoration commit',
  '   e0a02f417b5, never updated after this SD restored the file). The canonical Stage-17',
  '   analysisStep dispatcher (lib/eva/stage-templates/analysis-steps/index.js) does not',
  '   register either function either. LEAD/PLAN must resolve: does the GVOS composer already',
  '   supersede the restored archetype-generator (in which case the dead code should be',
  '   removed, not wired), or does the SD\'s original intent require wiring these functions',
  '   into the live Stage 17 flow? DB check: 12 legacy s17_archetypes rows exist (dated',
  '   2026-05-22/25, pre-dating generateArchetypeVariants() by 6 weeks) confirming zero live',
  '   executions of the current implementation to date.',
  '',
  '3. [MOOT — independently resolved, no action needed] "Urgently verify whether',
  '   refinement.js\'s live 4-variant writeArtifact() loop is affected by the same',
  '   dedup-collision bug" (owner: PLAN). Confirmed via code investigation (2026-07-11):',
  '   already fixed same-day by QF-20260706-090 (commit 13e6deff762), 87 minutes after the',
  '   retro flagged it. lib/eva/stage-17/refinement.js:129 already sets metadata.screenId',
  '   on each of its 4 writeArtifact() calls, closing the same is_current dedup-collision',
  '   vulnerability fixed in archetype-generator.js. Zero stage_17_refined rows exist',
  '   fleet-wide either way — the "chairman pick 1 of 4 refined variants" feature has never',
  '   run in production, not degraded to serving 1 variant.',
].join('\n');

const { data, error } = await supabase
  .from('quick_fixes')
  .update({ title, description })
  .eq('id', 'QF-20260711-567')
  .select('id, title')
  .single();

if (error) {
  console.error('UPDATE FAILED:', error.message);
  process.exit(1);
}
console.log('Corrected:', JSON.stringify(data, null, 2));
