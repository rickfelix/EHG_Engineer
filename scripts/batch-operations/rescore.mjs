/**
 * Rescore Operation Adapter
 * Wraps batch-rescore-*.js scripts for the /batch dispatcher.
 */
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — round-based rescoring iterates
// every matched SD; strategic_directives_v2 is a growing table and an ILIKE title match is not
// a strict bound, so a capped read would silently under-rescore with no error.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

export default {
  key: 'rescore',
  description: 'Rescore vision scores by type',
  supportsDryRun: true,
  requiresServiceRole: true,
  flags: [
    { name: 'type', description: 'Rescore target type', values: ['manual', 'round1', 'round2'] }
  ],
  async execute(supabase, { dryRun, flags = {} }) {
    const rescoreType = flags.type;
    if (!rescoreType) {
      return {
        total: 0, processed: 0, skipped: 0, failed: 0,
        details: [{ error: 'Missing required flag: --type (manual|round1|round2)' }]
      };
    }

    if (rescoreType === 'manual') {
      return await rescoreManualOverrides(supabase, dryRun);
    } else if (rescoreType === 'round1' || rescoreType === 'round2') {
      return await rescoreByRound(supabase, rescoreType, dryRun);
    }

    return {
      total: 0, processed: 0, skipped: 0, failed: 0,
      details: [{ error: `Unknown rescore type: ${rescoreType}. Valid: manual, round1, round2` }]
    };
  }
};

async function rescoreManualOverrides(supabase, dryRun) {
  const result = { total: 0, processed: 0, skipped: 0, failed: 0, details: [] };

  const { data: manualRows, error } = await supabase
    .from('eva_vision_scores')
    .select('id, sd_id, total_score, scored_at')
    .eq('created_by', 'manual-chairman-override')
    .order('scored_at', { ascending: true });

  if (error) {
    result.details.push({ error: `Query failed: ${error.message}` });
    result.failed = 1;
    return result;
  }

  result.total = manualRows?.length || 0;

  if (result.total === 0) {
    result.details.push({ status: 'no_manual_overrides_found' });
    return result;
  }

  for (const row of manualRows) {
    if (dryRun) {
      result.processed++;
      result.details.push({
        sd_id: row.sd_id, score_id: row.id,
        current_score: row.total_score, status: 'would_rescore'
      });
    } else {
      try {
        const { scoreSD } = await import('../eva/vision-scorer.js');
        const score = await scoreSD({
          sdKey: row.sd_id,
          visionKey: 'VISION-EHG-L1-001',
          archKey: 'ARCH-EHG-L1-001',
        });
        result.processed++;
        result.details.push({
          sd_id: row.sd_id, status: 'rescored',
          old_score: row.total_score, new_score: score.total_score
        });
      } catch (err) {
        result.failed++;
        result.details.push({
          sd_id: row.sd_id, status: 'failed', error: err.message
        });
      }
    }
  }

  return result;
}

async function rescoreByRound(supabase, round, dryRun) {
  const result = { total: 0, processed: 0, skipped: 0, failed: 0, details: [] };

  // Query SDs that are children of round-specific orchestrators
  const roundFilter = round === 'round1' ? 'Round 1' : 'Round 2';

  let children;
  try {
    children = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status')
      .ilike('title', `%${roundFilter}%`)
      .eq('status', 'completed')
      .order('id', { ascending: true }));
  } catch (error) {
    result.details.push({ error: `Query failed: ${error.message}` });
    result.failed = 1;
    return result;
  }

  result.total = children.length;

  if (result.total === 0) {
    result.details.push({ status: `no_${round}_children_found` });
    return result;
  }

  for (const child of children) {
    if (dryRun) {
      result.processed++;
      result.details.push({
        sd_key: child.sd_key, title: child.title, status: 'would_rescore'
      });
    } else {
      result.skipped++;
      result.details.push({
        sd_key: child.sd_key, status: 'skipped',
        reason: 'Round-based rescoring requires vision-scorer integration (delegate to existing script)'
      });
    }
  }

  return result;
}
