<!-- Archived from: C:/Users/rickf/.claude/plans/radiant-toasting-kazoo.md -->
<!-- SD Key: SD-LEO-FIX-MULTI-SESSION-SHIP-001 -->
<!-- Archived at: 2026-02-11T15:43:48.791Z -->

# Multi-Session Ship Safety Plan

## Context

With ~4 concurrent Claude Code instances sharing the same repo, the ship process (`/ship`) can cause cross-session branch contamination. During a recent documentation audit, `ShippingExecutor.js` ran `git checkout main && git pull` after merging a PR, which switched the branch out from under other sessions. A hook then auto-merged an unrelated branch (`fix/enable-rls-migration-metadata`), causing our commit to land on the wrong branch. Recovery required manual `git reflog` work.

**Root causes identified:**
1. `ShippingExecutor.js:192` runs `git checkout main && git pull` — this changes the checkout state for ALL sessions sharing the working directory
2. `concurrent-session-worktree.cjs:121` filters by `codebase` only, ignoring branch — sessions on different branches aren't distinguished
3. `updateHeartbeat()` in `session-manager.mjs:318` doesn't update the current branch — stale branch info in DB
4. No branch guard in the ship process itself — no pre-flight check that the branch hasn't been switched by another session
5. No automated recovery tool — manual reflog required

## Plan: 3 Pillars

### Pillar 1: Fix the Ship Process (Prevent Contamination)

**File: `scripts/modules/shipping/ShippingExecutor.js`** (lines 189-199)

Replace the dangerous `git checkout main && git pull` with a safe remote-only fetch:

```javascript
// BEFORE (dangerous - changes working directory for all sessions):
await execAsync(`cd "${this.repoPath}" && git checkout main && git pull origin main`);

// AFTER (safe - updates main ref without touching working directory):
await execAsync(`cd "${this.repoPath}" && git fetch origin main:main`);
```

Also add a branch validation check at the start of `mergePR()`:
- Capture expected branch at PR creation time (store in `this.context.expectedBranch`)
- Before merge, verify `git rev-parse --abbrev-ref HEAD` matches expected branch
- If mismatch detected, abort with clear error message showing current vs expected branch

### Pillar 2: Branch-Aware Session Tracking

#### 2a. Add `current_branch` column to `claude_sessions`

**New migration file: `database/migrations/YYYYMMDD_ship_safety_branch_tracking.sql`**

```sql
-- Add first-class branch column (not buried in JSONB metadata)
ALTER TABLE claude_sessions ADD COLUMN IF NOT EXISTS current_branch TEXT;

-- Create RPC to update branch during heartbeat
CREATE OR REPLACE FUNCTION update_session_heartbeat_with_branch(
  p_session_id TEXT,
  p_branch TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE claude_sessions
  SET heartbeat_at = NOW(),
      updated_at = NOW(),
      current_branch = COALESCE(p_branch, current_branch)
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update v_active_sessions view to include branch
-- (recreate with current_branch column added)
```

#### 2b. Update heartbeat to track branch

**File: `lib/session-manager.mjs`** — `updateHeartbeat()` function (line 318)

- Add `getBranch()` call during heartbeat updates
- Pass current branch to new `update_session_heartbeat_with_branch` RPC
- Fallback: update `current_branch` column directly if RPC unavailable

#### 2c. Fix concurrent session detection

**File: `scripts/hooks/concurrent-session-worktree.cjs`** — `findConcurrentSessions()` (line 116)

- Add branch-awareness: sessions on different branches of the same codebase are NOT concurrent — they're expected multi-instance work
- Only flag as concurrent when sessions share the SAME codebase AND SAME branch (or main)

### Pillar 3: Recovery Tool

**New file: `scripts/git-commit-recovery.js`**

Automated orphaned commit scanner and recovery:
1. Scan `git reflog` for recent commits (last 24h)
2. Cross-reference with known branches — find commits that aren't reachable from any branch
3. For each orphaned commit, show: SHA, message, date, files changed
4. Offer recovery options:
   - Create a new branch from the orphaned commit
   - Cherry-pick onto current branch
   - Show diff for manual review
5. Integrate into ship-preflight.js as optional check

**New npm script:** `npm run git:recover` → `node scripts/git-commit-recovery.js`

## Files to Create

| File | Purpose |
|------|---------|
| `database/migrations/YYYYMMDD_ship_safety_branch_tracking.sql` | Add `current_branch` column, update RPC, update view |
| `scripts/git-commit-recovery.js` | Orphaned commit scanner/recovery CLI |

## Files to Modify

| File | Change |
|------|--------|
| `scripts/modules/shipping/ShippingExecutor.js` | Replace `git checkout main` with `git fetch origin main:main`; add branch validation |
| `lib/session-manager.mjs` | Update `updateHeartbeat()` to include current branch |
| `scripts/hooks/concurrent-session-worktree.cjs` | Add branch filtering to `findConcurrentSessions()` |
| `package.json` | Add `git:recover` npm script |

## Implementation Order

1. **ShippingExecutor.js fix** — Immediate risk mitigation (stops the bleeding)
2. **Migration + session-manager.mjs** — Branch tracking infrastructure
3. **concurrent-session-worktree.cjs** — Smarter concurrent detection
4. **git-commit-recovery.js** — Recovery tool for when things still go wrong

## Verification

1. **ShippingExecutor**: Run a merge from a feature branch, verify working directory stays on feature branch (not switched to main)
2. **Branch tracking**: Start session, switch branches, verify `v_active_sessions` shows updated `current_branch` after next heartbeat (30s)
3. **Concurrent detection**: Start two sessions on different branches of same codebase, verify they're NOT flagged as concurrent; start two on same branch, verify they ARE flagged
4. **Recovery tool**: Create a dangling commit (commit on detached HEAD), run `npm run git:recover`, verify it finds and can recover the commit
