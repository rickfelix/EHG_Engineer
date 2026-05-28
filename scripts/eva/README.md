# /heal vision evidence scoring — two modes

`scripts/eva/vision-evidence-scorer.js` deterministically scores vision +
architecture documents against the codebase they describe. Two modes:

## Mode 1 — EHG self-scoring (deterministic)

**When:** `args.visionKey` matches `/^VISION-EHG[-_]/i` (default
`VISION-EHG-L1-001`).

**How:** Static rubrics under `scripts/eva/evidence-rubrics/`
(`V01-V11`, `A01-A07`, `T01-T02`) reference EHG codebase paths/exports.
`loadAllRubrics()` returns `Map<dimId, rubric>` and `runRubricChecks()` evaluates
each check at `process.cwd()` (the EHG_Engineer repo root).

No LLM is called. Pure file/AST/DB introspection. Same codebase → same score.

Regression-pinned via `tests/unit/eva/ehg-self-scoring-regression-pin.test.js`:
the fixture `tests/fixtures/ehg-baseline-score.json` captures the per-dim and
total score at the time SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 merged.
Per-dim drift > 2 pts fails the regression pin.

```bash
node scripts/eva/vision-evidence-scorer.js                 # score EHG self
node scripts/eva/vision-evidence-scorer.js --persist       # ...and persist
node scripts/eva/vision-evidence-scorer.js --verbose       # show per-check evidence
LIVE_EHG_SCORE=1 npx vitest run tests/unit/eva/ehg-self-scoring-regression-pin.test.js
# ↑ re-runs the scorer end-to-end and asserts ±2pt baseline match
```

## Mode 2 — Venture scoring (LLM-generated, content-hash cached)

**When:** `args.visionKey` does NOT match the EHG regex (any venture vision-key,
e.g. `VISION-CRONGENIUS-API-L2-001`).

**Why a separate path:** EHG rubrics are HARD-CODED to EHG paths (V01 →
`scripts/modules/auto-proceed/urgency-scorer.js`, etc.). Positional matching
pairs V01 with whatever the venture's first vision dimension happens to be —
but the rubric's checks still assert EHG paths. Result: every venture scored
under EHG rubrics produces meaningless evidence. SD-CRONGENIUS-MAKE-HEAL-VISION-001
shipped a `--target-path` flag so checks RESOLVE against the venture codebase;
this SD closes the SEMANTIC gap by generating rubrics that REFERENCE the
venture codebase from the start.

**How:**
1. Fetch `vision` and `arch` rows (both have a `content_hash` GENERATED STORED
   column, added by migration `20260527_eva_vision_rubric_cache_and_content_hash.sql`).
2. Compute `cacheKey = SHA-256(JSON({vision_key, plan_key, vision_content_hash, plan_content_hash}))`.
3. `getCachedRubrics(supabase, cacheKey)`:
   - HIT → use cached `Map<dimId, rubric>` directly. O(1) DB lookup, no LLM call.
   - MISS → call `generateVentureRubrics({vision, arch, targetPath, retries: 1})`
     which prompts an LLM (`lib/llm/client-factory.js` cascade: Google →
     Anthropic → OpenAI → Ollama) once per dimension. Output is validated via
     `validateRubricStrict()` (≥3 checks, allowed types only, concrete params,
     weights sum to 100 ±2). Persisted via `setCachedRubrics()`.
4. Generated rubrics flow through the same `runRubricChecks(rubric, {targetPath})`
   path as the static EHG rubrics — there is no downstream divergence.

**Cache invalidation:** implicit. When `eva_vision_documents.content` or
`eva_architecture_plans.content` changes, `content_hash` recomputes, the cache
key changes, the next scoring run sees a cache MISS and regenerates.

```bash
# CronGenius example:
node scripts/eva/vision-evidence-scorer.js \
  --vision-key VISION-CRONGENIUS-API-L2-001 \
  --target-path /path/to/CronGenius
# Arch-key auto-derives to ARCH-CRONGENIUS-001 (pass --arch-key to override).
```

**Cost characteristics:**
- 1 LLM call per dimension per cache miss. Typical venture has ~20 dims (≤13
  vision + ≤7 arch) → ~20 calls per fresh generation.
- At medium-tier model pricing (~$0.02/call), one full generation is ~$0.40.
- All subsequent calls (with unchanged content) are O(1) DB lookups.

**Failure mode (TR-6 — refused-silent-fallback):** when no cloud LLM key is
available and no cache row exists, `generateVentureRubrics()` throws with an
explicit remediation hint. It does NOT silently fall back to EHG rubrics —
doing so would produce misleading scores for ventures (the exact bug this
SD fixes).

## Components

| Path | Purpose |
|------|---------|
| `scripts/eva/vision-evidence-scorer.js` | CLI entry; exports `isEhgVisionKey()`, `selectRubricMap()`, `resolveArchKey()`, `deriveArchKeyFromVisionKey()` |
| `scripts/eva/evidence-rubrics/index.js` | `loadAllRubrics()`, `validateRubric()`, `validateRubricStrict()`, `ALLOWED_CHECK_TYPES` |
| `scripts/eva/evidence-rubrics/V01..V11, A01..A07, T01..T02` | Static EHG rubric definitions |
| `scripts/eva/evidence-checks/check-types.js` | The 6 deterministic check-type implementations (factory: `createCheckTypes({targetPath})`) |
| `scripts/eva/evidence-checks/check-runner.js` | `runRubricChecks(rubric, {supabase, targetPath?})` |
| `lib/eva/rubric-generator.js` | `generateVentureRubrics({vision, arch, targetPath, llmClient?, retries?})` (FR-2) |
| `lib/eva/rubric-cache.js` | `computeCacheKey()`, `getCachedRubrics()`, `setCachedRubrics()` (FR-3) |
| `eva_vision_rubric_cache` table | Generated-rubric cache, keyed on `cache_key` SHA-256 hex |

## The 6 deterministic check types (LLM is constrained to these)

| Type | Params | Behavior |
|------|--------|----------|
| `file_exists` | `glob`, optional `minMatches` | Pass when ≥ `minMatches` files match |
| `code_pattern` | `glob`, `pattern` (regex), optional `minMatches` | Pass when ≥ `minMatches` files contain the pattern |
| `anti_pattern` | `glob`, `pattern`, optional `maxMatches` (default 0) | Pass when ≤ `maxMatches` files contain the pattern |
| `export_exists` | `module` (relative path), `exportName` | Dynamic-import the module and check the export |
| `db_row_exists` | `table`, optional `column` + `value` or `filter` | Pass when the Supabase query returns ≥ 1 row |
| `file_count` | `glob`, `minCount` | Pass when match count ≥ `minCount` |

All checks have a 10s timeout; a throwing check scores as `passed: false`.

## Adding new dimensions (EHG)

1. Bump the `extracted_dimensions` array on `eva_vision_documents` /
   `eva_architecture_plans` for `VISION-EHG-L1-001` / `ARCH-EHG-L1-001`.
2. Add a new `V{NN}-name.js` or `A{NN}-name.js` file under
   `scripts/eva/evidence-rubrics/` that exports a rubric matching the schema.
3. Run `node scripts/eva/vision-evidence-scorer.js` to verify scoring; commit
   the updated fixture `tests/fixtures/ehg-baseline-score.json` if the EHG
   total or per-dim scores changed (the regression pin will catch silent drift
   otherwise).

## Adding new dimensions (venture)

You don't. Venture rubrics are generated from the venture's `extracted_dimensions`
JSONB — add or revise dimensions on the venture's vision/arch doc and the next
scoring run will regenerate rubrics for the changed shape (content_hash drives
cache invalidation automatically).
