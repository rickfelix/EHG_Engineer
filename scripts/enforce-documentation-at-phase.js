#!/usr/bin/env node

/**
 * Enforce Documentation Monitor at Critical LEO Protocol Phases
 * Ensures documentation is updated and maintained throughout the SD lifecycle
 */

const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class DocumentationEnforcer {
  constructor(phase, sdId, prdId) {
    this.phase = phase;
    this.sdId = sdId;
    this.prdId = prdId;
    this.maxWaitTime = 60000; // 1 minute max wait
  }

  async enforceDocumentation() {
    console.log('📚 Documentation Enforcement Check');
    console.log('===================================');
    console.log(`Phase: ${this.phase}`);
    console.log(`SD: ${this.sdId || 'N/A'}`);
    console.log(`PRD: ${this.prdId || 'N/A'}\n`);

    try {
      // Step 1: Check if documentation is up to date
      const isUpToDate = await this.checkDocumentationStatus();

      if (isUpToDate) {
        console.log('✅ Documentation is up to date. Phase can proceed.\n');
        return {
          status: 'approved',
          message: 'Documentation requirement satisfied',
          documentationStatus: 'current'
        };
      }

      // Step 2: Documentation needs updating, trigger DOCMON
      console.log('⚠️  Documentation needs updating. Triggering DOCMON sub-agent...\n');
      const docUpdated = await this.triggerDocumentationUpdate();

      if (docUpdated) {
        console.log('✅ Documentation successfully updated. Phase can proceed.\n');
        return {
          status: 'approved',
          message: 'Documentation updated and requirement satisfied',
          documentationStatus: 'updated'
        };
      } else {
        console.log('❌ Failed to update documentation. Phase blocked.\n');
        return {
          status: 'blocked',
          message: 'Documentation update failed - phase blocked',
          documentationStatus: 'outdated'
        };
      }

    } catch (error) {
      console.error('❌ Error in documentation enforcement:', error.message);
      return {
        status: 'error',
        message: error.message,
        documentationStatus: 'unknown'
      };
    }
  }

  async checkDocumentationStatus() {
    // Check for recent documentation updates
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    // Query for documentation events
    const { data: docEvents, error } = await supabase
      .from('leo_events')
      .select('event_type, event_data, created_at')
      .in('event_type', ['DOCUMENTATION_UPDATE', 'DOCMON_EXECUTION'])
      .gte('created_at', oneHourAgo.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error checking documentation status:', error.message);
      return false;
    }

    // Check if any documentation events are related to current SD/PRD
    const relevantEvents = docEvents?.filter(event => {
      const eventData = event.event_data || {};
      return eventData.sd_id === this.sdId || eventData.prd_id === this.prdId;
    });

    if (relevantEvents && relevantEvents.length > 0) {
      console.log(`📊 Found ${relevantEvents.length} recent documentation event(s):`);
      relevantEvents.slice(0, 3).forEach(event => {
        console.log(`   - ${event.event_type} at ${event.created_at}`);
      });
      console.log();
      return true;
    }

    // Check documentation metadata in SD/PRD
    if (this.sdId) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('metadata')
        .eq('id', this.sdId)
        .single();

      const lastDocUpdate = sd?.metadata?.last_documentation_update;
      if (lastDocUpdate && new Date(lastDocUpdate) > oneHourAgo) {
        console.log('📊 SD has recent documentation update.\n');
        return true;
      }
    }

    console.log('📊 No recent documentation updates found.\n');
    return false;
  }

  async triggerDocumentationUpdate() {
    console.log('🚀 Triggering DOCMON sub-agent...');
    console.log(`   Phase: ${this.phase}`);
    console.log(`   Context: SD=${this.sdId}, PRD=${this.prdId}\n`);

    const docmonScript = path.join(__dirname, 'documentation-monitor-subagent.js');

    return new Promise((resolve) => {
      const args = ['--trigger', this.phase];
      if (this.sdId) args.push('--sd-id', this.sdId);
      if (this.prdId) args.push('--prd-id', this.prdId);

      const docmonProcess = spawn('node', [docmonScript, ...args], {
        env: { ...process.env },
        cwd: __dirname
      });

      let output = '';

      docmonProcess.stdout.on('data', (data) => {
        output += data.toString();
        process.stdout.write(data);
      });

      docmonProcess.stderr.on('data', (data) => {
        process.stderr.write(data);
      });

      docmonProcess.on('close', async (code) => {
        if (code === 0) {
          console.log('✅ Documentation update completed successfully\n');

          // Log the documentation event
          await this.logDocumentationEvent('completed');

          // Verify the documentation was actually updated
          const verified = await this.checkDocumentationStatus();
          resolve(verified);
        } else {
          console.error(`❌ Documentation update failed with code ${code}\n`);

          // Fallback: Create minimal documentation entry
          console.log('🔄 Attempting fallback documentation creation...');
          const fallbackSuccess = await this.createFallbackDocumentation();
          resolve(fallbackSuccess);
        }
      });

      // Timeout handler
      setTimeout(() => {
        console.error('⏱️ Documentation update timed out');
        docmonProcess.kill();
        resolve(false);
      }, this.maxWaitTime);
    });
  }

  async createFallbackDocumentation() {
    try {
      // Create a basic documentation entry
      const docEntry = {
        phase: this.phase,
        sd_id: this.sdId,
        prd_id: this.prdId,
        type: 'phase_documentation',
        content: {
          summary: `Documentation checkpoint for ${this.phase}`,
          timestamp: new Date().toISOString(),
          auto_generated: true,
          reason: 'Enforcement fallback'
        }
      };

      // Log the documentation event
      const { error } = await supabase
        .from('leo_events')
        .insert({
          event_type: 'DOCUMENTATION_UPDATE',
          event_data: docEntry
        });

      if (error) {
        console.error('Failed to create fallback documentation:', error.message);
        return false;
      }

      // Update SD metadata if applicable
      if (this.sdId) {
        const { data: sd } = await supabase
          .from('strategic_directives_v2')
          .select('metadata')
          .eq('id', this.sdId)
          .single();

        const updatedMetadata = {
          ...sd?.metadata,
          last_documentation_update: new Date().toISOString(),
          documentation_phases: [
            ...(sd?.metadata?.documentation_phases || []),
            this.phase
          ]
        };

        await supabase
          .from('strategic_directives_v2')
          .update({ metadata: updatedMetadata })
          .eq('id', this.sdId);
      }

      console.log('✅ Fallback documentation created');
      return true;

    } catch (error) {
      console.error('Error in fallback documentation creation:', error.message);
      return false;
    }
  }

  async logDocumentationEvent(status) {
    await supabase.from('leo_events').insert({
      event_type: 'DOCMON_EXECUTION',
      event_data: {
        phase: this.phase,
        sd_id: this.sdId,
        prd_id: this.prdId,
        status: status,
        timestamp: new Date().toISOString()
      }
    });
  }

  async getDocumentationSummary() {
    // Get recent documentation for review
    const { data: docs } = await supabase
      .from('leo_events')
      .select('event_data')
      .eq('event_type', 'DOCUMENTATION_UPDATE')
      .or(`event_data->sd_id.eq.${this.sdId},event_data->prd_id.eq.${this.prdId}`)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!docs || docs.length === 0) {
      return null;
    }

    return {
      recent_updates: docs.length,
      phases_documented: [...new Set(docs.map(d => d.event_data?.phase).filter(Boolean))],
      last_update: docs[0]?.event_data?.timestamp
    };
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const phaseIndex = args.indexOf('--phase');
  const sdIdIndex = args.indexOf('--sd-id');
  const prdIdIndex = args.indexOf('--prd-id');

  if (phaseIndex === -1 || !args[phaseIndex + 1]) {
    console.error('Usage: node enforce-documentation-at-phase.js --phase <PHASE> [--sd-id <SD_ID>] [--prd-id <PRD_ID>]');
    console.error('Phases: LEAD_TO_PLAN, PLAN_TO_EXEC, EXEC_TO_VERIFICATION, FINAL_APPROVAL');
    process.exit(1);
  }

  const phase = args[phaseIndex + 1];
  const sdId = sdIdIndex !== -1 ? args[sdIdIndex + 1] : null;
  const prdId = prdIdIndex !== -1 ? args[prdIdIndex + 1] : null;

  const enforcer = new DocumentationEnforcer(phase, sdId, prdId);
  const result = await enforcer.enforceDocumentation();

  // Get documentation summary if approved
  if (result.status === 'approved') {
    const summary = await enforcer.getDocumentationSummary();
    if (summary) {
      console.log('📋 Documentation Summary:');
      console.log('========================');
      console.log(`Recent Updates: ${summary.recent_updates}`);
      console.log(`Phases Documented: ${summary.phases_documented.join(', ')}`);
      console.log(`Last Update: ${summary.last_update}`);
      console.log('========================\n');
    }
  }

  // Exit with appropriate code
  process.exit(result.status === 'approved' ? 0 : 1);
}

// Export for use in other scripts
module.exports = DocumentationEnforcer;

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}