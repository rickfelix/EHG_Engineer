/**
 * Test SDs Operation Adapter
 * Runs smoke test verification across completed SDs.
 *
 * SD: SD-LEO-SIMPLIFY-ENFORCEMENT-AND-ORCH-001-C (FR-002)
 */

export default {
  key: 'test-sds',
  description: 'Verify smoke test steps across strategic directives',
  supportsDryRun: true,
  requiresServiceRole: false,
  flags: [
    { name: 'status', description: 'SD status filter', values: ['completed', 'in_progress'] }
  ],
  async execute(supabase, { dryRun, flags = {} }) {
    const statusFilter = flags.status || 'completed';
    const result = { total: 0, processed: 0, skipped: 0, failed: 0, details: [] };

    // Query SDs that have smoke_test_steps
    const { data: sds, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, smoke_test_steps')
      .eq('status', statusFilter)
      .not('smoke_test_steps', 'is', null)
      .order('updated_at', { ascending: false });

    if (error) {
      result.details.push({ error: `Query failed: ${error.message}` });
      result.failed = 1;
      return result;
    }

    // Filter out SDs with empty smoke_test_steps arrays
    const sdsWithTests = (sds || []).filter(sd => {
      if (Array.isArray(sd.smoke_test_steps)) return sd.smoke_test_steps.length > 0;
      if (typeof sd.smoke_test_steps === 'string') return sd.smoke_test_steps.trim().length > 0;
      return false;
    });

    result.total = sdsWithTests.length;

    if (result.total === 0) {
      result.details.push({
        status: `no_sds_with_smoke_tests`,
        filter: statusFilter
      });
      return result;
    }

    for (const sd of sdsWithTests) {
      const steps = parseSteps(sd.smoke_test_steps);

      if (dryRun) {
        result.processed++;
        result.details.push({
          sd_key: sd.sd_key,
          title: sd.title,
          test_count: steps.length,
          steps: steps.slice(0, 5).map(s => s.description || s),
          status: 'would_test'
        });
      } else {
        // In apply mode, report the steps and their parseable status
        // Actual test execution would require running commands — we report what's available
        result.processed++;
        result.details.push({
          sd_key: sd.sd_key,
          title: sd.title,
          test_count: steps.length,
          status: 'reported',
          steps: steps.map(s => ({
            description: s.description || s,
            expected: s.expected_outcome || 'N/A',
            status: 'needs_manual_verification'
          }))
        });
      }
    }

    return result;
  }
};

function parseSteps(smokeTestSteps) {
  if (Array.isArray(smokeTestSteps)) return smokeTestSteps;
  if (typeof smokeTestSteps === 'string') {
    try {
      const parsed = JSON.parse(smokeTestSteps);
      if (Array.isArray(parsed)) return parsed;
      return [parsed];
    } catch {
      // Plain text — split by newlines
      return smokeTestSteps.split('\n').filter(l => l.trim());
    }
  }
  return [];
}
