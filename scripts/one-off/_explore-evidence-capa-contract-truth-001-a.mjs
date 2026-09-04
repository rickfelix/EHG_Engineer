/**
 * One-off: write Explore sub-agent evidence for the LEAD-TO-PLAN handoff of
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A.
 *
 * Codebase survey of the surfaces this child must change, run BEFORE PLAN so the PRD is
 * authored against measured reality rather than the ticket's stated premise. It overturned
 * part of that premise: drift DETECTION and its CI enforcement are already built, so the
 * child's real gaps are narrower (no regen-on-write trigger; presence-only, fail-open
 * ratification writer). The SD row was corrected accordingly before this row was written.
 *
 * Every mechanism claim below carries a NAMED VERIFIER and the decisive quoted line, per the
 * gate-evidence provenance rule (chairman-ratified 2026-09-02, ratification 6c263823):
 * evidence without provenance is absent, not weak. Endorsement is not evidence.
 *
 * Uses the canonical writer (storeSubAgentResults) + canonical repo-evidence helper
 * (applySubAgentRepoVerdict) per CLAUDE.md item 11 — no hand-rolled repo_path columns.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A';
const VERIFIER = 'Explore sub-agent (read-and-quote survey of the root tree, .worktrees/ excluded), driven by worker Bravo session e60956f5-67ed-4869-b095-327f08543c92; each claim below verified by reading the cited file at the cited lines and quoting the decisive statement.';

async function main() {
  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  const mechanism_claims = [
    {
      claim: 'Drift DETECTION already refuses: scripts/check-claude-md-drift.cjs exits non-zero on drift. It is NOT advisory.',
      verifier: VERIFIER,
      method: 'Read scripts/check-claude-md-drift.cjs main() and quoted its exit logic.',
      file: 'scripts/check-claude-md-drift.cjs',
      lines: '169-199',
      evidence_quote: "if (!r.drift) { ... process.exit(0); } console.error('DRIFT generated protocol docs are STALE vs leo_protocol_sections.'); ... process.exit(1);  // and process.exit(2) on internal error (documented fail-open, header line 24)",
      verdict: 'ALREADY_BUILT',
      consequence_for_scope: 'Scope must EXTEND this, never reimplement it. Revision 1 of this SD wrongly asserted the drift check needed refuse-while-stale added; corrected before handoff.',
    },
    {
      claim: 'CI enforcement of the CLAUDE_*.md drift check already exists and can fail the build.',
      verifier: VERIFIER,
      method: 'Read .github/workflows/claude-md-drift.yml; searched the file for continue-on-error.',
      file: '.github/workflows/claude-md-drift.yml',
      lines: '71-78',
      evidence_quote: "elif [ \"$code\" -eq 1 ]; then echo '::error::CLAUDE_*.md have drifted...'; exit 1   — no continue-on-error anywhere in the file; exit 2 (infra error) deliberately fail-open (exit 0).",
      verdict: 'ALREADY_BUILT',
      consequence_for_scope: 'DISAMBIGUATION RECORDED: .github/workflows/leo-drift-check.yml is a DIFFERENT, genuinely advisory workflow (continue-on-error: true at lines 70 and 107) checking PRD/handoff filesystem drift, not the CLAUDE_*.md family. Do not treat it as the nearest match for this SD.',
    },
    {
      claim: 'There is NO regen-on-write trigger. Regeneration of the rendered contracts is entirely manual.',
      verifier: VERIFIER,
      method: 'Grepped the root tree for callers of generate-claude-md-from-db.js and inspected every hit.',
      file: 'scripts/generate-claude-md-from-db.js (+ callers)',
      lines: 'n/a — absence claim',
      evidence_quote: 'No automatic caller found. The only CI caller is .github/workflows/leo-kb-refresh.yml, which runs the generator on a DAILY CRON with --refresh-lessons — a schedule, not a write trigger.',
      verdict: 'GAP_CONFIRMED',
      consequence_for_scope: 'This is the primary missing corrective for Child A. Absence was measured, not assumed — a doc claiming absence is as unverified as one claiming existence.',
    },
    {
      claim: 'markRatificationEncoded checks marker PRESENCE only; it never checks whether the rendered file is STALE.',
      verifier: VERIFIER,
      method: 'Read lib/chairman/ratification-writer.mjs markRatificationEncoded and assertMarkerPresentInLiveSection end to end.',
      file: 'lib/chairman/ratification-writer.mjs',
      lines: '39-51, 205-257',
      evidence_quote: "line 51: if (!liveContent.includes(markerText)) { throw new Error('markRatificationEncoded: markerText is not present in the live content of section ...') }  — a substring match against whatever is currently on disk. It never calls computeDrift() or check-claude-md-drift.cjs.",
      verdict: 'GAP_CONFIRMED',
      consequence_for_scope: 'A STALE render whose marker text still happens to appear passes silently today. This is the exact case Success Criterion 3 now requires a test for.',
    },
    {
      claim: 'markRatificationEncoded FAILS OPEN on three separate paths — it returns success when it could not measure.',
      verifier: VERIFIER,
      method: 'Traced each catch/early-return in the marker verification path.',
      file: 'lib/chairman/ratification-writer.mjs',
      lines: '41-43, 46, 48-50',
      evidence_quote: 'Three distinct fail-open exits: catch { return; } on manifest read (41-43), early return on missing section meta (46), and catch { return; } on target-file read (48-50).',
      verdict: 'GAP_CONFIRMED',
      consequence_for_scope: 'Converted into explicit scope item 3 and a per-path test requirement. A guard that returns success when it could not measure is worse than no guard, because it reads as verified.',
    },
    {
      claim: 'A sanctioned worktree-creation path already exists and must be reused rather than hand-rolled.',
      verifier: VERIFIER,
      method: 'Read scripts/session-worktree.js and the library it wraps.',
      file: 'lib/worktree-manager.js (wrapped by scripts/session-worktree.js)',
      lines: 'exports: createWorktree, symlinkNodeModules, cleanupWorktree, cleanupStaleWorktrees, listWorktrees, getRepoRoot',
      evidence_quote: 'scripts/session-worktree.js is a CLI wrapper over lib/worktree-manager.js; usage: npm run session:worktree -- --sd-key <key> --branch <branch>, creating .worktrees/<workType>/<workKey>/.',
      verdict: 'REUSE_TARGET',
      consequence_for_scope: 'Named in scope item 1 so PLAN does not author a hand-rolled worktree path.',
    },
    {
      claim: 'The ENF-17 shared-tree hijack guard cited as the parent plan risk is real, and its invariant supports a worktree-or-refuse design.',
      verifier: VERIFIER,
      method: 'Read scripts/hooks/lib/shared-tree-guard.cjs header and path regex, plus its wiring in pre-tool-enforce.cjs.',
      file: 'scripts/hooks/lib/shared-tree-guard.cjs',
      lines: '1-30',
      evidence_quote: "Header: 'Shared-Tree Hijack Guard (ENF-17 / SD-LEO-FEAT-SHARED-TREE-HIJACK-001)'. Invariant: 'a branch op whose effective directory is inside a .worktrees/<sd>/ subtree ... is always allowed — isolated worktrees cannot hijack the shared host' (22-24), matching WORKTREE_PATH_RE = /[/\\\\]\\.worktrees[/\\\\][^/\\\\]+/i (line 30).",
      verdict: 'CONFIRMED',
      consequence_for_scope: 'Regenerating inside .worktrees/<sd>/ is compatible with the existing guard; regenerating in the shared root is what the guard exists to stop.',
    },
    {
      claim: 'The generator writes a manifest carrying per-section digests, which is what the drift check compares against.',
      verifier: VERIFIER,
      method: 'Read scripts/modules/claude-md-generator/index.js writeManifest() and computeSectionDigests().',
      file: 'scripts/modules/claude-md-generator/index.js',
      lines: '519-543, 569-627',
      evidence_quote: 'writeManifest() writes claude-generation-manifest.json at join(this.baseDir, ...) containing db_snapshot_hash, git_commit, per-file content_hash and section_digests (byId/meta/global). File writes and the manifest write are both skip-on-unchanged, deliberately avoiding churn in the shared root on a no-op regen.',
      verdict: 'CONFIRMED',
      consequence_for_scope: 'The regen-on-write trigger inherits an existing no-op-safe write path, so a triggered regen that changes nothing will not create PR churn.',
    },
  ];

  const results = {
    verdict: 'PASS',
    confidence: 90,
    summary:
      'Surveyed all five surfaces named in the SD; all exist under the cited names. The survey OVERTURNED part of the ticket premise: drift detection (check-claude-md-drift.cjs, exit 1 on drift) and its CI enforcement (claude-md-drift.yml, no continue-on-error) are ALREADY BUILT under SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001, so "add refuse-while-stale to the drift check" would have had PLAN reimplement a working guard. The genuine gaps are narrower: (a) no regen-on-write trigger exists at all — regeneration is 100% manual, the only CI caller being a daily cron; and (b) markRatificationEncoded performs a marker-substring PRESENCE check only, never a staleness check, and fails open on three paths. The SD scope and success criteria were corrected to match these measurements before this evidence row was written.',
    critical_issues: [],
    warnings: [
      {
        severity: 'HIGH',
        issue:
          'Ticket premise vs main disagreed: the SD as decomposed implied the drift check and CI wiring were missing. Both are present and enforcing. Building to the stated premise would have duplicated an existing guard and produced a second representation of one invariant.',
        recommendation:
          'PLAN must author the PRD against scope OUT-OF-SCOPE item 0 (ALREADY BUILT — DO NOT REIMPLEMENT) and extend the existing check rather than introduce a parallel one.',
      },
      {
        severity: 'MEDIUM',
        issue:
          'Two similarly named workflows exist: claude-md-drift.yml (enforcing, correct target) and leo-drift-check.yml (advisory, continue-on-error, unrelated subject). A future reader grepping for "drift" can easily wire work to the wrong one.',
        recommendation: 'PRD should name .github/workflows/claude-md-drift.yml explicitly as the CI surface.',
      },
    ],
    recommendations: [
      'Scope the regen-on-write trigger as the primary corrective; it is the only fully-absent mechanism of the four surfaces surveyed.',
      'Treat the three fail-open paths in ratification-writer.mjs as first-class deliverables with a test each, not as incidental hardening — they are why a stale mark can be recorded as verified.',
      'Reuse lib/worktree-manager.js createWorktree; do not hand-roll worktree creation in the hook.',
    ],
    detailed_analysis: {
      survey_scope: 'Root tree only; .worktrees/ siblings deliberately excluded.',
      surfaces_requested: 5,
      surfaces_found_under_cited_name: 5,
      premise_corrections: 2,
      mechanism_claims,
    },
    metadata: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001',
      verifier: VERIFIER,
      provenance_note:
        'Each mechanism claim carries verifier + file + lines + quoted decisive statement, per the gate-evidence provenance ratification 6c263823.',
    },
  };

  applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

  const stored = await storeSubAgentResults('Explore', SD_KEY, null, results, {
    phase: 'LEAD',
    sdKey: SD_KEY,
  });
  console.log('Stored Explore evidence row:', stored.id, 'verdict:', stored.verdict);
  console.log('mechanism claims recorded:', mechanism_claims.length);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exitCode = 1;
});
