import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const RETRO_ID = 'af093997-5019-4f82-9def-4a88ce8f818f';

const { data: existing, error: fetchErr } = await supabase
  .from('retrospectives')
  .select('key_learnings, what_went_well, what_needs_improvement, action_items, success_patterns, failure_patterns, tags, related_files, related_commits, affected_components')
  .eq('id', RETRO_ID)
  .single();
if (fetchErr) { console.error(fetchErr); process.exit(1); }

const additionalLearnings = [
  {
    learning: "ARCHITECTURAL GOTCHA: stripNonDdl() runs BEFORE object-name extraction and already destroys dollar-quoted function bodies ($$...$$ / $tag$...$tag$) as part of its normal comment/string stripping. Body-content extraction for FR-2 (extractFunctionBodies) had to be added as a SEPARATE pass over the RAW, unstripped migration SQL text -- running it after stripNonDdl() silently returns empty/wrong bodies with no error. Any future extraction feature in this file must check whether stripNonDdl() already consumed the substring it needs before assuming the stripped text is a safe starting point.",
    is_boilerplate: false
  },
  {
    learning: "CROSS-CUTTING-CONSUMER RISK: introducing one new classification status (BODY_MISMATCH) in classifyFiles() silently flowed into THREE unrelated downstream consumers that each independently assumed the existing status vocabulary was closed: (1) summarizeResults()'s gaps array, read by seed-migration-dispositions.mjs Rule A as not-yet-applied -- would have permanently stamped 6 already-applied functions as DEFERRED/blocked-on-chairman-sign-off; (2) a chairman-gated CEREMONY_PENDING relabel condition in the same file; (3) the CHAIRMAN_APPLY_VERIFICATION gate's not-applied filter in gates.js (a completely different file), which uses an EXCLUSION list rather than an inclusion list, so a new status falls INTO the not-applied bucket by default unless explicitly excluded. Lesson: when adding a new status value to a shared classifier, grep every consumer of the array/field it feeds -- exclusion-list filters are the most dangerous pattern because a new value is silently INCLUDED by default, the opposite of what an inclusion list would do.",
    is_boilerplate: false
  },
  {
    learning: "INDEPENDENT SECURITY RE-REVIEW CAUGHT REAL, LOAD-BEARING BUGS -- TWICE: the first SECURITY pass (CONDITIONAL_PASS at 78) found 3 concrete bugs from the single root cause above (1 HIGH, 1 MEDIUM, 1 LOW), all fixed in commit b91f578dc9a and independently re-verified via fresh live measurement (not re-reading the same evidence) in a second SECURITY pass (PASS at 95). That SECOND pass then surfaced a NEW finding (NEW-MED-1: the CHAIRMAN_APPLY_VERIFICATION gate message issue) that had survived the first fix entirely, producing commit d9a030ca574. This is direct evidence that mandatory SECURITY re-review after a fix is not formality/box-checking -- it caught bugs a confident PASS on the first pass would have missed, across two full review cycles.",
    is_boilerplate: false
  },
  {
    learning: "FOLLOW-ON WORK IDENTIFIED, NOT BLOCKING: BODY_MISMATCH classification is now live and correctly excluded from the applied/gap/chairman-gate pipelines, but it has NO disposition or suppression workflow of its own -- 44-47 live functions with genuinely drifted bodies (confirmed via spot-check, e.g. check_gate_weights) are now visible in verification output but there is no way to acknowledge, suppress, or route a BODY_MISMATCH finding to resolution the way APPLIED/DEFERRED/CEREMONY_PENDING already can be. This is a legitimate candidate for a follow-on SD (a disposition workflow for BODY_MISMATCH), explicitly NOT a blocker for this SD -- visibility without actionability is still strictly better than the prior silent false-APPLIED read.",
    is_boilerplate: false
  }
];

const additionalActionItems = [
  {
    action: "File a follow-on SD for a BODY_MISMATCH disposition/suppression workflow: 44-47 live functions currently surface as drifted-body findings with no acknowledge/suppress/route mechanism (unlike APPLIED/DEFERRED/CEREMONY_PENDING). Not blocking -- visibility-only is an improvement over the prior silent false-APPLIED read, but the backlog is not actionable yet.",
    category: 'follow-on-sd',
    is_boilerplate: false
  },
  {
    action: "When adding a new classification/status value to any shared classifier feeding multiple downstream gates or seeders, explicitly audit every consumer for exclusion-list filters (which silently INCLUDE new values by default) before merging -- this was the root cause of all 3 bugs the first SECURITY review found in this SD.",
    category: 'process',
    is_boilerplate: false
  },
  {
    action: "Continue requiring a fresh, independently-measured SECURITY re-review (not a re-read of the same evidence) after any fix to security/gate-relevant classification logic -- this SD is direct evidence it catches real, load-bearing bugs across multiple review cycles, not just the first pass.",
    category: 'process',
    is_boilerplate: false
  }
];

const additionalSuccessPatterns = [
  "Live-verified against the real DB at each stage rather than trusting unit tests alone: found 44 pre-existing BODY_MISMATCH cases on first run, spot-checked one (check_gate_weights) to confirm genuine drift vs. a bug in the new detector.",
  "Second SECURITY re-review re-measured live (seeder dry-run seeded=0 vs a reconstructed pre-fix seeded=6; CEREMONY_PENDING set unchanged at 8; zero body keys across 1682 missing[] entries in a 640KB JSON payload) rather than accepting the fix commit's own claims -- independent re-verification, not re-reading the same transcript.",
  "Root-cause fix: all 3 bugs the first SECURITY review found traced to ONE root cause (BODY_MISMATCH mixed into the shared gaps array) and were fixed together with one structural change (dedicated bodyMismatches array) rather than three point patches."
];

const additionalFailurePatterns = [
  "Initial implementation (commit 1b175452b9c) added a new status value directly into the same gaps array/exclusion-list surfaces that pre-existing downstream consumers (seeder Rule A, CEREMONY_PENDING relabel, CHAIRMAN_APPLY_VERIFICATION gate) already treated as a closed vocabulary meaning not-applied -- caught by SECURITY review, not by the author or by unit tests, because none of the existing tests asserted on the CLOSED-ness of that vocabulary."
];

const updatedKeyLearnings = [...(existing.key_learnings || []), ...additionalLearnings];
const updatedActionItems = [...(existing.action_items || []), ...additionalActionItems];
const updatedSuccessPatterns = [...(existing.success_patterns || []), ...additionalSuccessPatterns];
const updatedFailurePatterns = [...(existing.failure_patterns || []), ...additionalFailurePatterns];
const updatedTags = Array.from(new Set([...(existing.tags || []), 'migration-verification', 'body-mismatch', 'security-re-review', 'cross-cutting-consumer-risk', 'exclusion-list-gotcha']));
const updatedRelatedFiles = Array.from(new Set([...(existing.related_files || []), 'scripts/verify-migration-apply-state.mjs', 'scripts/modules/handoff/executors/lead-final-approval/gates.js', 'scripts/seed-migration-dispositions.mjs']));
const updatedRelatedCommits = Array.from(new Set([...(existing.related_commits || []), '1b175452b9c', 'b91f578dc9a', 'd9a030ca574']));
const updatedAffectedComponents = Array.from(new Set([...(existing.affected_components || []), 'verify-migration-apply-state.mjs', 'CHAIRMAN_APPLY_VERIFICATION gate', 'seed-migration-dispositions.mjs']));

const { data, error } = await supabase
  .from('retrospectives')
  .update({
    key_learnings: updatedKeyLearnings,
    action_items: updatedActionItems,
    success_patterns: updatedSuccessPatterns,
    failure_patterns: updatedFailurePatterns,
    tags: updatedTags,
    related_files: updatedRelatedFiles,
    related_commits: updatedRelatedCommits,
    affected_components: updatedAffectedComponents,
    bugs_found: 3,
    bugs_resolved: 3,
    technical_debt_created: true,
    updated_at: new Date().toISOString()
  })
  .eq('id', RETRO_ID)
  .select('id, quality_score, key_learnings, action_items, bugs_found, bugs_resolved, technical_debt_created')
  .single();
if (error) { console.error(error); process.exit(1); }
console.log('Updated retrospective:', data.id);
console.log('quality_score:', data.quality_score);
console.log('key_learnings count:', data.key_learnings.length);
console.log('action_items count:', data.action_items.length);
console.log('bugs_found:', data.bugs_found, 'bugs_resolved:', data.bugs_resolved, 'technical_debt_created:', data.technical_debt_created);
