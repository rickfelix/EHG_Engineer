#!/usr/bin/env node
/**
 * Protocol Improvements Module - Main Exports
 *
 * This module provides a complete API for extracting, applying, and tracking
 * protocol improvements from retrospectives.
 *
 * Architecture:
 * - ImprovementExtractor: Parse retrospectives for actionable improvements
 * - ImprovementApplicator: Apply approved improvements to database
 * - EffectivenessTracker: Measure if improvements reduce issue frequency
 *
 * Database-First Architecture:
 * - ALL changes write to database first
 * - Markdown files regenerated via generate-claude-md-from-db.js
 * - NEVER write directly to .md files
 */

// Import classes
import { ImprovementExtractor } from './ImprovementExtractor.js';
import { ImprovementApplicator } from './ImprovementApplicator.js';
import { EffectivenessTracker } from './EffectivenessTracker.js';

// Re-export classes
export { ImprovementExtractor, ImprovementApplicator, EffectivenessTracker };

/**
 * Factory function to create a protocol improvement system instance
 * Used by CLI scripts for consistent interface
 * @returns {Object} System with all methods
 */
export function createProtocolImprovementSystem() {
  return {
    // List improvements with optional filtering
    async listImprovements(filters = {}) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      let query = supabase.from('protocol_improvement_queue').select('*');

      if (filters.status) {
        query = query.eq('status', filters.status.toUpperCase());
      }
      if (filters.phase) {
        query = query.eq('target_phase', filters.phase.toUpperCase());
      }

      const { data, error } = await query.order('evidence_count', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    // Get a single improvement by ID
    async getImprovement(id) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data, error } = await supabase
        .from('protocol_improvement_queue')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },

    // Approve an improvement
    async approveImprovement(id, reviewedBy = 'system') {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data, error } = await supabase
        .from('protocol_improvement_queue')
        .update({
          status: 'APPROVED',
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewedBy
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Improvement approved:', id);
      return { success: true, improvement: data };
    },

    // Reject an improvement
    async rejectImprovement(id, reason, reviewedBy = 'system') {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data, error } = await supabase
        .from('protocol_improvement_queue')
        .update({
          status: 'REJECTED',
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewedBy
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      console.log('❌ Improvement rejected:', id, '- Reason:', reason);
      return { success: true, improvement: data, reason };
    },

    // Apply a single improvement
    async applyImprovement(id, dryRun = false) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // Get the improvement
      const { data: improvement, error: fetchError } = await supabase
        .from('protocol_improvement_queue')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!improvement) throw new Error('Improvement not found');

      if (dryRun) {
        console.log('DRY RUN - Would apply:', improvement.description);
        return { success: true, notes: 'Dry run - no changes made' };
      }

      // Apply to target table
      const { target_table, target_operation, payload } = improvement;

      if (target_operation === 'INSERT') {
        const { error: insertError } = await supabase.from(target_table).insert(payload);
        if (insertError) throw insertError;
      } else if (target_operation === 'UPDATE' || target_operation === 'UPSERT') {
        const { error: upsertError } = await supabase.from(target_table).upsert(payload);
        if (upsertError) throw upsertError;
      }

      // Mark as applied
      await supabase
        .from('protocol_improvement_queue')
        .update({
          status: 'APPLIED',
          applied_at: new Date().toISOString()
        })
        .eq('id', id);

      console.log('✅ Applied improvement to', target_table);
      return { success: true };
    },

    // Get effectiveness report
    async getEffectivenessReport(filters = {}) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data, error } = await supabase
        .from('v_improvement_effectiveness')
        .select('*');

      if (error) {
        console.log('Note: v_improvement_effectiveness view may not exist yet');
        return [];
      }

      console.log('');
      console.log('📊 Effectiveness Report');
      console.log('='.repeat(60));

      if (!data || data.length === 0) {
        console.log('   No applied improvements to track yet');
      } else {
        data.forEach(item => {
          console.log(`   ${item.description?.substring(0, 50)}...`);
          console.log(`      Score: ${item.effectiveness_score || 'N/A'}%`);
          console.log('');
        });
      }

      return data || [];
    },

    // Get statistics
    async getStats() {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data, error } = await supabase
        .from('protocol_improvement_queue')
        .select('status, improvement_type, target_phase');

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        pending: data?.filter(d => d.status === 'PENDING').length || 0,
        approved: data?.filter(d => d.status === 'APPROVED').length || 0,
        applied: data?.filter(d => d.status === 'APPLIED').length || 0,
        rejected: data?.filter(d => d.status === 'REJECTED').length || 0,
        byCategory: {},
        byPhase: {},
        byImpact: {}
      };

      // Group by type
      data?.forEach(d => {
        if (d.improvement_type) {
          stats.byCategory[d.improvement_type] = (stats.byCategory[d.improvement_type] || 0) + 1;
        }
        if (d.target_phase) {
          stats.byPhase[d.target_phase] = (stats.byPhase[d.target_phase] || 0) + 1;
        }
      });

      return stats;
    }
  };
}

// Default export
export default {
  ImprovementExtractor,
  ImprovementApplicator,
  EffectivenessTracker,
  createProtocolImprovementSystem
};
