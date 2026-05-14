# CONVERGENCE-PROTOCOL.md — /grill voting math, dissent, cost, fixtures

Progressive-disclosure peer of `SKILL.md` (ADR-0012). The skill body stays ≤30 LOC by deferring all detail here.

## Voting Math

Three adversarial agents per question: **Builder** (proposes the answer), **Challenger** (attacks the proposal), **Judiciary** (scores). Sampling is **T=0** to keep the run deterministic; we still take **≥3 samples per agent per round** to expose the rare case where T=0 sampling at the API boundary still produces variation (tokenizer ties, ENS routing).

A round produces 9 samples (3 agents × 3 samples). The round **converges** when ≥2 of 3 agents agree across ≥2 of 3 of their samples on the same canonical answer (whitespace-normalised, case-folded). Worked example:

```
Round 2
  Builder    samples: [A, A, B]        → A wins 2/3
  Challenger samples: [A, A, A]        → A wins 3/3
  Judiciary  samples: [A, B, A]        → A wins 2/3
Convergent: 3/3 agents on A with ≥2/3 majority each → return A as the recommended answer.
```

Rounds cap at 5. If no convergence by round 5, the run records `converged=false` with `dissent[]` populated.

## Dissent Emission

`dissent[]` is a per-sample list grouped by agent, captured **only at run termination** (convergence-failure OR cost-cap). It is the only intermediate-round material the chairman ever sees. Schema:

```
[{ agent: 'Builder', round: 5, sample_index: 0, answer: 'A' },
 { agent: 'Challenger', round: 5, sample_index: 0, answer: 'B' }, …]
```

Mandatory: even if all 9 samples in the final round agree on the same answer, when `converged=false` (e.g. failure detected earlier), the runner still emits `dissent[]` carrying the per-sample raw answers. This prevents chairman false-confidence at T=0 (R6 in the PRD).

## Cost Governor

Budget: **3 samples × 5 rounds × 3 agents = 45 LLM calls** maximum per invocation. The runner counts LLM calls in `total_llm_calls` and writes the count to every artifact.

Early-exit policy: as soon as a round converges, the runner stops and writes the artifact. A round-2 convergence ends at 18 calls. The artifact's `cost_capped` field is `true` only when the run hit 45 calls without convergence; in that case `converged=false` and `dissent[]` carries the partial round samples.

CLI: `--budget-tokens=N` is accepted as a stricter cap (e.g. CI smoke tests use `--budget-tokens=6` for TS-1). When `total_llm_calls` would exceed the cap, the runner stops gracefully, writes the artifact with `cost_capped=true`, and exits 0.

## Fixture Format

`grill_fixtures` rows: `{ fixture_id, question_text, verified_answer, category, expected_to_converge, notes }`. The 20-row seed corpus is the determinism + convergence-rate test bed (TS-3, TS-4). At least 14 of 20 must converge to the `verified_answer` within 5 rounds at T=0 (PRD success criterion 1).

For TS-7 (adversarial non-convergence), at least one seed fixture carries `expected_to_converge=false` and an ambiguous question — used to assert that `dissent[]` is populated, not omitted, when convergence fails.

## Chairman Channel Discipline (TS-5)

When `chairman_channel=true`, the runner suppresses all intermediate-round JSON from stdout. The only stdout payloads are: the final convergence artifact JSON (one block) and optionally a dissent JSON block. CI greps for `round_payload` and expects zero matches.

## RPC + Audit Trail

Every invocation writes a `grill_convergence_artifacts` row whether it converged or not. Append-only — re-running the same question creates a new row. This is the audit trail the chairman queries after a handoff has been bypassed via the `--bypass-grill` quota.
