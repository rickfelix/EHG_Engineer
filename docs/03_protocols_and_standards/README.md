# Handoff Documentation

> **DATABASE-FIRST (LEO Protocol v4.3.3)**: Handoffs are stored in the `sd_phase_handoffs` table.
> This directory contains templates and legacy documentation only. Query the database for current handoff data.

## Database Source of Truth

```sql
-- Get handoffs for a specific SD
SELECT * FROM sd_phase_handoffs WHERE sd_id = 'SD-XXX-001' ORDER BY created_at DESC;

-- List recent handoffs
SELECT sd_id, from_phase, to_phase, created_at FROM sd_phase_handoffs ORDER BY created_at DESC LIMIT 20;
```

---

*The content below describes the handoff system. All handoffs must be created in the database.*

This directory contains handoff documentation for inter-agent and inter-phase communication.

## Purpose

Handoffs enable structured communication between:
- **Agents**: LEAD → PLAN → EXEC → LEAD
- **Phases**: Strategic → Planning → Implementation
- **Systems**: Database → Application → Testing

## Unified Handoff System

EHG_Engineer uses a standardized 7-element handoff structure stored in the `sd_phase_handoffs` database table.

### 7-Element Handoff Structure

```typescript
{
  sd_id: string;              // Strategic directive ID
  from_phase: string;         // Source phase (LEAD/PLAN/EXEC)
  to_phase: string;           // Target phase (PLAN/EXEC/LEAD)
  handoff_content: object;    // Structured handoff data
  handoff_metadata: object;   // Metadata (timestamp, version, etc.)
  created_at: timestamp;      // Creation timestamp
  updated_at: timestamp;      // Last update timestamp
}
```

## Handoff Types

### 1. LEAD → PLAN Handoff
- Approved strategic directive
- Technical requirements
- Success criteria
- Constraints and assumptions

### 2. PLAN → EXEC Handoff
- PRD validation complete
- Implementation blueprint
- Test strategy
- Acceptance criteria

### 3. EXEC → LEAD Handoff
- Implementation complete
- Test results
- Deployment status
- Lessons learned

## Creating Handoffs

### Database-First Approach (Recommended)

```javascript
const { data, error } = await supabase
  .from('sd_phase_handoffs')
  .insert({
    sd_id: 'SD-XXX-001',
    from_phase: 'PLAN',
    to_phase: 'EXEC',
    handoff_content: {
      prd_id: 'PRD-SD-XXX-001',
      validation_passed: true,
      test_strategy: 'dual',
      // ... other handoff data
    },
    handoff_metadata: {
      timestamp: new Date().toISOString(),
      leo_version: '4.3.3'
    }
  });
```

### File-Based (Legacy)

Markdown files for historical reference or complex handoffs:
```
HANDOFF-{FROM}-{TO}-{DATE}-{IDENTIFIER}.md
```

## Directory Structure

```
/docs/handoffs/
├── README.md                 (this file)
├── templates/                (handoff templates)
├── completed/                (historical handoffs)
└── patterns/                 (RLS patterns, resilience guides)
```

## RLS Bypass Pattern

When creating handoffs via database:
- Use **service role key** (bypasses RLS)
- Or use `rpc('create_handoff_with_bypass', ...)`
- Never use anon key for handoff creation

See `/docs/reference/unified-handoff-system.md` for complete details.

## Handoff Validation

Before completing handoff:
- [ ] All required fields populated
- [ ] Validation gates passed
- [ ] Database record created
- [ ] Receiving agent notified
- [ ] Handoff acknowledged

## Troubleshooting

**Handoff creation fails**: Check RLS policies, use service role key
**Missing handoff data**: Query `sd_phase_handoffs` table directly
**Handoff not received**: Verify database trigger execution

## Related Documentation

- `/docs/reference/unified-handoff-system.md` - Complete handoff system guide
- `/docs/reference/handoff-rls-bypass-pattern.md` - RLS bypass patterns
- `/docs/reference/handoff-rls-patterns.md` - Additional RLS patterns
- `/docs/handoff-resilience-guide.md` - Resilience best practices

---

*Part of LEO Protocol v4.3.3 - Unified Handoff System*
*Updated: 2025-12-29 - Added database-first notice*

## Files

- [Advisory Invocation Log](advisory-invocation-log.md)
- [Child Sd Governance Sections](child-sd-governance-sections.md)
- [Compliance Report Sdip](compliance-report-sdip.md)
- [Exec To Plan Week1 Verification](exec-to-plan-week1-verification.md)
- [Lead Final Production Approval](lead-final-production-approval.md)
- [Leo Prd Automation](leo-prd-automation.md)
- [Leo Helper Tools](leo_helper_tools.md)
- [LEO PROTOCOL CHECKLIST ENFORCEMENT](leo-protocol-checklist-enforcement.md)
- [Leo Protocol Repository Guidelines](leo_protocol_repository_guidelines.md)
- [Leo Status Line Integration](leo_status_line_integration.md)
- [Leo Status Reference](leo_status_reference.md)
- [LEO V4.1 SUMMARY](leo-v4.1-summary.md)
- [LEO V4.2 Dynamic Checklists](leo-v4.2-dynamic-checklists.md)
- [LEO V4.2 PLAYWRIGHT TESTING INTEGRATION](leo-v4.2-playwright-testing-integration.md)
- [LEO V4.4.2 CHANGELOG](leo-v4.4.2-changelog.md)
- [Leo Vision Qa Integration](leo_vision_qa_integration.md)
- [Observations 2025 09 03](observations-2025-09-03.md)
- [PRE COMMIT HOOK](pre-commit-hook.md)
- [Protocol Constitution Guide](protocol-constitution-guide.md)
- [Russian Judge Quality System](russian-judge-quality-system.md)
- [Sd Anchor Ownership Rule](sd-anchor-ownership-rule.md)
- [Strategic Intake Contract V1](strategic-intake-contract-v1.md)
- [Terminology Rules](terminology-rules.md)
