#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

class WSJFPriorityFetcher {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }

  async getTop3Priorities() {
    try {
      const { data: directives, error } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, status, priority, created_at')
        .in('status', ['draft', 'in_progress', 'active', 'pending_approval'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!directives || directives.length === 0) {
        return [];
      }

      // Fallback: prioritize by priority field (if exists) then status order then created_at
      const statusPriority = { 'in_progress': 4, 'active': 3, 'pending_approval': 2, 'draft': 1 };
      const sorted = directives.sort((a, b) => {
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
if (import.meta.url === `file://${process.argv[1]}`) {
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