# Stage Pipeline Pre-Approval Playbook

> **Audience:** the operator about to click *Approve* on a stage gate (Stage 18–26, the BUILD-AND-MARKET phase).
> **Purpose:** before promoting Stage N → Stage N+1, run this checklist against Stage N+1 to surface the same class of bugs we hit on Stage 18 *before* the chairman ever sees them.

This document was extracted from the Stage 18 debugging session on 2026-04-28. The session walked from "Generate Copy returns 500" to "real Gemini-generated, persona-targeted, persisted marketing copy" through six commits driven by one repeated discipline: **diagnose, then fix; never fix what's in front of you without grounding in original intent.**

---

## Section 0 — The methodology (use it on every stage)

These six rules are non-negotiable. They surfaced repeatedly during the S18 work.

1. **Vision before symptoms.** Before touching code, read the DB-authoritative migration (`database/migrations/*stage-N*.sql`), the analyzer header (`lib/eva/stage-templates/analysis-steps/stage-N-*.js`), and the SDs that authored or amended this stage (`SELECT * FROM strategic_directives_v2 WHERE sd_key ILIKE '%STAGE-N%' OR scope ILIKE '%stage N%'`). What was this stage *supposed* to do? The fix you'd reach for in 30 seconds is usually wrong because the stage's job isn't what the symptom suggests.

2. **Diagnostic before fix.** When a stage fails opaquely, the first commit is structured logging — not a fix. The fix is the *second* commit, guided by what the new logs reveal. We caught the Gemini timeout cause, the schema mismatch cause, and the persona field-path bug *only* because the first three commits were logging, not fixes.

3. **Verify CAPA claims.** A retrospective or sub-agent saying "all fixed" is a *claim*, not a fact. Run `git log origin/main -- path/to/file.js` and `git show <commit> -- path/to/file.js` to see what actually landed. The Stage 18 work caught **PR #3399 was on main, but our branch was 9 commits behind**, so we observed the broken behavior despite the fix existing. Test claims against the file currently being executed.

4. **Honest failure beats synthetic success.** If the LLM call fails, return HTTP 502 with `code: 'LLM_UNAVAILABLE'`. **Never** return 200 with placeholder content. The marketing-first vision (S18 copy is the binding contract for S19 build) cannot survive `[Fallback]` strings being approved as final copy. This rule applies to every stage that produces artifacts the chairman approves.

5. **Use canonical patterns from the codebase.** When Stage 18 needed to write to `venture_artifacts`, the right pattern was already in `server/routes/ventures.js:177-226` (demote-then-insert with versioning). The route's `upsert(..., { onConflict })` was a fresh attempt that didn't match the schema. Before inventing, grep for *how does the rest of the system do this?*.

6. **Fallback paths are dev-only.** Synthetic content generation (placeholders that confess "[Fallback]" in the body) belongs behind `MOCK_LLM=true` or deleted entirely. Production must throw a typed error and the route must surface it. We deleted `buildFallbackCopy()` for this reason.

---

## Section 1 — Per-stage pre-approval checklist

Apply this list to **Stage N+1** before approving Stage N's promotion gate. Most checks are a quick read or a single query.

### 1.0 Vision & architecture recon

- [ ] **DB-authoritative migration read.** Find `database/migrations/*stage-N*.sql`, `database/migrations/*S18-S26*.sql`, or the lifecycle config migration that defines this stage. Note the upstream artifact types, output artifact types, and gate type (promotion / kill / advisory).
- [ ] **Analyzer header read.** Open `lib/eva/stage-templates/analysis-steps/stage-N-*.js`. The top comment names the SD that authored it. What's the LLM supposed to produce?
- [ ] **Strategic Directives history.** Run `SELECT sd_key, status, scope FROM strategic_directives_v2 WHERE sd_key ILIKE '%STAGE-N%' ORDER BY created_at DESC LIMIT 20`. Skim titles. Which SDs are recent? Which have CAPAs (Corrective Action / Prevention Actions)? Are any "completed" claims worth verifying?
- [ ] **Reality gate boundary.** Does Stage N+1 have a Reality Gate at the (N → N+1) boundary? Check `lib/eva/reality-gates.js`. If yes, what's it asserting?

### 1.1 Honest-failure check

- [ ] **No synthetic-fallback path in the analyzer.** Search the analyzer file for `[Fallback]`, `placeholder`, or any `try/catch` around the LLM call that produces content instead of throwing. If found, gate behind `MOCK_LLM=true` or delete (see S18 commit `71828c8eac`).
- [ ] **Route returns 502 on LLM failure.** Look for `if (err?.code === 'LLM_UNAVAILABLE'` (or analogous) → `return res.status(502).json(...)` in `server/routes/stageN*.js`. If absent, copy the pattern from `server/routes/stage18.js:104-117`.
- [ ] **Frontend handles 502 with an honest banner.** In `ehg/src/components/stages/StageN-*.tsx`, look for a `formatStageNError`-style helper that recognizes `LLM_UNAVAILABLE` / `LLM_INVALID_RESPONSE` codes and renders a chairman-friendly amber banner (not raw "Internal Server Error" text). Reference: `ehg/src/components/stages/Stage18MarketingCopy.tsx` (commit `81aec653` on `fix/SD-MAN-FIX-STAGE-MARKETING-COPY-001-...`).

### 1.2 Real-persistence check

- [ ] **Storage write uses versioned-write pattern.** The canonical reference is `server/routes/ventures.js:177-226`: (a) UPDATE prior `is_current=true` rows → `is_current=false`, (b) SELECT max(version) for next-version computation, (c) INSERT new rows with `is_current=true, version=max+1`. **Do NOT use** `upsert(..., { onConflict: 'venture_id,artifact_type' })` — `venture_artifacts` has no such UNIQUE; it has a partial UNIQUE on `(venture_id, lifecycle_stage, artifact_type, screenId) WHERE is_current=true`.
- [ ] **Column name matches schema.** Run `SELECT * FROM venture_artifacts LIMIT 1` and verify your INSERT/UPDATE keys exist. The S18 trap: `stage_number` is wrong — the column is `lifecycle_stage`. There are also two body columns (`artifact_data` JSONB and `content` TEXT) — different stages use different ones.
- [ ] **Smoke-test persistence.** After clicking Generate, run `SELECT artifact_type, version, is_current, jsonb_typeof(artifact_data) FROM venture_artifacts WHERE venture_id = '<id>' AND lifecycle_stage = N AND is_current = true` to confirm rows landed.

### 1.3 Diagnostic-visibility check

- [ ] **Route logs structured JSON.** Catch block uses `console.error('[stageN-route] X failed', JSON.stringify({step, ventureId, errorName, errorMessage, errorCode, errorCause, providerContext}))`. Reference: `server/routes/stage18.js:108-118`.
- [ ] **Step variable names the failing phase.** Each route handler should have `let step = 'fetchUpstream'` updated through `step = 'analyze'` → `step = 'storeArtifacts'` so the error log tells you exactly where it died.
- [ ] **EVA error handler enrichment in dev.** `lib/middleware/eva-error-handler.js` logs include `req.method`, `req.path`, `err.context` (the route's step), and `err.stack`. Verify present (commit `4964ff4727`).
- [ ] **Provider adapter logs full payload.** Per attempt, `console.error('[GoogleAdapter] attempt N/M failed', JSON.stringify({model, attempt, elapsedMs, errorName, httpStatus, responseHeaders, responseBodyPreview, timeoutMs}))`. Reference: `lib/sub-agents/vetting/provider-adapters.js` (commit `3bf8bf73e1`).

### 1.4 LLM-config check

- [ ] **Default provider is Google Gemini.** Stage N analyzer calls `getLLMClient()` with no provider override unless N === 17 (Anthropic Opus 4.7 reserved for S17 UI variant generation). The cascade is currently selection-priority, not failover-on-failure (deferred).
- [ ] **Long-form content uses 180s timeout + content-generation purpose.** If the stage produces ≥4KB of structured output, the analyzer must call `client.complete(SYSTEM_PROMPT, userPrompt, { purpose: 'content-generation', timeout: 180000 })`. The default 30s is for short validation calls and will hit `AbortController.abort()` mid-Gemini-thinking. Reference: `lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js:251-262` (commit `cf67777f15`).
- [ ] **Model name is current.** `gemini-2.5-pro` is the production stable model as of April 2026; `gemini-2.0-pro` was deprecated Feb 2026. Verify with [Models | Gemini API](https://ai.google.dev/gemini-api/docs/models) if uncertain.

### 1.5 Field-path check (often missed)

- [ ] **Upstream artifact extraction handles real shapes.** Stage 10 outputs `customerPersonas[0].name` (camelCase, plural) — not `personas[0].name`. Each upstream stage may have its own quirks. Verify by `SELECT artifact_data FROM venture_artifacts WHERE artifact_type = 'identity_persona_brand' LIMIT 1` and reading the actual top-level keys.
- [ ] **Persona coverage uses first-name token.** Personalized copy says "Hi Devan," not "Hi Devan the Developer," — match on `personaName.trim().split(/\s+/)[0].toLowerCase()`. Reference: commit `e7cf3b7b76`.

### 1.6 Branch-hygiene check

- [ ] **Working branch is correct.** Product code on a product branch off `origin/main`, NOT on a docs branch like `docs/harness-backlog-*`. Run `git branch --show-current` and `git rev-list --left-right --count origin/main...HEAD`. If the branch is more than ~5 commits behind main, sync first (cherry-pick or fresh feature branch).
- [ ] **Pre-existing main is verified.** `git diff origin/main HEAD -- <stage-files>` to see what's truly your work vs. inherited from main. Don't take credit for fixes already on main; don't blame yourself for bugs already on main.

### 1.7 The pre-Approve smoke

- [ ] **HTTP 200 response.** Click Generate (or the equivalent stage trigger). Frontend network tab should show **200 OK** — not 500, not 502.
- [ ] **DB rows persisted.** Query venture_artifacts as in §1.2.
- [ ] **No fallback markers in body.** `SELECT artifact_data::text FROM venture_artifacts WHERE artifact_type LIKE 'stageN_%' AND is_current = true` and search for `[Fallback]`, `[YOUR `, `[TODO`, `placeholder`. Zero hits required.
- [ ] **Quality metrics non-trivial.** Whatever the stage's output metric is (`personaCoveragePct`, `qualityScore`, etc.) should be > 0 and ideally domain-meaningful.

---

## Section 2 — Patterns reference (copy these)

### 2.1 Versioned-storage write (canonical)

```js
// 1. Demote prior current
const { error: demoteError } = await supabase
  .from('venture_artifacts')
  .update({ is_current: false })
  .eq('venture_id', ventureId)
  .eq('lifecycle_stage', N)
  .in('artifact_type', types)
  .eq('is_current', true);
if (demoteError) return { error: demoteError };

// 2. Compute next version per type
const { data: existing } = await supabase
  .from('venture_artifacts')
  .select('artifact_type, version')
  .eq('venture_id', ventureId)
  .eq('lifecycle_stage', N)
  .in('artifact_type', types);
const maxVer = {};
for (const r of existing || []) {
  if ((r.version || 0) > (maxVer[r.artifact_type] || 0)) maxVer[r.artifact_type] = r.version;
}

// 3. Insert new
const inserts = types.map(t => ({
  venture_id: ventureId,
  artifact_type: t,
  title: titleFor(t),
  lifecycle_stage: N,
  artifact_data: payloadFor(t),
  is_current: true,
  version: (maxVer[t] || 0) + 1,
}));
const { error } = await supabase.from('venture_artifacts').insert(inserts);
return { error };
```

### 2.2 Honest-failure analyzer pattern

```js
const client = getLLMClient();
let response;
try {
  response = await client.complete(SYSTEM_PROMPT, userPrompt, {
    purpose: 'content-generation',
    timeout: 180000,
  });
} catch (err) {
  const llmErr = new Error(`<Stage> generation unavailable: ${err.message}`);
  llmErr.name = 'LlmUnavailableError';
  llmErr.code = 'LLM_UNAVAILABLE';
  llmErr.cause = err;
  llmErr.provider = err.provider;
  llmErr.modelTried = err.model;
  llmErr.attempts = err.attempts;
  llmErr.lastErrorContext = err.lastErrorContext;
  throw llmErr;
}

const parsed = parseJSON(response);
if (!parsed?.tagline /* or whatever the required-field shape is */) {
  const structErr = new Error('LLM returned invalid <stage> structure');
  structErr.name = 'LlmInvalidResponseError';
  structErr.code = 'LLM_INVALID_RESPONSE';
  structErr.responsePreview = String(response).slice(0, 500);
  throw structErr;
}
```

### 2.3 Route 502 mapping

```js
} catch (err) {
  console.error('[stageN-route] X failed', JSON.stringify({
    step, ventureId, errorName: err?.name, errorMessage: err?.message,
    errorCode: err?.code, errorCause: err?.cause?.message,
    providerContext: err?.lastErrorContext,
  }));
  if (err?.stack) console.error('[stageN-route] stack:', err.stack);

  if (err?.code === 'LLM_UNAVAILABLE' || err?.code === 'LLM_INVALID_RESPONSE') {
    return res.status(502).json({
      error: err.message,
      code: err.code,
      provider: err.provider,
      model: err.modelTried,
      attempts: err.attempts,
      ventureId,
      diagnostics: process.env.NODE_ENV !== 'production' ? err.lastErrorContext : undefined,
    });
  }

  err.statusCode = err.statusCode || 500;
  err.context = { step, ventureId };
  throw err;
}
```

### 2.4 Frontend honest-banner pattern

See `ehg/src/components/stages/Stage18MarketingCopy.tsx` for the full reference: `formatStageNError` returning `{message, code, isLlmUnavailable}`, an `errorCode` state, and an amber banner with `data-testid="stageN-error-banner"` + `data-error-code`.

---

## Section 3 — Stage-specific quirks worth recording

As we apply this playbook stage by stage, capture each stage's idiosyncrasies here. Future operators will thank you.

### Stage 17 — UI variant generation
- Provider override: **Anthropic Opus 4.7** (`claude-opus-4-7`) — the only stage that uses Anthropic.
- Reason: design fidelity for HTML/UI generation.
- Reference: `lib/eva/stage-17/archetype-generator.js:684`.

### Stage 18 — Marketing Copy Studio
- 12 upstream artifacts: truth_idea_brief, truth_competitive_analysis, engine_pricing_model, engine_business_model_canvas, identity_persona_brand, identity_brand_guidelines, identity_naming_visual, identity_brand_name, identity_gtm_sales_strategy, blueprint_product_roadmap, blueprint_user_story_pack, blueprint_financial_projection.
- 9 output artifacts: marketing_tagline, marketing_app_store_desc, marketing_landing_hero, marketing_email_welcome, marketing_email_onboarding, marketing_email_reengagement, marketing_social_posts, marketing_seo_meta, marketing_blog_draft.
- Promotion gate, chairman signature required.
- LLM call: 180s timeout, content-generation purpose, no thinking budget.
- Persona path: `customerPersonas[0].name` (camelCase, plural).
- All 6 methodology rules from §0 hit at least once during S18 debugging.

### Stage 19 — Sprint Planning
- **Architectural shape: worker-driven, NOT user-API-driven.** No `/api/stage19/*` route exists. When the chairman approves S18, `lib/agents/venture-state-machine.js:316` calls `executeStage({ stageNumber: 19 })` which invokes `template.analysisStep` (= `analyzeStage19`) and persists output via the centralized `writeArtifact()` service. The frontend (`Stage19SprintPlanning.tsx`) is a pure renderer of `stageData.advisoryData`.
- **Implication for the playbook:** §1.1's "frontend honest banner" check does not apply (no fetch). §1.2's "real persistence" is handled by `lib/eva/artifact-persistence-service.js` (already correct, dedup-by-screenId pattern). The playbook still applies for §1.0 (vision), §1.4 (LLM config), §1.5 (field-path).
- **Errors bubble to `venture-state-machine.js:325-326` which catches with `console.warn` only.** Worker-side honest failure UX (surfacing typed errors to the chairman) is a future improvement; today, an LLM failure means the stage simply doesn't advance and the chairman has to read engineer logs.
- **Upstream dependencies (CROSS_STAGE_DEPS):** stage18Data (build readiness), stage17Data (blueprint review quality scores), stage13Data (roadmap milestones), stage14Data (architecture layers), stage15Data (user stories / wireframes for app-type resolution).
- **Output: sprint plan + SD bridge payloads.** Each sprint item generates an SD draft (title, description, priority, type, scope, success_criteria, dependencies, risks, target_application). Promotion gate, chairman signature required.
- **LLM call:** `client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 180000 })`. Default-routed to Gemini via `getLLMClient({ purpose: 'content-generation' })`. Timeout was 120s pre-fix; bumped to 180s in commit `d5e4c0ba0f` to match S18.
- **Fix history (this session):** commit `d5e4c0ba0f` applied Option A — wrapped `client.complete()` in try/catch → `LlmUnavailableError`; deleted synthetic `[{ title: 'Initial Build Task', ... }]` placeholder; replaced with `LlmInvalidResponseError` throw.

### Stage 20–26 — *(populate as we work them)*
*To be filled in.*

---

## Section 4 — Process notes (LEO Protocol-specific)

### 4.1 Pre-commit hook flake
The `tests/smoke.test.js` file contains 4 Supabase connectivity tests that intermittently fail with `TypeError: fetch failed` despite the database being reachable (verified by `database-agent`). When this happens **on every branch including clean `origin/main`**, the appropriate path is `git commit --no-verify` with a justification line in the commit body referencing this file.

### 4.2 Branch hygiene
LEO protocol allows multiple branch types. Product code (route/analyzer/component fixes) belongs on a feature branch like `fix/<descriptor>` off `origin/main`, NOT on docs branches (`docs/harness-backlog-*`). If you discover product work landed on a docs branch:
1. `git stash push <product files>`.
2. `git checkout -b fix/<descriptor> origin/main`.
3. `git stash pop` and resolve the 3-way merge with main's version.
4. Commit on the new branch.

### 4.3 Sub-agent claim verification
The Explore agent and the database-agent are useful for parallel reconnaissance but their summaries should be treated as **claims to verify**, not facts. When an agent reports "no active issues" or "all fixed by PR #X", run `git log origin/main -- <file>` and `git diff HEAD origin/main -- <file>` to confirm the claim against actual on-disk state.

---

## Document hygiene

- This playbook is a living document. As we work S19–S26, append stage-specific findings to §3 and any new patterns to §2.
- When a check from §1 surfaces an issue we hadn't anticipated, add a new check.
- Cross-reference commits by SHA (not "the recent fix") so future readers can navigate `git log` for context.

*Authored 2026-04-28 from the Stage 18 LLM-honest-failure session. Branches: `fix/stage18-llm-honest-failure` (EHG_Engineer, 7 commits) and `fix/SD-MAN-FIX-STAGE-MARKETING-COPY-001-...` (EHG, +1 commit).*
