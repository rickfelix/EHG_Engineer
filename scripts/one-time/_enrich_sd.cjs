require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: [
        'Two infrastructure improvements to LEO Protocol tooling:',
        '',
        '1. **Atomic File Writes for Protocol Files**: The CLAUDE.md generator (generate-claude-md-from-db.js) writes',
        '   directly to destination files via fs.writeFileSync(). If the process crashes mid-write (OOM, power loss,',
        '   SIGKILL), the file is left in a corrupted partial state. All 5 protocol files (CLAUDE.md, CLAUDE_CORE.md,',
        '   CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md) plus the manifest are affected.',
        '   Fix: Write to a .tmp sibling file first, then rename (atomic on same filesystem).',
        '',
        '2. **SD Creation Content Guard**: leo-create-sd.js populates SDs with generic placeholder text like',
        '   "Implement X as specified in the SD scope" and "Maintain backward compatibility". These pass',
        '   LEAD-TO-PLAN validation gates but carry zero real information, wasting the LEAD review phase.',
        '   Fix: Add a content quality check that warns when SD fields contain only default template text.',
      ].join('\n'),
      scope: [
        'IN SCOPE:',
        '- Atomic write pattern for scripts/modules/claude-md-generator/index.js generateFile() and writeManifest()',
        '- Content quality guard in scripts/handoff.js LEAD-TO-PLAN gates (warn on placeholder text)',
        '- Shared atomic-write utility in lib/utils/ for reuse across codebase',
        '',
        'OUT OF SCOPE:',
        '- Changing CLAUDE.md content or structure',
        '- Modifying SD creation wizard UX',
        '- Retroactive enrichment of existing placeholder SDs',
      ].join('\n'),
      strategic_objectives: [
        'Prevent protocol file corruption from interrupted writes during CLAUDE.md generation',
        'Detect and warn when SDs are created with only default placeholder content',
        'Provide a reusable atomic-write utility for the codebase',
      ],
      success_criteria: [
        'Protocol file generation uses write-to-temp-then-rename pattern',
        'LEAD-TO-PLAN handoff warns when SD description/objectives/criteria contain only template defaults',
        'Atomic write utility exists in lib/utils/ with tests',
        'Existing generation behavior unchanged (same output, different write strategy)',
      ],
      key_changes: [
        { change: 'Add lib/utils/atomic-write.js with writeFileAtomic() function', type: 'feature' },
        { change: 'Update claude-md-generator/index.js to use atomic writes', type: 'fix' },
        { change: 'Add placeholder content detection to LEAD-TO-PLAN transition readiness gate', type: 'feature' },
        { change: 'Add unit tests for atomic write and placeholder detection', type: 'feature' },
      ],
      key_principles: [
        'Minimal change footprint - only modify the write path, not content generation',
        'Backward compatible - same files produced, different write strategy',
        'Reusable utility - atomic-write module usable by any script',
      ],
      success_metrics: [
        { metric: 'Protocol file write atomicity', target: 'All 6 files use write-then-rename', actual: 'TBD' },
        { metric: 'Placeholder detection coverage', target: 'Detect all 5 default templates from leo-create-sd.js', actual: 'TBD' },
        { metric: 'Zero regressions', target: '0 existing tests broken', actual: 'TBD' },
      ],
      rationale: 'Protocol files are loaded at session start and drive all LEO workflow decisions. A corrupted CLAUDE.md causes immediate session failure. Placeholder SDs waste LEAD review time and propagate empty requirements to PLAN and EXEC phases.',
    })
    .eq('sd_key', 'SD-LEO-INFRA-PROTOCOL-FILE-STATE-001');

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('SD enriched successfully');
  }
}

main();
