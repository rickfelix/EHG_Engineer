/**
 * Accept Handoffs Operation Adapter
 * Wraps batch-accept-all-valid-handoffs.mjs for the /batch dispatcher.
 */

export default {
  key: 'accept-handoffs',
  description: 'Accept all valid pending handoffs',
  supportsDryRun: true,
  requiresServiceRole: false,
  flags: [
    { name: 'type', description: 'Handoff type filter', values: ['lead-to-plan', 'plan-to-exec', 'exec-to-plan', 'plan-to-lead', 'all'] }
  ],
  async execute(supabase, { dryRun, flags = {} }) {
    const typeFilter = flags.type || 'all';

    const handoffTypeMap = {
      'lead-to-plan': { from: 'LEAD', to: 'PLAN' },
      'plan-to-exec': { from: 'PLAN', to: 'EXEC' },
      'exec-to-plan': { from: 'EXEC', to: 'PLAN' },
      'plan-to-lead': { from: 'PLAN', to: 'LEAD' },
    };

    const typesToProcess = typeFilter === 'all'
      ? Object.entries(handoffTypeMap)
      : [[typeFilter, handoffTypeMap[typeFilter]]];

    if (typeFilter !== 'all' && !handoffTypeMap[typeFilter]) {
      return {
        total: 0, processed: 0, skipped: 0, failed: 0,
        details: [{ error: `Unknown type: ${typeFilter}. Valid: ${Object.keys(handoffTypeMap).join(', ')}` }]
      };
    }

    const result = { total: 0, processed: 0, skipped: 0, failed: 0, details: [] };

    for (const [typeName, { from, to }] of typesToProcess) {
      const { data: pendingHandoffs, error: queryError } = await supabase
        .from('sd_phase_handoffs')
        .select('id, sd_id, executive_summary, created_at')
        .eq('from_phase', from)
        .eq('to_phase', to)
        .eq('status', 'pending_acceptance')
        .order('created_at', { ascending: true });

      if (queryError) {
        result.details.push({ type: typeName, error: queryError.message });
        result.failed++;
        continue;
      }

      if (!pendingHandoffs || pendingHandoffs.length === 0) {
        result.details.push({ type: typeName, status: 'no_pending_handoffs' });
        continue;
      }

      result.total += pendingHandoffs.length;

      for (const handoff of pendingHandoffs) {
        if (!handoff.executive_summary || handoff.executive_summary.length < 50) {
          result.skipped++;
          result.details.push({
            type: typeName, sd_id: handoff.sd_id, status: 'skipped',
            reason: 'Missing or incomplete executive summary'
          });
          continue;
        }

        if (dryRun) {
          result.processed++;
          result.details.push({
            type: typeName, sd_id: handoff.sd_id, status: 'would_accept',
            summary: handoff.executive_summary.substring(0, 80)
          });
          continue;
        }

        const { error: acceptError } = await supabase.rpc('accept_phase_handoff', {
          handoff_id_param: handoff.id
        });

        if (acceptError) {
          result.failed++;
          result.details.push({
            type: typeName, sd_id: handoff.sd_id, status: 'failed',
            error: acceptError.message
          });
        } else {
          result.processed++;
          result.details.push({
            type: typeName, sd_id: handoff.sd_id, status: 'accepted'
          });
        }
      }
    }

    return result;
  }
};
