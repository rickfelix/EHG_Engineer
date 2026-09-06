// Lesson-mode captures for SD-...-002-C through the canonical executor (lib/sub-agent-executor -> retro/lesson-capture.js).
process.env.CLAUDE_SESSION_ID = process.env.CLAUDE_SESSION_ID || '85c82b18-0984-4948-bd86-1992cdf5170d';
import { executeSubAgent } from '../lib/sub-agent-executor.js';
const SD = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C';
const common = { mode: 'lesson', phase: 'PLAN_VERIFICATION', sessionId: process.env.CLAUDE_SESSION_ID, target_application: 'EHG_Engineer' };
const lessons = [
  { title: 'Measure the hazard before code: VALIDATION caught the self-generating-key design at LEAD',
    severity: 'medium', tags: ['security','validation','encryption','design'],
    message: 'VALIDATION row b4ed3c2c (LEAD, CONDITIONAL_PASS 90) measured that encryption.cjs would generate its own key when none was present, so a missing host key would silently encrypt with a throwaway key. The module was therefore built refuse-never-generate before any code existed. Measuring a hazard at LEAD is cheaper than discovering it in review or production.',
    root_cause: 'A convenience default (generate a key when absent) reads as a working feature while quietly destroying the security property it exists to protect.',
    prevention: 'For any credential or key path, have VALIDATION measure the absent-input branch at LEAD and require refuse-not-generate semantics in the PRD before EXEC.' },
  { title: 'Unit tests encode the author belief; adversarial review caught expiry and scope semantics the tests had blessed',
    severity: 'high', tags: ['testing','review','oauth','correctness'],
    message: 'Two adversarial review rounds on PR #8346 and two on PR #8351 found real correctness defects that 150 passing unit tests had encoded as beliefs: expires_at meant grant expiry but was written from access-token expiry, the OAuth state compare was not length-safe, and granted scopes were never stored so a partial grant read as healthy. Passing tests proved consistency with the author, not correctness of the semantics.',
    root_cause: 'Tests and code were written by the same seat from the same mental model; the defect was in the model, so tests could not see it.',
    prevention: 'Run an adversarial review round on every credential-handling PR before merge and ask it specifically to attack field semantics (what does this timestamp mean, what does health mean under partial grants), not only code paths.' },
  { title: 'STORIES generator indexes LLM output positionally and misaligns when fewer stories return than FRs',
    severity: 'medium', tags: ['harness','stories','sub-agent','prd'],
    message: 'The STORIES sub-agent maps LLM-returned stories to PRD functional_requirements by array position. When the batch returned fewer stories than FRs, stories were attached to the wrong FR. Logged to harness_backlog as feedback 0710d4c5 during PLAN for this SD; the second STORIES run (3da83d04) was needed to get a usable set.',
    root_cause: 'Positional join between two lists of different lengths with no key.',
    prevention: 'Key stories to FR ids returned by the LLM (or reject the batch when counts differ) instead of joining by index.' },
  { title: 'Sub-agent reports over ~4KB are truncated in the teammate mailbox; write long reports to a file',
    severity: 'low', tags: ['harness','sub-agent','mailbox'],
    message: 'The Explore report for this SD (row 5552dc0f) exceeded the mailbox message size and arrived truncated, so the sub-agent had to write the full report to a file and send the path. Any sub-agent report likely to exceed roughly 4KB must be written to .artifacts and referenced by path.',
    root_cause: 'Teammate message channel has a size cap that is not surfaced to the sender.',
    prevention: 'Sub-agent briefs should instruct: reports over ~4KB go to a file under .artifacts, message carries the path plus a 10-line summary.' },
  { title: 'Child C wrote michael_credentials.key_fingerprint that the child B migration DO $verify$ block does not pin',
    severity: 'medium', tags: ['database','migration','verifier','cross-child'],
    message: 'DATABASE PLAN row f6d68bac (CONDITIONAL_PASS 92) found that the -B migration apply-time DO $verify$ v_columns array pins encrypted_blob but not key_fingerprint, the column child C writes. The condition belongs to child B (chairman-gated migration), not to this SD, so it was recorded as a cross-child action rather than fixed here. Also open: no revoke path exists for the Google grant, carried since the YouTube OAuth module.',
    root_cause: 'The migration verifier list was authored from the -B writer set, before child C added a second writer of the same table.',
    prevention: 'When a later child writes a column created by an earlier child migration, add the column to that migration DO $verify$ v_columns before the migration is applied; track a revoke verb for every OAuth grant as a scope item, not a follow-up.' },
  { title: 'Two PRs with zero DDL kept an OAuth module under the 400 LOC ceiling and reviewable',
    severity: 'low', tags: ['pr-size','process','oauth'],
    message: 'The Google OAuth work was split into PR #8346 (module plus class export, host-key encryption) and PR #8351 (consent CLI, gmail client, route and mount behind requireAuth). Each stayed under the 400 LOC ceiling, each got two adversarial review rounds, and no DDL was needed because the -B migration already created michael_credentials. Total build 11:48Z to 13:55Z on 2026-09-06.',
    root_cause: 'Not a defect: recorded as the pattern that made the deep-tier review (risk 0.86 on both PRs) tractable.',
    prevention: 'For credential modules, split the crypto/token core from the CLI and route surface into separate PRs so each adversarial review reads one concern.' },
];
for (const l of lessons) {
  const r = await executeSubAgent('RETRO', SD, { ...common, ...l });
  console.log('LESSON_RESULT', r.verdict, r.stored_result_id, JSON.stringify(r.findings?.retrospective || r.findings?.lesson || {}).slice(0,200));
}
