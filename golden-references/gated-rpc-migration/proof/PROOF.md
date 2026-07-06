# Consumption proof — gated-rpc-migration

**Verdict: PASS** · iterations: **1** (first attempt) · date: 2026-07-06 · session: FABLE-MAX Bravo (4901448b)

## Setup

A live **Sonnet-tier** agent (Claude Code Agent, `model: sonnet`) received ONLY:
`problem-prompt.md`, `migration.sql` (the canonical reference), and
`application-guide.md` — no estate access, no other context.

**Adaptation-forcing fixture task**: build the gated write path for
`escalation_requests` / `submit_escalation_request` with a CHANGED validation
surface — a new `severity` argument (enum CHECK `low|medium|high|critical`,
absent from the reference; changes the RPC signature everywhere it appears,
including every REVOKE/GRANT line) plus `detail` min length 20 (reference used
10) and a different disposition enum. Transcription cannot pass this fixture.

## Judgment (mechanical, not vibes)

The output (`sonnet-applied.sql`, committed verbatim) was judged by the SAME
parameterized lock harness that judges the canonical
(`acceptance-locks.mjs` via `tests/unit/golden-references/gated-rpc-acceptance.test.js`
with `GOLDEN_REF_SQL`/`GOLDEN_REF_ENTITY_MAP`/`GOLDEN_REF_KIND=application`):

- `judgeSql` → `{ ok: true, failed: [] }` — all 12 locks hold (hardened
  search_path, in-function AUTHZ, REVOKE PUBLIC+anon, named-role grants only,
  RAISE validation, CHECKs, RLS, verify-by-read-back, DOWN stanza, staged
  application header).
- Fixture-forced changes all present: new `p_severity` arg + RAISE guard +
  CHECK; `detail` min-20 guard; four-argument signature propagated through all
  four REVOKE/GRANT lines.
- Vitest run: **18/18** under the application entity map.

## One harness amendment (recorded, not hidden)

The agent correctly swapped the `-- REFERENCE ONLY` header for the staged
chairman-gated application header — exactly what the guide's Invariants teach.
The lock set originally demanded the reference header unconditionally; it was
amended to be kind-aware (`reference` vs `application`) BEFORE judgment, because
the judge must not punish compliance with the guide. No guide iteration was
needed; the guide transferred on the first attempt.

## CI determinism

This live run happened once. The committed `sonnet-applied.sql` is the CI
artifact; the acceptance suite re-judges it on every build with zero LLM calls.
