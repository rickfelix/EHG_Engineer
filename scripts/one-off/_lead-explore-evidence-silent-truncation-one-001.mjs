#!/usr/bin/env node
/**
 * One-off: record Explore LEAD-phase evidence for SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001.
 * The Explore sub-agent runs read-only and cannot write to the DB, so its returned triage is
 * recorded here through the canonical writer (CLAUDE.md prologue rule 11).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '4d825dee-12c2-43da-ab32-5b2bb4ae6f36';
const SD_KEY = 'SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 85,
    findings: [
      {
        id: 'F1-population-is-heterogeneous-blanket-sweep-would-break-code',
        severity: 'HIGH',
        summary: "The raw identifier-truncation population does NOT sort into one fix set. Triaged: KIND 1 HAZARD ~50 found / ~43 live after excluding archived duplicates (an existing id shortened for display and re-consumable as input); KIND 2 MINTING 17 sites where randomUUID().slice(0,8) CONSTRUCTS a new short id -- no full value is hidden and 'fixing' these breaks id generation; KIND 3 DERIVED LABEL 9 sites (sim/<8> git branch names, PAT-<cat>-<8> pattern ids) which are keys in their own right. Only KIND 1 is the defect.",
      },
      {
        id: 'F2-NEW-kind-4-git-sha-prefixes-exempt-by-design',
        severity: 'MEDIUM',
        summary: "A FOURTH category the worker's triage did not have: ~19 sites truncate a git commit SHA for display. Structurally these match the hazard definition (a full value exists, shortened for display) BUT git itself resolves an unambiguous short SHA to the correct object, or refuses on ambiguity -- so no guessing occurs and no fabrication is possible. Session/correlation ids have no prefix-resolve support, which is exactly why they fabricate. Recommend the SD name git-SHA prefixes as an explicit exempt-by-design 4th category rather than leaving 19 call sites to be individually re-litigated.",
      },
      {
        id: 'F3-array-cap-false-positives-must-be-excluded-before-counting',
        severity: 'MEDIUM',
        summary: "lib/coordinator/detectors.cjs:71 and :95 do `.map(c => c.session_id).filter(Boolean).slice(0, 10)` -- the slice caps the ARRAY to 10 elements; every session_id inside is full-length and untouched. This is list truncation, not string truncation, and a naive regex over identifier-named variables catches it. Any raw count (the worker's 114, VALIDATION's 153-438 range) includes an unknown number of these and must be filtered before the fix set is sized.",
      },
      {
        id: 'F4-first-fix-target-located-precisely',
        severity: 'HIGH',
        summary: "The literal 'Fleet Identity Roster' is scripts/assign-fleet-identities.cjs (title printed at :643). The truncating call sites are :648, :674, :737 (three roster-row shapes, all `w.session_id.substring(0, 12)` followed by '...') plus sibling diagnostics at :523, :575, :712, :732. NONE of these print the full session_id anywhere in the same output -- this is the exact producer the SD blames for the coordinator's fabricated-id DISPATCH_TARGET_UNKNOWN.",
      },
      {
        id: 'F5-two-sites-match-the-incident-narrative-beyond-the-named-target',
        severity: 'HIGH',
        summary: "scripts/hooks/session-role-orient.cjs:82 prints `coordinator session=${coordFile.session_id.slice(0,8)}` into the [ROLE] orientation line delivered to EVERY worker at session start, with no full id anywhere in the hook -- a worker addressing the coordinator from that string alone reproduces the printed-success-threaded-to-nothing failure exactly. scripts/coordinator-hourly-review.cjs:326 prints `[<id 8>] correlation=<correlationId 8>` in the Solomon leg of the hourly review and is the most likely literal source of the 'Solomon copied his own diagnostic output into --reply-to' incident; scripts/fleet-dashboard.cjs:2236 is a byte-identical duplicate.",
      },
      {
        id: 'F6-five-kind-1-sites-are-already-compliant-do-not-over-count',
        severity: 'MEDIUM',
        summary: "At least 5 sites already carry the full value alongside the short one and are functionally safe: scripts/coordinator-reply.cjs:53 (short form in the subject line only; buildReplyPayload stamps the FULL correlationId into payload.reply_to and payload.correlation_id, which is what worker-signal.cjs:318 actually matches on), lib/npm-install-lock.cjs:75 (short in body text, full holder_session in the same insert's payload), server/routes/fleet-panel.js:108 (emits session_id FULL; the fleet-ui client renders what the API sends and truncates nothing), scripts/worker-signal.cjs:403 and :571 (print the full correlation_id).",
      },
      {
        id: 'F7-the-working-pattern-is-not-the-SD-literal-prescription',
        severity: 'HIGH',
        summary: "The SD prescribes printing `id=<full> (short: abcd1234)`. NOTHING in the codebase does that verbatim. The pattern that actually works in the compliant sites is different and better: the FULL value goes in the machine-consumed field (payload, DB column, API response) and the short form appears ONLY in a human free-text label that nothing parses. The PRD should adopt the observed working pattern rather than mandating a literal output format, or it will churn ~43 call sites into a shape the codebase has no precedent for.",
      },
      {
        id: 'F8-decomposition-required-with-a-natural-split',
        severity: 'HIGH',
        summary: "Kind 1 alone spans ~43 live sites across ~25 files with materially different call shapes (CLI table renderers, coordination-message bodies, log lines, a session hook) -- too large and too heterogeneous for one PR under the <=100 LOC target. Natural split: (a) the fleet-identity-roster family (assign-fleet-identities.cjs + session-role-orient.cjs -- the two closest to the cited incidents); (b) the scripts/stale-session-sweep.cjs cluster (20 sites, one file, mechanically uniform, one PR); (c) the remaining ~20 scattered single/double-site files, batchable by directory into 2-3 small PRs.",
      },
      {
        id: 'F9-adjacent-real-bug-out-of-scope',
        severity: 'LOW',
        summary: "lib/rca/rca-orchestrator.js:405 and :451 query `.ilike('pattern_id', 'PAT-AUTO-' + fingerprint.slice(0,8) + '%')` then `.limit(1).maybeSingle()`. Two fingerprints sharing an 8-hex prefix would both match the wildcard and the wrong pattern's assigned_sd_id could be picked silently. NOT this SD's defect (nothing is displayed then retyped) but a real collision bug for whoever owns lib/rca/.",
      },
    ],
    metadata: {
      counts: { kind1_hazard_found: 50, kind1_live_after_excluding_archived: 43, kind2_minting: 17, kind3_derived_label: 9, kind4_git_sha_exempt: 19, array_cap_false_positives_confirmed: 2 },
      not_fully_swept: 'Identifier families covered: session_id, correlation_id, sha/commit, uuid/randomUUID, PAT-, sim/, accountUuid8. NOT swept: feedback c.id, qf_id, sd_key, worktree hash, token/key families -- a plausible further ~15-20 kind-1/kind-3 sites.',
      decomposition_verdict: 'REQUIRED — kind 1 alone is ~43 live sites over ~25 files.',
      binding_note: 'Only KIND 1 may be changed. Kinds 2, 3 and 4 must be named as explicit exemptions in the PRD or the next worker greps the raw population and sweeps them.',
    },
    phase: 'LEAD',
    summary: "PASS for LEAD-TO-PLAN, with a hard constraint attached. The Class A population is heterogeneous and a mechanical sweep would BREAK WORKING CODE: only ~43 live sites are the genuine hazard, while 17 are id MINTING (randomUUID().slice — no full value hidden), 9 are deliberate derived labels (sim/<8>, PAT-<cat>-<8>), and a NEW fourth category of ~19 git-SHA prefixes is exempt-by-design because git resolves an unambiguous short SHA correctly or refuses — session ids have no such prefix-resolve, which is precisely why they fabricate. Array-cap false positives (detectors.cjs:71,95 slice the ARRAY not the id) must also be filtered before any count is trusted. First fix target located exactly: scripts/assign-fleet-identities.cjs :648/:674/:737 (+ :523/:575/:712/:732), the literal Fleet Identity Roster. Two further sites match the incident narrative directly and belong in the first child: session-role-orient.cjs:82 (ships a truncated coordinator session id to EVERY worker at startup) and coordinator-hourly-review.cjs:326 (the likely literal source of the copied correlation prefix). Finally, the SD's literal prescription id=<full> (short: abcd1234) has NO precedent in the codebase; the pattern that demonstrably works in 5 already-compliant sites is full value in the machine-consumed field, short form only in an unparsed human label — the PRD should adopt that instead.",
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore (read-only triage sub-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('Explore result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
