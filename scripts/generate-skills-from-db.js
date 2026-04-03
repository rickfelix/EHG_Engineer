#!/usr/bin/env node
/**
 * Generate Skill Files from Database Protocol Sections
 *
 * Reads leo_protocol_sections tagged with skill_key values and assembles
 * focused .claude/commands/<skill_key>.md files. Each file is a thin wrapper
 * encoding step sequences that reference canonical scripts.
 *
 * SD: SD-LEO-INFRA-CUSTOM-SKILLS-PROTOCOL-001
 * Vision: VISION-CUSTOM-SKILLS-L2-001
 *
 * Usage:
 *   node scripts/generate-skills-from-db.js           # Generate all skills
 *   node scripts/generate-skills-from-db.js --check    # Check staleness only
 *   node scripts/generate-skills-from-db.js --verbose  # Show detailed output
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BASE_DIR = join(__dirname, '..');
const COMMANDS_DIR = join(BASE_DIR, '.claude', 'commands');

const CHECK_ONLY = process.argv.includes('--check');
const VERBOSE = process.argv.includes('--verbose');

/**
 * Compute a content hash for staleness detection
 */
function computeHash(content) {
  return createHash('sha256').update(content).digest('hex').substring(0, 12);
}

/**
 * Extract the content hash from an existing generated skill file header
 */
function extractFileHash(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^<!-- GENERATED: hash=([a-f0-9]+)/m);
  return match ? match[1] : null;
}

/**
 * Skill file templates that wrap DB content with instructions.
 * Each template defines the skill's purpose, the canonical scripts it references,
 * and how to assemble DB sections into the final file.
 */
const SKILL_TEMPLATES = {
  'sd-start': {
    frontmatter: {
      description: 'Start work on a Strategic Directive: claim, validate status, load phase context. Use when user says /sd-start <SD-ID> or when starting any SD.',
    },
    header: `# SD Start — Claim, Validate, Load Context

**Purpose**: Execute the SD lifecycle startup sequence without drift.
This skill encodes the exact steps for claiming an SD, validating its status,
and loading the correct phase context. All steps use canonical scripts.

## Quick Reference
\`\`\`bash
# Claim and start SD
npm run sd:start <SD-ID>

# If worktree path shown in output, cd to it:
# cd <WORKTREE_CWD path>

# Then load phase context:
# Read tool: CLAUDE_CORE.md
# Read tool: CLAUDE_<PHASE>.md
\`\`\`

## Step-by-Step Protocol
`,
    footer: `
## Canonical Scripts (NEVER bypass these)
- \`npm run sd:start <SD-ID>\` — Claim + status check + worktree
- \`node scripts/handoff.js execute <PHASE> <SD-ID>\` — Phase transitions
- \`node scripts/child-sd-preflight.js <SD-ID>\` — Child SD validation
- \`node scripts/orchestrator-preflight.js <SD-ID>\` — Orchestrator preflight

## Anti-Drift Rules
1. ALWAYS run sd:start before any work (never query DB directly for claims)
2. ALWAYS cd to worktree path if shown in output
3. ALWAYS read CLAUDE_CORE.md + phase-specific file before coding
4. NEVER skip child-sd-preflight for child SDs
5. NEVER skip orchestrator-preflight for orchestrator SDs
`,
  },
  'gate-debug': {
    frontmatter: {
      description: 'Debug gate failures during handoff execution. Use when a handoff fails, gates return low scores, or you need to diagnose validation issues.',
    },
    header: `# Gate Debug — Diagnose Failures, Inspect Fields, Retry

**Purpose**: Systematic gate failure diagnosis and resolution.
This skill encodes the exact steps for understanding why a handoff gate failed,
inspecting the relevant database fields, and retrying correctly.

## Quick Reference
\`\`\`bash
# See ALL gate failures at once (run this FIRST)
node scripts/handoff.js precheck <PHASE> <SD-ID>

# Re-run a specific handoff after fixing
node scripts/handoff.js execute <PHASE> <SD-ID>
\`\`\`

## Diagnosis Protocol
`,
    footer: `
## Common Gate Fixes
| Gate | Common Cause | Fix |
|------|-------------|-----|
| SMOKE_TEST_SPECIFICATION | Missing/malformed smoke_test_steps | Add objects with instruction + expected_outcome |
| GATE_SD_QUALITY | Placeholder content | Replace generic text with specific details |
| GATE_PRD_EXISTS | No PRD in database | Run add-prd-to-database.js |
| BMAD_PLAN_TO_EXEC | Missing implementation_context | Add to user stories |
| ERR_CHAIN_INCOMPLETE | Skipped prerequisite handoff | Run missing handoff first |

## Anti-Drift Rules
1. ALWAYS run precheck FIRST to see all failures (not just the first one)
2. NEVER bypass gates without --bypass-validation flag and documented reason
3. ALWAYS fix root cause, not symptoms (e.g., fix the data, not the gate check)
4. NEVER retry blindly — read the error message and fix the specific issue
`,
  },
};

/**
 * Query tagged sections from DB and assemble skill file content
 */
async function generateSkill(skillKey) {
  const template = SKILL_TEMPLATES[skillKey];
  if (!template) {
    console.error(`No template defined for skill_key: ${skillKey}`);
    return null;
  }

  // Query sections tagged with this skill_key, ordered by order_index
  const { data: sections, error } = await supabase
    .from('leo_protocol_sections')
    .select('id, title, content, order_index, section_type')
    .eq('skill_key', skillKey)
    .order('order_index', { ascending: true });

  if (error) {
    console.error(`DB query error for ${skillKey}:`, error.message);
    return null;
  }

  if (!sections || sections.length === 0) {
    console.error(`No sections tagged with skill_key=${skillKey}`);
    return null;
  }

  // Assemble content from sections
  const sectionContent = sections
    .map(s => {
      const title = s.title.replace(/^[🚀🔍🚫⚠️📚🛡️]+\s*/g, '').trim();
      return `### ${title}\n\n${s.content}`;
    })
    .join('\n\n---\n\n');

  // Build the full file
  const dbContentHash = computeHash(sectionContent);
  const timestamp = new Date().toISOString();

  const frontmatterBlock = [
    '---',
    `description: "${template.frontmatter.description}"`,
    '---',
  ].join('\n');

  const generationHeader = `<!-- GENERATED: hash=${dbContentHash} timestamp=${timestamp} sections=${sections.length} -->`;

  const fullContent = [
    frontmatterBlock,
    '',
    generationHeader,
    '',
    template.header,
    sectionContent,
    template.footer,
  ].join('\n');

  return {
    skillKey,
    content: fullContent,
    hash: dbContentHash,
    sectionCount: sections.length,
    sectionIds: sections.map(s => s.id),
  };
}

/**
 * Check if existing file is stale compared to DB content
 */
function checkStaleness(skillKey, newHash) {
  const filePath = join(COMMANDS_DIR, `${skillKey}.md`);
  const existingHash = extractFileHash(filePath);

  if (!existingHash) {
    return { stale: true, reason: 'file does not exist or has no hash header' };
  }

  if (existingHash !== newHash) {
    return { stale: true, reason: `hash mismatch: file=${existingHash} db=${newHash}` };
  }

  return { stale: false };
}

async function main() {
  console.log('🔧 Skill Generation Pipeline');
  console.log('=' .repeat(50));

  // Discover all skill_keys in the database
  const { data: skillKeys, error } = await supabase
    .from('leo_protocol_sections')
    .select('skill_key')
    .not('skill_key', 'is', null);

  if (error) {
    console.error('Failed to query skill_keys:', error.message);
    process.exit(1);
  }

  const uniqueKeys = [...new Set(skillKeys.map(s => s.skill_key))];
  console.log(`Found ${uniqueKeys.length} skill(s) to generate: ${uniqueKeys.join(', ')}`);

  // Ensure commands directory exists
  if (!existsSync(COMMANDS_DIR)) {
    mkdirSync(COMMANDS_DIR, { recursive: true });
  }

  let staleCount = 0;
  let generatedCount = 0;
  let upToDateCount = 0;

  for (const skillKey of uniqueKeys) {
    const result = await generateSkill(skillKey);
    if (!result) continue;

    const staleness = checkStaleness(skillKey, result.hash);

    if (!staleness.stale) {
      upToDateCount++;
      console.log(`  ✅ ${skillKey}.md — up to date (hash=${result.hash})`);
      continue;
    }

    staleCount++;

    if (CHECK_ONLY) {
      console.log(`  ⚠️  ${skillKey}.md — STALE: ${staleness.reason}`);
      continue;
    }

    // Write the file
    const filePath = join(COMMANDS_DIR, `${skillKey}.md`);
    writeFileSync(filePath, result.content, 'utf-8');
    generatedCount++;
    console.log(`  📝 ${skillKey}.md — generated (${result.sectionCount} sections, hash=${result.hash})`);

    if (VERBOSE) {
      console.log(`     Sections: ${result.sectionIds.join(', ')}`);
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Skills found: ${uniqueKeys.length}`);
  console.log(`  Up to date:   ${upToDateCount}`);
  console.log(`  Stale:        ${staleCount}`);
  if (!CHECK_ONLY) {
    console.log(`  Generated:    ${generatedCount}`);
  }

  if (CHECK_ONLY && staleCount > 0) {
    console.log('\n💡 Run without --check to regenerate stale files');
    process.exit(1); // Non-zero exit for CI detection
  }

  console.log('\n✅ Done');
}

// Windows-compatible entry point detection
const normalizedArgv = process.argv[1]?.replace(/\\/g, '/');
if (
  import.meta.url === `file:///${normalizedArgv}` ||
  import.meta.url === `file://${normalizedArgv}`
) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

export { generateSkill, computeHash, checkStaleness, SKILL_TEMPLATES };
