# Team Migration Guide: Template-Based LEO Protocol


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, testing, migration, schema

**Generated**: September 27, 2025
**Status**: Production Ready
**Version**: LEO Protocol v4.2.0

## 🎯 Overview

The LEO Protocol has been upgraded to a **template-based architecture** that eliminates script proliferation while maintaining full functionality. This guide helps team members transition from SD-specific scripts to universal templates.

## 📋 What Changed

### Before: Script Proliferation Problem
- **38+ SD-specific scripts** for different Strategic Directives
- Scripts like `generate-prd-sd027.js`, `create-handoff-sd039.js`
- Copy-paste development pattern
- Inconsistent behavior across SDs
- Maintenance overhead

### After: Template-Based Solution
- **3 universal templates** handle all SDs
- Consistent behavior and sub-agent integration
- Configuration-driven customization
- Database-first architecture
- 100% LEO Protocol v4.2.0 compliance

## 🔧 New Template System

### Core Templates

#### 1. Universal Phase Execution
```bash
# Old way (multiple scripts):
node scripts/execute-sd-027.js
node scripts/sd039-lead-final-approval.js
node scripts/sd046-exec-completion.js

# New way (one template):
node templates/execute-phase.js EXEC SD-027
node templates/execute-phase.js APPROVAL SD-039
node templates/execute-phase.js EXEC SD-046
```

#### 2. Universal PRD Generation
```bash
# Old way:
node scripts/generate-prd-sd027.js
node scripts/generate-prd-sd039.js

# New way:
node templates/generate-prd.js SD-027
node templates/generate-prd.js SD-039
```

#### 3. Universal Handoff Creation
```bash
# Old way:
node scripts/create-lead-plan-handoff-sd027.js
node scripts/sd039-plan-exec-handoff.js

# New way:
node templates/create-handoff.js LEAD PLAN SD-027
node templates/create-handoff.js PLAN EXEC SD-039
```

### Convenience Scripts

For easier transition, convenience scripts are available in `scripts/`:

```bash
# These call templates automatically:
node scripts/execute-phase.js EXEC SD-027
node scripts/generate-prd.js SD-039
node scripts/create-handoff.js LEAD PLAN SD-046
```

## 🚀 Quick Start Guide

### 1. Phase Execution
```bash
# Execute any LEO protocol phase
node templates/execute-phase.js <PHASE> <SD-ID> [--force]

# Examples:
node templates/execute-phase.js LEAD SD-050
node templates/execute-phase.js PLAN SD-051
node templates/execute-phase.js EXEC SD-052
node templates/execute-phase.js VERIFICATION SD-053
node templates/execute-phase.js APPROVAL SD-054
```

### 2. PRD Generation
```bash
# Generate PRD for any SD (regular or consolidated)
node templates/generate-prd.js <SD-ID> [--force]

# Examples:
node templates/generate-prd.js SD-050
node templates/generate-prd.js SD-051 --force  # Re-generate
```

### 3. Handoff Creation
```bash
# Create handoff between any phases
node templates/create-handoff.js <FROM> <TO> <SD-ID>

# Examples:
node templates/create-handoff.js LEAD PLAN SD-050
node templates/create-handoff.js PLAN EXEC SD-051
node templates/create-handoff.js EXEC VERIFICATION SD-052
node templates/create-handoff.js VERIFICATION APPROVAL SD-053
```

## 📊 Migration Reference

### Common Migration Patterns

| Old Script Pattern | New Template Command |
|-------------------|---------------------|
| `generate-prd-sd*.js` | `node templates/generate-prd.js SD-*` |
| `create-*-handoff-sd*.js` | `node templates/create-handoff.js <FROM> <TO> SD-*` |
| `execute-sd-*.js` | `node templates/execute-phase.js EXEC SD-*` |
| `sd*-lead-final-approval.js` | `node templates/execute-phase.js APPROVAL SD-*` |
| `sd*-exec-completion.js` | `node templates/execute-phase.js EXEC SD-*` |
| `sd*-verification.js` | `node templates/execute-phase.js VERIFICATION SD-*` |

### Script Archive

All original SD-specific scripts have been archived to `scripts/archived-sd-scripts/` for reference. They are no longer needed but preserved for rollback if necessary.

## 🤖 Sub-Agent Integration

The template system includes **full sub-agent integration**:

### Automatic Sub-Agent Activation
- **LEAD Phase**: RETRO, DOCMON sub-agents
- **PLAN Phase**: DATABASE, SECURITY, TESTING, STORIES sub-agents
- **EXEC Phase**: TESTING, SECURITY, PERFORMANCE sub-agents
- **VERIFICATION Phase**: TESTING, PERFORMANCE, VALIDATION sub-agents
- **APPROVAL Phase**: GITHUB, DOCMON, SECURITY sub-agents

### Sub-Agent Functions
- **RETRO**: Generates retrospectives with quality metrics
- **GITHUB**: Prepares deployment artifacts and rollback plans
- **DOCMON**: Updates documentation and compliance tracking
- **SECURITY**: Validates security requirements and scans
- **DATABASE**: Manages schema and migration requirements
- **TESTING**: Ensures test coverage and quality validation
- **PERFORMANCE**: Validates performance requirements

## 🔄 LEO Orchestrator Integration

The template system is fully integrated with the LEO orchestrator:

```bash
# Full SD processing using templates internally
node scripts/leo-orchestrator-enforced.js SD-050

# Individual phase execution
node templates/execute-phase.js EXEC SD-050
```

## 📝 Configuration

### Phase Requirements
Templates use configuration files in `templates/config/`:
- `phase-requirements.json`: Defines requirements for each phase
- `handoff-templates.json`: 7-element handoff structure templates

### Customization
To modify phase requirements or handoff templates:
1. Edit configuration files in `templates/config/`
2. Changes apply to all future executions
3. No code changes needed

## ✅ Best Practices

### 1. Use Templates for All New Work
- Don't create new SD-specific scripts
- Use templates for all LEO protocol operations
- Leverage configuration for customization

### 2. Consistent Command Patterns
```bash
# Always specify phase explicitly
node templates/execute-phase.js PLAN SD-050

# Use SD-ID format consistently (SD-XXX)
node templates/generate-prd.js SD-050

# Use proper phase names for handoffs
node templates/create-handoff.js LEAD PLAN SD-050
```

### 3. Force Flag Usage
```bash
# Use --force to re-execute completed phases
node templates/execute-phase.js EXEC SD-050 --force

# Re-generate PRDs when needed
node templates/generate-prd.js SD-050 --force
```

## 🔍 Troubleshooting

### Common Issues

#### "Phase already completed"
**Solution**: Use `--force` flag to re-execute
```bash
node templates/execute-phase.js EXEC SD-050 --force
```

#### "SD not found"
**Solution**: Verify SD-ID format and existence in database
```bash
# Check SD exists in database first
```

#### "Template not found"
**Solution**: Ensure you're running from project root directory
```bash
# Run from EHG_Engineer root directory
pwd  # Should show project root
```

### Getting Help

1. **Template README**: See `templates/README.md` for detailed documentation
2. **Command Help**: Run templates without arguments for usage information
3. **Migration Log**: Check `scripts/archived-sd-scripts/migration-log.md` for specific mappings
4. **DOCMON Analysis**: Run `node scripts/docmon-analysis.js` for system status

## 🎉 Benefits Summary

### For Developers
- ✅ **No more script creation** - Use existing templates
- ✅ **Consistent behavior** - Same logic for all SDs
- ✅ **Better error handling** - Robust template implementation
- ✅ **Sub-agent integration** - Automatic quality checks

### For Operations
- ✅ **Reduced maintenance** - 3 templates vs 38+ scripts
- ✅ **Database-first** - All data properly stored
- ✅ **Configuration-driven** - Easy to modify behavior
- ✅ **Full compliance** - LEO Protocol v4.2.0 standards

### For Teams
- ✅ **Easier onboarding** - Learn 3 templates vs many scripts
- ✅ **Predictable behavior** - Same workflow for all SDs
- ✅ **Better documentation** - Centralized template docs
- ✅ **Quality assurance** - Built-in sub-agent validation

## 📞 Support

For questions about the template system:
1. Check this migration guide first
2. Review template documentation in `templates/README.md`
3. Run DOCMON analysis for system status
4. Check archived scripts for reference patterns

---

**Migration completed**: September 27, 2025
**Template system**: Production ready
**LEO Protocol**: v4.2.0 compliant
**Sub-agent integration**: Fully functional