#!/usr/bin/env node
/**
 * Test Script for LEO 5.0 Task System
 *
 * Verifies:
 * 1. Track selection logic
 * 2. Template loading
 * 3. Task hydration
 * 4. Sub-agent requirements
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_CONFIG
} from '../lib/tasks/track-selector.js';
import { TaskHydrator } from '../lib/tasks/task-hydrator.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  LEO 5.0 Task System Test Suite');
console.log('═══════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(name, condition, details = '') {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
    failed++;
  }
}

// Test 1: Track Selection
console.log('\n📋 Test 1: Track Selection\n');

test(
  'Infrastructure SD selects FULL track',
  selectTrack({ sd_type: 'infrastructure' }).track === 'FULL'
);

test(
  'Feature SD selects STANDARD track',
  selectTrack({ sd_type: 'feature' }).track === 'STANDARD'
);

test(
  'Fix SD selects FAST track',
  selectTrack({ sd_type: 'fix' }).track === 'FAST'
);

test(
  'Hotfix SD selects HOTFIX track',
  selectTrack({ sd_type: 'hotfix' }).track === 'HOTFIX'
);

test(
  'Feature with >200 LOC escalates to FULL',
  selectTrack({ sd_type: 'feature', estimated_loc: 250 }).track === 'FULL'
);

test(
  'Security-relevant SD uses FULL track',
  selectTrack({ sd_type: 'fix', security_relevant: true }).track === 'FULL'
);

// Test 2: Track Configuration
console.log('\n📋 Test 2: Track Configuration\n');

test(
  'FULL track has 5 phases',
  TRACK_CONFIG.FULL.phases.length === 5
);

test(
  'STANDARD track has 4 phases',
  TRACK_CONFIG.STANDARD.phases.length === 4
);

test(
  'FAST track has 3 phases',
  TRACK_CONFIG.FAST.phases.length === 3
);

test(
  'HOTFIX track has 3 phases (EXEC, SAFETY, FINAL)',
  TRACK_CONFIG.HOTFIX.phases.length === 3 &&
  TRACK_CONFIG.HOTFIX.phases.includes('SAFETY')
);

test(
  'FULL track requires sub-agents',
  TRACK_CONFIG.FULL.subAgentsRequired === true
);

test(
  'HOTFIX track has no BMAD validation',
  TRACK_CONFIG.HOTFIX.bmadValidation === false
);

// Test 3: Sub-Agent Requirements
console.log('\n📋 Test 3: Sub-Agent Requirements\n');

const featureSubAgents = getSubAgentRequirements('feature', []);
test(
  'Feature type requires TESTING, DESIGN, STORIES',
  featureSubAgents.required.includes('TESTING') &&
  featureSubAgents.required.includes('DESIGN') &&
  featureSubAgents.required.includes('STORIES')
);

const infraSubAgents = getSubAgentRequirements('infrastructure', []);
test(
  'Infrastructure type requires GITHUB, DOCMON',
  infraSubAgents.required.includes('GITHUB') &&
  infraSubAgents.required.includes('DOCMON')
);

const securityCategoryAgents = getSubAgentRequirements('feature', ['security']);
test(
  'Security category adds SECURITY, RISK',
  securityCategoryAgents.required.includes('SECURITY') &&
  securityCategoryAgents.required.includes('RISK')
);

const qaCategory = getSubAgentRequirements('fix', ['Quality Assurance']);
test(
  'Quality Assurance category adds TESTING, UAT, VALIDATION',
  qaCategory.required.includes('TESTING') &&
  qaCategory.required.includes('UAT') &&
  qaCategory.required.includes('VALIDATION')
);

// Test 4: Track Validation
console.log('\n📋 Test 4: Track Validation\n');

const validUpgrade = validateTrackSelection({ sd_type: 'feature' }, 'FULL');
test(
  'Can upgrade feature SD to FULL track',
  validUpgrade.valid === true
);

const invalidDowngrade = validateTrackSelection({ sd_type: 'infrastructure' }, 'STANDARD');
test(
  'Cannot downgrade infrastructure SD to STANDARD track',
  invalidDowngrade.valid === false
);

// Test 5: Template Loading (requires file system)
console.log('\n📋 Test 5: Template Structure\n');

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'lib', 'tasks', 'templates', 'tracks');

async function testTemplates() {
  try {
    // Test FULL track LEAD template
    const fullLead = JSON.parse(await readFile(join(TEMPLATES_DIR, 'full', 'lead.json'), 'utf-8'));
    test(
      'FULL track LEAD template loads',
      fullLead.track === 'FULL' && fullLead.phase === 'LEAD'
    );

    // Test HOTFIX track SAFETY template
    const hotfixSafety = JSON.parse(await readFile(join(TEMPLATES_DIR, 'hotfix', 'safety.json'), 'utf-8'));
    test(
      'HOTFIX track SAFETY template loads',
      hotfixSafety.track === 'HOTFIX' && hotfixSafety.phase === 'SAFETY'
    );

    // Test SAFETY-WALL has compensates_for metadata
    const safetyWallTask = hotfixSafety.tasks.find(t => t.id_template.includes('SAFETY-WALL'));
    test(
      'SAFETY-WALL compensates for LEAD-WALL and PLAN-WALL',
      safetyWallTask?.metadata?.compensates_for?.includes('LEAD-WALL') &&
      safetyWallTask?.metadata?.compensates_for?.includes('PLAN-WALL')
    );

    // Test all tracks have required phases
    const tracks = ['full', 'standard', 'fast', 'hotfix'];
    for (const track of tracks) {
      const config = TRACK_CONFIG[track.toUpperCase()];
      for (const phase of config.phases) {
        try {
          const template = JSON.parse(await readFile(join(TEMPLATES_DIR, track, `${phase.toLowerCase()}.json`), 'utf-8'));
          test(
            `${track.toUpperCase()} ${phase} template exists`,
            template.phase === phase
          );
        } catch (err) {
          test(`${track.toUpperCase()} ${phase} template exists`, false, err.message);
        }
      }
    }
  } catch (err) {
    console.log(`❌ Template test error: ${err.message}`);
    failed++;
  }
}

// Test 6: TaskHydrator (if Supabase credentials available)
async function testHydrator() {
  if (!supabaseUrl || !supabaseKey) {
    console.log('\n⚠️  Skipping TaskHydrator tests (no Supabase credentials)\n');
    return;
  }

  console.log('\n📋 Test 6: TaskHydrator\n');

  const supabase = createClient(supabaseUrl, supabaseKey);
  const hydrator = new TaskHydrator(supabase);

  try {
    // Test with LEO 5.0 SD
    const result = await hydrator.hydratePhase('7ffc037e-a85a-4b31-afae-eb8a00517dd0', 'EXEC');

    test(
      'TaskHydrator loads SD correctly',
      result.sd?.title?.includes('LEO 5.0')
    );

    test(
      'TaskHydrator selects correct track',
      result.track === 'FULL',
      `Got: ${result.track}`
    );

    test(
      'TaskHydrator generates tasks',
      result.tasks?.length > 0,
      `Tasks: ${result.tasks?.length}`
    );

    test(
      'Tasks have interpolated IDs',
      result.tasks?.every(t => !t.id?.includes('{{'))
    );

    test(
      'Tasks have blockedBy dependencies',
      result.tasks?.some(t => t.blockedBy?.length > 0)
    );

    // Test handoff validation
    const validHandoff = await hydrator.validateHandoff(
      '7ffc037e-a85a-4b31-afae-eb8a00517dd0',
      'PLAN',
      'EXEC'
    );
    test(
      'Handoff validation works for valid transitions',
      validHandoff.valid === true
    );

  } catch (err) {
    console.log(`❌ TaskHydrator test error: ${err.message}`);
    failed++;
  }
}

// Run all tests
await testTemplates();
await testHydrator();

// Summary
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
