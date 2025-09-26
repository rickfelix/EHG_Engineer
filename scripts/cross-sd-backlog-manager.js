#!/usr/bin/env node

/**
 * Cross-SD Backlog Manager
 * Enables PLAN agents to utilize and complete backlog items from other SDs
 * Prevents duplicate work through intelligent cross-SD collaboration
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import chalk from 'chalk';
import Table from 'cli-table3';
import { AgentEventBus, EventTypes, Priority } from './agent-event-system.js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class CrossSDBacklogManager {
  constructor(agentCode = 'PLAN') {
    this.agentCode = agentCode;
    this.eventBus = new AgentEventBus(agentCode);
    this.currentSD = null;
    this.currentPRD = null;
  }

  /**
   * Set current context (SD and PRD being worked on)
   */
  setContext(sdId, prdId = null) {
    this.currentSD = sdId;
    this.currentPRD = prdId;
    console.log(chalk.blue(`📍 Context set: SD=${sdId}, PRD=${prdId || 'N/A'}`));
  }

  /**
   * Search for backlog items across all SDs
   */
  async searchBacklogItems(keyword, options = {}) {
    console.log(chalk.cyan(`\n🔍 Searching for "${keyword}" across all backlog items...`));

    try {
      let query = supabase
        .from('sd_backlog_map')
        .select('*, strategic_directives_v2!inner(sd_key, title)')
        .or(`backlog_title.ilike.%${keyword}%,item_description.ilike.%${keyword}%`);

      // Apply filters
      if (options.stage) {
        query = query.eq('stage_number', options.stage);
      }
      if (options.excludeCompleted) {
        query = query.neq('completion_status', 'COMPLETED');
      }
      if (options.priority) {
        query = query.eq('priority', options.priority);
      }

      const { data: items, error } = await query;

      if (error) throw error;

      if (!items || items.length === 0) {
        console.log(chalk.yellow('No matching items found'));
        return [];
      }

      // Check completion status for each item
      const enrichedItems = await Promise.all(
        items.map(async item => {
          const completion = await this.getCompletionStatus(item.backlog_id);
          return {
            ...item,
            completion_info: completion
          };
        })
      );

      // Display results
      this.displaySearchResults(enrichedItems);

      return enrichedItems;

    } catch (error) {
      console.error(chalk.red(`Search error: ${error.message}`));
      return [];
    }
  }

  /**
   * Get completion status for a backlog item
   */
  async getCompletionStatus(backlogId) {
    const { data, error } = await supabase
      .from('backlog_item_completion')
      .select('*')
      .eq('backlog_id', backlogId)
      .single();

    if (error || !data) {
      return { status: 'NOT_STARTED', completed_by: null };
    }

    return {
      status: data.completion_status,
      completed_by: data.completed_by_sd_id,
      completed_by_prd: data.completed_by_prd_id,
      completion_date: data.completion_date,
      completion_type: data.completion_type,
      verified: data.verified
    };
  }

  /**
   * Display search results in a table
   */
  displaySearchResults(items) {
    if (items.length === 0) return;

    const table = new Table({
      head: [
        chalk.cyan('Backlog ID'),
        chalk.cyan('Title'),
        chalk.cyan('SD'),
        chalk.cyan('Stage'),
        chalk.cyan('Status'),
        chalk.cyan('Completed By')
      ],
      colWidths: [15, 40, 20, 8, 15, 20]
    });

    items.forEach(item => {
      const status = item.completion_info.status;
      const statusColor = status === 'COMPLETED' ? chalk.green :
                         status === 'IN_PROGRESS' ? chalk.yellow :
                         chalk.gray;

      table.push([
        item.backlog_id,
        item.backlog_title.substring(0, 38),
        item.strategic_directives_v2.sd_key,
        item.stage_number || 'N/A',
        statusColor(status),
        item.completion_info.completed_by || '-'
      ]);
    });

    console.log(table.toString());
  }

  /**
   * Check if a backlog item is already completed
   */
  async checkIfCompleted(backlogId) {
    console.log(chalk.blue(`\n🔍 Checking completion status for ${backlogId}...`));

    const { data, error } = await supabase
      .from('backlog_item_completion')
      .select(`
        *,
        product_requirements_v2!completed_by_prd_id(id, title)
      `)
      .eq('backlog_id', backlogId)
      .single();

    if (error || !data) {
      console.log(chalk.green('✅ Not completed - available for implementation'));
      return null;
    }

    console.log(chalk.yellow(`⚠️  Already completed:`));
    console.log(`   Completed by SD: ${data.completed_by_sd_id}`);
    console.log(`   PRD: ${data.completed_by_prd_id}`);
    console.log(`   Date: ${data.completion_date}`);
    console.log(`   Type: ${data.completion_type}`);
    console.log(`   Verified: ${data.verified ? 'Yes' : 'No'}`);

    if (data.implementation_details) {
      console.log(`   Implementation: ${JSON.stringify(data.implementation_details, null, 2)}`);
    }

    return data;
  }

  /**
   * Request to utilize a backlog item from another SD
   */
  async requestUtilization(sourceSD, backlogId, utilizationType, justification) {
    if (!this.currentSD) {
      console.error(chalk.red('Error: No SD context set. Call setContext() first'));
      return null;
    }

    console.log(chalk.cyan(`\n📋 Requesting cross-SD utilization...`));
    console.log(`   From: ${sourceSD}`);
    console.log(`   To: ${this.currentSD}`);
    console.log(`   Item: ${backlogId}`);
    console.log(`   Type: ${utilizationType}`);

    try {
      // Check if utilization is allowed
      const { data: canUtilize, error: checkError } = await supabase.rpc(
        'can_utilize_backlog_item',
        {
          p_requesting_sd: this.currentSD,
          p_source_sd: sourceSD,
          p_backlog_id: backlogId
        }
      );

      if (checkError) throw checkError;

      if (!canUtilize.can_utilize) {
        console.log(chalk.red(`❌ Cannot utilize: ${canUtilize.reason}`));
        return null;
      }

      // Create utilization request
      const { data: requestId, error: requestError } = await supabase.rpc(
        'request_cross_sd_utilization',
        {
          p_requesting_sd: this.currentSD,
          p_source_sd: sourceSD,
          p_backlog_id: backlogId,
          p_utilization_type: utilizationType,
          p_justification: justification
        }
      );

      if (requestError) throw requestError;

      console.log(chalk.green(`✅ Utilization request created: ${requestId}`));

      // Check if auto-approved
      const { data: request } = await supabase
        .from('cross_sd_utilization')
        .select('approval_status')
        .eq('id', requestId)
        .single();

      if (request.approval_status === 'AUTO_APPROVED') {
        console.log(chalk.green('✅ Request auto-approved!'));
      } else {
        console.log(chalk.yellow('⏳ Request pending approval'));
      }

      // Publish event
      await this.eventBus.publish(
        EventTypes.HANDOFF_CREATED,
        `Cross-SD utilization requested: ${backlogId}`,
        {
          requestId,
          sourceSD,
          requestingSD: this.currentSD,
          backlogId,
          utilizationType
        },
        {
          targetAgents: ['LEAD'],
          priority: Priority.MEDIUM
        }
      );

      return requestId;

    } catch (error) {
      console.error(chalk.red(`Request failed: ${error.message}`));
      return null;
    }
  }

  /**
   * Mark a backlog item as completed
   */
  async markCompleted(backlogId, sourceSD, completionType, details = {}) {
    if (!this.currentSD || !this.currentPRD) {
      console.error(chalk.red('Error: SD and PRD context required. Call setContext() first'));
      return null;
    }

    console.log(chalk.cyan(`\n✅ Marking backlog item as completed...`));

    try {
      const { data: completionId, error } = await supabase.rpc(
        'mark_backlog_item_completed',
        {
          p_backlog_id: backlogId,
          p_source_sd: sourceSD,
          p_completed_by_sd: this.currentSD,
          p_completed_by_prd: this.currentPRD,
          p_completion_type: completionType,
          p_implementation_details: details
        }
      );

      if (error) throw error;

      console.log(chalk.green(`✅ Item marked as completed: ${completionId}`));

      // Notify source SD if different
      if (sourceSD !== this.currentSD) {
        console.log(chalk.blue(`📢 Notifying source SD: ${sourceSD}`));

        await this.eventBus.publish(
          EventTypes.ANALYSIS_COMPLETE,
          `Backlog item ${backlogId} completed by ${this.currentSD}`,
          {
            completionId,
            backlogId,
            sourceSD,
            completedBySD: this.currentSD,
            completedByPRD: this.currentPRD,
            completionType
          },
          {
            targetAgents: ['LEAD', 'PLAN'],
            priority: Priority.LOW
          }
        );
      }

      return completionId;

    } catch (error) {
      console.error(chalk.red(`Failed to mark completed: ${error.message}`));
      return null;
    }
  }

  /**
   * Find similar or duplicate backlog items
   */
  async findSimilarItems(backlogId, threshold = 50) {
    console.log(chalk.cyan(`\n🔍 Finding similar items to ${backlogId}...`));

    try {
      const { data: similar, error } = await supabase.rpc(
        'find_similar_backlog_items',
        {
          p_backlog_id: backlogId,
          p_similarity_threshold: threshold
        }
      );

      if (error) throw error;

      if (!similar || similar.length === 0) {
        console.log(chalk.green('✅ No similar items found'));
        return [];
      }

      console.log(chalk.yellow(`⚠️  Found ${similar.length} similar items:`));

      const table = new Table({
        head: [
          chalk.cyan('Backlog ID'),
          chalk.cyan('SD'),
          chalk.cyan('Title'),
          chalk.cyan('Similarity'),
          chalk.cyan('Status')
        ],
        colWidths: [15, 10, 40, 12, 15]
      });

      similar.forEach(item => {
        const statusColor = item.completion_status === 'COMPLETED' ? chalk.green :
                           item.completion_status === 'IN_PROGRESS' ? chalk.yellow :
                           chalk.gray;

        table.push([
          item.backlog_id,
          item.sd_id,
          item.backlog_title.substring(0, 38),
          `${Math.round(item.similarity_score)}%`,
          statusColor(item.completion_status || 'NOT_STARTED')
        ]);
      });

      console.log(table.toString());

      return similar;

    } catch (error) {
      console.error(chalk.red(`Error finding similar items: ${error.message}`));
      return [];
    }
  }

  /**
   * Get utilization report for current SD
   */
  async getUtilizationReport() {
    if (!this.currentSD) {
      console.error(chalk.red('Error: No SD context set'));
      return;
    }

    console.log(chalk.cyan(`\n📊 UTILIZATION REPORT FOR ${this.currentSD}`));
    console.log(chalk.cyan('═'.repeat(60)));

    try {
      // Items completed by this SD
      const { data: completed } = await supabase
        .from('backlog_item_completion')
        .select('*')
        .eq('completed_by_sd_id', this.currentSD);

      console.log(`\n✅ Items Completed: ${completed?.length || 0}`);
      if (completed?.length > 0) {
        const direct = completed.filter(c => c.source_sd_id === this.currentSD).length;
        const crossSD = completed.length - direct;
        console.log(`   Direct: ${direct}`);
        console.log(`   Cross-SD: ${crossSD}`);
      }

      // Utilization requests made
      const { data: requests } = await supabase
        .from('cross_sd_utilization')
        .select('*')
        .eq('requesting_sd_id', this.currentSD);

      console.log(`\n📤 Utilization Requests Made: ${requests?.length || 0}`);
      if (requests?.length > 0) {
        const approved = requests.filter(r => r.approval_status.includes('APPROVED')).length;
        const pending = requests.filter(r => r.approval_status === 'PENDING').length;
        console.log(`   Approved: ${approved}`);
        console.log(`   Pending: ${pending}`);
      }

      // Items utilized by others
      const { data: utilized } = await supabase
        .from('cross_sd_utilization')
        .select('*')
        .eq('source_sd_id', this.currentSD)
        .in('approval_status', ['APPROVED', 'AUTO_APPROVED']);

      console.log(`\n📥 Items Utilized by Others: ${utilized?.length || 0}`);

      // Efficiency metrics
      const { data: myItems } = await supabase
        .from('sd_backlog_map')
        .select('backlog_id')
        .eq('sd_id', this.currentSD);

      const totalItems = myItems?.length || 0;
      const completedItems = completed?.filter(c => c.source_sd_id === this.currentSD).length || 0;
      const completionRate = totalItems > 0 ? (completedItems / totalItems * 100).toFixed(1) : 0;

      console.log(`\n📈 Metrics:`);
      console.log(`   Total Items: ${totalItems}`);
      console.log(`   Completion Rate: ${completionRate}%`);
      console.log(`   Cross-SD Collaboration Score: ${((crossSD || 0) + (utilized?.length || 0)) * 10}`);

      console.log(chalk.cyan('═'.repeat(60)));

    } catch (error) {
      console.error(chalk.red(`Report error: ${error.message}`));
    }
  }

  /**
   * Approve a utilization request (for LEAD agents)
   */
  async approveUtilization(requestId, approvedBy = 'LEAD') {
    console.log(chalk.cyan(`\n✅ Approving utilization request ${requestId}...`));

    try {
      const { error } = await supabase
        .from('cross_sd_utilization')
        .update({
          approval_status: 'APPROVED',
          approved_by: approvedBy,
          approved_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      console.log(chalk.green('✅ Request approved'));

      // Notify requesting SD
      await this.eventBus.publish(
        EventTypes.ANALYSIS_COMPLETE,
        `Utilization request ${requestId} approved`,
        { requestId, approvedBy },
        {
          priority: Priority.LOW
        }
      );

      return true;

    } catch (error) {
      console.error(chalk.red(`Approval failed: ${error.message}`));
      return false;
    }
  }

  /**
   * Get pending utilization requests for approval
   */
  async getPendingRequests() {
    console.log(chalk.cyan('\n📋 PENDING UTILIZATION REQUESTS'));
    console.log(chalk.cyan('═'.repeat(60)));

    try {
      const { data: requests, error } = await supabase
        .from('cross_sd_utilization')
        .select(`
          *,
          sd_backlog_map!backlog_id(backlog_title)
        `)
        .eq('approval_status', 'PENDING')
        .order('requested_at', { ascending: false });

      if (error) throw error;

      if (!requests || requests.length === 0) {
        console.log(chalk.green('✅ No pending requests'));
        return [];
      }

      const table = new Table({
        head: [
          chalk.cyan('Request ID'),
          chalk.cyan('From SD'),
          chalk.cyan('To SD'),
          chalk.cyan('Item'),
          chalk.cyan('Type'),
          chalk.cyan('Risk')
        ],
        colWidths: [38, 15, 15, 30, 12, 8]
      });

      requests.forEach(req => {
        const riskColor = req.risk_assessment === 'HIGH' ? chalk.red :
                         req.risk_assessment === 'MEDIUM' ? chalk.yellow :
                         chalk.green;

        table.push([
          req.id,
          req.requesting_sd_id,
          req.source_sd_id,
          req.sd_backlog_map?.backlog_title?.substring(0, 28) || req.backlog_id,
          req.utilization_type,
          riskColor(req.risk_assessment)
        ]);
      });

      console.log(table.toString());
      console.log(`\n${requests.length} pending requests`);

      return requests;

    } catch (error) {
      console.error(chalk.red(`Error fetching requests: ${error.message}`));
      return [];
    }
  }
}

// CLI Interface
async function main() {
  const manager = new CrossSDBacklogManager();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(chalk.yellow('\n📚 Cross-SD Backlog Manager'));
    console.log(chalk.yellow('═'.repeat(40)));
    console.log('Usage:');
    console.log('  node cross-sd-backlog-manager.js [command] [options]');
    console.log('\nCommands:');
    console.log('  search <keyword>        - Search backlog items across all SDs');
    console.log('  check <backlog-id>      - Check if item is completed');
    console.log('  similar <backlog-id>    - Find similar items');
    console.log('  request <sd> <item>     - Request to use item from another SD');
    console.log('  complete <item> <sd>    - Mark item as completed');
    console.log('  pending                 - Show pending utilization requests');
    console.log('  approve <request-id>    - Approve utilization request');
    console.log('  report <sd-id>          - Get utilization report for SD');
    return;
  }

  const command = args[0];

  switch (command) {
    case 'search':
      if (args[1]) {
        await manager.searchBacklogItems(args[1]);
      }
      break;

    case 'check':
      if (args[1]) {
        await manager.checkIfCompleted(args[1]);
      }
      break;

    case 'similar':
      if (args[1]) {
        await manager.findSimilarItems(args[1]);
      }
      break;

    case 'pending':
      await manager.getPendingRequests();
      break;

    case 'approve':
      if (args[1]) {
        await manager.approveUtilization(args[1]);
      }
      break;

    case 'report':
      if (args[1]) {
        manager.setContext(args[1]);
        await manager.getUtilizationReport();
      }
      break;

    case 'request':
      if (args[1] && args[2]) {
        // Example: node cross-sd-backlog-manager.js request SD-040 BP-123 REFERENCE "Need GTM feasibility"
        manager.setContext('SD-011'); // Would be set by PLAN agent
        await manager.requestUtilization(
          args[1],
          args[2],
          args[3] || 'REFERENCE',
          args[4] || 'Cross-SD utilization needed'
        );
      }
      break;

    case 'complete':
      if (args[1] && args[2]) {
        // Example: node cross-sd-backlog-manager.js complete BP-123 SD-040
        manager.setContext('SD-011', 'PRD-SD-011'); // Would be set by PLAN agent
        await manager.markCompleted(
          args[1],
          args[2],
          'DIRECT',
          { location: '/src/components/gtm' }
        );
      }
      break;

    default:
      console.log(chalk.red(`Unknown command: ${command}`));
  }
}

// Export for use in other modules
export { CrossSDBacklogManager };
export default CrossSDBacklogManager;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
    process.exit(1);
  });
}