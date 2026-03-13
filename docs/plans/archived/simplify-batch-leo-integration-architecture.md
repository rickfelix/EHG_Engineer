# Architecture Plan: /simplify and /batch Integration into LEO Protocol

## Stack & Repository Decisions

- **Repository**: EHG_Engineer (same repo — internal protocol tooling)
- **Runtime**: Node.js (ESM) — consistent with existing scripts
- **Database**: Supabase (existing) — new table `batch_operation_log` only
- **No new dependencies** — uses existing Supabase client, dotenv, and simplification engine
- **Command definition**: `.claude/commands/batch.md` (new) + update `.claude/commands/simplify.md` and `.claude/commands/ship.md`

## Legacy Deprecation Plan

### /simplify
- No deprecation needed — the command already exists. Changes are behavioral (optional → enforced).

### Batch Scripts
- **NOT deprecated** — existing scripts remain as the underlying implementations
- /batch dispatcher routes to them; they are not rewritten
- Ad-hoc direct invocation remains possible but discouraged in documentation
- Migration path: update script argument signatures to conform to standard interface where needed (minor refactoring)

### Scripts to Route (in priority order)

| Script | Operation Key | Estimated Refactor |
|--------|--------------|-------------------|
| `batch-accept-all-valid-handoffs.mjs` | `accept-handoffs` | Minimal — already has clean output |
| `batch-accept-pending-handoffs.mjs` | `accept-handoffs --type lead-to-plan` | Minimal — subset of above |
| `eva/batch-rescore-manual-overrides.js` | `rescore --type manual` | Minimal — already has --dry-run |
| `eva/batch-rescore-round1-children.js` | `rescore --type round1` | Minimal — similar pattern |
| `eva/batch-rescore-round2-children.js` | `rescore --type round2` | Minimal — similar pattern |
| `batch-complete-child-sds.js` | `complete-children` | Moderate — hardcoded parent SD |
| `batch-update-handoff-table-refs.cjs` | `update-refs` | Moderate — CJS needs ESM wrapper |
| `batch-test-completed-sds.cjs` | `test-sds` | Moderate — CJS needs ESM wrapper |

## Route & Component Structure

### New Files
```
.claude/commands/batch.md              # /batch command definition (skill)
scripts/batch-dispatcher.mjs           # Main dispatcher (~150-200 LOC)
scripts/batch-operations/              # Operation registry
  index.mjs                            # Operation manifest
  accept-handoffs.mjs                  # Adapter for existing script
  rescore.mjs                          # Adapter for existing scripts
  complete-children.mjs                # Adapter for existing script
database/migrations/YYYYMMDD_batch_operation_log.sql  # Audit table
```

### Modified Files
```
.claude/commands/ship.md               # Step 0.6: optional → enforced
.claude/commands/simplify.md           # Add enforcement mode docs
scripts/hooks/pre-tool-enforce.cjs     # Add /simplify gate before /ship
```

### Dispatcher Architecture
```
/batch <operation> [flags]
    │
    ├── Parse args (operation, --dry-run, --filter, --concurrency)
    ├── Load operation from registry (scripts/batch-operations/index.mjs)
    ├── Validate: require --dry-run on first invocation
    ├── Execute operation
    │   ├── Query phase: Supabase query for items
    │   ├── Preview phase: Show item count + sample
    │   ├── Process phase: Iterate with progress reporting
    │   └── Verify phase: Read-back verification on writes
    ├── Report: success/fail/skip counts
    └── Log: Write to batch_operation_log
```

### Operation Interface Contract
Each operation module must export:
```javascript
export default {
  key: 'accept-handoffs',
  description: 'Accept all valid pending handoffs',
  supportsDryRun: true,
  flags: [
    { name: 'type', description: 'Handoff type filter', values: ['lead-to-plan', 'plan-to-exec', 'all'] }
  ],
  async execute(supabase, { dryRun, filter, concurrency }) {
    // Returns: { total, processed, skipped, failed, details[] }
  }
};
```

## Data Layer

### New Table: `batch_operation_log`
```sql
CREATE TABLE batch_operation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  operator TEXT,                          -- session_id or 'manual'
  total_items INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  details JSONB DEFAULT '[]'::jsonb,      -- per-item results
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for dashboard queries
CREATE INDEX idx_batch_operation_log_operation ON batch_operation_log(operation);
CREATE INDEX idx_batch_operation_log_created ON batch_operation_log(created_at DESC);

-- RLS: service role only (operational commands)
ALTER TABLE batch_operation_log ENABLE ROW LEVEL SECURITY;
```

### Existing Tables Used (Read/Write)
- `sd_phase_handoffs` — handoff acceptance operations
- `strategic_directives_v2` — SD completion operations
- `eva_vision_scores` — rescore operations
- `leo_simplification_rules` — /simplify rules (read-only)

### Write Verification Pattern
```javascript
// After any batch write, verify with read-back
async function verifiedWrite(supabase, table, id, updates) {
  const { error: writeError } = await supabase.from(table).update(updates).eq('id', id);
  if (writeError) return { success: false, error: writeError.message };

  // Read-back verification
  const { data, error: readError } = await supabase.from(table).select('*').eq('id', id).single();
  if (readError || !data) return { success: false, error: 'Write verification failed' };

  // Verify the update applied
  for (const [key, value] of Object.entries(updates)) {
    if (data[key] !== value) return { success: false, error: `Field ${key} not updated` };
  }
  return { success: true };
}
```

## API Surface

### CLI Interface
```bash
# /simplify enforcement (Phase 1)
/simplify                      # Dry-run (unchanged)
/simplify --apply              # Apply (unchanged)
/ship                          # Now runs /simplify automatically before commit
/ship --skip-simplify          # Escape hatch with logging

# /batch command (Phase 2)
/batch accept-handoffs                        # Dry-run preview
/batch accept-handoffs --apply                # Execute
/batch accept-handoffs --type lead-to-plan    # Filtered
/batch rescore --type manual                  # Rescore manual overrides
/batch rescore --type round1                  # Rescore round 1 children
/batch complete-children --parent <sd-key>    # Complete children of orchestrator
/batch test-sds                               # Test completed SDs
/batch --list                                 # Show available operations
```

### RPC Functions
No new RPC functions. Uses existing:
- `accept_phase_handoff(handoff_id_param)` — for batch handoff acceptance
- `release_sd(session_id, sd_id)` — for SD state management

## Implementation Phases

### Phase 1: /simplify Enforcement (SD-A) — ~30-50 LOC changed
1. Update `.claude/commands/ship.md` — remove "optional" from Step 0.6, add `--skip-simplify` escape
2. Update `scripts/hooks/pre-tool-enforce.cjs` — add simplify gate check
3. Update `.claude/commands/simplify.md` — document enforcement mode
4. Test: verify /ship blocks without /simplify, verify --skip-simplify logs bypass

### Phase 2: /batch Dispatcher (SD-B) — ~400-500 LOC new
1. Create `batch_operation_log` migration
2. Build `scripts/batch-dispatcher.mjs` with operation registry pattern
3. Create 3 operation adapters: accept-handoffs, rescore, complete-children
4. Write `.claude/commands/batch.md` command definition
5. Add write-verification pattern
6. Test: dry-run all 3 operations, verify logging, verify no side effects

### Phase 3: /batch Expansion (SD-C, future) — incremental
1. Add remaining operations (update-refs, test-sds)
2. Add `simplify-all` codebase-wide sweep operation
3. Add concurrency control with configurable parallelism
4. Update CLAUDE_EXEC_DIGEST.md with /batch documentation

## Testing Strategy

### /simplify Enforcement (Phase 1)
- **Unit**: Hook correctly blocks /ship without prior /simplify run
- **Unit**: `--skip-simplify` flag logs bypass and proceeds
- **Integration**: Full /ship flow with /simplify enforcement end-to-end

### /batch Dispatcher (Phase 2)
- **Unit**: Dispatcher correctly routes to operation modules
- **Unit**: `--dry-run` enforced on first invocation (no writes)
- **Unit**: Write-verification catches silent Supabase failures
- **Integration**: Each operation adapter produces correct results vs. direct script invocation
- **Safety**: Verify batch_operation_log captures 100% of executions

### Regression
- Existing batch scripts continue to work when invoked directly
- /simplify behavior unchanged when invoked directly (not via /ship)

## Risk Mitigation

### Silent Failure Amplification (Critical)
- **Risk**: Supabase returns empty data on schema errors. Batch amplifies one silent failure into N failures.
- **Mitigation**: Mandatory write-verification (read-back after write) on all batch operations. Fail-fast on first verification failure with partial results logged.

### Race Conditions on Shared State (Medium)
- **Risk**: Parallel batch operations writing to same Supabase tables (e.g., sd_phase_handoffs).
- **Mitigation**: Serial execution only in Phase 1-2. Concurrency control deferred to Phase 3 with advisory locks.

### Operator Confusion (Low)
- **Risk**: Operators don't discover /batch or continue using ad-hoc scripts.
- **Mitigation**: Document in CLAUDE_EXEC_DIGEST.md. Surface in sd:next output when batch-relevant conditions detected.

### /simplify False Positives (Low)
- **Risk**: /simplify suggests changes that break functionality, blocking /ship.
- **Mitigation**: `--skip-simplify` escape hatch with mandatory logging. Only `cleanup` rules enforced by default; `logic` rules remain optional.
