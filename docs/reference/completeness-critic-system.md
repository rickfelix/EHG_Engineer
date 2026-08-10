# Completeness-Critic System

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (Fleet worker Bravo)
**Last Updated**: 2026-08-10
**Tags**: adversarial-critique, gate, invariant-library, semantic-index, coverage

Mechanizes the known half of the chairman's completeness-critic instinct so the human
instinct only fires on the genuinely novel. Chairman-ratified 2026-08-08 (instinct1=A).

## Components

| Component | Where | What it does |
|-----------|-------|--------------|
| PRE_PLAN_ADVERSARIAL_CRITIQUE gate | `scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js` | Verdict-bearing (required, weight 1.0) at LEAD-TO-PLAN. LLM critique + invariant library. BLOCK fails the handoff. |
| Invariant library | `lib/eva/invariant-library.js` | Deterministic known-gap-class checks; runs even when the LLM cannot. Entries admitted ONLY from real caught gaps with citations (loader throws otherwise). |
| LLM critique | `lib/eva/devils-advocate.js` `critiquePlanProposal` | Adversarial LLM pass. Every could-not-run path returns `could_not_check`, never `pass`. |
| Override writer | `scripts/critique-override.js` | The canonical audited escape hatch (see below). |
| Catch-rate monitor | `scripts/critique-catch-rate-monitor.js` | Reports checked-clean vs could-not-check separately, denominators named. `--days N --json`. |
| Semantic indexer | `scripts/semantic-indexer.js` + `.github/workflows/semantic-indexer-cron.yml` | Feeds `codebase_semantic_index` (weekly incremental, Sun 04:17 UTC). Green gates on data-present per directory, not exit-0. |
| Duplicate search | `lib/utils/validation-automation.js` `searchExistingInfrastructure` | The create-path consumer. Similarity tiers are MODEL-CALIBRATED (`SIMILARITY_TIERS`, gemini-embedding-001: floor 0.55 / infra 0.60 / dup 0.75) with a drift warning when the active embedder differs. |

## Operator workflows

### A BLOCK verdict stopped my LEAD-TO-PLAN handoff

The gate persists the findings to `plan_critiques` and prints them. Either fix the plan,
or record an audited override:

```bash
node scripts/critique-override.js <SD-KEY> --by "<who>" --reason "<why>"
```

The override binds to the KIND of findings it excuses (severity + category + invariant id
fingerprint): a re-worded same-kind block stays excused; a new kind of block re-blocks and
needs fresh approval. Overrides downgrade (gate passes at reduced score, override cited) —
they never delete findings. `override_by` is stamped provenance, not authentication.

### The gate reports COULD_NOT_CHECK

The LLM half could not run (missing `OPENAI_API_KEY`, timeout, malformed output). The gate
passes DEGRADED (score 50, loud warning) — never silently — and the invariant library still
ran. Fix the underlying cause; the catch-rate monitor surfaces how often this happens.

### Adding an invariant (the learning loop)

A gap that escaped both the LLM pass and the library and was later caught (retro, incident,
chairman review) is codified in `lib/eva/invariant-library.js` WITH its citation
(`citation.source` + `citation.measured`). That is the only admission path — speculative
rules are rejected at import time. Heuristic text checks cap at `warn`.

## Chairman-gated migrations (state at 2026-08-10: authored, NOT applied)

| Migration | Widens | Until applied |
|-----------|--------|---------------|
| `database/migrations/20260809_semantic_index_entity_type_sql_entities.sql` | `codebase_semantic_index.entity_type` += `table`, `view` | SQL table/view entities are refused per-row (named in the indexer log); JS/TS and SQL `function` entities land normally. |
| `database/migrations/20260810_plan_critiques_could_not_check.sql` | `plan_critiques.overall_severity` += `could_not_check` | Blind-run rows cannot persist; the gate warns loudly and the monitor caveats that `could_not_check=0` is not evidence of no blind runs. |

Each migration file carries its own post-apply VERIFY queries. A migration file is a lead,
never proof of a live object — verify over the pooler after apply.

## Load-bearing invariants (do not regress)

- **Coverage, never completeness**: the critic reports what it checked; `pass` means "no
  findings in the checked dimensions", never "the plan is complete".
- **Blindness is not cleanliness**: could-not-run outcomes are `could_not_check`, persisted
  when the schema allows, and degrade the score — mapping them onto `pass`/`note` makes the
  column lie.
- **The verdict seeds severity**: the gate's combined severity seeds from the LLM's
  `overall_severity`; findings can raise it, never lower it. Off-vocabulary finding
  severities map conservatively to `warn`.
- **Model-calibrated thresholds**: an embedder swap re-scales cosine similarity. The
  indexer refuses incremental skip and the search warns when the active model differs from
  `SIMILARITY_TIERS.calibrated_for` — recalibrate with live probes, then update that record.
- **Import-safe seeder**: `semantic-indexer.js` runs only when executed directly; importing
  it must never start a (destructive full-rebuild) run.
