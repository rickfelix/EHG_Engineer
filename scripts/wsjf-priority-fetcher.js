#!/usr/bin/env node
import { createSupabaseClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
import { isMainModule } from '../lib/utils/is-main-module.js';
// FR-5 (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001): exclude venture-build SDs from prio:top3
// so they don't starve the platform priority queue (same isolation as sd:next's ventureTrack).
import { isVentureBuildSD } from './modules/sd-next/rank-items.js';

dotenv.config();

class WSJFPriorityFetcher {
  constructor() {
    this.supabase = createSupabaseClient();
  }

  async getTop3Priorities() {
    try {
      const { data: directives, error } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, status, priority, created_at, target_application')
        .in('status', ['draft', 'in_progress', 'active', 'pending_approval'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!directives || directives.length === 0) {
        return [];
      }

      // FR-5: drop venture-build SDs — they live in the isolated venture queue, not the
      // platform top-3. Platform SDs (target_application null or ehg/ehg_engineer) remain.
      const platformDirectives = directives.filter((d) => !isVentureBuildSD(d));
      if (platformDirectives.length === 0) {
        return [];
      }

      // Fallback: prioritize by priority field (if exists) then status order then created_at
      const statusPriority = { 'in_progress': 4, 'active': 3, 'pending_approval': 2, 'draft': 1 };
      const sorted = platformDirectives.sort((a, b) => {
        // First sort by priority if available
        if (a.priority && b.priority) {
          if (a.priority !== b.priority) return b.priority - a.priority;
        }
        // Then by status
        const aPrio = statusPriority[a.status] || 0;
        const bPrio = statusPriority[b.status] || 0;
        if (aPrio !== bPrio) return bPrio - aPrio;
        // Finally by created_at
        return new Date(b.created_at) - new Date(a.created_at);
      });

      // Return top 3 with priority reasons
      return sorted.slice(0, 3).map((d, idx) => ({
        id: d.id,
        title: d.title,
        priority_reason: this.getPriorityReason(d, idx + 1)
      }));
    } catch (error) {
      throw error;
    }
  }

  getPriorityReason(directive, rank) {
    const parts = [];
    if (directive.priority) {
      parts.push(`priority ${directive.priority}`);
    }
    parts.push(`${directive.status.replace(/_/g, ' ')} status`);
    parts.push(`created ${new Date(directive.created_at).toLocaleDateString()}`);
    return `Rank #${rank}: ${parts.join(', ')}`;
  }
}

// Main execution
if (isMainModule(import.meta.url)) {
  const fetcher = new WSJFPriorityFetcher();
  fetcher.getTop3Priorities()
    .then(results => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('Error fetching priorities:', err.message);
      process.exit(1);
    });
}

export default WSJFPriorityFetcher;