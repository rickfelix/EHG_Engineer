
## Table of Contents

- [Diagnostic Flow](#diagnostic-flow)
- [Gate Failures](#gate-failures)
  - [Reality Gate](#reality-gate)
  - [Kill Gate](#kill-gate)
  - [Promotion Gate](#promotion-gate)
- [Template Errors](#template-errors)
  - [Template Not Found](#template-not-found)
  - [Invalid Template](#invalid-template)
- [Database Errors](#database-errors)
  - [RLS Policy Blocking](#rls-policy-blocking)
  - [Idempotency Conflict](#idempotency-conflict)
  - [Connection Failure](#connection-failure)
- [LLM Errors](#llm-errors)
  - [JSON Parse Failure](#json-parse-failure)
  - [Token Budget Exceeded](#token-budget-exceeded)
  - [API Timeout](#api-timeout)
- [State Machine Errors](#state-machine-errors)
  - [State Transition Rejected](#state-transition-rejected)
  - [Invalid Transition](#invalid-transition)
- [Devil's Advocate Failures](#devils-advocate-failures)
  - [OPENAI_API_KEY Not Set](#openai_api_key-not-set)
  - [GPT-4o API Error](#gpt-4o-api-error)
- [Bridge Errors](#bridge-errors)
  - [Duplicate Orchestrator](#duplicate-orchestrator)
  - [Invalid SD Type Mapping](#invalid-sd-type-mapping)
- [General Debugging Tools](#general-debugging-tools)
  - [Event Log Query](#event-log-query)
  - [Artifact Inspection](#artifact-inspection)
  - [Transition History](#transition-history)
- [Escalation Path](#escalation-path)
- [Related Documentation](#related-documentation)

---
Category: Guide
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, guide]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001]
---

# Troubleshooting Guide

This guide catalogs common issues encountered when running the Eva Orchestrator
CLI Venture Lifecycle system, with root causes and resolution steps.

## Diagnostic Flow

When an issue occurs, follow this decision tree to find the relevant section:

```
Issue Encountered
    |
    +-- Is it a gate failure?
    |     |
    |     +-- Reality gate → Section: Gate Failures > Reality Gate
    |     +-- Kill gate → Section: Gate Failures > Kill Gate
    |     +-- Promotion gate → Section: Gate Failures > Promotion Gate
    |
    +-- Is it a template error?
    |     |
    |     +-- Template not found → Section: Template Errors > Not Found
    |     +-- Invalid template → Section: Template Errors > Invalid Template
    |
    +-- Is it a database error?
    |     |
    |     +-- RLS policy → Section: Database Errors > RLS Policy
    |     +-- Idempotency conflict → Section: Database Errors > Idempotency
    |     +-- Connection failure → Section: Database Errors > Connection
    |
    +-- Is it an LLM error?
    |     |
    |     +-- JSON parse failure → Section: LLM Errors > JSON Parse
    |     +-- Token budget → Section: LLM Errors > Token Budget
    |     +-- Timeout → Section: LLM Errors > Timeout
    |
    +-- Is it a state machine error?
    |     |
    |     +-- Transition rejected → Section: State Machine Errors
    |     +-- Invalid transition → Section: State Machine Errors
    |
    +-- Is it a Devil's Advocate failure?
    |     |
    |     +-- API key missing → Section: Devil's Advocate Failures
    |     +-- GPT-4o error → Section: Devil's Advocate Failures
    |
    +-- Is it a bridge error?
          |
          +-- Duplicate orchestrator → Section: Bridge Errors > Duplicate
          +-- Invalid SD type → Section: Bridge Errors > Type Mapping
```

## Gate Failures

### Reality Gate

**Symptom**: Stage processing halts at a phase boundary with a message indicating
missing artifacts.

**Root Cause**: The reality gate at `lib/eva/gates/reality-gates.js` checks that
all required artifacts exist in the `venture_artifacts` table before allowing
progression past a boundary.

**Diagnosis Steps**:

1. Identify the boundary that failed (check the gate result's `boundary` field)
2. Look up the boundary in `BOUNDARY_CONFIG` within `reality-gates.js`
3. Identify which artifact types are required for that boundary
4. Query `venture_artifacts` for the venture to see which artifacts exist

**Resolution**:

- If artifacts are missing because a stage was skipped: re-run the skipped stage
- If artifacts exist but have wrong `artifact_type`: check the stage template's
  `outputArtifactTypes` for a naming mismatch
- If artifacts exist but have low quality scores: re-run the stage to generate
  a higher-quality version (new version is created, old is retained)

**Prevention**: Ensure all stages within a phase complete before attempting to
cross the phase boundary. The `runMultipleStages()` method handles this
automatically when given a full range.

### Kill Gate

**Symptom**: Stage processing halts with a kill recommendation. The orchestrator
reports a score below the configured threshold.

**Root Cause**: The stage output's quality score fell below the Chairman's
`kill_gate_threshold` preference. The gate is evaluated in
`lib/eva/gates/stage-gates.js`.

**Diagnosis Steps**:

1. Check the stage output's `qualityScore` in the gate result
2. Check the Chairman's `kill_gate_threshold` in `chairman_preferences`
3. Review the stage's LLM output for quality issues
4. Check if the input data to the stage was insufficient

**Resolution Options**:

| Chairman Decision | Action |
|-------------------|--------|
| Persevere | Re-run the stage with updated inputs or adjusted prompt |
| Pivot | Update venture metadata with new direction, re-run stages |
| Terminate | Set venture status to `killed`, stop processing |

- To adjust the threshold: Update `kill_gate_threshold` via
  `ChairmanPreferenceStore.setPreference()`
- To improve the score: Ensure prior stages produced high-quality artifacts
  that feed into the failing stage

**Prevention**: Monitor quality scores across stages. A declining trend often
signals input data issues that compound downstream.

### Promotion Gate

**Symptom**: Phase promotion is blocked because the checklist is incomplete.

**Root Cause**: The promotion gate verifies a list of conditions that must be
true before advancing from one lifecycle phase to the next. The checklist is
defined in Chairman preferences.

**Diagnosis Steps**:

1. Check the promotion gate result for the specific incomplete items
2. Verify each item against the venture's actual state
3. Some items require manual verification (e.g., "founder interview completed")

**Resolution**:

- Complete the missing checklist items
- If an item is not applicable, update the Chairman preferences to remove it
- Use `ChairmanPreferenceStore.setPreference()` to modify the checklist

## Template Errors

### Template Not Found

**Symptom**: `Error: Stage template not found for stage {N}`

**Root Cause**: The stage template registry at `lib/eva/stage-templates/index.js`
cannot locate a module file for the requested stage number.

**Diagnosis Steps**:

1. Verify the file exists: `lib/eva/stage-templates/stage-{NN}.js`
   (zero-padded two-digit number)
2. Verify the file is registered in `lib/eva/stage-templates/index.js`
3. Verify the file uses ES module exports (not CommonJS)

**Resolution**:

- If the file is missing: create it following the template pattern
  (see extending-stages.md)
- If the file exists but is not registered: add it to the registry
  in `lib/eva/stage-templates/index.js`
- If it is a dynamic import issue: check for syntax errors in the
  template file that prevent module loading

### Invalid Template

**Symptom**: `Error: Invalid stage template: missing required export {X}`

**Root Cause**: A stage template file exists but does not export all required
members. Every template must export: `STAGE_METADATA`, `ANALYSIS_PROMPT`,
and `execute`.

**Diagnosis Steps**:

1. Open the template file and verify all three exports exist
2. Run the validation utility:
   `node lib/eva/stage-templates/validation.js --stage {N}`
3. Check for typos in export names (case-sensitive)

**Resolution**:

- Add missing exports to the template file
- Ensure `STAGE_METADATA` has all required fields (see testing-guide.md)
- Ensure `execute` is an async function that returns `{ output, qualityScore }`
- Run validation again to confirm the fix

## Database Errors

### RLS Policy Blocking

**Symptom**: `Error: new row violates row-level security policy`
or empty result sets when data should exist.

**Root Cause**: The Supabase client is using an anon key or a user JWT instead
of the service role key. Eva tables have RLS policies that restrict access.

**Diagnosis Steps**:

1. Check which key is being used to create the Supabase client
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set in `.env`
3. Verify the key is being passed to `createClient()`, not `SUPABASE_ANON_KEY`

**Resolution**:

- Use `SUPABASE_SERVICE_ROLE_KEY` when creating the Supabase client
- The service role key bypasses all RLS policies
- Never use the anon key for Eva Orchestrator operations

**Prevention**: The orchestrator constructor should validate that the db client
has service role permissions before proceeding.

### Idempotency Conflict

**Symptom**: `Error: duplicate key value violates unique constraint`
on `venture_stage_transitions` table.

**Root Cause**: A stage transition with the same `idempotency_key` already
exists. This happens when re-running a stage that was previously completed.

**Diagnosis Steps**:

1. Query `venture_stage_transitions` for the venture and stage number
2. Check if a transition already exists with `transition_type = 'completed'`
3. Verify the orchestrator's idempotency check is running before the insert

**Resolution**:

- If the stage should be re-run: delete the existing transition record,
  then re-process
- If this is a bug: the orchestrator's `processStage()` should detect
  existing transitions and skip. Verify the check-before-insert logic
  in the orchestrator

**Prevention**: Always call `processStage()` which includes idempotency
checks. Do not insert transitions directly.

### Connection Failure

**Symptom**: `FetchError`, `ECONNREFUSED`, or timeout when accessing Supabase.

**Root Cause**: Network connectivity to Supabase is interrupted, or the
Supabase project is paused/unreachable.

**Diagnosis Steps**:

1. Test connectivity: check if `SUPABASE_URL` is reachable
2. Verify `.env` has correct URL (no trailing slash, correct project ID)
3. Check Supabase dashboard for project status
4. If using `SUPABASE_POOLER_URL`, verify pooler is active

**Resolution**:

- If Supabase project is paused: resume it from the dashboard
- If URL is wrong: correct it in `.env`
- If network issue: check firewall, VPN, or proxy settings
- For intermittent failures: the orchestrator retries database operations
  up to 3 times with exponential backoff

## LLM Errors

### JSON Parse Failure

**Symptom**: `SyntaxError: Unexpected token` or
`Error: Failed to parse stage output as JSON`

**Root Cause**: The LLM returned a response that is not valid JSON. Common
causes include markdown formatting around JSON, truncated output, or the
model generating conversational text instead of structured output.

**Diagnosis Steps**:

1. Check the raw LLM response in the error details or event log
2. Look for common issues:
   - JSON wrapped in markdown code fences
   - Trailing text after the JSON object
   - Truncated response (token limit hit)
   - Model returned a refusal or clarification instead of JSON

**Resolution**:

- The orchestrator automatically retries JSON parse failures up to 3 times
- If all retries fail, check the stage template's `ANALYSIS_PROMPT` for
  clear JSON output instructions
- Consider adjusting `temperature` (lower = more deterministic)
- If the model consistently fails, check if `llmTier` is appropriate for
  the complexity of the stage

**Prevention**: Stage templates should include explicit JSON output format
instructions in `ANALYSIS_PROMPT`, including example output shape.

### Token Budget Exceeded

**Symptom**: `Error: Token limit exceeded` or truncated LLM output.

**Root Cause**: The stage's input data plus prompt exceeds the model's
context window, or the output exceeds `maxTokens`.

**Diagnosis Steps**:

1. Check `estimatedTokens` in the stage's `STAGE_METADATA`
2. Estimate the actual token count of the prompt + inputs
3. Check if the model's context window is sufficient

**Resolution**:

- Increase `estimatedTokens` in the stage template's `STAGE_METADATA`
- Reduce input data by summarizing or filtering before passing to the LLM
- If the prompt itself is too long, consider splitting into sub-stages
- Consider using a higher-tier model with a larger context window

### API Timeout

**Symptom**: `Error: Request timed out` or `ETIMEDOUT`.

**Root Cause**: The LLM API did not respond within the configured timeout
period. This is common with long prompts on slower models.

**Diagnosis Steps**:

1. Check if the issue is intermittent or consistent
2. If consistent, the prompt may be too complex for the model tier
3. Check Anthropic/OpenAI status pages for service issues

**Resolution**:

- The orchestrator retries with exponential backoff: 1s, 2s, 4s (3 attempts)
- If all retries fail, consider:
  - Reducing prompt complexity
  - Using a faster model tier (haiku instead of sonnet)
  - Increasing the timeout configuration
- If using local Ollama: check that the model is loaded and GPU is available

## State Machine Errors

### State Transition Rejected

**Symptom**: `Error: Cannot transition venture from stage {X} to stage {Y}`

**Root Cause**: The venture's `current_lifecycle_stage` does not match the
expected "from" stage for the requested transition. This can happen when:

- Multiple sessions try to advance the same venture simultaneously
- A previous stage failed but the venture state was not rolled back
- Manual database modification put the venture in an inconsistent state

**Diagnosis Steps**:

1. Query the venture's `current_lifecycle_stage`
2. Compare with the stage being requested
3. Check `venture_stage_transitions` for the most recent transition
4. Check `eva_events` for error events

**Resolution**:

- If the venture is behind: process the intermediate stages first
- If the venture is ahead: the requested stage may already be done (check artifacts)
- If state is corrupted: update `current_lifecycle_stage` to match the
  last successfully completed stage in `venture_stage_transitions`

### Invalid Transition

**Symptom**: `Error: Stage {Y} depends on stages [{A}, {B}] which are not complete`

**Root Cause**: The requested stage has dependencies (defined in
`lifecycle_stage_config.depends_on`) that have not been completed yet.

**Diagnosis Steps**:

1. Check which stages are listed in `depends_on` for the target stage
2. Query `venture_stage_transitions` for the dependent stages
3. Identify which specific dependency is missing

**Resolution**:

- Process the missing dependency stages first
- Use `runMultipleStages()` which automatically respects dependency ordering
- If a dependency stage is intentionally skipped (e.g., not applicable),
  mark it as skipped in `venture_stage_transitions` with
  `transition_type = 'skipped'`

## Devil's Advocate Failures

### OPENAI_API_KEY Not Set

**Symptom**: Devil's Advocate returns a fallback result. Log message indicates
the API key is not configured.

**Root Cause**: The `OPENAI_API_KEY` environment variable is not set in `.env`.

**Impact**: Non-blocking. The Devil's Advocate is advisory only and does not
prevent stage progression. The fallback result contains a note that the
challenge was not performed.

**Resolution**:

- To enable: add `OPENAI_API_KEY=sk-...` to `.env`
- To suppress the warning: this is expected behavior when the Devil's
  Advocate feature is not desired

### GPT-4o API Error

**Symptom**: Devil's Advocate returns a fallback result with an API error
message. The LLM call to GPT-4o failed.

**Root Cause**: OpenAI API issue (rate limit, service outage, invalid key).

**Impact**: Non-blocking. Same as missing API key - advisory only.

**Diagnosis Steps**:

1. Check the error message in the event log
2. Common errors:
   - `401 Unauthorized`: API key is invalid or expired
   - `429 Rate Limited`: Too many requests
   - `500/503 Server Error`: OpenAI service issue

**Resolution**:

- For auth errors: regenerate the API key
- For rate limits: wait and retry (automatic backoff handles this)
- For server errors: wait for OpenAI to resolve

## Bridge Errors

### Duplicate Orchestrator

**Symptom**: `lifecycle-sd-bridge` reports an existing orchestrator SD for this
venture, or creation fails with a duplicate constraint.

**Root Cause**: Stage 18 has been processed before, and an orchestrator SD already
exists in `strategic_directives_v2` for this venture.

**Diagnosis Steps**:

1. Check the bridge's `findExistingOrchestrator()` result
2. Query `strategic_directives_v2` for SDs linked to this venture
3. Verify the existing orchestrator SD's status

**Resolution**:

- If the existing orchestrator is valid: the bridge correctly skips creation
  (this is idempotent behavior, not an error)
- If the existing orchestrator should be replaced: update its status to
  `cancelled` before re-running stage 18
- If this is unexpected: check the venture metadata for stale SD references

### Invalid SD Type Mapping

**Symptom**: `Error: Cannot map venture task to SD type` or invalid `sd_type`
in created SDs.

**Root Cause**: The bridge's type mapping table does not include a mapping for
the venture task category being processed.

**Diagnosis Steps**:

1. Check the venture task category from the stage 18 output
2. Look up the type mapping in `lifecycle-sd-bridge.js`
3. Verify the mapped SD type is registered in all 13 SD type reference points
   (see MEMORY.md for the complete list)

**Resolution**:

- Add the missing type mapping to the bridge
- If mapping to a new SD type: register the type in all 13 reference points
  before creating SDs (see MEMORY.md section "SD Type Registration Reference Points")

## General Debugging Tools

### Event Log Query

All orchestrator activity is logged to `eva_events`. Query to trace execution:

```
Table: eva_events
Filter: venture_id = {ventureId}
Order: created_at DESC
Fields: event_type, stage_number, payload, created_at
```

Common event types:
- `stage_started`, `stage_completed`, `stage_failed`
- `gate_evaluated`, `gate_passed`, `gate_failed`
- `kill_gate_decision`, `reality_gate_check`
- `filter_applied`, `preference_checked`
- `bridge_triggered`, `sd_created`
- `venture_graduated`, `venture_killed`

### Artifact Inspection

Check stage outputs stored in `venture_artifacts`:

```
Table: venture_artifacts
Filter: venture_id = {ventureId}, stage_number = {N}
Fields: artifact_type, content, quality_score, version, created_at
```

### Transition History

View the complete stage progression:

```
Table: venture_stage_transitions
Filter: venture_id = {ventureId}
Order: created_at ASC
Fields: from_stage, to_stage, transition_type, idempotency_key
```

## Escalation Path

If an issue cannot be resolved using this guide:

1. Invoke the RCA sub-agent for systematic root cause analysis
2. Check `issue_patterns` table for known patterns matching the symptoms
3. Review recent `eva_events` for the venture to trace the failure point
4. Check related documentation in `docs/workflow/cli-venture-lifecycle/`

## Related Documentation

- Developer Setup: `docs/workflow/cli-venture-lifecycle/guides/developer-setup.md`
- Running a Venture: `docs/workflow/cli-venture-lifecycle/guides/running-a-venture.md`
- Testing Guide: `docs/workflow/cli-venture-lifecycle/guides/testing-guide.md`
- Extending Stages: `docs/workflow/cli-venture-lifecycle/guides/extending-stages.md`
