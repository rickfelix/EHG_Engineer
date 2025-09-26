#!/usr/bin/env node

/**
 * classify-strategic-directives.js
 *
 * Purpose: Classify Strategic Directives as either EHG_ENGINEER or EHG
 *
 * Classification Rule:
 * - EHG_ENGINEER: LEO Protocol development workflow (LEAD/PLAN/EXEC agents, SD management)
 * - EHG: Everything else (business agents like EVA, all stages, dashboards, features)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// List of known EHG_Engineer SD patterns
const EHG_ENGINEER_PATTERNS = {
  // Specific SD keys
  keys: [
    'SD-002',                  // AI Navigation for EHG_Engineer
    'SD-2025-0903-SDIP',      // Strategic Directive Initiation Protocol
    'SD-2025-09-EMB',         // Message Bus for Agent Handoffs
    'SD-GOVERNANCE-UI-001',   // Governance UI
    'SD-MONITORING-001',      // Observability Framework
    'SD-VISION-ALIGN-001'     // Vision Alignment System
  ],

  // Title patterns (must include these AND exclude business terms)
  titleIncludes: [
    'LEO Protocol',
    'SD Management',
    'PRD Management',
    'Handoff Management',
    'Strategic Directive Management',
    'Development Workflow'
  ],

  // Title patterns that indicate EHG (not EHG_Engineer)
  titleExcludes: [
    'Chairman',
    'EVA',
    'Stage',
    'Venture',
    'Customer',
    'Voice',
    'GTM',
    'AI CEO'
  ]
};

async function classifyStrategicDirectives() {
  try {
    console.log('🔍 Starting Strategic Directive Classification...\n');

    // Get all strategic directives
    const { data: sds, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`Found ${sds.length} Strategic Directives to classify\n`);

    const classification = {
      EHG_ENGINEER: [],
      EHG: []
    };

    // Classify each SD
    for (const sd of sds) {
      let target = 'EHG'; // Default to EHG
      let reason = 'Default (business feature)';

      // Check if it's an EHG_Engineer SD by key
      if (EHG_ENGINEER_PATTERNS.keys.includes(sd.key)) {
        target = 'EHG_ENGINEER';
        reason = `Known EHG_Engineer SD key: ${sd.key}`;
      }
      // Check title patterns
      else if (sd.title) {
        const titleLower = sd.title.toLowerCase();

        // Check for EHG_Engineer patterns
        const hasEngineerPattern = EHG_ENGINEER_PATTERNS.titleIncludes.some(
          pattern => titleLower.includes(pattern.toLowerCase())
        );

        // Check for EHG exclusion patterns
        const hasBusinessPattern = EHG_ENGINEER_PATTERNS.titleExcludes.some(
          pattern => titleLower.includes(pattern.toLowerCase())
        );

        if (hasEngineerPattern && !hasBusinessPattern) {
          target = 'EHG_ENGINEER';
          reason = 'Title indicates LEO Protocol/development feature';
        }
      }

      classification[target].push({
        id: sd.id,
        key: sd.key,
        title: sd.title,
        status: sd.status,
        reason
      });
    }

    // Display results
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    CLASSIFICATION RESULTS                      ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`📊 Summary:`);
    console.log(`  • EHG SDs (Business Application): ${classification.EHG.length} (${(classification.EHG.length / sds.length * 100).toFixed(1)}%)`);
    console.log(`  • EHG_ENGINEER SDs (Dev Platform): ${classification.EHG_ENGINEER.length} (${(classification.EHG_ENGINEER.length / sds.length * 100).toFixed(1)}%)`);
    console.log(`  • Total SDs: ${sds.length}\n`);

    // Show EHG_Engineer SDs
    if (classification.EHG_ENGINEER.length > 0) {
      console.log('🛠️  EHG_ENGINEER Strategic Directives (Development Platform):');
      console.log('────────────────────────────────────────────────────────────');
      classification.EHG_ENGINEER.forEach((sd, i) => {
        console.log(`  ${i + 1}. ${sd.key || sd.id}`);
        console.log(`     Title: ${sd.title || 'N/A'}`);
        console.log(`     Status: ${sd.status}`);
        console.log(`     Reason: ${sd.reason}`);
        console.log('');
      });
    }

    // Show sample of EHG SDs
    console.log('🚀 EHG Strategic Directives (Business Application) - Sample:');
    console.log('────────────────────────────────────────────────────────────');
    const sampleSize = Math.min(10, classification.EHG.length);
    classification.EHG.slice(0, sampleSize).forEach((sd, i) => {
      console.log(`  ${i + 1}. ${sd.key || sd.id}: ${sd.title || 'N/A'}`);
    });
    if (classification.EHG.length > sampleSize) {
      console.log(`  ... and ${classification.EHG.length - sampleSize} more\n`);
    }

    // Ask for confirmation before updating
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('To apply these classifications to the database, run:');
    console.log('  node scripts/apply-sd-classification.js');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Save classification to file for review
    const fs = require('fs');
    const classificationReport = {
      timestamp: new Date().toISOString(),
      summary: {
        total: sds.length,
        ehg: classification.EHG.length,
        ehg_engineer: classification.EHG_ENGINEER.length
      },
      classifications: {
        EHG_ENGINEER: classification.EHG_ENGINEER,
        EHG: classification.EHG.map(sd => ({
          key: sd.key,
          title: sd.title,
          status: sd.status
        }))
      }
    };

    fs.writeFileSync(
      'sd-classification-report.json',
      JSON.stringify(classificationReport, null, 2)
    );
    console.log('📄 Full report saved to: sd-classification-report.json\n');

  } catch (error) {
    console.error('❌ Error classifying Strategic Directives:', error);
    process.exit(1);
  }
}

// Run classification
classifyStrategicDirectives();