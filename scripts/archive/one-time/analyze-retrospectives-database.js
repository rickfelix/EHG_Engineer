#!/usr/bin/env node
/**
 * Analyze Retrospectives from DATABASE (Not Markdown Files!)
 *
 * Purpose: Query retrospectives table and extract sub-agent performance patterns
 * Source: Supabase retrospectives table (85+ records)
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SUB_AGENTS = {
  DOCMON: 'Information Architecture Lead',
  UAT: 'UAT Test Executor',
  GITHUB: 'DevOps Platform Architect',
  RETRO: 'Continuous Improvement Coach',
  DESIGN: 'Senior Design Sub-Agent',
  RESEARCH: 'Research Agent',
  STORIES: 'Product Requirements Expert',
  FINANCIAL_ANALYTICS: 'Senior Financial Analytics Engineer',
  SECURITY: 'Chief Security Architect',
  DATABASE: 'Principal Database Architect',
  TESTING: 'QA Engineering Director',
  PERFORMANCE: 'Performance Engineering Lead',
  VALIDATION: 'Principal Systems Analyst'
};

async function analyzeRetrospectives() {
  console.log('📊 Analyzing Retrospectives from DATABASE...\n');

  // Query ALL retrospectives
  const { data: retrospectives, error } = await supabase
    .from('retrospectives')
    .select('*')
    .not('sd_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error querying retrospectives:', error.message);
    process.exit(1);
  }

  console.log(`Found ${retrospectives.length} retrospectives in database\n`);

  // Initialize findings for each sub-agent
  const findings = {};
  Object.keys(SUB_AGENTS).forEach(code => {
    findings[code] = {
      name: SUB_AGENTS[code],
      mentions: 0,
      explicit_mentions: [],
      success_patterns: [],
      failure_patterns: [],
      improvement_areas: [],
      key_learnings: [],
      what_went_well: [],
      what_needs_improvement: [],
      sds_involved: []
    };
  });

  // Analyze each retrospective
  retrospectives.forEach(retro => {
    const sdId = retro.sd_id;

    // Check sub_agents_involved field
    if (retro.sub_agents_involved && Array.isArray(retro.sub_agents_involved)) {
      retro.sub_agents_involved.forEach(agentName => {
        // Match agent name to code
        const code = Object.keys(SUB_AGENTS).find(c => SUB_AGENTS[c] === agentName);
        if (code && findings[code]) {
          findings[code].mentions++;
          findings[code].explicit_mentions.push({
            sd_id: sdId,
            field: 'sub_agents_involved'
          });
          if (!findings[code].sds_involved.includes(sdId)) {
            findings[code].sds_involved.push(sdId);
          }
        }
      });
    }

    // Search in success_patterns
    if (retro.success_patterns && Array.isArray(retro.success_patterns)) {
      retro.success_patterns.forEach(pattern => {
        Object.keys(SUB_AGENTS).forEach(code => {
          const agentName = SUB_AGENTS[code];
          if (pattern.toLowerCase().includes(agentName.toLowerCase()) ||
              pattern.toLowerCase().includes(code.toLowerCase())) {
            findings[code].success_patterns.push({
              sd_id: sdId,
              pattern
            });
            if (!findings[code].sds_involved.includes(sdId)) {
              findings[code].sds_involved.push(sdId);
            }
          }
        });
      });
    }

    // Search in failure_patterns
    if (retro.failure_patterns && Array.isArray(retro.failure_patterns)) {
      retro.failure_patterns.forEach(pattern => {
        Object.keys(SUB_AGENTS).forEach(code => {
          const agentName = SUB_AGENTS[code];
          if (pattern.toLowerCase().includes(agentName.toLowerCase()) ||
              pattern.toLowerCase().includes(code.toLowerCase())) {
            findings[code].failure_patterns.push({
              sd_id: sdId,
              pattern
            });
            if (!findings[code].sds_involved.includes(sdId)) {
              findings[code].sds_involved.push(sdId);
            }
          }
        });
      });
    }

    // Search in key_learnings
    if (retro.key_learnings && Array.isArray(retro.key_learnings)) {
      retro.key_learnings.forEach(learning => {
        Object.keys(SUB_AGENTS).forEach(code => {
          const agentName = SUB_AGENTS[code];
          const learningText = learning.learning || '';
          if (learningText.toLowerCase().includes(agentName.toLowerCase()) ||
              learningText.toLowerCase().includes(code.toLowerCase()) ||
              (learning.category && learning.category.toLowerCase().includes(code.toLowerCase()))) {
            findings[code].key_learnings.push({
              sd_id: sdId,
              category: learning.category,
              learning: learning.learning
            });
            if (!findings[code].sds_involved.includes(sdId)) {
              findings[code].sds_involved.push(sdId);
            }
          }
        });
      });
    }

    // Search in what_went_well
    if (retro.what_went_well && Array.isArray(retro.what_went_well)) {
      retro.what_went_well.forEach(item => {
        Object.keys(SUB_AGENTS).forEach(code => {
          const agentName = SUB_AGENTS[code];
          const description = item.description || '';
          const category = item.category || '';
          if (description.toLowerCase().includes(agentName.toLowerCase()) ||
              description.toLowerCase().includes(code.toLowerCase()) ||
              category.toLowerCase().includes(code.toLowerCase())) {
            findings[code].what_went_well.push({
              sd_id: sdId,
              category: item.category,
              description: item.description,
              impact: item.impact
            });
            if (!findings[code].sds_involved.includes(sdId)) {
              findings[code].sds_involved.push(sdId);
            }
          }
        });
      });
    }

    // Search in what_needs_improvement
    if (retro.what_needs_improvement && Array.isArray(retro.what_needs_improvement)) {
      retro.what_needs_improvement.forEach(item => {
        Object.keys(SUB_AGENTS).forEach(code => {
          const agentName = SUB_AGENTS[code];
          const description = item.description || '';
          const category = item.category || '';
          if (description.toLowerCase().includes(agentName.toLowerCase()) ||
              description.toLowerCase().includes(code.toLowerCase()) ||
              category.toLowerCase().includes(code.toLowerCase())) {
            findings[code].what_needs_improvement.push({
              sd_id: sdId,
              category: item.category,
              description: item.description,
              severity: item.severity
            });
            if (!findings[code].sds_involved.includes(sdId)) {
              findings[code].sds_involved.push(sdId);
            }
          }
        });
      });
    }

    // Search in improvement_areas
    if (retro.improvement_areas && Array.isArray(retro.improvement_areas)) {
      retro.improvement_areas.forEach(area => {
        Object.keys(SUB_AGENTS).forEach(code => {
          const agentName = SUB_AGENTS[code];
          if (area.toLowerCase().includes(agentName.toLowerCase()) ||
              area.toLowerCase().includes(code.toLowerCase())) {
            findings[code].improvement_areas.push({
              sd_id: sdId,
              area
            });
            if (!findings[code].sds_involved.includes(sdId)) {
              findings[code].sds_involved.push(sdId);
            }
          }
        });
      });
    }
  });

  // Generate report
  const report = {
    total_retrospectives: retrospectives.length,
    analyzed_at: new Date().toISOString(),
    source: 'DATABASE (retrospectives table)',
    sub_agent_findings: {}
  };

  Object.keys(findings).forEach(code => {
    const f = findings[code];
    report.sub_agent_findings[code] = {
      name: f.name,
      total_mentions: f.mentions,
      sds_involved_count: f.sds_involved.length,
      sds_involved: f.sds_involved,
      explicit_mentions: f.explicit_mentions.length,
      success_patterns_count: f.success_patterns.length,
      failure_patterns_count: f.failure_patterns.length,
      key_learnings_count: f.key_learnings.length,
      what_went_well_count: f.what_went_well.length,
      what_needs_improvement_count: f.what_needs_improvement.length,
      improvement_areas_count: f.improvement_areas.length,
      success_patterns: f.success_patterns,
      failure_patterns: f.failure_patterns,
      key_learnings: f.key_learnings,
      what_went_well: f.what_went_well,
      what_needs_improvement: f.what_needs_improvement,
      improvement_areas: f.improvement_areas
    };
  });

  // Save to file
  const outputPath = 'retrospectives/database-analysis-report.json';
  writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`✅ Analysis complete! Report saved to: ${outputPath}\n`);

  // Print summary
  console.log('📋 Sub-Agent Findings Summary:\n');

  const sortedAgents = Object.keys(report.sub_agent_findings)
    .sort((a, b) => {
      const aTotal = report.sub_agent_findings[a].sds_involved_count;
      const bTotal = report.sub_agent_findings[b].sds_involved_count;
      return bTotal - aTotal;
    });

  sortedAgents.forEach(code => {
    const f = report.sub_agent_findings[code];
    console.log(`${code} (${f.name})`);
    console.log(`  SDs Involved: ${f.sds_involved_count}`);
    console.log(`  Success Patterns: ${f.success_patterns_count}`);
    console.log(`  Failure Patterns: ${f.failure_patterns_count}`);
    console.log(`  Key Learnings: ${f.key_learnings_count}`);
    console.log(`  What Went Well: ${f.what_went_well_count}`);
    console.log(`  What Needs Improvement: ${f.what_needs_improvement_count}`);
    console.log(`  Improvement Areas: ${f.improvement_areas_count}`);
    console.log('');
  });

  return report;
}

analyzeRetrospectives().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
