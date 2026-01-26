# LEO Protocol v4.2 - Dynamic Checklist Amendment


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, schema, security

## Overview
This amendment introduces dynamic, context-aware checklists that are automatically generated based on Strategic Directive content, replacing generic static checklists.

## Key Changes

### 1. Dynamic Checklist Generation
- Checklists are generated based on detected patterns in SD content
- Patterns include: database, API, frontend, realtime, AI, voice, security, etc.
- Complexity assessment (low/medium/high) adjusts checklist depth

### 2. Automated Handoff Validation
- **Mandatory validation before any handoff**
- ALL handoffs require 100% completion:
  - LEAD → PLAN: 100% required
  - PLAN → EXEC: 100% required  
  - EXEC → PLAN: 100% required
  - PLAN → LEAD: 100% required
  - LEAD → DEPLOY: 100% required
- No partial handoffs allowed - ensures quality and completeness

### 3. Enforcement Mechanism

```bash
# Before any handoff, run:
node scripts/handoff-validator.js validate [FROM] [TO] [SD-ID]

# Exit code 0 = handoff approved
# Exit code 1 = handoff blocked
```

### 4. Smart Checklist Features

#### Pattern Detection
Automatically detects technical requirements:
- Voice implementation → adds audio pipeline checks
- Database work → adds schema validation
- Real-time features → adds latency verification
- AI integration → adds model/API checks

#### Verification Methods
Each checklist item includes:
- Clear description
- Verification method
- Evidence requirements
- Test commands (if applicable)

#### Auto-completion
Some items can be auto-verified:
- File existence checks
- API health checks
- Log analysis
- Database record validation

### 5. Integration Points

#### GitHub Actions
```yaml
- name: Validate Handoff
  run: |
    node scripts/handoff-validator.js validate $FROM $TO $SD_ID
    if [ $? -ne 0 ]; then
      echo "Handoff blocked - checklist incomplete"
      exit 1
    fi
```

#### Pre-commit Hook
```bash
#!/bin/bash
if git diff --staged --name-only | grep -q "handoff"; then
  node scripts/handoff-validator.js validate EXEC PLAN SD-CURRENT
fi
```

### 6. Benefits

1. **Relevance**: Checklists match actual work being done
2. **Flexibility**: Pareto principle (80/20) for EXEC phase
3. **Automation**: Reduces manual checking overhead
4. **Traceability**: All validations logged to database
5. **Quality Gates**: Prevents premature handoffs

### 7. Example Usage

```bash
# Generate dynamic checklists for new SD
node scripts/dynamic-checklist-generator.js SD-2025-002

# Validate before handoff
node scripts/handoff-validator.js validate PLAN EXEC SD-2025-002

# Auto-complete eligible items
node scripts/handoff-validator.js auto EXEC SD-2025-002
```

### 8. Database Schema Updates

New fields in `product_requirements_v2`:
- `dynamic_checklists`: JSONB - generated checklists
- `checklist_metadata`: JSONB - generation metadata
- `last_validation`: JSONB - latest validation report
- `validation_history`: JSONB[] - all validation attempts

### 9. Backward Compatibility

- Static checklists still supported if present
- Dynamic generation occurs only when checklists are empty
- Existing SDs can be migrated with regeneration script

### 10. Implementation Status

✅ Dynamic checklist generator implemented
✅ Handoff validator with thresholds
✅ Pattern detection for 15+ technical areas
✅ Auto-completion for common items
⏳ GitHub Actions integration (pending)
⏳ Pre-commit hooks (pending)

---

*Amendment effective immediately for all new Strategic Directives*
*Version: 4.2.0 | Date: 2025-09-01*