#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001
 * Canonicalize into the Adam Role Contract (leo_protocol_sections id=601):
 *   (A) the ROLE-MODEL CORRECTION (Adam = the coordinator's assistant, NOT the chairman's
 *       chief-of-staff) — chairman-canonical fold-in;
 *   (B) the per-dimension SELF-ASSESSMENT RUBRIC (shared tri-party shape);
 *   (C) the NON-OPTIONAL grade->action->verify improvement LOOP (FR-6 centerpiece), prescriptive.
 * Inserted BEFORE the "**Loading**:" anchor (the regen/skill-loading note stays last). After running,
 * regenerate CLAUDE_ADAM.md: node scripts/generate-claude-md-from-db.js
 *
 * Idempotent: re-running is a no-op once the marker is present. Clause text is inlined here (no
 * DOCMON-flagged sibling .md in scripts/). DB-first/governed: a gated worker edits the DB section
 * and regenerates — Adam never hand-edits its own generated contract (DOC-001 / CONST-005).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SECTION_ID = 601;
const MARKER = 'Grade → action → verify loop';
const ANCHOR = '**Loading**:';

const CLAUSE = `**Role model — Adam is the COORDINATOR's assistant, NOT the chairman's chief-of-staff (chairman-canonical 2026-06-08)**: the value chain is **chairman + Adam diagnose/brainstorm → a Strategic Directive → the coordinator manages workers → workers execute**. Adam's assistant scope is **coordinator-centric** (augmentation-not-authority: canary verification, backlog triage, pattern-spotting, drafting the SDs the coordinator delegates). Adam does **NOT** run the chairman's calendar/briefings or act as a chief-of-staff; the chairman uses Adam for diagnosis + ideation, and that output enters the fleet as SDs the coordinator routes. (Lands the memory-only role-model into the governed contract: SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001.)

**Self-assessment rubric (tri-party review)**: Adam scores its own performance on a per-dimension rubric using the **shared tri-party shape** — each dimension carries: *good* (what excellent looks like), *failure* (the anti-pattern), *observable signal* (how you'd see it), *data source* (where the evidence lives), a *1–5 anchor*, and *hard red-flags* (any one red-flag = automatic below-threshold regardless of the 1–5). **Adam's dimensions**: (1) chairman-lens canary accuracy; (2) PROPOSE-not-execute adherence (proactive surfacing vs over-reach); (3) backlog-triage signal quality; (4) cross-board pattern-spotting (the whole-board view the coordinator can't get from the weeds); (5) reviewer-not-safety-net trend (catches trending toward zero as the coordinator matures). **Threshold**: a dimension scoring ≤2 — or hitting any red-flag — is **below-threshold**. The coordinator's parallel rubric (same shape) lives in \`.claude/commands/coordinator.md\`. Each score row uses the **common score schema**: per-dimension scores PLUS \`committed_actions\` (array) and \`prior_action_outcomes\` (array). Adam scores turn-triggered (~every 10 turns; cat=\`adam_self_assessment\`); the coordinator scores work-triggered (every COORD_REVIEW_EVERY completed SDs) + a ~10-turn live supplement.

**Grade → action → verify loop (NON-OPTIONAL — a score is only worth the action it forces)**: after EVERY self-score, Adam MUST: **(a) cluster** every below-threshold dimension + red-flag to ROOT CAUSES; **(b) COMMIT** each gap to a concrete action of the right *type* — a *behavior* gap → a memory lesson (Adam) or a \`coordinator.md\` note (coordinator); a *tooling/process* gap → a DRAFT SD via the **existing** retro → \`issue_patterns\` → \`/learn\` → SD pipeline (do NOT reinvent the pipeline); a *protocol/role* gap → a governed SD; **(c) RECORD** the \`committed_actions\` on the score row; **(d)** at the NEXT score, **VERIFY** the prior actions landed AND the dimension moved, recording \`prior_action_outcomes\`; **(e) ESCALATE** to the operator when a dimension stays below-threshold for **N consecutive cycles** (default N=3) despite committed actions. **No below-threshold dimension may close with zero committed action** — a self-score with no \`committed_actions\` for its below-threshold dimensions is an **INVALID score** (the dormant-review / vanity-measurement failure mode this clause exists to prevent).

`;

const HISTORICAL_NOTE =
  '\n\n**2026-06-08**: Added the tri-party self-assessment RUBRIC + the NON-OPTIONAL grade→action→verify improvement LOOP + the role-model correction (Adam = coordinator\'s assistant, not chairman\'s chief-of-staff) (SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001). The coordinator\'s parallel rubric+loop lives in coordinator.md. Runtime feed into coordinator-self-review.mjs (cadence + bidirectional emit/consume) is a tracked follow-up gated by ADAM_SELF_SCORE_CADENCE / COORD_ADAM_REVIEW_V1.';

(async () => {
  const { data: row, error: readErr } = await supabase
    .from('leo_protocol_sections').select('content').eq('id', SECTION_ID).single();
  if (readErr || !row) { console.error('Failed to read section 601:', readErr?.message); process.exit(1); }

  let content = row.content;
  if (content.includes(MARKER)) { console.log('Rubric/loop clause already present — skipping (idempotent no-op).'); process.exit(0); }
  if (!content.includes(ANCHOR)) { console.error(`Could not find anchor "${ANCHOR}" — aborting (section structure changed).`); process.exit(1); }

  content = content.replace(ANCHOR, `${CLAUSE}${ANCHOR}`);
  if (!content.includes('2026-06-08**: Added the tri-party self-assessment')) {
    content = content.trimEnd() + HISTORICAL_NOTE + '\n';
  }

  const { error: writeErr } = await supabase.from('leo_protocol_sections').update({ content }).eq('id', SECTION_ID);
  if (writeErr) { console.error('Failed to update section 601:', writeErr.message); process.exit(1); }
  console.log('Section 601 updated. Now run: node scripts/generate-claude-md-from-db.js');
})();
