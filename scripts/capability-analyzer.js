#!/usr/bin/env node
/**
 * Capability Analyzer Pipeline
 * SD: SD-CAP-LEDGER-001 | US-003
 *
 * Analyzes capabilities across the codebase and SD history.
 * Identifies, scores, and tracks capability reuse.
 *
 * Usage:
 *   npm run capability:analyze           # Full analysis
 *   npm run capability:scan              # Scan codebase only
 *   npm run capability:report            # Generate report
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  CAPABILITY_TYPES,
  CAPABILITY_CATEGORIES,
  calculatePlane1Score,
  isValidCapabilityType,
  getCapabilityType,
} from '../lib/capabilities/capability-taxonomy.js';

const EHG_ROOT = process.env.EHG_ROOT || '/mnt/c/_EHG/EHG';
const ENGINEER_ROOT = process.env.ENGINEER_ROOT || process.cwd();

/**
 * Capability detection patterns for codebase scanning
 */
const DETECTION_PATTERNS = {
  agent: {
    patterns: [
      /class\s+(\w+Agent)\s+extends/gi,
      /export\s+const\s+(\w+_AGENT)\s*=/gi,
      /agent_key:\s*['"]([^'"]+)['"]/gi,
    ],
    filePatterns: ['**/agents/**/*.{js,ts}', '**/sub-agents/**/*.{js,ts}'],
  },
  crew: {
    patterns: [
      /class\s+(\w+Crew)\s+extends/gi,
      /crew:\s*\[/gi,
      /createCrew\(['"]([^'"]+)['"]/gi,
    ],
    filePatterns: ['**/crews/**/*.{js,ts}'],
  },
  tool: {
    patterns: [
      /export\s+function\s+(\w+Tool)/gi,
      /tools:\s*\[/gi,
      /@tool\(['"]([^'"]+)['"]\)/gi,
    ],
    filePatterns: ['**/tools/**/*.{js,ts}'],
  },
  skill: {
    patterns: [
      /skill:\s*['"]([^'"]+)['"]/gi,
      /\/(\w+)\.md$/gi,
    ],
    filePatterns: ['skills/**/*.md', '.claude/skills/**/*.md'],
  },
  database_schema: {
    patterns: [
      /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/gi,
    ],
    filePatterns: ['database/**/*.sql', 'supabase/**/*.sql'],
  },
  database_function: {
    patterns: [
      /CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+(\w+)/gi,
    ],
    filePatterns: ['database/**/*.sql', 'supabase/**/*.sql'],
  },
  rls_policy: {
    patterns: [
      /CREATE POLICY\s+['"]([^'"]+)['"]/gi,
    ],
    filePatterns: ['database/**/*.sql', 'supabase/**/*.sql'],
  },
  api_endpoint: {
    patterns: [
      /router\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/gi,
      /app\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/gi,
    ],
    filePatterns: ['**/routes/**/*.{js,ts}', '**/api/**/*.{js,ts}'],
  },
  component: {
    patterns: [
      /export\s+(?:default\s+)?function\s+(\w+)\s*\(/gi,
      /export\s+const\s+(\w+):\s*(?:React\.)?FC/gi,
    ],
    filePatterns: ['src/components/**/*.{jsx,tsx}'],
  },
  hook: {
    patterns: [
      /export\s+function\s+(use\w+)/gi,
      /export\s+const\s+(use\w+)\s*=/gi,
    ],
    filePatterns: ['**/hooks/**/*.{js,ts,jsx,tsx}'],
  },
  service: {
    patterns: [
      /class\s+(\w+Service)\s+/gi,
      /export\s+const\s+(\w+Service)\s*=/gi,
    ],
    filePatterns: ['**/services/**/*.{js,ts}'],
  },
  workflow: {
    patterns: [
      /workflow:\s*['"]([^'"]+)['"]/gi,
      /class\s+(\w+Workflow)/gi,
    ],
    filePatterns: ['**/workflows/**/*.{js,ts}'],
  },
  quality_gate: {
    patterns: [
      /GATE\d+/gi,
      /validateGate\(['"]([^'"]+)['"]/gi,
    ],
    filePatterns: ['**/validators/**/*.{js,ts}', '**/gates/**/*.{js,ts}'],
  },
  protocol: {
    patterns: [
      /protocol:\s*['"]([^'"]+)['"]/gi,
    ],
    filePatterns: ['docs/**/*.md'],
  },
};

/**
 * Scan codebase for capabilities
 */
async function scanCodebase(rootPath = EHG_ROOT) {
  console.log('🔍 Scanning codebase for capabilities...\n');
  const capabilities = [];

  for (const [type, config] of Object.entries(DETECTION_PATTERNS)) {
    console.log(`   Scanning for ${type}...`);
    let found = 0;

    for (const filePattern of config.filePatterns) {
      try {
        // Use glob to find files
        const files = execSync(
          `find "${rootPath}" -path "*/${filePattern.replace('**/', '')}" -type f 2>/dev/null || true`,
          { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        ).trim().split('\n').filter(Boolean);

        for (const file of files) {
          try {
            const content = fs.readFileSync(file, 'utf-8');
            for (const pattern of config.patterns) {
              const matches = content.matchAll(pattern);
              for (const match of matches) {
                const capabilityKey = match[1] || match[2] || match[0];
                if (capabilityKey && capabilityKey.length > 2) {
                  capabilities.push({
                    capability_type: type,
                    capability_key: capabilityKey.replace(/['"]/g, ''),
                    source_file: file.replace(rootPath, ''),
                    detected_at: new Date().toISOString(),
                  });
                  found++;
                }
              }
            }
          } catch (e) {
            // Skip unreadable files
          }
        }
      } catch (e) {
        // Pattern didn't match anything
      }
    }

    console.log(`      Found ${found} ${type} capabilities`);
  }

  console.log(`\n   Total capabilities detected: ${capabilities.length}`);
  return capabilities;
}

/**
 * Load capabilities from database
 */
async function loadExistingCapabilities(client) {
  console.log('\n📊 Loading existing capabilities from database...');

  const result = await client.query(`
    SELECT
      capability_key,
      capability_type,
      sd_id,
      action,
      maturity_score,
      extraction_score,
      reuse_count,
      plane1_score
    FROM sd_capabilities
    ORDER BY created_at DESC
  `);

  console.log(`   Found ${result.rows.length} capabilities in database`);
  return result.rows;
}

/**
 * Analyze capability dependencies
 */
async function analyzeDependencies(capabilities) {
  console.log('\n🔗 Analyzing capability dependencies...');

  const dependencyMap = new Map();

  // Build import/dependency graph (simplified)
  for (const cap of capabilities) {
    if (cap.source_file) {
      try {
        const content = fs.readFileSync(
          path.join(EHG_ROOT, cap.source_file),
          'utf-8'
        );

        // Find imports
        const imports = content.matchAll(/import\s+.*from\s+['"]([^'"]+)['"]/gi);
        const deps = [];

        for (const imp of imports) {
          const importPath = imp[1];
          // Find if any capability matches this import
          const matchingCap = capabilities.find(
            (c) => c.source_file && c.source_file.includes(importPath)
          );
          if (matchingCap) {
            deps.push(matchingCap.capability_key);
          }
        }

        if (deps.length > 0) {
          dependencyMap.set(cap.capability_key, deps);
        }
      } catch (e) {
        // Skip files that can't be read
      }
    }
  }

  console.log(`   Found ${dependencyMap.size} capabilities with dependencies`);
  return dependencyMap;
}

/**
 * Calculate Plane 1 scores for capabilities
 */
function calculateScores(capabilities, existingCaps, dependencyMap) {
  console.log('\n📈 Calculating Plane 1 scores...');

  const scored = capabilities.map((cap) => {
    const existing = existingCaps.find((e) => e.capability_key === cap.capability_key);
    const deps = dependencyMap.get(cap.capability_key) || [];
    const dependedBy = Array.from(dependencyMap.entries())
      .filter(([_, v]) => v.includes(cap.capability_key))
      .map(([k, _]) => k);

    // Use existing scores or estimate defaults
    const maturity = existing?.maturity_score ?? estimateMaturity(cap);
    const extraction = existing?.extraction_score ?? estimateExtraction(cap);
    const reuseCount = existing?.reuse_count ?? dependedBy.length;

    const scoreInput = {
      capability_type: cap.capability_type,
      maturity_score: maturity,
      extraction_score: extraction,
      reuse_count: reuseCount,
    };

    const plane1 = calculatePlane1Score(scoreInput);

    return {
      ...cap,
      maturity_score: maturity,
      extraction_score: extraction,
      reuse_count: reuseCount,
      depends_on: deps,
      depended_by: dependedBy,
      plane1_score: plane1.weighted_total,
      plane1_breakdown: plane1,
    };
  });

  return scored;
}

/**
 * Estimate maturity score based on file analysis
 */
function estimateMaturity(cap) {
  // Default estimates based on capability type patterns
  const typeDefaults = {
    agent: 2, // Most agents are functional
    crew: 2,
    tool: 3, // Tools tend to be more mature
    skill: 2,
    database_schema: 3, // Schemas are usually stable
    database_function: 3,
    rls_policy: 2,
    api_endpoint: 2,
    component: 2,
    hook: 2,
    service: 2,
    workflow: 2,
    quality_gate: 3,
    protocol: 3,
  };

  return typeDefaults[cap.capability_type] || 2;
}

/**
 * Estimate extraction score based on file location
 */
function estimateExtraction(cap) {
  if (!cap.source_file) return 1;

  // Higher extraction for lib/shared locations
  if (cap.source_file.includes('/lib/') || cap.source_file.includes('/shared/')) {
    return 3;
  }
  if (cap.source_file.includes('/utils/') || cap.source_file.includes('/helpers/')) {
    return 3;
  }
  if (cap.source_file.includes('/components/') || cap.source_file.includes('/hooks/')) {
    return 2;
  }

  return 1;
}

/**
 * Generate capability report
 */
function generateReport(capabilities) {
  console.log('\n📋 CAPABILITY LEDGER REPORT');
  console.log('═'.repeat(70));

  // Summary by category
  const byCategory = {};
  for (const cap of capabilities) {
    const type = getCapabilityType(cap.capability_type);
    const category = type?.category || 'unknown';
    byCategory[category] = byCategory[category] || [];
    byCategory[category].push(cap);
  }

  console.log('\n📊 SUMMARY BY CATEGORY:');
  console.log('-'.repeat(50));
  for (const [category, caps] of Object.entries(byCategory)) {
    const catInfo = Object.values(CAPABILITY_CATEGORIES).find((c) => c.code === category);
    const avgPlane1 = caps.reduce((sum, c) => sum + (c.plane1_score || 0), 0) / caps.length;
    console.log(`   ${catInfo?.name || category}: ${caps.length} capabilities (avg Plane 1: ${avgPlane1.toFixed(2)})`);
  }

  // Top 10 by Plane 1 score
  console.log('\n🏆 TOP 10 BY PLANE 1 SCORE:');
  console.log('-'.repeat(50));
  const top10 = [...capabilities]
    .sort((a, b) => (b.plane1_score || 0) - (a.plane1_score || 0))
    .slice(0, 10);

  for (const cap of top10) {
    console.log(
      `   ${cap.plane1_score?.toFixed(2) || '0.00'} | ${cap.capability_type.padEnd(15)} | ${cap.capability_key.substring(0, 40)}`
    );
  }

  // Most reused
  console.log('\n🔄 MOST REUSED CAPABILITIES:');
  console.log('-'.repeat(50));
  const mostReused = [...capabilities]
    .filter((c) => c.reuse_count > 0)
    .sort((a, b) => (b.reuse_count || 0) - (a.reuse_count || 0))
    .slice(0, 10);

  if (mostReused.length === 0) {
    console.log('   No reuse data yet. Run capability analysis after SD completions.');
  } else {
    for (const cap of mostReused) {
      console.log(
        `   ${cap.reuse_count} reuses | ${cap.capability_type.padEnd(15)} | ${cap.capability_key.substring(0, 40)}`
      );
    }
  }

  // Central capabilities (most depended upon)
  console.log('\n🎯 MOST CENTRAL (DEPENDED UPON):');
  console.log('-'.repeat(50));
  const mostCentral = [...capabilities]
    .filter((c) => c.depended_by && c.depended_by.length > 0)
    .sort((a, b) => (b.depended_by?.length || 0) - (a.depended_by?.length || 0))
    .slice(0, 10);

  if (mostCentral.length === 0) {
    console.log('   No dependency data yet. Run full codebase scan.');
  } else {
    for (const cap of mostCentral) {
      console.log(
        `   ${cap.depended_by.length} deps | ${cap.capability_type.padEnd(15)} | ${cap.capability_key.substring(0, 40)}`
      );
    }
  }

  console.log('\n' + '═'.repeat(70));

  return {
    total: capabilities.length,
    byCategory,
    top10,
    mostReused,
    mostCentral,
  };
}

/**
 * Sync capabilities to database
 */
async function syncToDatabase(client, capabilities) {
  console.log('\n💾 Syncing capabilities to database...');

  let inserted = 0;
  let updated = 0;

  for (const cap of capabilities) {
    try {
      // Check if exists
      const existing = await client.query(
        'SELECT id FROM sd_capabilities WHERE capability_key = $1 LIMIT 1',
        [cap.capability_key]
      );

      if (existing.rows.length > 0) {
        // Update existing
        await client.query(
          `UPDATE sd_capabilities SET
            maturity_score = $1,
            extraction_score = $2,
            depends_on = $3,
            depended_by = $4,
            source_files = source_files || $5::jsonb
          WHERE capability_key = $6`,
          [
            cap.maturity_score,
            cap.extraction_score,
            JSON.stringify(cap.depends_on || []),
            JSON.stringify(cap.depended_by || []),
            JSON.stringify([cap.source_file].filter(Boolean)),
            cap.capability_key,
          ]
        );
        updated++;
      } else {
        // Insert new (without sd_uuid for scanner-detected capabilities)
        // These will be properly registered when an SD delivers them
        console.log(`   Detected but not registered: ${cap.capability_key} (${cap.capability_type})`);
      }
    } catch (e) {
      // Skip errors
    }
  }

  console.log(`   Updated: ${updated} capabilities`);
  console.log(`   New (unregistered): ${capabilities.length - updated} detected`);
}

/**
 * Main analysis pipeline
 */
async function main() {
  const command = process.argv[2] || 'analyze';

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           CAPABILITY ANALYZER PIPELINE                            ║');
  console.log('║           SD-CAP-LEDGER-001 | US-003                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    if (command === 'scan' || command === 'analyze') {
      // Scan codebase
      const detected = await scanCodebase(EHG_ROOT);

      // Also scan engineer repo
      const engineerDetected = await scanCodebase(ENGINEER_ROOT);
      detected.push(...engineerDetected);

      // Load existing from database
      const existing = await loadExistingCapabilities(client);

      // Analyze dependencies
      const deps = await analyzeDependencies(detected);

      // Calculate scores
      const scored = calculateScores(detected, existing, deps);

      if (command === 'analyze') {
        // Sync to database
        await syncToDatabase(client, scored);
      }

      // Generate report
      generateReport(scored);
    } else if (command === 'report') {
      // Load from database only
      const existing = await loadExistingCapabilities(client);
      generateReport(existing);
    } else {
      console.log('Usage:');
      console.log('  node capability-analyzer.js analyze  - Full analysis with sync');
      console.log('  node capability-analyzer.js scan     - Scan codebase only');
      console.log('  node capability-analyzer.js report   - Report from database');
    }
  } finally {
    await client.end();
  }
}

main().catch(console.error);
