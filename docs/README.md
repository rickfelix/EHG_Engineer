# EHG_Engineer Documentation

## Overview

EHG_Engineer is a clean LEO Protocol v3.1.5 implementation for strategic directive management and application development.

## Directory Structure

```
docs/
├── 03_protocols_and_standards/
│   └── leo_protocol_v3.1.5.md          # Core LEO Protocol
├── templates/
│   ├── leo_protocol/                   # LEO artifact templates
│   └── agent_communications/           # Agent handoff templates
├── wbs_artefacts/
│   ├── strategic_directives/           # Strategic Directive files
│   └── execution_sequences/            # Epic Execution Sequence files
├── product-requirements/               # PRD documents
└── strategic-operations/               # Operational documentation
```

## Quick Start

### Creating Your First Strategic Directive

1. **Generate SD Template**:
   ```bash
   npm run new-sd
   ```

2. **Edit the Strategic Directive**:
   - Open the generated file in `docs/wbs_artefacts/strategic_directives/`
   - Fill in the strategic objectives and success criteria
   - Define the epic breakdown

3. **Add to Database**:
   ```bash
   npm run add-sd SD-YYYY-MM-DD-A
   ```

4. **Verify Setup**:
   ```bash
   npm run check-directives
   ```

## LEO Protocol Workflow

1. **LEAD** creates Strategic Directives using templates
2. **PLAN** decomposes SDs into Epic Execution Sequences (EES)
3. **EXEC** implements EES items with code and verification
4. **HUMAN** provides oversight and approval

## Templates Available

- **Strategic Directive**: `docs/templates/leo_protocol/strategic_directive_template.md`
- **Epic Execution Sequence**: `docs/templates/leo_protocol/epic_execution_sequence_template.md`
- **Product Requirements**: `docs/templates/leo_protocol/prd_template.md`
- **Agent Communications**: `docs/templates/agent_communications/`

## Database Schema

Core tables for LEO Protocol:
- `strategic_directives_v2`: Strategic directives and their metadata
- `execution_sequences_v2`: Epic execution sequences linked to SDs
- `hap_blocks_v2`: Human Action Protocol blocks for detailed tasks

## Scripts Available

- `npm run check-directives`: Query pending strategic directives
- `npm run new-sd`: Create new Strategic Directive template
- `npm run add-sd <SD-ID>`: Add Strategic Directive to database
- `npm run update-status <SD-ID> <status>`: Update directive status
- `npm run test-database`: Verify database connectivity
- `npm run audit-compliance`: Run LEO Protocol compliance audit

## Agent Communication Standards

All agent communications must follow LEO Protocol v3.1.5 format:
- Include proper header with To/From/Protocol information
- Reference all required files with full paths
- Follow handoff templates for consistency

## Support

For issues or questions:
1. Check LEO Protocol documentation: `docs/03_protocols_and_standards/leo_protocol_v3.1.5.md`
2. Review templates in `docs/templates/`
3. Run compliance audit: `npm run audit-compliance`