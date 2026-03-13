# Architecture Plan: EVA Intake Redesign — Interactive 3-Dimension Classification

## Stack & Repository Decisions

- **Repository**: EHG_Engineer (backend/tooling)
- **Runtime**: Node.js (ESM modules, consistent with existing EVA scripts)
- **Database**: Supabase (PostgreSQL) — additive columns on existing tables
- **LLM**: Claude Haiku via existing `getLLMClient({ purpose: 'triage' })` routing
- **Interaction**: AskUserQuestion tool (Claude Code native)
- **No new dependencies required** — all needed packages already installed

## Legacy Deprecation Plan

### Deprecate (not remove in Phase 1)
- `eva_idea_categories.venture_tag` / `business_function` classification — replaced by application/aspects/intent
- `evaluation-bridge.js` interactive mode via readline — replaced by AskUserQuestion flow
- `idea-classifier.js` 2-dimension classification prompt — replaced by 3-dimension taxonomy prompt

### Migration Path
1. Phase 1: New columns are additive, old columns remain populated by existing pipeline
2. Phase 2: Modify evaluation-bridge to write new taxonomy instead of old
3. Phase 3: Mark old columns as deprecated, stop populating
4. Phase 4 (future): Drop old columns after confirming no downstream dependencies

## Route & Component Structure

### New Files
```
scripts/
  eva-intake-classify.js          # CLI entry point: npm run eva:intake:classify
lib/
  integrations/
    intake-classifier.js          # Core classification engine (AI + AskUserQuestion)
    intake-taxonomy.js            # Taxonomy definitions, aspect lookups, validation
database/
  migrations/
    YYYYMMDD_add_intake_classification_columns.sql
```

### Modified Files
```
lib/inbox/unified-inbox-builder.js    # Add intake normalizer (Phase 2 child SD)
lib/inbox/format-inbox.js             # Add taxonomy badge rendering (Phase 2 child SD)
package.json                          # Add eva:intake:classify script
```

### Module Organization
- `intake-taxonomy.js` — Pure data module exporting Application enum, Aspect maps (per-app), Intent enum, validation functions. No side effects.
- `intake-classifier.js` — Stateful classification engine: loads pending items, calls LLM for recommendations, orchestrates AskUserQuestion flow, writes results, manages checkpoints.
- `eva-intake-classify.js` — Thin CLI wrapper: parses flags (--resume, --limit, --source todoist|youtube|all), initializes Supabase client, calls classifier.

## Data Layer

### Schema Changes (Additive)

```sql
-- eva_todoist_intake
ALTER TABLE eva_todoist_intake
  ADD COLUMN target_application TEXT CHECK (target_application IN ('ehg_engineer', 'ehg_app', 'new_venture')),
  ADD COLUMN target_aspects JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN chairman_intent TEXT CHECK (chairman_intent IN ('idea', 'insight', 'reference', 'question', 'value')),
  ADD COLUMN chairman_notes TEXT,
  ADD COLUMN classification_confidence NUMERIC(3,2),
  ADD COLUMN classified_at TIMESTAMPTZ;

-- eva_youtube_intake (identical columns)
ALTER TABLE eva_youtube_intake
  ADD COLUMN target_application TEXT CHECK (target_application IN ('ehg_engineer', 'ehg_app', 'new_venture')),
  ADD COLUMN target_aspects JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN chairman_intent TEXT CHECK (chairman_intent IN ('idea', 'insight', 'reference', 'question', 'value')),
  ADD COLUMN chairman_notes TEXT,
  ADD COLUMN classification_confidence NUMERIC(3,2),
  ADD COLUMN classified_at TIMESTAMPTZ;
```

### Queries

**Pending items (for classification):**
```sql
SELECT id, title, description, raw_data, status
FROM eva_todoist_intake
WHERE target_application IS NULL AND status != 'error'
ORDER BY created_at ASC;
```

**Resume checkpoint:**
```sql
-- Items with partial classification (started but interrupted)
SELECT id, title, evaluation_outcome
FROM eva_todoist_intake
WHERE target_application IS NOT NULL AND chairman_intent IS NULL
ORDER BY classified_at ASC;
```

**Classification progress:**
```sql
SELECT
  COUNT(*) FILTER (WHERE target_application IS NOT NULL) as classified,
  COUNT(*) FILTER (WHERE target_application IS NULL AND status != 'error') as pending,
  COUNT(*) as total
FROM eva_todoist_intake;
```

### RLS
- No RLS changes needed — existing service_role_key access pattern used by all EVA scripts

## API Surface

### CLI Commands
```bash
# Interactive classification (primary workflow)
npm run eva:intake:classify

# Resume interrupted session
npm run eva:intake:classify -- --resume

# Classify specific source only
npm run eva:intake:classify -- --source todoist
npm run eva:intake:classify -- --source youtube

# Limit items per session
npm run eva:intake:classify -- --limit 20

# Show classification statistics
npm run eva:intake:classify -- --stats
```

### Internal APIs (module exports)

```javascript
// intake-taxonomy.js
export const APPLICATIONS = ['ehg_engineer', 'ehg_app', 'new_venture'];
export const ASPECTS = { ehg_engineer: [...], ehg_app: [...], new_venture: [...] };
export const INTENTS = ['idea', 'insight', 'reference', 'question', 'value'];
export function getAspectsForApp(app) { ... }
export function validateClassification(app, aspects, intent) { ... }

// intake-classifier.js
export async function classifyItems(supabase, options) { ... }
export async function getClassificationStats(supabase) { ... }
export async function getAIRecommendation(item, llmClient) { ... }
```

### No REST/RPC endpoints — classification is a CLI-only workflow

## Implementation Phases

### Phase 1: DB Migration + Taxonomy Module (Child SD 1)
- Create migration for additive columns on both intake tables
- Build `intake-taxonomy.js` with enum definitions and validation
- Run migration, verify columns exist
- **Deliverable**: Database ready for classification data
- **Estimate**: ~50 LOC

### Phase 2: Core Classification Engine (Child SD 2)
- Build `intake-classifier.js` with LLM recommendation + AskUserQuestion flow
- 3-step classification: Application → Aspects (context-sensitive) → Intent
- "Accept AI recommendation" shortcut (single action to accept all 3 dimensions)
- Checkpoint progress in `classified_at` + partial column writes
- Session resume via `--resume` flag
- Build `eva-intake-classify.js` CLI wrapper
- **Deliverable**: Working classification flow for Todoist and YouTube items
- **Estimate**: ~150-200 LOC

### Phase 3: Unified Inbox Integration (Child SD 3)
- Add intake normalizer function to `unified-inbox-builder.js`
- Map classified items to inbox item schema with taxonomy badges
- Cross-link Todoist items referencing YouTube videos
- Render badges in `format-inbox.js`
- **Deliverable**: Classified items visible in `/leo inbox`
- **Estimate**: ~100 LOC

### Phase 4: Enrichment (Separate Future SD)
- Dropbox local file resolution for classification enrichment
- Batch-accept mode for high-confidence items
- Training data capture from Chairman overrides
- **Deliverable**: Enhanced classification accuracy and speed
- **Estimate**: ~150 LOC

## Testing Strategy

### Unit Tests
- `intake-taxonomy.js`: Validate enum values, aspect-per-app lookup, classification validation
- `intake-classifier.js`: Mock LLM responses, verify AskUserQuestion payload structure, checkpoint writes

### Integration Tests
- End-to-end: Create test intake row → classify → verify columns populated
- Resume: Partially classify → restart → verify continues from checkpoint
- Cross-link: Todoist item with YouTube reference → verify linked in inbox

### Manual Validation (Acceptance)
- Classify 10+ real items via AskUserQuestion
- Interrupt mid-session, resume, verify no data loss
- View classified items in Unified Inbox
- Verify AI confidence scoring matches human judgment

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Context compaction loses classification loop state | High | Checkpoint every classification to DB; resume reads from DB, not memory |
| Existing pipeline overwrites new classification | Medium | New columns are independent of old venture_tag/business_function; no column overlap |
| AskUserQuestion 3-step flow too slow per item | Medium | Offer "accept all" shortcut; pre-compute all 3 dimensions before first question |
| Check constraints block new taxonomy values | Low | New columns have their own CHECK constraints; no modification to existing constraints |
| YouTube OAuth token expires during long session | Low | Classification reads from DB (already-synced data), not YouTube API directly |
| LLM rate limits during batch classification | Low | Sequential processing with 100ms delay; Haiku tier has generous limits |
