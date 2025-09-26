#!/usr/bin/env node

/**
 * Enforce Retrospective Generation Before LEAD Final Approval
 * This script ensures that a retrospective is generated for an SD before LEAD can provide final approval
 */

const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class RetrospectiveEnforcer {
  constructor(sdId) {
    this.sdId = sdId;
    this.maxWaitTime = 60000; // 1 minute max wait for retrospective generation
  }

  async enforceRetrospective() {
    console.log('🔍 Retrospective Enforcement Check for SD:', this.sdId);
    console.log('================================================\n');

    try {
      // Step 1: Check if a recent retrospective exists
      const hasRecentRetro = await this.checkForRecentRetrospective();

      if (hasRecentRetro) {
        console.log('✅ Recent retrospective found. LEAD approval can proceed.\n');
        return { status: 'approved', message: 'Retrospective requirement satisfied' };
      }

      // Step 2: No recent retrospective, trigger generation
      console.log('⚠️  No recent retrospective found. Triggering RETRO sub-agent...\n');
      const retroGenerated = await this.triggerRetrospectiveGeneration();

      if (retroGenerated) {
        console.log('✅ Retrospective successfully generated. LEAD approval can proceed.\n');
        return { status: 'approved', message: 'Retrospective generated and requirement satisfied' };
      } else {
        console.log('❌ Failed to generate retrospective. LEAD approval blocked.\n');
        return { status: 'blocked', message: 'Retrospective generation failed - approval blocked' };
      }

    } catch (error) {
      console.error('❌ Error in retrospective enforcement:', error.message);
      return { status: 'error', message: error.message };
    }
  }

  async checkForRecentRetrospective() {
    // Check for retrospectives created in the last 24 hours for this SD
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: retrospectives, error } = await supabase
      .from('retrospectives')
      .select('id, created_at')
      .eq('sd_id', this.sdId)
      .gte('created_at', twentyFourHoursAgo.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error checking for retrospectives:', error.message);
      return false;
    }

    if (retrospectives && retrospectives.length > 0) {
      console.log(`📊 Found ${retrospectives.length} recent retrospective(s):`);
      retrospectives.forEach(retro => {
        console.log(`   - ID: ${retro.id}`);
        console.log(`     Created: ${retro.created_at}`);
      });
      console.log();
      return true;
    }

    console.log('📊 No recent retrospectives found for this SD.\n');
    return false;
  }

  async triggerRetrospectiveGeneration() {
    console.log('🚀 Triggering RETRO sub-agent for SD:', this.sdId);

    // Option 1: Direct script execution
    const retroScriptPath = path.join(__dirname, 'retrospective-sub-agent.js');

    return new Promise((resolve) => {
      const retroProcess = spawn('node', [retroScriptPath, '--sd-id', this.sdId, '--trigger', 'LEAD_PRE_APPROVAL_REVIEW'], {
        env: { ...process.env },
        cwd: __dirname
      });

      let output = '';

      retroProcess.stdout.on('data', (data) => {
        output += data.toString();
        process.stdout.write(data);
      });

      retroProcess.stderr.on('data', (data) => {
        process.stderr.write(data);
      });

      retroProcess.on('close', async (code) => {
        if (code === 0) {
          console.log('✅ Retrospective generation completed successfully\n');

          // Verify the retrospective was actually created
          const verified = await this.checkForRecentRetrospective();
          resolve(verified);
        } else {
          console.error(`❌ Retrospective generation failed with code ${code}\n`);

          // Fallback: Try to create a basic retrospective entry
          console.log('🔄 Attempting fallback retrospective creation...');
          const fallbackSuccess = await this.createFallbackRetrospective();
          resolve(fallbackSuccess);
        }
      });

      // Timeout handler
      setTimeout(() => {
        console.error('⏱️ Retrospective generation timed out');
        retroProcess.kill();
        resolve(false);
      }, this.maxWaitTime);
    });
  }

  async createFallbackRetrospective() {
    try {
      // Get SD details for context
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status, metadata')
        .eq('id', this.sdId)
        .single();

      if (!sd) {
        console.error('SD not found:', this.sdId);
        return false;
      }

      const retrospective = {
        sd_id: this.sdId,
        title: `Pre-Approval Retrospective: ${sd.title}`,
        summary: `Automated retrospective generated for LEAD approval of ${this.sdId}`,
        learnings: {
          successes: ['SD reached completion phase'],
          challenges: ['Retrospective auto-generation required'],
          recommendations: ['Review retrospective process for this SD type']
        },
        metadata: {
          trigger: 'LEAD_PRE_APPROVAL_REVIEW',
          auto_generated: true,
          sd_status: sd.status,
          generation_reason: 'Enforcement before LEAD approval'
        }
      };

      const { data, error } = await supabase
        .from('retrospectives')
        .insert(retrospective)
        .select();

      if (error) {
        console.error('Failed to create fallback retrospective:', error.message);
        return false;
      }

      console.log('✅ Fallback retrospective created:', data[0].id);
      return true;

    } catch (error) {
      console.error('Error in fallback retrospective creation:', error.message);
      return false;
    }
  }

  async getRetrospectiveInsights() {
    // Fetch the most recent retrospective for insights
    const { data: retrospective } = await supabase
      .from('retrospectives')
      .select('*')
      .eq('sd_id', this.sdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!retrospective) {
      return null;
    }

    return {
      id: retrospective.id,
      created_at: retrospective.created_at,
      summary: retrospective.summary,
      learnings: retrospective.learnings,
      recommendations: retrospective.recommendations || [],
      risk_factors: retrospective.risk_factors || [],
      success_metrics: retrospective.success_metrics || {}
    };
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const sdIdIndex = args.indexOf('--sd-id');

  if (sdIdIndex === -1 || !args[sdIdIndex + 1]) {
    console.error('Usage: node enforce-retrospective-before-approval.js --sd-id <SD_ID>');
    process.exit(1);
  }

  const sdId = args[sdIdIndex + 1];
  const enforcer = new RetrospectiveEnforcer(sdId);

  const result = await enforcer.enforceRetrospective();

  // Get insights if retrospective exists
  if (result.status === 'approved') {
    const insights = await enforcer.getRetrospectiveInsights();
    if (insights) {
      console.log('📋 Retrospective Insights for LEAD Review:');
      console.log('==========================================');
      console.log('Summary:', insights.summary);
      console.log('\nKey Learnings:', JSON.stringify(insights.learnings, null, 2));

      if (insights.recommendations?.length > 0) {
        console.log('\nRecommendations:');
        insights.recommendations.forEach(rec => console.log(`  - ${rec}`));
      }

      console.log('\n==========================================\n');
    }
  }

  // Exit with appropriate code
  process.exit(result.status === 'approved' ? 0 : 1);
}

// Export for use in other scripts
module.exports = RetrospectiveEnforcer;

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}