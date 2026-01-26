# PRD Addendum Generator - LEO Protocol Integration Analysis


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, e2e, migration, schema

**Created**: 2025-12-05
**Purpose**: Deep dive analysis for integrating scenario-driven chairman_interests addenda into LEO Protocol PRD system
**Related**: SD-VISION-ALIGN-001

---

## Executive Summary

The PRD addendum generator currently creates **standalone markdown files** from chairman_interests records. To properly integrate with LEO Protocol, it should:

1. **Write directly to `product_requirements_v2.metadata` field** (not standalone files)
2. **Update specific PRD JSONB fields** (`ui_ux_requirements`, `functional_requirements`, `acceptance_criteria`)
3. **Trigger sub-agent workflows** (DESIGN, DATABASE) like `add-prd-to-database.js` does
4. **Support PRD enhancement mode** (add to existing PRD vs create new)

---

## Current State Analysis

### What We Built

**File**: `scripts/generate-prd-addendum-from-scenario.js`

**Current Capabilities**:
- ✅ Reads chairman_interests with story_beats, vision_signals, coverage_nav_item_ids, feasibility_score
- ✅ Generates structured markdown addendum
- ✅ Uses JavaScript template literals (no external dependencies)
- ✅ CLI interface with `--interest-id`, `--output`, `--include-nav-details`

**Current Limitations**:
- ❌ Outputs to file system, not database
- ❌ No integration with `product_requirements_v2` table
- ❌ No sub-agent triggering (DESIGN, DATABASE, STORIES)
- ❌ No update of existing PRD records
- ❌ Markdown format doesn't map to JSONB structured fields

---

## LEO Protocol PRD System (Existing Pattern)

### add-prd-to-database.js Workflow

**Phase 1: DESIGN Analysis**
```javascript
// Invokes DESIGN sub-agent to analyze UI/UX workflows
node lib/sub-agent-executor.js DESIGN --context-file "${designPromptFile}"

// Output stored in metadata.design_analysis
metadata: {
  design_analysis: {
    generated_at: timestamp,
    sd_context: { id, title, scope },
    raw_analysis: "..." // First 5000 chars
  }
}
```

**Phase 2: DATABASE Schema Analysis**
```javascript
// Invokes DATABASE sub-agent with design context
node lib/sub-agent-executor.js DATABASE --context-file "${promptFile}"

// Output stored in metadata.database_analysis
metadata: {
  database_analysis: {
    generated_at: timestamp,
    sd_context: { id, title, scope },
    raw_analysis: "...", // First 5000 chars
    design_informed: true
  }
}
```

**Phase 3: Component Recommendations**
```javascript
// Uses semantic AI to recommend Shadcn components
const { recommendations } = await getComponentRecommendations({...});

// Stored in metadata field (ui_components fields don't exist in schema)
metadata: {
  component_recommendations_generated_at: timestamp
}
```

**Phase 4: Auto-trigger STORIES Sub-agent**
```javascript
const storiesResult = await autoTriggerStories(supabase, sdId, prdId, {...});
```

### Key PRD Fields for Vision Alignment

From `product_requirements_v2` schema:

| Field | Type | Purpose | Vision Alignment Mapping |
|-------|------|---------|--------------------------|
| `ui_ux_requirements` | JSONB | UI/UX specifications | → Story beats (user workflows) |
| `functional_requirements` | JSONB | WHAT system must do | → Vision signals (measurable features) |
| `acceptance_criteria` | JSONB | Success criteria | → Story beat acceptance_criteria |
| `test_scenarios` | JSONB | Test cases | → Generated from story beats |
| `dependencies` | JSONB | External deps | → coverage_nav_item_ids (nav item dependencies) |
| `metadata` | JSONB | Flexible storage | → Full scenario card context |

---

## Proposed Integration Pattern

### Option A: Metadata-Only Storage (Simplest)

**Approach**: Store all chairman_interests data in `metadata.vision_alignment_scenarios`

```javascript
// Update PRD with vision alignment addendum
await supabase
  .from('product_requirements_v2')
  .update({
    metadata: {
      ...existingMetadata,
      vision_alignment_scenarios: [
        {
          interest_id: chairmanInterest.id,
          interest_name: chairmanInterest.name,
          interest_type: chairmanInterest.interest_type,
          priority: chairmanInterest.priority,
          feasibility_score: chairmanInterest.feasibility_score,
          story_beats: chairmanInterest.story_beats,
          vision_signals: chairmanInterest.vision_signals,
          coverage_nav_item_ids: chairmanInterest.coverage_nav_item_ids,
          generated_at: new Date().toISOString(),
          addendum_version: '1.0'
        }
      ]
    }
  })
  .eq('id', prdId);
```

**Pros**:
- ✅ Minimal changes to existing PRD structure
- ✅ Preserves all chairman_interests context
- ✅ Easy to query and display in UI
- ✅ No schema migration needed

**Cons**:
- ❌ Data not normalized into PRD standard fields
- ❌ Doesn't leverage existing JSONB validation
- ❌ Harder to query across PRDs for vision signals

### Option B: Normalized Field Mapping (Recommended)

**Approach**: Map chairman_interests data to standard PRD JSONB fields + metadata backup

```javascript
async function enhancePRDWithVisionAlignment(chairmanInterest, prdId) {
  // 1. Transform story beats → ui_ux_requirements
  const uiUxRequirements = chairmanInterest.story_beats.map((beat, idx) => ({
    id: `UX-BEAT-${idx + 1}`,
    component: `Story Beat ${beat.sequence}`,
    description: beat.description,
    user_flow: beat.acceptance_criteria,
    priority: 'HIGH'
  }));

  // 2. Transform vision signals → functional_requirements
  const functionalReqs = chairmanInterest.vision_signals.map((signal, idx) => ({
    id: `FR-SIGNAL-${idx + 1}`,
    requirement: `${signal.signal_type}: ${signal.target_metric}`,
    priority: 'HIGH',
    acceptance_criteria: [signal.measurement_method],
    source: 'vision_alignment'
  }));

  // 3. Transform story beat criteria → acceptance_criteria
  const acceptanceCriteria = chairmanInterest.story_beats.flatMap((beat, idx) =>
    beat.acceptance_criteria.map((criterion, cIdx) => ({
      id: `AC-BEAT-${idx + 1}-${cIdx + 1}`,
      criterion: `${beat.description}: ${criterion}`,
      verification_method: 'E2E test validation',
      source: 'story_beat'
    }))
  );

  // 4. Transform coverage IDs → dependencies
  const dependencies = chairmanInterest.coverage_nav_item_ids.map(navId => ({
    type: 'navigation_item',
    name: navId,
    status: 'required',
    blocker: false
  }));

  // 5. Update PRD with merged data
  const { data: currentPrd } = await supabase
    .from('product_requirements_v2')
    .select('ui_ux_requirements, functional_requirements, acceptance_criteria, dependencies, metadata')
    .eq('id', prdId)
    .single();

  await supabase
    .from('product_requirements_v2')
    .update({
      // Merge with existing arrays
      ui_ux_requirements: [...(currentPrd.ui_ux_requirements || []), ...uiUxRequirements],
      functional_requirements: [...(currentPrd.functional_requirements || []), ...functionalReqs],
      acceptance_criteria: [...(currentPrd.acceptance_criteria || []), ...acceptanceCriteria],
      dependencies: [...(currentPrd.dependencies || []), ...dependencies],

      // Store full context in metadata
      metadata: {
        ...(currentPrd.metadata || {}),
        vision_alignment_source: {
          interest_id: chairmanInterest.id,
          interest_name: chairmanInterest.name,
          feasibility_score: chairmanInterest.feasibility_score,
          generated_at: new Date().toISOString(),
          raw_data: chairmanInterest // Full backup
        }
      }
    })
    .eq('id', prdId);
}
```

**Pros**:
- ✅ Leverages existing PRD JSONB validation
- ✅ Data queryable via standard PRD fields
- ✅ Integrates with existing PRD UI components
- ✅ Full context preserved in metadata backup

**Cons**:
- ❌ More complex transformation logic
- ❌ Need to handle merge conflicts (existing vs new data)
- ❌ Requires validation of transformed data against schema constraints

### Option C: Hybrid Approach with Sub-agent Workflow (Best)

**Approach**: Combine normalized mapping + sub-agent workflow like `add-prd-to-database.js`

```javascript
async function integrateVisionAlignmentWithPRD(chairmanInterest, sdId, prdId) {
  // Phase 1: Enhance PRD with normalized data (Option B)
  await enhancePRDWithVisionAlignment(chairmanInterest, prdId);

  // Phase 2: Trigger DESIGN sub-agent with story beat context
  const designPrompt = `Analyze UI/UX design for chairman interest: ${chairmanInterest.name}

**Story Beats**:
${chairmanInterest.story_beats.map(b => `- Beat ${b.sequence}: ${b.description}`).join('\n')}

**Vision Signals**:
${chairmanInterest.vision_signals.map(s => `- ${s.signal_type}: ${s.target_metric}`).join('\n')}

Task: Generate UI component designs, user workflows, and navigation flows based on story beats.`;

  const designAnalysis = await executeSubAgent('DESIGN', designPrompt);

  // Phase 3: Trigger DATABASE sub-agent with design context
  const dbPrompt = `Analyze database schema for vision alignment scenario: ${chairmanInterest.name}

**Design Analysis Context**:
${designAnalysis}

**Data Requirements**:
- Coverage nav items: ${chairmanInterest.coverage_nav_item_ids.length}
- Vision signals requiring storage: ${chairmanInterest.vision_signals.length}

Task: Recommend schema changes to support vision alignment workflows.`;

  const dbAnalysis = await executeSubAgent('DATABASE', dbPrompt);

  // Phase 4: Update PRD metadata with sub-agent analyses
  await supabase
    .from('product_requirements_v2')
    .update({
      metadata: {
        ...currentMetadata,
        vision_alignment_analysis: {
          design_analysis: designAnalysis.substring(0, 5000),
          database_analysis: dbAnalysis.substring(0, 5000),
          generated_at: new Date().toISOString()
        }
      }
    })
    .eq('id', prdId);

  // Phase 5: Auto-trigger STORIES sub-agent (optional)
  await autoTriggerStories(supabase, sdId, prdId, {
    skipIfExists: true,
    visionAlignmentContext: chairmanInterest
  });
}
```

**Pros**:
- ✅ Full LEO Protocol integration (sub-agents + database)
- ✅ Reuses proven workflow patterns
- ✅ Generates comprehensive technical specifications
- ✅ Maintains audit trail and context

**Cons**:
- ❌ Most complex implementation
- ❌ Longer execution time (sub-agent calls)
- ❌ Requires sub-agent executor integration

---

## Recommended Implementation Plan

### Phase 1: Refactor Current Generator (1-2 hours)

1. **Rename file** from `generate-prd-addendum-from-scenario.js` → `enhance-prd-with-vision-alignment.js`
2. **Change output** from file system to database writes
3. **Implement Option B** (normalized field mapping)
4. **Add CLI flags**: `--prd-id`, `--merge-mode` (append|replace)

### Phase 2: Add Sub-agent Integration (2-3 hours)

1. **Import sub-agent executor** from `lib/sub-agent-executor.js`
2. **Implement DESIGN sub-agent** call with story beat context
3. **Implement DATABASE sub-agent** call with coverage context
4. **Store analyses** in `metadata.vision_alignment_analysis`

### Phase 3: Update PRD Auto-Generation (1 hour)

1. **Extend `add-prd-to-database.js`** to check for linked chairman_interests
2. **Auto-call vision alignment enhancement** if chairman_interest exists
3. **Add to PRD checklist**: "Vision alignment scenarios integrated"

### Phase 4: Create UI Integration Points (Future)

1. **Add UI component** to display vision alignment scenarios in PRD view
2. **Show story beats** as interactive timeline
3. **Display vision signals** as metric dashboards
4. **Link to chairman_interests** records for editing

---

## Code Example: Refactored Integration

```javascript
#!/usr/bin/env node
/**
 * Enhance PRD with Vision Alignment (LEO Protocol Pattern)
 * Integrates chairman_interests scenario cards into product_requirements_v2
 *
 * Usage: node scripts/enhance-prd-with-vision-alignment.js --prd-id=PRD-SD-XXX --interest-id=<UUID>
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

class VisionAlignmentPRDEnhancer {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async enhancePRD(prdId, chairmanInterest, options = {}) {
    const { mergeMode = 'append', triggerSubAgents = true } = options;

    console.log(`\n📋 Enhancing PRD ${prdId} with vision alignment...\n`);

    // Step 1: Transform and merge data
    const transformedData = this.transformToP RDFields(chairmanInterest);
    await this.mergePRDData(prdId, transformedData, mergeMode);

    // Step 2: Trigger sub-agent workflows (if enabled)
    if (triggerSubAgents) {
      await this.triggerDesignAnalysis(chairmanInterest);
      await this.triggerDatabaseAnalysis(chairmanInterest);
    }

    // Step 3: Update PRD metadata
    await this.updatePRDMetadata(prdId, chairmanInterest);

    console.log('\n✅ PRD enhancement complete!');
  }

  transformToPRDFields(chairmanInterest) {
    // Implementation from Option B above
    return {
      ui_ux_requirements: [...],
      functional_requirements: [...],
      acceptance_criteria: [...],
      dependencies: [...]
    };
  }

  async mergePRDData(prdId, transformedData, mergeMode) {
    const { data: currentPrd } = await this.supabase
      .from('product_requirements_v2')
      .select('ui_ux_requirements, functional_requirements, acceptance_criteria, dependencies')
      .eq('id', prdId)
      .single();

    const mergedData = mergeMode === 'append'
      ? {
          ui_ux_requirements: [...(currentPrd.ui_ux_requirements || []), ...transformedData.ui_ux_requirements],
          functional_requirements: [...(currentPrd.functional_requirements || []), ...transformedData.functional_requirements],
          // ... etc
        }
      : transformedData; // replace mode

    await this.supabase
      .from('product_requirements_v2')
      .update(mergedData)
      .eq('id', prdId);

    console.log('✅ PRD fields updated');
  }

  async triggerDesignAnalysis(chairmanInterest) {
    // Implementation from Option C above
    console.log('\n🎨 Triggering DESIGN sub-agent...');
    // ... sub-agent execution
  }

  async triggerDatabaseAnalysis(chairmanInterest) {
    console.log('\n📊 Triggering DATABASE sub-agent...');
    // ... sub-agent execution
  }

  async updatePRDMetadata(prdId, chairmanInterest) {
    console.log('\n💾 Updating PRD metadata...');
    // ... metadata update
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const prdIdArg = args.find(arg => arg.startsWith('--prd-id='));
  const interestIdArg = args.find(arg => arg.startsWith('--interest-id='));

  if (!prdIdArg || !interestIdArg) {
    console.error('Usage: node enhance-prd-with-vision-alignment.js --prd-id=PRD-SD-XXX --interest-id=<UUID>');
    process.exit(1);
  }

  const prdId = prdIdArg.split('=')[1];
  const interestId = interestIdArg.split('=')[1];

  // Execute enhancement
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const enhancer = new VisionAlignmentPRDEnhancer(supabase);
  // ... fetch chairman_interest and execute
}
```

---

## Conclusion

**Recommended Approach**: **Option C (Hybrid)** for full LEO Protocol integration

**Immediate Action**: Refactor `generate-prd-addendum-from-scenario.js` to write to database instead of files

**Next Steps**:
1. Implement normalized field mapping (Option B logic)
2. Add sub-agent workflow integration (Option C)
3. Update `add-prd-to-database.js` to auto-detect chairman_interests linkage
4. Create UI components to display vision alignment in PRD views

**Estimated Effort**: 6-8 hours for full integration

---

*Analysis created as part of SD-VISION-ALIGN-001 EXEC phase*
*Generated: 2025-12-05*
