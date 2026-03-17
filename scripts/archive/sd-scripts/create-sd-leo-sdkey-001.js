#!/usr/bin/env node

/**
 * Create SD-LEO-SDKEY-001: Centralize SD Creation Through /leo
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createSD() {
  const sdData = {
    id: randomUUID(),
    sd_key: 'SD-LEO-SDKEY-001',
    title: 'Centralize SD Creation Through /leo with Unified SDKeyGenerator',
    description: `## Overview
Consolidate all Strategic Directive creation paths into a single, centralized system accessed through \`/leo create\`. This addresses the current fragmentation where 6+ different scripts create SDs with inconsistent naming conventions, validation rules, and hierarchy handling.

## Problem Statement
Currently, SDs are created through multiple independent paths:
1. **UAT Process** (\`uat-to-strategic-directive-ai.js\`) → \`SD-UAT-###\`
2. **/learn Process** (\`modules/learning/executor.js\`) → \`SD-LEARN-###\` or \`QF-YYYYMMDD-###\`
3. **create-sd.js** → \`SD-{TYPE}-{WORDS}-###\`
4. **sd-from-feedback.js** (from /inbox) → \`SD-{FIX|FEAT}-{WORDS}-###\`
5. **pattern-alert-sd-creator.js** → \`SD-PAT-FIX-{CATEGORY}-###\`
6. **child-sd-template.js** → \`{PARENT}-P{N}\`

Each path has its own:
- Key generation logic (different formats)
- Validation rules (inconsistent)
- Field population (varying completeness)
- Hierarchy handling (or lack thereof)

## Solution
Create a centralized \`SDKeyGenerator\` module and enhance \`/leo\` with a \`create\` subcommand that all other paths call into.

### Components
1. **SDKeyGenerator Module** (\`scripts/modules/sd-key-generator.js\`)
   - Unified naming convention: \`SD-{SOURCE}-{TYPE}-{SEMANTIC}-###\`
   - Hierarchy-aware: Parent/child/grandchild suffixes
   - Collision detection across both \`sd_key\` and \`id\` columns
   - Sequential numbering per namespace

2. **/leo create Command**
   - Interactive wizard for manual creation
   - Flag-based creation from other sources:
     - \`--from-uat <test-id>\`
     - \`--from-learn <pattern-id>\`
     - \`--from-feedback <id>\`
     - \`--child <parent-key>\`

3. **Upstream Refactoring**
   - UAT, /learn, /inbox, pattern-alert scripts become "preparers"
   - They collect context and call centralized creation
   - Removes duplicated validation and insertion logic

### Hierarchy Support
- Root SDs: \`SD-{SOURCE}-{TYPE}-{SEMANTIC}-###\`
- Children: \`{PARENT}-A\`, \`{PARENT}-B\`, etc.
- Grandchildren: \`{PARENT}-A1\`, \`{PARENT}-A2\`, etc.
- Great-grandchildren: \`{PARENT}-A1.1\`, \`{PARENT}-A1.2\`, etc.`,

    rationale: 'Addresses nomenclature drift, validation inconsistency, and maintainability issues caused by 6+ independent SD creation paths. Centralizing through /leo ensures all SDs follow consistent naming, pass the same validation gates, and properly handle parent-child hierarchies.',

    scope: `Affects:
- scripts/modules/sd-key-generator.js (NEW)
- .claude/skills/leo.md (ENHANCED)
- scripts/uat-to-strategic-directive-ai.js (REFACTOR)
- scripts/modules/learning/executor.js (REFACTOR)
- scripts/sd-from-feedback.js (REFACTOR)
- scripts/pattern-alert-sd-creator.js (REFACTOR)
- scripts/create-sd.js (REFACTOR)
- scripts/modules/child-sd-template.js (INTEGRATE)`,

    sd_type: 'infrastructure',
    status: 'draft',
    priority: 'high',
    category: 'Infrastructure',
    current_phase: 'LEAD',
    target_application: 'EHG_Engineer',
    created_by: 'Claude',

    success_metrics: [
      { metric: 'SD creation paths consolidated', target: '6 paths → 1', unit: 'count' },
      { metric: 'Naming convention compliance', target: '100%', unit: 'percent' },
      { metric: 'Hierarchy depth support', target: '4 levels', unit: 'levels' },
      { metric: 'Collision detection coverage', target: '100%', unit: 'percent' }
    ],

    key_principles: [
      { principle: 'Single Entry Point', description: 'All SD creation flows through /leo create' },
      { principle: 'Source Traceability', description: 'SD key embeds origin (UAT, LEARN, FEEDBACK, etc.)' },
      { principle: 'Hierarchy Awareness', description: 'Parent-child-grandchild relationships encoded in keys' },
      { principle: 'Backward Compatibility', description: 'Existing SDs remain valid, new SDs follow new convention' }
    ],

    strategic_objectives: [
      { objective: 'Eliminate naming drift across SD creation sources', metric: 'Single SDKeyGenerator used everywhere' },
      { objective: 'Enable consistent parent-child-grandchild hierarchies', metric: 'Hierarchy depth properly encoded' },
      { objective: 'Centralize validation for all SD creation', metric: 'One validation path for all sources' },
      { objective: 'Improve maintainability of SD creation logic', metric: 'LOC reduction in creation scripts' }
    ],

    success_criteria: [
      { criterion: 'SDKeyGenerator module created and tested', measure: 'Unit tests pass' },
      { criterion: '/leo create command functional', measure: 'Can create SD interactively and via flags' },
      { criterion: 'All 6 sources refactored to use centralized creation', measure: 'No direct DB inserts in source scripts' },
      { criterion: 'Hierarchy naming works to 4 levels deep', measure: 'Grandchild SDs have correct keys' },
      { criterion: 'Existing SDs unaffected', measure: 'No breaking changes to existing keys' }
    ],

    risks: [
      { risk: 'Breaking existing SD references', severity: 'HIGH', mitigation: 'Backward compatibility mode for existing keys' },
      { risk: 'Complex refactoring across 6+ files', severity: 'MEDIUM', mitigation: 'Phased rollout with feature flag' },
      { risk: 'Hierarchy depth edge cases', severity: 'LOW', mitigation: 'Comprehensive test coverage for deep hierarchies' }
    ],

    smoke_test_steps: [
      { step_number: 1, instruction: 'Run /leo create interactively', expected_outcome: 'SD created with proper key format' },
      { step_number: 2, instruction: 'Create SD from UAT via /leo create --from-uat', expected_outcome: 'SD key includes UAT source marker' },
      { step_number: 3, instruction: 'Create child SD via /leo create --child', expected_outcome: 'Child key follows PARENT-A pattern' },
      { step_number: 4, instruction: 'Create grandchild SD', expected_outcome: 'Grandchild key follows PARENT-A1 pattern' },
      { step_number: 5, instruction: 'Verify old scripts no longer insert directly', expected_outcome: 'All paths call SDKeyGenerator' }
    ],

    metadata: {
      source: 'conversation_analysis',
      triggered_by: 'UAT nomenclature mismatch observation',
      related_commands: ['/leo', '/uat', '/learn', '/inbox'],
      affected_files: [
        'scripts/modules/sd-key-generator.js',
        '.claude/skills/leo.md',
        'scripts/uat-to-strategic-directive-ai.js',
        'scripts/modules/learning/executor.js',
        'scripts/sd-from-feedback.js',
        'scripts/pattern-alert-sd-creator.js',
        'scripts/create-sd.js',
        'scripts/modules/child-sd-template.js'
      ],
      estimated_phases: 3
    }
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, sd_key, title, status, priority, current_phase')
    .single();

  if (error) {
    console.error('Error creating SD:', error.message);
    process.exit(1);
  }

  console.log('\n✅ Strategic Directive Created');
  console.log('═'.repeat(60));
  console.log('  SD Key:  ', data.sd_key);
  console.log('  Title:   ', data.title.substring(0, 55) + '...');
  console.log('  Status:  ', data.status);
  console.log('  Priority:', data.priority);
  console.log('  Phase:   ', data.current_phase);
  console.log('  UUID:    ', data.id);
  console.log('═'.repeat(60));
  console.log('\n📋 Next Steps:');
  console.log('   1. Run: npm run sd:next');
  console.log('   2. The SD will appear in queue for LEAD review');
  console.log('   3. Follow LEO Protocol: LEAD → PLAN → EXEC');
}

createSD();
