# Architecture Plan: Capability-Aware Scanners + Agent Skill Registry + Anthropic Plugin Integration

## Stack & Repository Decisions
- **Repository**: EHG_Engineer (backend infrastructure) for harvester, scanner integration, plugin pipeline
- **Repository**: EHG (frontend) for Chairman capability dashboard (Phase 4 only)
- **Runtime**: Node.js (ESM), consistent with existing LEO/EVA infrastructure
- **Database**: Supabase (PostgreSQL) — new view + 1 new table, modifications to existing scanner code
- **LLM**: Claude Haiku for plugin fitness evaluation (low-cost, high-volume scanning)
- **Scheduling**: LEO scheduled tasks for weekly plugin scanning (existing cron infrastructure)

## Legacy Deprecation Plan
- **No deprecation required** — this extends existing systems rather than replacing them
- `venture_capabilities` table already exists (empty) — no schema migration needed for Phase 1
- Scanner functions in `discovery-mode.js` are extended, not replaced
- Agent skill tables (`agent_skills`, `skills_inventory`, `agent_registry`) remain unchanged — read-only via federated view

## Route & Component Structure

### Module Organization
```
lib/
├── capabilities/
│   ├── harvester.js              # Retroactive capability extraction from completed SDs
│   ├── unified-view.js           # Query interface for v_unified_capabilities
│   └── capability-types.js       # Type definitions and category constants
├── eva/stage-zero/paths/
│   └── discovery-mode.js         # MODIFIED — inject capability context into scanner prompts
└── plugins/
    ├── anthropic-scanner.js      # Weekly repo scanner (GitHub API)
    ├── fitness-rubric.js         # Plugin evaluation rubric (automated + LLM)
    ├── plugin-adapter.js         # Auto-fork and EHG customization
    └── plugin-registry.js        # CRUD for anthropic_plugin_registry table

scripts/
├── harvest-capabilities.js       # CLI: npm run capabilities:harvest
├── scan-anthropic-plugins.js     # CLI: npm run plugins:scan
└── adapt-anthropic-plugin.js     # CLI: npm run plugins:adapt <plugin-name>
```

### Scanner Modification Points
Each scanner in `discovery-mode.js` gets a capability injection step:
1. Query `v_scanner_capabilities` for relevant capabilities
2. Format as context block for LLM prompt
3. Inject before the existing LLM call
4. Scanner logic unchanged — the system only enriches the prompt

## Data Layer

### New Database View: `v_unified_capabilities`
```sql
CREATE OR REPLACE VIEW v_unified_capabilities AS
  -- Tech capabilities from ventures/SDs
  SELECT
    id, name, capability_type,
    'venture' AS capability_source,
    reusability_score AS relevance_score,
    maturity_level,
    origin_venture_id AS source_id,
    origin_sd_key AS source_key
  FROM venture_capabilities
  WHERE status = 'active'

  UNION ALL

  -- Agent skills (trigger-based)
  SELECT
    id, skill_name AS name, category_scope AS capability_type,
    'agent_skill' AS capability_source,
    5 AS relevance_score,  -- default mid-range
    'production' AS maturity_level,
    NULL AS source_id,
    NULL AS source_key
  FROM agent_skills
  WHERE is_active = true

  UNION ALL

  -- Agent registry capabilities (one row per capability per agent)
  SELECT
    id, unnest(capabilities) AS name, 'agent_capability' AS capability_type,
    'agent_registry' AS capability_source,
    5 AS relevance_score,
    'production' AS maturity_level,
    NULL AS source_id,
    agent_type AS source_key
  FROM agent_registry
  WHERE status = 'active'

  UNION ALL

  -- Team proficiency
  SELECT
    id, skill_code AS name, 'team_proficiency' AS capability_type,
    'skills_inventory' AS capability_source,
    current_proficiency * 2 AS relevance_score,  -- scale 0-5 to 0-10
    CASE WHEN current_proficiency >= 4 THEN 'production'
         WHEN current_proficiency >= 2 THEN 'developing'
         ELSE 'experimental' END AS maturity_level,
    NULL AS source_id,
    NULL AS source_key
  FROM skills_inventory;
```

### Scanner-Optimized View: `v_scanner_capabilities`
```sql
CREATE OR REPLACE VIEW v_scanner_capabilities AS
  SELECT * FROM v_unified_capabilities
  WHERE capability_source IN ('venture', 'agent_skill', 'agent_registry');
  -- Excludes team_proficiency (not relevant for venture opportunity matching)
```

### New Table: `anthropic_plugin_registry`
```sql
CREATE TABLE anthropic_plugin_registry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plugin_name TEXT NOT NULL,
  source_repo TEXT NOT NULL,         -- 'financial-services-plugins' | 'knowledge-work-plugins' | 'claude-plugins-official'
  source_path TEXT NOT NULL,         -- path within repo
  source_commit TEXT,                -- git commit hash of source version
  ehg_skill_id UUID REFERENCES agent_skills(id),  -- link to adapted skill
  fitness_score NUMERIC(3,1),        -- 0.0-10.0
  fitness_evaluation JSONB,          -- {relevance, format_compatible, security_ok, adaptation_notes}
  status TEXT NOT NULL DEFAULT 'discovered',  -- discovered | evaluating | adapted | rejected | outdated
  adaptation_date TIMESTAMPTZ,
  last_scanned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_repo, plugin_name)
);
```

### Capability Harvester Queries
The harvester extracts capabilities from completed SDs:
```sql
-- Source: strategic_directives_v2 completion metadata
SELECT sd_key, title, sd_type,
       key_changes,           -- JSONB array of what was built
       delivers_capabilities, -- JSONB array of capability names
       success_criteria       -- JSONB array verifying delivery
FROM strategic_directives_v2
WHERE status = 'completed'
  AND delivers_capabilities IS NOT NULL
  AND delivers_capabilities != '[]'::jsonb;
```

### RLS Policies
- `v_unified_capabilities` — read-only, no RLS needed (view on already-protected tables)
- `anthropic_plugin_registry` — service_role only (automated pipeline, no user-facing access)
- `venture_capabilities` inserts via harvester use service_role key

## API Surface

### RPC Functions
```sql
-- Harvest capabilities from a completed SD
CREATE OR REPLACE FUNCTION harvest_sd_capabilities(p_sd_key TEXT)
RETURNS INTEGER AS $$
  -- Extracts delivers_capabilities from SD, upserts into venture_capabilities
  -- Returns count of capabilities harvested
$$;

-- Get scanner-ready capability context
CREATE OR REPLACE FUNCTION get_scanner_capabilities(p_scanner_type TEXT)
RETURNS TABLE(name TEXT, capability_type TEXT, source TEXT, relevance_score INTEGER) AS $$
  -- Returns capabilities relevant to the given scanner type
  -- Capability Overhang: all tech + agent capabilities
  -- Democratization: tech capabilities with high reusability
  -- Trend: tech capabilities grouped by category
  -- Nursery: capabilities added since last nursery eval
$$;
```

### CLI Commands
```bash
npm run capabilities:harvest          # Retroactive backfill from completed SDs
npm run capabilities:harvest -- --sd-key SD-XXX  # Harvest single SD
npm run plugins:scan                  # Weekly Anthropic repo scan
npm run plugins:adapt <plugin-name>   # Fork and adapt a discovered plugin
npm run plugins:status                # Show plugin registry status
```

### LEAD-FINAL-APPROVAL Hook Integration
```javascript
// In lead-final-approval/helpers.js — after existing hooks
async function onSDCompletion(sdKey) {
  // ... existing hooks ...

  // Capability harvester (Phase 1)
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('delivers_capabilities, key_changes, venture_id')
    .eq('sd_key', sdKey)
    .single();

  if (sd?.delivers_capabilities?.length > 0) {
    await harvestCapabilities(sdKey, sd);
  }
}
```

## Implementation Phases

### Phase 1: Capability Harvester (Foundation)
- **Migration**: Create `v_unified_capabilities` and `v_scanner_capabilities` views
- **Script**: `harvest-capabilities.js` — retroactive backfill from completed SDs
- **Hook**: Add capability extraction to LEAD-FINAL-APPROVAL
- **Validation**: `venture_capabilities` populated with 50+ entries
- **Files**: `lib/capabilities/harvester.js`, `lib/capabilities/unified-view.js`, migration SQL
- **Scope**: ~200 LOC new code + migration

### Phase 2: Scanner Integration
- **Modify**: `lib/eva/stage-zero/paths/discovery-mode.js` — add capability context injection
- **Function**: `get_scanner_capabilities()` RPC for scanner-specific capability queries
- **Prompt**: Each scanner's LLM prompt enriched with "EHG has these capabilities: ..."
- **Validation**: Scanner output references specific internal capabilities
- **Files**: `discovery-mode.js` modifications, `lib/capabilities/capability-types.js`
- **Scope**: ~150 LOC modifications + RPC function

### Phase 3: Anthropic Plugin Pipeline
- **Migration**: Create `anthropic_plugin_registry` table
- **Scanner**: `lib/plugins/anthropic-scanner.js` — GitHub API to check 3 repos
- **Rubric**: `lib/plugins/fitness-rubric.js` — format check + LLM relevance scoring
- **Adapter**: `lib/plugins/plugin-adapter.js` — clone, customize, register
- **Scheduling**: Weekly LEO scheduled task trigger
- **Files**: All `lib/plugins/` files, `scripts/scan-anthropic-plugins.js`, migration SQL
- **Scope**: ~400 LOC new code + migration

### Phase 4: Chairman Capability Dashboard (Future — separate SD)
- **Repository**: EHG (frontend)
- **Components**: Capability inventory table, opportunity annotation badges
- **API**: New Supabase queries against `v_unified_capabilities`
- **Not included in this architecture plan** — separate SD after Phase 3

## Testing Strategy

### Unit Tests
- Capability harvester: mock SD data → verify correct `venture_capabilities` inserts
- Plugin fitness rubric: mock plugin JSON → verify scoring output
- Unified view: verify correct UNION ALL semantics across source tables

### Integration Tests
- Harvester + LEAD-FINAL-APPROVAL hook: complete an SD → verify capability auto-extracted
- Scanner + capabilities: run Capability Overhang with populated data → verify prompt includes capabilities
- Plugin scanner + GitHub API: mock repo response → verify discovery + registry insert

### E2E Validation
- Run full Stage 0 "Find Opportunities" flow → verify suggestions reference internal capabilities
- Run plugin scan → adapt → verify new skill appears in `agent_skills` table
- Run `npm run capabilities:harvest` on clean DB → verify 50+ entries populated

## Risk Mitigation

### Risk 1: Empty capability data produces low-quality scanner output
- **Mitigation**: Harvester runs BEFORE scanner integration. Phase 1 must complete and validate 50+ entries before Phase 2 begins.
- **Fallback**: If harvester produces <20 entries, scanner falls back to LLM-only mode (current behavior) with a warning log.

### Risk 2: Anthropic plugin format changes break scanner
- **Mitigation**: Format compatibility is the first gate in the fitness rubric. Unrecognizable formats are flagged `status: 'evaluating'` for manual review, not silently skipped.
- **Monitoring**: Scanner logs format parse failures. If >50% of plugins fail format check, the system raises an alert.

### Risk 3: Federated view performance degrades with scale
- **Mitigation**: `v_scanner_capabilities` excludes `skills_inventory` (largest table). Views use indexed columns only. For Phase 1, expected row count is <500 total — performance is not a concern.
- **Future**: If view exceeds 10K rows, materialize as a table with periodic refresh.

### Risk 4: Capability harvester extracts low-quality capabilities from vague SD metadata
- **Mitigation**: Only harvest from SDs where `delivers_capabilities` is explicitly populated (not NULL/empty). Key_changes are secondary source with LLM extraction for capability naming.
- **Quality gate**: Harvested capabilities with no `capability_type` classification are flagged for review.
