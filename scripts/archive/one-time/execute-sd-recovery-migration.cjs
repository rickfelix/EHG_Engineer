#!/usr/bin/env node

/**
 * Execute SD Recovery Protocol migration
 * Adds leo_protocol_sections entry and issue_patterns entry
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function executeMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    console.log('🚀 Executing SD Recovery Protocol migration...\n');

    // 1. Check if protocol section already exists
    const { data: existingSection } = await supabase
      .from('leo_protocol_sections')
      .select('id')
      .eq('protocol_id', 'leo-v4-3-3-ui-parity')
      .eq('section_type', 'sd_recovery_protocol')
      .eq('order_index', 451)
      .maybeSingle();

    if (existingSection) {
      console.log('ℹ️  Protocol section already exists (ID:', existingSection.id, ')');
    } else {
      // Insert protocol section
      const { data: sectionData, error: sectionError } = await supabase
        .from('leo_protocol_sections')
        .insert({
          protocol_id: 'leo-v4-3-3-ui-parity',
          section_type: 'sd_recovery_protocol',
          title: 'SD Recovery Protocol (Limbo State Detection)',
          content: `## SD Recovery Protocol (Limbo State Detection)

**Pattern**: PAT-SD-LIMBO-001

### What is "Limbo State"?

An SD enters limbo when:
- Work artifacts exist (PRD, user stories, code commits)
- But formal handoffs are missing or incomplete
- Quality gates may have been bypassed

This can happen when:
- Work starts without running \`handoff.js\`
- Sessions are interrupted mid-workflow
- Manual database updates bypass protocol

### Detection Command

\`\`\`bash
node scripts/sd-recovery-audit.js <SD_KEY>
\`\`\`

### Recovery Actions

| Action | When to Use | Steps |
|--------|-------------|-------|
| **FULL_RECOVERY** | Artifacts exist, no handoffs | Reset status → Re-run handoffs → Continue |
| **BACKFILL_AND_ACKNOWLEDGE** | Some handoffs missing | Create missing handoffs → Log gap → Continue |
| **ABORT_AND_RESTART** | Quality too compromised | Archive artifacts → Start fresh |

### Execution

\`\`\`bash
# Audit only (default)
node scripts/sd-recovery-audit.js SD-XXX-001

# Audit and remediate
node scripts/sd-recovery-audit.js SD-XXX-001 --remediate

# Force remediation without prompts
node scripts/sd-recovery-audit.js SD-XXX-001 --remediate --force
\`\`\`

### When to Invoke

- Before resuming any SD that was worked on outside normal workflow
- When GATE errors indicate status/handoff mismatch
- When artifacts exist but handoffs are missing
- During session continuity when previous session state is unclear

### STOP → AUDIT → ASSESS → REMEDIATE

1. **STOP**: Do not continue work on a potentially limbo SD
2. **AUDIT**: Run \`sd-recovery-audit.js\` to inventory state
3. **ASSESS**: Review indicators and recommended action
4. **REMEDIATE**: Execute appropriate recovery action
`,
          order_index: 451,
          metadata: {
            category: 'recovery',
            added_by: 'SD-RECOVERY-PROTOCOL-001',
            added_date: '2026-02-02',
            target_file: 'CLAUDE_CORE.md'
          }
        })
        .select();

      if (sectionError) {
        console.error('❌ Error adding protocol section:', sectionError.message);
        throw sectionError;
      }

      console.log('✅ Protocol section added to leo_protocol_sections');
      console.log('   ID:', sectionData[0].id);
    }

    // 2. Insert issue pattern (using actual schema columns and valid source value)
    const { data: patternData, error: patternError } = await supabase
      .from('issue_patterns')
      .upsert({
        pattern_id: 'PAT-SD-LIMBO-001',
        category: 'workflow',
        severity: 'high',
        issue_summary: 'SD has work artifacts (PRD, user stories, code commits) but is missing formal handoffs, indicating protocol bypass',
        occurrence_count: 0,
        proven_solutions: [
          '1. Run sd-recovery-audit.js to assess state',
          '2. Determine recovery action (FULL_RECOVERY, BACKFILL, or ABORT)',
          '3. Execute remediation with --remediate flag',
          '4. Verify protocol compliance before continuing',
          '5. Log incident in audit_log for pattern tracking'
        ],
        prevention_checklist: [
          'Always use handoff.js for phase transitions',
          'Never manually update SD status without corresponding handoff',
          'Use sd-recovery-audit.js before resuming any unclear SD',
          'Check sd_phase_handoffs table when resuming work'
        ],
        related_sub_agents: ['DATABASE', 'RCA'],
        status: 'active',
        source: 'retrospective'  // Changed to match check constraint
      }, {
        onConflict: 'pattern_id'
      })
      .select();

    if (patternError) {
      console.error('❌ Error adding issue pattern:', patternError.message);
      throw patternError;
    }

    console.log('\n✅ Issue pattern added/updated to issue_patterns');
    console.log('   Pattern ID: PAT-SD-LIMBO-001');
    console.log('   Issue Summary: SD Limbo State - Work Without Handoffs');
    console.log('   Severity: high');
    console.log('   Category: workflow');

    console.log('\n✅ Migration completed successfully');
    console.log('\nNext steps:');
    console.log('1. Regenerate CLAUDE.md: npm run claude:md');
    console.log('2. Verify content appears in CLAUDE_CORE.md');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

executeMigration();
