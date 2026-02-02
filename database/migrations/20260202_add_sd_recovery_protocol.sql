-- Migration: Add SD Recovery Protocol section and issue pattern
-- Created: 2026-02-02
-- SD: SD-RECOVERY-PROTOCOL-001
-- Status: COMPLETED (executed via scripts/execute-sd-recovery-migration.cjs)

-- 1. Add SD Recovery Protocol section to leo_protocol_sections
INSERT INTO leo_protocol_sections (
  protocol_id,
  section_type,
  title,
  content,
  order_index,
  metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'sd_recovery_protocol',
  'SD Recovery Protocol (Limbo State Detection)',
  '## SD Recovery Protocol (Limbo State Detection)

**Pattern**: PAT-SD-LIMBO-001

### What is "Limbo State"?

An SD enters limbo when:
- Work artifacts exist (PRD, user stories, code commits)
- But formal handoffs are missing or incomplete
- Quality gates may have been bypassed

This can happen when:
- Work starts without running `handoff.js`
- Sessions are interrupted mid-workflow
- Manual database updates bypass protocol

### Detection Command

```bash
node scripts/sd-recovery-audit.js <SD_KEY>
```

### Recovery Actions

| Action | When to Use | Steps |
|--------|-------------|-------|
| **FULL_RECOVERY** | Artifacts exist, no handoffs | Reset status → Re-run handoffs → Continue |
| **BACKFILL_AND_ACKNOWLEDGE** | Some handoffs missing | Create missing handoffs → Log gap → Continue |
| **ABORT_AND_RESTART** | Quality too compromised | Archive artifacts → Start fresh |

### Execution

```bash
# Audit only (default)
node scripts/sd-recovery-audit.js SD-XXX-001

# Audit and remediate
node scripts/sd-recovery-audit.js SD-XXX-001 --remediate

# Force remediation without prompts
node scripts/sd-recovery-audit.js SD-XXX-001 --remediate --force
```

### When to Invoke

- Before resuming any SD that was worked on outside normal workflow
- When GATE errors indicate status/handoff mismatch
- When artifacts exist but handoffs are missing
- During session continuity when previous session state is unclear

### STOP → AUDIT → ASSESS → REMEDIATE

1. **STOP**: Do not continue work on a potentially limbo SD
2. **AUDIT**: Run `sd-recovery-audit.js` to inventory state
3. **ASSESS**: Review indicators and recommended action
4. **REMEDIATE**: Execute appropriate recovery action
',
  451,
  '{"category": "recovery", "added_by": "SD-RECOVERY-PROTOCOL-001", "added_date": "2026-02-02", "target_file": "CLAUDE_CORE.md"}'::jsonb
)
ON CONFLICT (protocol_id, section_type, order_index) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata;

-- 2. Add issue pattern for SD Limbo State
INSERT INTO issue_patterns (
  pattern_id,
  category,
  severity,
  issue_summary,
  occurrence_count,
  proven_solutions,
  prevention_checklist,
  related_sub_agents,
  status,
  source
) VALUES (
  'PAT-SD-LIMBO-001',
  'workflow',
  'high',
  'SD has work artifacts (PRD, user stories, code commits) but is missing formal handoffs, indicating protocol bypass',
  0,
  ARRAY[
    '1. Run sd-recovery-audit.js to assess state',
    '2. Determine recovery action (FULL_RECOVERY, BACKFILL, or ABORT)',
    '3. Execute remediation with --remediate flag',
    '4. Verify protocol compliance before continuing',
    '5. Log incident in audit_log for pattern tracking'
  ],
  ARRAY[
    'Always use handoff.js for phase transitions',
    'Never manually update SD status without corresponding handoff',
    'Use sd-recovery-audit.js before resuming any unclear SD',
    'Check sd_phase_handoffs table when resuming work'
  ],
  ARRAY['DATABASE', 'RCA'],
  'active',
  'retrospective'
)
ON CONFLICT (pattern_id) DO UPDATE SET
  issue_summary = EXCLUDED.issue_summary,
  proven_solutions = EXCLUDED.proven_solutions,
  prevention_checklist = EXCLUDED.prevention_checklist,
  related_sub_agents = EXCLUDED.related_sub_agents,
  status = EXCLUDED.status;

-- Verification queries
-- SELECT * FROM leo_protocol_sections WHERE section_type = 'sd_recovery_protocol';
-- SELECT * FROM issue_patterns WHERE pattern_id = 'PAT-SD-LIMBO-001';
