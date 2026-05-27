# Child C Scaffold — lifecycle-bridge refusal gate

**Apply this AFTER concurrent session's `SD-LEO-INFRA-FLEET-WIDE-SUB-001` (CAPA-4) merges.** Both SDs touch `lib/eva/lifecycle-sd-bridge.js`; CAPA-4 lands first per the cross-session coordination plan.

**Pre-flight before applying**:
```bash
# Confirm CAPA-4 merged
gh pr list --repo rickfelix/EHG_Engineer --state merged --limit 10 \
  | grep -i "SD-LEO-INFRA-FLEET-WIDE-SUB-001"

# Confirm worktree is on the SD's branch
cd /c/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-UNIFY-VENTURE-NON-001
git branch --show-current  # → feat/SD-LEO-INFRA-UNIFY-VENTURE-NON-001
git merge origin/main --no-edit  # absorb CAPA-4 + any other intervening commits
```

## What ships in Child C

Three things — all in `lib/eva/lifecycle-sd-bridge.js` + one test file:

### 1. `assertVentureVisionReady` helper (top of file, near other helpers)

Insert after the existing `normalizeSprintLabel` helper (around line 154 in the current file). This is a pure helper that takes `(supabase, ventureId, ventureName)` and returns the canonical L2 doc OR throws a structured ServiceError.

```js
/**
 * SD-LEO-INFRA-UNIFY-VENTURE-NON-001 / Child C.1 + C.2
 *
 * Refusal gate: require a chairman-approved L2 vision doc before generating
 * orchestrator + child SDs for a venture. Two distinct ServiceError codes
 * surface the self-service unblock command (per Child D's --seed-from flag).
 *
 * Called at the orchestrator-insert site (around current line 240) and at
 * the per-child-insert site (around current line 355). Lifts the L2 check
 * out of the metadata write — refuse BEFORE any insert runs.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @param {string} ventureName — display name for error messages
 * @returns {Promise<object>} the canonical L2 vision doc row (vision_key, version)
 * @throws {ServiceError} VENTURE_L2_VISION_MISSING | VENTURE_L2_VISION_DRAFT_SEED
 */
async function assertVentureVisionReady(supabase, ventureId, ventureName) {
  if (!ventureId) {
    throw new ServiceError(
      'VENTURE_ID_MISSING',
      'Cannot generate orchestrator: ventureContext.id is null. The bridge requires a resolved venture row.'
    );
  }

  // Look for a canonical active+chairman-approved L2 row
  const { data: canonical } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, version, content, updated_at')
    .eq('venture_id', ventureId)
    .eq('level', 'L2')
    .eq('status', 'active')
    .eq('chairman_approved', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (canonical) return canonical;

  // No canonical — check for a draft_seed (archived stub) to give the differentiated unblock command
  const { data: archived } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, status, updated_at')
    .eq('venture_id', ventureId)
    .eq('level', 'L2')
    .in('status', ['draft_seed'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (archived) {
    throw new ServiceError(
      'VENTURE_L2_VISION_DRAFT_SEED',
      [
        `Venture ${ventureName || ventureId}: archived stub L2 vision found (vision_key=${archived.vision_key}, status=draft_seed).`,
        `No chairman-approved canonical L2 exists. To unblock orchestrator generation:`,
        `  /brainstorm --seed-from=draft_seed --venture ${ventureName || '<name>'}`,
        `After the brainstorm completes, review the generated L2 doc and set chairman_approved=true.`,
      ].join('\n')
    );
  }

  throw new ServiceError(
    'VENTURE_L2_VISION_MISSING',
    [
      `Venture ${ventureName || ventureId}: no L2 vision document found.`,
      `To unblock orchestrator generation, run:`,
      `  /brainstorm --venture ${ventureName || '<name>'}`,
      `After the brainstorm completes, review the generated L2 doc and set chairman_approved=true.`,
    ].join('\n')
  );
}
```

### 2. Call `assertVentureVisionReady` at the orchestrator generation point

In the existing `convertSprintToSDs` (or equivalent — find the function that does the orchestrator insert at current line 260), insert this call IMMEDIATELY after the `try {` block opens (around current line 240):

```js
  try {
    // SD-LEO-INFRA-UNIFY-VENTURE-NON-001 / Child C.1: refuse generation if no canonical L2
    await assertVentureVisionReady(supabase, ventureContext?.id, ventureContext?.name);

    // Generate orchestrator SD key
    const orchestratorKey = await generateSDKey({
      ...
```

This way the refusal fires BEFORE any DB insert — clean fail-fast.

### 3. Tests (NEW file: `tests/unit/eva/lifecycle-sd-bridge-refusal.test.js`)

Three test cases:

```js
import { describe, it, expect, vi } from 'vitest';

describe('lifecycle-sd-bridge: assertVentureVisionReady refusal gate', () => {
  it('throws VENTURE_L2_VISION_MISSING when no L2 exists for the venture', async () => {
    // Mock supabase to return null for both canonical + archived lookups
    // Call convertSprintToSDs with a venture that has no L2
    // Assert ServiceError thrown with code='VENTURE_L2_VISION_MISSING'
    // Assert message contains '/brainstorm --venture <name>'
  });

  it('throws VENTURE_L2_VISION_DRAFT_SEED when only archived stub exists', async () => {
    // Mock supabase to return null for canonical, return a row for draft_seed lookup
    // Assert ServiceError code='VENTURE_L2_VISION_DRAFT_SEED'
    // Assert message contains '/brainstorm --seed-from=draft_seed --venture <name>'
  });

  it('proceeds when a canonical active+chairman_approved L2 exists', async () => {
    // Mock supabase to return a canonical row for the first lookup
    // Assert no error thrown; orchestrator insert proceeds
  });
});
```

## Commit message template

```
feat(SD-LEO-INFRA-UNIFY-VENTURE-NON-001): Child C — lifecycle-bridge refusal gate + self-service unblock ServiceError

Adds assertVentureVisionReady(supabase, ventureId, ventureName) to
lib/eva/lifecycle-sd-bridge.js. Called at the top of convertSprintToSDs
before any orchestrator/child SD insert runs. Refuses with a structured
ServiceError naming the exact self-service unblock command:

- VENTURE_L2_VISION_MISSING → /brainstorm --venture <X>
- VENTURE_L2_VISION_DRAFT_SEED → /brainstorm --seed-from=draft_seed --venture <X>

Closes the 4-child decomposition of the SD; only Phase 0 (chairman runs
/brainstorm --venture CronGenius) remains before CronGenius orchestrator
can pass GATE_VISION_SCORE.

Coordinates with concurrent SD-LEO-INFRA-FLEET-WIDE-SUB-001 (CAPA-4)
which also touches this file in different sections.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## After Child C merges

1. Notify chairman: Children A+B+C+D are complete; Phase 0 (your CronGenius brainstorm) is the last remaining step before CronGenius can proceed.
2. Once chairman runs `/brainstorm --venture CronGenius` and approves the resulting L2:
   - Re-attempt `/leo start SD-CRONGENIUS-LEO-ORCH-SPRINT-SPRINT-2026-001`
   - Should pass GATE_VISION_SCORE at LEAD-TO-PLAN
3. SD-LEO-INFRA-UNIFY-VENTURE-NON-001 can now complete via PLAN-TO-LEAD + LEAD-FINAL-APPROVAL handoffs.

## Why this scaffold isn't itself a shipped PR

`lib/eva/lifecycle-sd-bridge.js` is the file the concurrent session's CAPA-4 also modifies (different sections). To avoid forcing them to rebase against an in-flight PR, we hold the Child C ship until AFTER CAPA-4 merges. The scaffold is a planning artifact for the eventual ship.
