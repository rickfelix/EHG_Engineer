/**
 * Complete Children Operation Adapter
 * Wraps batch-complete-child-sds.js for the /batch dispatcher.
 */

export default {
  key: 'complete-children',
  description: 'Complete children of an orchestrator SD',
  supportsDryRun: true,
  requiresServiceRole: true,
  flags: [
    { name: 'parent', description: 'Parent orchestrator SD key (required)', values: [] }
  ],
  async execute(supabase, { dryRun, flags = {}, verifiedWrite }) {
    const parentKey = flags.parent;
    if (!parentKey) {
      return {
        total: 0, processed: 0, skipped: 0, failed: 0,
        details: [{ error: 'Missing required flag: --parent <SD-KEY>' }]
      };
    }

    const result = { total: 0, processed: 0, skipped: 0, failed: 0, details: [] };

    // Resolve parent SD key to UUID
    const { data: parentSD, error: parentError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title')
      .eq('sd_key', parentKey)
      .single();

    if (parentError || !parentSD) {
      result.details.push({ error: `Parent SD not found: ${parentKey}` });
      result.failed = 1;
      return result;
    }

    // Get incomplete children
    const { data: children, error: childError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase')
      .eq('parent_sd_id', parentSD.id)
      .neq('status', 'completed');

    if (childError) {
      result.details.push({ error: `Query failed: ${childError.message}` });
      result.failed = 1;
      return result;
    }

    result.total = children?.length || 0;

    if (result.total === 0) {
      result.details.push({
        parent: parentKey, status: 'all_children_already_completed'
      });
      return result;
    }

    for (const child of children) {
      if (dryRun) {
        result.processed++;
        result.details.push({
          sd_key: child.sd_key, title: child.title,
          current_status: child.status, current_phase: child.current_phase,
          status: 'would_complete'
        });
        continue;
      }

      try {
        const updates = {
          status: 'completed',
          current_phase: 'COMPLETED',
          progress: 100,
          updated_at: new Date().toISOString()
        };

        if (verifiedWrite) {
          const writeResult = await verifiedWrite(supabase, 'strategic_directives_v2', child.id, updates);
          if (!writeResult.success) {
            result.failed++;
            result.details.push({
              sd_key: child.sd_key, status: 'failed',
              error: writeResult.error
            });
            continue;
          }
        } else {
          const { error: updateError } = await supabase
            .from('strategic_directives_v2')
            .update(updates)
            .eq('id', child.id);

          if (updateError) {
            result.failed++;
            result.details.push({
              sd_key: child.sd_key, status: 'failed',
              error: updateError.message
            });
            continue;
          }
        }

        result.processed++;
        result.details.push({
          sd_key: child.sd_key, title: child.title, status: 'completed'
        });
      } catch (err) {
        result.failed++;
        result.details.push({
          sd_key: child.sd_key, status: 'failed', error: err.message
        });
      }
    }

    return result;
  }
};
