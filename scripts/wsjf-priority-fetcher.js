#!/usr/bin/env node
import { createSupabaseClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
import { isMainModule } from '../lib/utils/is-main-module.js';
// FR-5 (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001): exclude venture-build SDs from prio:top3
// so they don't starve the platform priority queue (same isolation as sd:next's ventureTrack).
import { isVentureBuildSD } from './modules/sd-next/rank-items.js';
// FR-2 (SD-LEO-INFRA-MAKE-WSJF-SELF-001): the SAME shared superset extractor the claim
// gates (lib/claim/gates/dependency-gate.cjs + lib/fleet/claim-eligibility.cjs) delegate to,
// so "top-3 recommendable" and "claimable" cannot diverge on dependency shape.
import { extractAllDependencyRefs } from '../lib/utils/parse-sd-dependencies.cjs';

dotenv.config();

// FR-3 (SD-LEO-INFRA-MAKE-WSJF-SELF-001): freshness parity with scripts/worker-checkin.cjs
// DISPATCH_RANK_TTL_MS — the coordinator ranking loop runs ~10-15min; a metadata.dispatch_rank
// whose dispatch_rank_at is older than 1h is stale and ignored, exactly as in self-claim.
const DISPATCH_RANK_TTL_MS = 60 * 60 * 1000;

class WSJFPriorityFetcher {
  constructor() {
    this.supabase = createSupabaseClient();
  }

  async getTop3Priorities() {
    try {
      const { data: directives, error } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, status, priority, created_at, target_application, dependencies, metadata')
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

      // FR-2 (SD-LEO-INFRA-MAKE-WSJF-SELF-001): dependency-aware — exclude candidates having
      // any ref not status='completed'. Refs come from the shared extractor; one batch lookup
      // resolves them (refs are sd_keys normally; uuid-shaped refs also match the id column).
      // Unknown/dangling refs (incl. a self-ref on a non-completed SD) stay un-completed ->
      // that candidate alone is excluded (fail-closed per-SD); ref-less/none-sentinel SDs remain.
      const refsBySd = new Map(platformDirectives.map((d) => [d, extractAllDependencyRefs(d)]));
      const allRefs = [...new Set([].concat(...refsBySd.values()))];
      const completedRefs = new Set();
      if (allRefs.length > 0) {
        const list = allRefs.map((k) => `"${String(k).replace(/"/g, '')}"`).join(',');
        const { data: depRows } = await this.supabase
          .from('strategic_directives_v2')
          .select('id, sd_key, status')
          .or(`sd_key.in.(${list}),id.in.(${list})`);
        for (const r of depRows || []) {
          if (r.status !== 'completed') continue;
          if (r.sd_key) completedRefs.add(r.sd_key);
          if (r.id) completedRefs.add(r.id);
        }
      }
      const claimable = platformDirectives.filter((d) => refsBySd.get(d).every((k) => completedRefs.has(k)));
      if (claimable.length === 0) {
        return [];
      }

      // FR-3: a FRESH coordinator dispatch_rank (see DISPATCH_RANK_TTL_MS above) orders first,
      // ascending; stale/absent/malformed ranks fall through to the legacy ordering below.
      const now = Date.now();
      const freshRankOf = (d) => {
        const m = d.metadata || {};
        if (m.dispatch_rank == null || !m.dispatch_rank_at) return Infinity;
        if (!((now - new Date(m.dispatch_rank_at).getTime()) < DISPATCH_RANK_TTL_MS)) return Infinity;
        const rank = Number(m.dispatch_rank);
        return Number.isFinite(rank) ? rank : Infinity;
      };
      // Fallback: prioritize by priority field (if exists) then status order then created_at
      const statusPriority = { 'in_progress': 4, 'active': 3, 'pending_approval': 2, 'draft': 1 };
      const sorted = claimable.sort((a, b) => {
        const aRank = freshRankOf(a);
        const bRank = freshRankOf(b);
        if (aRank !== bRank) return aRank - bRank;
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

      // Return top 3 with priority reasons.
      // SD-LEO-INFRA-INCOME-OBJECTIVE-FUNCTION-001: income_contribution is surfaced INFORMATIONALLY for
      // transparency. prio:top3 ranks PLATFORM SDs (venture-build SDs are excluded above via FR-5), which
      // carry no direct revenue — the income objective function (revenue-to-effort + time-to-first-dollar
      // + $18k-escape-velocity, canonical replacement-net) is computed for VENTURES by the Glide Path
      // scoreVenture income_contribution dimension. It is reported as null here (no direct income score for
      // a platform SD); ranking is unchanged and nothing is auto-picked.
      return sorted.slice(0, 3).map((d, idx) => ({
        id: d.id,
        title: d.title,
        priority_reason: this.getPriorityReason(d, idx + 1),
        income_contribution: null,
        income_note: 'platform SD — no direct income; income objective scored for ventures via Glide Path',
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