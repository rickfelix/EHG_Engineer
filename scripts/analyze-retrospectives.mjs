#!/usr/bin/env node
/**
 * Query and analyze recent retrospectives for pattern identification
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function analyzeRetrospectives() {
  let client;

  try {
    // Connect to EHG_Engineer database
    client = await createDatabaseClient('engineer', { verbose: true });

    // Query recent retrospectives with quality_score >= 60
    const query = `
      SELECT
        id,
        sd_id,
        title,
        quality_score,
        success_patterns,
        failure_patterns,
        key_learnings,
        what_went_well,
        what_needs_improvement,
        action_items,
        improvement_areas,
        team_satisfaction,
        created_at
      FROM retrospectives
      WHERE quality_score >= 60
      ORDER BY created_at DESC
      LIMIT 15;
    `;

    console.log('\n🔍 Querying retrospectives...\n');
    const result = await client.query(query);

    if (result.rows.length === 0) {
      console.log('No retrospectives found with quality_score >= 60');
      return;
    }

    console.log(`Found ${result.rows.length} retrospectives\n`);
    console.log('='.repeat(80));

    // Aggregate patterns
    const claudeMdPatterns = new Map();
    const leoProtocolPatterns = new Map();
    const subAgentPatterns = new Map();
    const databasePatterns = new Map();
    const generalPatterns = new Map();

    result.rows.forEach((retro, index) => {
      console.log(`\n[${index + 1}] ${retro.sd_id}: ${retro.title}`);
      console.log(`Quality Score: ${retro.quality_score}, Team Satisfaction: ${retro.team_satisfaction || 'N/A'}`);
      console.log(`Created: ${new Date(retro.created_at).toLocaleDateString()}`);

      // Extract patterns from different fields
      const allPatterns = [
        ...(retro.success_patterns || []),
        ...(retro.failure_patterns || []),
        ...(retro.improvement_areas || [])
      ];

      // Add key_learnings if it's a JSONB array
      if (retro.key_learnings && Array.isArray(retro.key_learnings)) {
        allPatterns.push(...retro.key_learnings);
      } else if (retro.key_learnings && typeof retro.key_learnings === 'object') {
        // If it's a JSONB object, extract values
        Object.values(retro.key_learnings).forEach(val => {
          if (typeof val === 'string') allPatterns.push(val);
        });
      }

      allPatterns.forEach(pattern => {
        if (!pattern || typeof pattern !== 'string') return;

        const patternLower = pattern.toLowerCase();

        // Categorize patterns
        if (patternLower.includes('claude.md') ||
            patternLower.includes('context') ||
            patternLower.includes('router') ||
            patternLower.includes('documentation loading')) {
          claudeMdPatterns.set(pattern, (claudeMdPatterns.get(pattern) || 0) + 1);
        }

        if (patternLower.includes('leo protocol') ||
            patternLower.includes('handoff') ||
            patternLower.includes('gate') ||
            patternLower.includes('phase transition')) {
          leoProtocolPatterns.set(pattern, (leoProtocolPatterns.get(pattern) || 0) + 1);
        }

        if (patternLower.includes('sub-agent') ||
            patternLower.includes('sub agent') ||
            patternLower.includes('agent orchestration') ||
            patternLower.includes('database agent') ||
            patternLower.includes('qa director')) {
          subAgentPatterns.set(pattern, (subAgentPatterns.get(pattern) || 0) + 1);
        }

        if (patternLower.includes('database') ||
            patternLower.includes('migration') ||
            patternLower.includes('schema') ||
            patternLower.includes('rls') ||
            patternLower.includes('supabase')) {
          databasePatterns.set(pattern, (databasePatterns.get(pattern) || 0) + 1);
        }

        if (!patternLower.includes('claude') &&
            !patternLower.includes('leo') &&
            !patternLower.includes('sub-agent') &&
            !patternLower.includes('database')) {
          generalPatterns.set(pattern, (generalPatterns.get(pattern) || 0) + 1);
        }
      });

      // Show key learnings for this retro
      if (retro.key_learnings) {
        console.log('\nKey Learnings:');
        if (Array.isArray(retro.key_learnings)) {
          retro.key_learnings.slice(0, 3).forEach(learning => {
            console.log(`  - ${learning}`);
          });
        } else if (typeof retro.key_learnings === 'object') {
          Object.values(retro.key_learnings).slice(0, 3).forEach(learning => {
            console.log(`  - ${learning}`);
          });
        }
      }
    });

    // Print aggregated analysis
    console.log('\n\n' + '='.repeat(80));
    console.log('AGGREGATED PATTERN ANALYSIS');
    console.log('='.repeat(80));

    console.log('\n📝 CLAUDE.md / Context Management Patterns:');
    console.log('-'.repeat(80));
    if (claudeMdPatterns.size === 0) {
      console.log('No specific patterns found');
    } else {
      [...claudeMdPatterns.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([pattern, count]) => {
          console.log(`[${count}x] ${pattern}`);
        });
    }

    console.log('\n🔄 LEO Protocol / Handoff Patterns:');
    console.log('-'.repeat(80));
    if (leoProtocolPatterns.size === 0) {
      console.log('No specific patterns found');
    } else {
      [...leoProtocolPatterns.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([pattern, count]) => {
          console.log(`[${count}x] ${pattern}`);
        });
    }

    console.log('\n🤖 Sub-Agent Patterns:');
    console.log('-'.repeat(80));
    if (subAgentPatterns.size === 0) {
      console.log('No specific patterns found');
    } else {
      [...subAgentPatterns.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([pattern, count]) => {
          console.log(`[${count}x] ${pattern}`);
        });
    }

    console.log('\n🗄️ Database Patterns:');
    console.log('-'.repeat(80));
    if (databasePatterns.size === 0) {
      console.log('No specific patterns found');
    } else {
      [...databasePatterns.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([pattern, count]) => {
          console.log(`[${count}x] ${pattern}`);
        });
    }

    console.log('\n🎯 General Patterns (Top 10):');
    console.log('-'.repeat(80));
    if (generalPatterns.size === 0) {
      console.log('No specific patterns found');
    } else {
      [...generalPatterns.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([pattern, count]) => {
          console.log(`[${count}x] ${pattern}`);
        });
    }

    console.log('\n' + '='.repeat(80));
    console.log('RECOMMENDATIONS (High-Impact Only)');
    console.log('='.repeat(80));

    // Generate recommendations based on frequency
    const recommendations = [];

    [...claudeMdPatterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([pattern, count]) => {
        if (count >= 2) {
          recommendations.push({
            category: 'CLAUDE.md',
            severity: count >= 4 ? 'HIGH' : 'MEDIUM',
            pattern,
            frequency: count,
            impact: 'Context efficiency, session startup time'
          });
        }
      });

    [...leoProtocolPatterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([pattern, count]) => {
        if (count >= 2) {
          recommendations.push({
            category: 'LEO Protocol',
            severity: count >= 4 ? 'HIGH' : 'MEDIUM',
            pattern,
            frequency: count,
            impact: 'Workflow reliability, phase transitions'
          });
        }
      });

    [...subAgentPatterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([pattern, count]) => {
        if (count >= 2) {
          recommendations.push({
            category: 'Sub-Agents',
            severity: count >= 4 ? 'HIGH' : 'MEDIUM',
            pattern,
            frequency: count,
            impact: 'Automation quality, error handling'
          });
        }
      });

    if (recommendations.length === 0) {
      console.log('\nNo high-impact patterns detected (all patterns occur < 2 times)');
    } else {
      recommendations
        .sort((a, b) => b.frequency - a.frequency)
        .forEach((rec, idx) => {
          console.log(`\n[${idx + 1}] ${rec.severity} - ${rec.category}`);
          console.log(`    Pattern: ${rec.pattern}`);
          console.log(`    Frequency: ${rec.frequency} retrospectives`);
          console.log(`    Impact: ${rec.impact}`);
        });
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('Error analyzing retrospectives:', error);
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('\n✅ Database connection closed');
    }
  }
}

// Run the analysis
analyzeRetrospectives()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
