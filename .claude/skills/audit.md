# /audit - Self-Audit Command

Run read-only audits against strategic directives to detect gaps, staleness, and missing artifacts.

## Instructions

When the user invokes `/audit` or mentions "audit", "gap check", "health check", or "sd audit":

### Step 1: Run the Audit

Execute the audit runner with appropriate options:

```bash
# Default: Dry run, all SDs
node scripts/run-audit.js

# Execute and post to feedback system
node scripts/run-audit.js --execute

# Specific scope
node scripts/run-audit.js --scope active   # Only active SDs
node scripts/run-audit.js --scope stale    # Potentially stale SDs

# Specific SD
node scripts/run-audit.js --sd SD-XXX-001

# Full JSON output
node scripts/run-audit.js --json
```

### Step 2: Present Results

After running the audit, present:

1. **Chairman Summary** - High-level risk assessment
2. **Top Findings** - Most critical issues to address
3. **Recommended Actions** - What to do next

### Step 3: Offer Follow-up Actions

Based on findings, suggest:
- **High severity**: Immediate review of affected SDs
- **Stale SDs**: Update or archive stale directives
- **Missing artifacts**: Create missing PRDs, retrospectives, etc.

## Detection Rules

The audit evaluates these rules:

| Rule | Severity | Description |
|------|----------|-------------|
| STALE_SD | medium | SD not updated for X days (configurable) |
| DRAFT_TOO_LONG | low | SD in draft too long |
| MISSING_PRD | high | Non-infrastructure SD missing PRD |
| MISSING_RETROSPECTIVE | medium | Completed SD missing retro |
| INVALID_STATUS | high | Invalid status value |
| PROGRESS_MISMATCH | medium | Progress vs status inconsistency |
| INCOMPLETE_HANDOFF_CHAIN | medium | Missing required handoffs |
| MISSING_ARTIFACT | medium | Missing required artifact per checklist |

## Configuration

Audit behavior is controlled by `leo_audit_config` table:
- `stale_after_days` - Days before SD is stale (default: 14)
- `warn_after_days` - Days before warning (default: 7)
- `max_findings_per_sd` - Limit findings per SD (default: 25)

## Examples

```
User: /audit
Claude: Running self-audit...
[Executes node scripts/run-audit.js]
[Presents chairman summary and top findings]

User: /audit --scope stale
Claude: Running audit for potentially stale SDs...
[Executes node scripts/run-audit.js --scope stale]

User: check the health of SD-FEATURE-001
Claude: Running targeted audit for SD-FEATURE-001...
[Executes node scripts/run-audit.js --sd SD-FEATURE-001 --json]
```

## Related

- `/learn` - Capture patterns from audit findings
- `/leo next` - View SD queue after addressing findings
- `/inbox` - Review audit findings posted to feedback
