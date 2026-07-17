# Generate docs/strategy/LEO-ROADMAP.md as a committed projection of the DB roadmap-of-record

## Type
infrastructure

## Target Repos
EHG_Engineer

## Summary
Solomon chairman-directed question 2026-07-16 (ledger 9f7ae629): the ratified plan-of-record artifact `docs/strategy/LEO-ROADMAP.md` (named in the chairman briefing, ratified 2026-07-16, governance SD-LEO-ORCH-ADAM-PLAN-KEEPER-001) does NOT exist in the repo — `git log --all` shows no branch ever contained it and `docs/strategy/` is absent on origin/main. The roadmap DB (roadmap_id 3aa2f3e2, `roadmap_waves`, 6 approved waves) IS live and canonical. Plan-keeper resolution (Adam): the DB stays the SOLE source of truth (database-first), and a committed `.md` is a GENERATED PROJECTION for in-repo readability + durability — exactly the CLAUDE.md-from-DB pattern (`scripts/generate-claude-md-from-db.js`). This closes the "ratified plan lives nowhere readable" concern without a second writable source.

## Functional Requirements
### FR-1: Generator script (DB → md projection)
Add a generator (e.g. `scripts/generate-leo-roadmap-md.js`) that reads roadmap_id 3aa2f3e2 + `roadmap_waves` (sequence_rank, title, status, progress_pct, time_horizon, okr linkage, item/promoted counts) and renders `docs/strategy/LEO-ROADMAP.md` with a "GENERATED — do not hand-edit; source is the DB" header + a snapshot hash + generated-at (pass timestamp in; do not embed nondeterministic clock in a way that churns the file every run — regenerate-on-change semantics like the CLAUDE.md generator).
### FR-2: Commit the first projection
Run it and commit the initial `docs/strategy/LEO-ROADMAP.md` so the ratified plan-of-record is durably readable in-repo.
### FR-3: Single-writer invariant honored
The generated .md is READ-ONLY/projection — never a second source. Note the DB-canonical rule in the header. Relates SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-WRITER-001 (the DB roadmap is the single writer; this only projects it).

## Success Metrics
- metric: ratified roadmap readable in-repo without DB access; target: yes (committed projection)
- metric: second writable roadmap source introduced; target: no (projection only)
- metric: file churn on no-op regeneration; target: none (regenerate-on-change)

## Smoke Test Steps
1. instruction: Run the generator twice with no DB change; expected_outcome: identical output, no spurious diff.
2. instruction: Change a wave's progress_pct in the DB and regenerate; expected_outcome: the .md reflects it with an updated snapshot hash.

## Sizing / Notes
Tier 1-2 QF (mirror scripts/generate-claude-md-from-db.js). SOURCE-AND-GO. Answers a 24h chairman-directed question (ledger 9f7ae629) + honors evidence-durability without violating database-first. Plan-keeper (SD-LEO-ORCH-ADAM-PLAN-KEEPER-001) hygiene.
