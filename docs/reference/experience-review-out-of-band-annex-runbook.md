# Experience-review out-of-band annex runbook

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (FR-5, Unit C)
**Last Updated**: 2026-08-28
**Tags**: stage-20, experience-review, design-agent, annex

## When to use this

The chairman's timing condition: **if the Stage-20 experience-design review capability
lands safely before a venture reaches Stage 20, it runs inline as part of the normal
traversal. If the venture reaches Stage 20 first, do NOT delay the venture** — run the
review out-of-band instead and attach the result as an advisory annex.

This runbook is that fallback path. It uses the exact same adapter and persistence
code as the in-traversal path — the only difference is `--run-mode out_of_band_annex`
on the persistence step, which tags the findings without touching the venture's live
Stage-20 verdict, gating, or any Stage-23 surface.

## Preconditions

- The venture has already passed (or is currently at/past) Stage 20.
- You have the venture's `venture_id` and its live deployment URL.

## Steps

1. **Gather context** (read-only; fetches Stage-15 artifacts, prints a review prompt):

   ```bash
   node scripts/experience-review/gather-context.mjs \
     --venture-id <VENTURE_ID> \
     --deployment-url <LIVE_DEPLOYMENT_URL> \
     --venture-name "<Venture Name>"
   ```

   If Stage-15 artifacts are missing, the printed prompt instructs the reviewer to mark
   dependent findings INCONCLUSIVE rather than fabricate journey/wireframe structure.

2. **Perform the review.** A Claude Code session reads the printed prompt (scan → rank,
   no fix step — see `~/.claude/skills/ehg-redesign-skill/SKILL.md` for the rubric this
   is derived from) and produces a JSON array of findings: `{ category, severity, title,
   detail, evidence_pointer }`, `category` one of `usability` / `accessibility` /
   `journey_coherence`. Save it to a file, e.g. `findings.json`.

3. **Persist as an out-of-band annex:**

   ```bash
   node scripts/experience-review/record-review.mjs \
     --venture-id <VENTURE_ID> \
     --run-id "annex-$(date -u +%Y%m%dT%H%M%SZ)" \
     --content @findings.json \
     --run-mode out_of_band_annex \
     --deployment-url <LIVE_DEPLOYMENT_URL>
   ```

   `--run-id` must be unique per run (the write is idempotent on `(venture_id, run_id)`
   — reusing an id upserts the same row rather than duplicating).

4. **Verify nothing live was touched** (this IS the guarantee this runbook exists to
   provide, not an optional check):

   ```bash
   git diff --stat -- '**/stage-23*'   # expect: no output
   ```

   The venture's `strategic_directives_v2` / Stage-20 verdict / Stage-24 decision-record
   are all untouched by this runbook — `record-review.mjs` only ever writes to
   `venture_quality_findings` (via the existing writer, unchanged from the in-traversal
   path) and `venture_experience_review_runs`.

5. **Point Solomon at the run** for his chairman report: `venture_experience_review_runs`
   is queryable directly by `venture_id`; the annex row's `run_mode='out_of_band_annex'`
   distinguishes it from an in-traversal run in the same query.

## Dry-run verification (what a test run must confirm)

A dry run against a disposable test venture must show:

- Findings persisted with `run_mode='out_of_band_annex'` in
  `venture_experience_review_runs` and in each finding's provenance.
- Zero diffs under any `stage-23` file path.
- No claim, lock, or write against the venture's stage-progression state (no call to
  `advanceStage` or any Stage-20/24 gate function — the annex path never imports them).
- The venture's existing Stage-20 verdict (if any) is byte-identical before and after.

`persistExperienceReview()` (`lib/eva/experience-review/persist.js`) is covered by
`tests/unit/eva/experience-review/persist.test.js`, including an explicit
`run_mode='out_of_band_annex'` case — that test IS the dry-run verification for the
persistence half of this runbook; steps 1-2 above (context + review) have no
side effects to verify (read-only fetch, prompt printed to stdout).
