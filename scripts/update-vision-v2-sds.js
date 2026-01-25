#!/usr/bin/env node

/**
 * Update Vision V2 Strategic Directives based on OpenAI Codex feedback
 *
 * Updates all 9 Vision V2 SDs (SD-VISION-V2-000 through SD-VISION-V2-008)
 * with improved descriptions, scope, success criteria, and other fields
 * based on detailed specification review.
 *
 * Usage:
 *   node scripts/update-vision-v2-sds.js [--dry-run]
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Update definitions for each SD
 * Each update contains the changes to apply to specific fields
 */
const SD_UPDATES = {
  'SD-VISION-V2-000': {
    description_additions: {
      section: 'Architecture Principle',
      content: `

**Non-Negotiables:**
- **Production Safety:** Browser/UI never uses \`service_role\`; all privileged writes/agent automation happen server-side.
- **Stage 0:** No automatic 0→1 advancement; promotion must be atomic + idempotent; inception brief is required artifact.
- **Decision Gates:** Stages 3, 5, 13, 16, 23, 25 require explicit gate decisions.
- **Traceability:** All mutating requests persist \`correlation_id\` and respect \`Idempotency-Key\` where defined.
- **Deal Flow:** Blueprints must not auto-create ventures.`
    },
    success_criteria_additions: [
      { criterion: 'Correlation-id traceability end-to-end', measure: 'All mutations include correlation_id in DB' },
      { criterion: 'No service_role key in browser', measure: 'Security audit' }
    ]
  },

  'SD-VISION-V2-001': {
    description_replacement: {
      section: 'Tables to Create',
      content: `Implement **all tables/functions** in \`docs/vision/specs/01-database-schema.md\` including:
- Stage 0 artifacts + \`promote_venture_stage0_to_stage1(...)\` (atomic/idempotent)
- Governance tables (chairman_directives, directive_delegations, agent_task_contracts)
- Token ledger + \`circuit_breaker_events\`
- Artifact versioning tables
- Opportunity blueprint persistence
- Venture budget settings`
    },
    scope_additions: {
      in_scope: [
        'Prototype vs production RLS posture rules',
        'Service-role safety guidance (never exposed to client)'
      ]
    },
    success_criteria_additions: [
      { criterion: 'No permissive RLS on venture/portfolio scoped tables', measure: 'RLS audit' },
      { criterion: 'service_role key never exposed to client', measure: 'Code review' }
    ]
  },

  'SD-VISION-V2-002': {
    description_additions: {
      section: 'Endpoints',
      content: `

**Complete Endpoint List:**
- \`POST /api/ventures\` - Create venture
- \`POST /api/ventures/:id/promote\` - Stage 0→1 promotion (atomic/idempotent)
- Budget endpoints (venture budget settings CRUD)
- Blueprints endpoints (opportunity → blueprint flow)
- Artifacts endpoints (override/version)
- \`POST /api/crews/dispatch\` - Manual crew dispatch
- Assumptions update endpoints
- \`GET /api/realtime/*\` - SSE endpoints

**Header Requirements:**
All endpoints MUST implement:
- \`X-Correlation-Id\` propagation (echo in response)
- \`Idempotency-Key\` for mutating operations where specified
- No \`service_role\` key in browser requests`
    },
    success_criteria_additions: [
      { criterion: 'Idempotency-Key honored on mutating endpoints', measure: 'Integration test' },
      { criterion: 'X-Correlation-Id echoed in all responses', measure: 'API test' }
    ]
  },

  'SD-VISION-V2-003': {
    description_replacements: [
      {
        section: 'Token Budget System',
        content: `**Token Budget System:**
- Budget profiles: \`exploratory\`, \`standard\`, \`deep_diligence\`
- Phase allocations with per-stage budgets
- Enforcement via \`venture_token_ledger\` and budget settings table`
      },
      {
        section: 'Circuit Breaker',
        content: `**Circuit Breaker Configuration:**
- **Hard Cap:** Blocks/pauses venture operations
- **Burn Rate Limit:** Rate-limits or blocks on excessive consumption
- **Anomaly Threshold:** Warns on statistical deviation
- **Soft Cap Percent (85%):** Warns Chairman
- **Cooldown Period:** Defined recovery time after breach
- All events logged to \`circuit_breaker_events\` table`
      }
    ],
    scope_additions: {
      in_scope: [
        'Stage 0 constraints (no auto-advance 0→1)',
        'Deal-flow blueprint loop boundaries',
        'Four Buckets enforcement in outputs',
        'Graceful degradation behaviors'
      ]
    },
    success_criteria_additions: [
      { criterion: 'No Stage 0 auto-advance', measure: 'E2E test' },
      { criterion: 'Blueprints never auto-create ventures', measure: 'Integration test' },
      { criterion: 'Briefing aggregation parallelized', measure: 'Performance test' }
    ]
  },

  'SD-VISION-V2-004': {
    description_replacement: {
      section: 'Tool Access Model',
      content: `**Tool Access Model:**
- Supports **direct** and **inherited** grants (grant_type field)
- Inheritance rules: explicit grant > inherited; validity windows enforced
- Revocation cascades down hierarchy unless overridden
- Must implement \`venture_tool_quotas\` for per-venture limits
- \`tool_usage_ledger\` tracks consumption against quotas`
    },
    scope_additions: {
      in_scope: [
        '`venture_tool_quotas` table',
        '`tool_usage_ledger` table',
        'Gateway quota enforcement behavior'
      ]
    }
  },

  'SD-VISION-V2-005': {
    description_additions: {
      section: 'Insulation Requirements',
      content: `

## ⚠️ MANDATORY 25-STAGE INSULATION REQUIREMENTS (COMPLETE LIST)

1. READ-ONLY queries to venture_stage_work (never direct writes)
2. Stage transitions ONLY via fn_advance_venture_stage()
3. Respects existing gate types (auto/advisory/hard)
4. No direct crew dispatch - delegates to VPs only
5. Existing stage triggers, functions, policies UNCHANGED
6. Idempotency + correlation-id required for all commits
7. Claim-with-lease / advisory lock prevents double-message processing
8. Deadline watchdog escalates overdue work
9. Poison/failed tasks handled per spec (retry limits, dead-letter)
10. Handoff package validated before commit; artifacts preserved/versioned
11. Clear state ownership - CEO observes, canonical functions mutate`
    },
    success_criteria_additions: [
      { criterion: 'Single-message processing (no double-claim)', measure: 'Concurrency test' },
      { criterion: 'Deadline escalation triggers correctly', measure: 'Timeout test' },
      { criterion: 'Handoff package completeness validated', measure: 'Schema validation test' }
    ]
  },

  'SD-VISION-V2-006': {
    description_additions: {
      section: 'UI Requirements',
      content: `

**Production UI Requirements (Non-Negotiable):**
- Client/server auth boundary: No service_role in browser
- Refresh strategy: Polling with SSE fallback where supported
- States: Loading, Empty, Error must all be handled per component
- Deep-link contract: \`/ventures/:id?stage=N\` supported
- Accessibility: Keyboard operability required; swipe is enhancement only

**Additional Components Required:**
- \`OpportunityInbox\` - Deal flow management
- \`BlueprintGenerationProgress\` - Blueprint creation status
- \`BoardReviewVisualization\` - Decision board overview
- \`TelemetryPanel\` - SSE with polling fallback
- Stage 0 inception + promote UX flow`
    },
    success_criteria_additions: [
      { criterion: 'Deep-link /ventures/:id?stage=N works', measure: 'URL test' },
      { criterion: 'Keyboard navigation for all actions', measure: 'A11y audit' },
      { criterion: 'Loading/Empty/Error states for all components', measure: 'UI test' },
      { criterion: 'No service_role key in client bundle', measure: 'Security audit' }
    ]
  },

  'SD-VISION-V2-007': {
    description_expansion: {
      section: 'Test Scenarios',
      content: `**Must-Pass Integration Tests:**
1. Stage 0 → 1 promotion is atomic + idempotent (exactly-one transition row on retry)
2. Blueprint generation never auto-creates ventures
3. Blueprint generation never auto-promotes stages
4. Correlation-id threaded through DB traces/ledgers/events
5. UI polling/SSE fallback behaves per spec
6. Deep-link navigation works correctly
7. RLS: service_role isolation verified (not exposed to browser)
8. Idempotency-Key prevents duplicate mutations`
    },
    success_criteria_additions: [
      { criterion: 'Stage 0 promote is atomic + idempotent', measure: 'Retry test with assertion on row count' },
      { criterion: 'Correlation-id in all audit trails', measure: 'DB query verification' }
    ]
  },

  'SD-VISION-V2-008': {
    description_replacement: {
      section: 'Cleanup Targets',
      content: `**Kill List (from Vision Specs):**
- Ghost routes: Legacy API endpoints no longer in use
- Zombie components: Unreferenced React components
- Legacy stage components: Any Stage>25 artifacts in code
- VenturesManager.jsx: Hardcoded 7-stage labels
- DB cleanup: Rows where stage_number > 25
- Deprecated handlers: Old event handlers replaced by Vision V2

**Archive Cleanup:**
- Remove FK references to archived SDs
- Purge orphaned PRD records
- Clean governance_archive after retention period (1 year)`
    },
    acceptance_criteria_additions: [
      { criterion: 'Grep audit confirms zero Stage>25 references', measure: 'Automated grep' },
      { criterion: 'VenturesManager.jsx 7-stage labels removed', measure: 'Code review' }
    ]
  }
};

/**
 * Apply updates to an SD's description field
 */
function updateDescription(currentDescription, updates) {
  let updatedDescription = currentDescription || '';

  if (updates.description_additions) {
    const { section, content } = updates.description_additions;
    // Find the section or append at end
    if (updatedDescription.includes(section)) {
      // Insert after the section header
      const sectionRegex = new RegExp(`(##.*${section}.*\n)`, 'i');
      updatedDescription = updatedDescription.replace(sectionRegex, `$1${content}\n`);
    } else {
      updatedDescription += `\n\n## ${section}\n${content}`;
    }
  }

  if (updates.description_replacement) {
    const { section, content } = updates.description_replacement;
    // Replace entire section
    const sectionRegex = new RegExp(`##.*${section}.*\n[\\s\\S]*?(?=\n##|$)`, 'i');
    if (sectionRegex.test(updatedDescription)) {
      updatedDescription = updatedDescription.replace(sectionRegex, `## ${section}\n${content}\n`);
    } else {
      updatedDescription += `\n\n## ${section}\n${content}`;
    }
  }

  if (updates.description_replacements) {
    updates.description_replacements.forEach(({ section, content }) => {
      const sectionRegex = new RegExp(`##.*${section}.*\n[\\s\\S]*?(?=\n##|$)`, 'i');
      if (sectionRegex.test(updatedDescription)) {
        updatedDescription = updatedDescription.replace(sectionRegex, `## ${section}\n${content}\n`);
      } else {
        updatedDescription += `\n\n## ${section}\n${content}`;
      }
    });
  }

  if (updates.description_expansion) {
    const { section, content } = updates.description_expansion;
    if (updatedDescription.includes(section)) {
      const sectionRegex = new RegExp(`(##.*${section}.*\n)`, 'i');
      updatedDescription = updatedDescription.replace(sectionRegex, `$1\n${content}\n`);
    } else {
      updatedDescription += `\n\n## ${section}\n${content}`;
    }
  }

  return updatedDescription;
}

/**
 * Apply updates to an SD's scope field
 */
function updateScope(currentScope, updates) {
  if (!updates.scope_additions) return currentScope;

  let updatedScope = currentScope || '';

  if (updates.scope_additions.in_scope) {
    const items = updates.scope_additions.in_scope.map(item => `- ${item}`).join('\n');

    if (updatedScope.includes('## In Scope') || updatedScope.includes('**In Scope')) {
      // Add to existing in-scope section
      const inScopeRegex = /(\*\*In Scope\*\*:?|## In Scope)\n/i;
      updatedScope = updatedScope.replace(inScopeRegex, `$1\n${items}\n`);
    } else {
      updatedScope += `\n\n## In Scope\n${items}`;
    }
  }

  return updatedScope;
}

/**
 * Apply updates to success_criteria JSONB field
 */
function updateSuccessCriteria(currentCriteria, updates) {
  const criteria = Array.isArray(currentCriteria) ? [...currentCriteria] : [];

  if (updates.success_criteria_additions) {
    criteria.push(...updates.success_criteria_additions);
  }

  if (updates.acceptance_criteria_additions) {
    criteria.push(...updates.acceptance_criteria_additions);
  }

  return criteria;
}

/**
 * Main execution function
 */
async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Vision V2 Strategic Directives Update');
  console.log(`${'='.repeat(80)}\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No database changes will be made\n');
  }

  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    let updateCount = 0;
    let errorCount = 0;

    for (const [sdId, updates] of Object.entries(SD_UPDATES)) {
      console.log(`\n📝 Processing ${sdId}...`);

      try {
        // Fetch current SD data
        const selectResult = await client.query(
          'SELECT id, title, description, scope, success_criteria FROM strategic_directives_v2 WHERE id = $1',
          [sdId]
        );

        if (selectResult.rows.length === 0) {
          console.log(`   ❌ SD not found: ${sdId}`);
          errorCount++;
          continue;
        }

        const currentSD = selectResult.rows[0];

        // Apply updates
        const updatedDescription = updateDescription(currentSD.description, updates);
        const updatedScope = updateScope(currentSD.scope, updates);
        const updatedSuccessCriteria = updateSuccessCriteria(currentSD.success_criteria, updates);

        // Show changes
        console.log(`   Title: ${currentSD.title}`);

        if (updatedDescription !== currentSD.description) {
          console.log(`   ✓ Description updated (+${updatedDescription.length - (currentSD.description?.length || 0)} chars)`);
        }

        if (updatedScope !== currentSD.scope) {
          console.log(`   ✓ Scope updated (+${updatedScope.length - (currentSD.scope?.length || 0)} chars)`);
        }

        if (JSON.stringify(updatedSuccessCriteria) !== JSON.stringify(currentSD.success_criteria)) {
          const added = updatedSuccessCriteria.length - (currentSD.success_criteria?.length || 0);
          console.log(`   ✓ Success criteria updated (+${added} criteria)`);
        }

        if (!DRY_RUN) {
          // Execute update
          await client.query(
            `UPDATE strategic_directives_v2
             SET description = $1,
                 scope = $2,
                 success_criteria = $3,
                 updated_at = CURRENT_TIMESTAMP,
                 updated_by = 'database-agent:vision-v2-update'
             WHERE id = $4`,
            [updatedDescription, updatedScope, JSON.stringify(updatedSuccessCriteria), sdId]
          );

          console.log(`   ✅ Successfully updated ${sdId}`);
          updateCount++;
        } else {
          console.log(`   ✓ Would update ${sdId}`);
          updateCount++;
        }

      } catch (_error) {
        console.log(`   ❌ Error updating ${sdId}: ${error.message}`);
        errorCount++;
      }
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('Summary');
    console.log(`${'='.repeat(80)}\n`);
    console.log(`✅ Successfully ${DRY_RUN ? 'validated' : 'updated'}: ${updateCount} SDs`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount} SDs`);
    }

    if (DRY_RUN) {
      console.log('\n💡 Run without --dry-run to apply changes to database');
    } else {
      console.log('\n✅ All updates applied successfully!');
    }

  } catch (_error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Execute
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
