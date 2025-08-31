# AI_GUIDE.md - EHG_Engineer Development Guide

> Essential context and practices for AI assistants working with the EHG_Engineer platform

## Project Overview

**EHG_Engineer** is a minimal, clean implementation of the LEO Protocol v3.1.5 for strategic directive management. It provides:
- Database-first architecture with Supabase/PostgreSQL
- Strategic Directive lifecycle management
- Epic Execution Sequence tracking
- HAP blocks for detailed task management
- Complete template system for all LEO Protocol artifacts

## Critical Development Practices

### 1. LEO Protocol v3.1.5 Compliance

This project strictly follows the LEO Protocol multi-agent workflow:
- **LEAD**: Strategic direction and architecture
- **PLAN**: Tactical planning and decomposition
- **EXEC**: Code execution and implementation
- **HUMAN**: Orchestration and final decisions

### 2. Communication Standards (MANDATORY)

All agent communications MUST use this header format:

```markdown
**To:** [Recipient Agent Role/HUMAN]
**From:** [Sending Agent Role]  
**Protocol:** LEO Protocol v3.1.5 (Adaptive Verification Framework)
**Strategic Directive:** [SD-ID]: [Strategic Directive Title]
**Strategic Directive Path:** `docs/wbs_artefacts/strategic_directives/[SD-ID].md`
**Related PRD:** [PRD-ID]
**Related PRD Path:** `docs/product-requirements/[PRD-ID].md`

**Reference Files Required**:
- `docs/wbs_artefacts/strategic_directives/[SD-ID].md` (Strategic Directive)
- `docs/product-requirements/[PRD-ID].md` (Product Requirements Document)
- `docs/templates/leo_protocol/` (Templates)
- `[additional-files-as-needed]` (Context-specific)
```

### 3. Task Execution Options

**Iterative Execution (Default)**:
- Tasks provided one at a time
- Verification between each task
- Best for critical operations
- Allows course correction

**Batched Execution (Optional)**:
- All tasks in single batch
- Only when explicitly requested
- Best for well-defined, low-risk work
- Minimal human intervention

### 4. Database Operations

**Connection Pattern** (Always use singleton):
```javascript
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
```

**Core Tables**:
- `strategic_directives_v2` - Strategic goals and objectives
- `execution_sequences_v2` - Epic-level task breakdowns
- `hap_blocks_v2` - Detailed action items

### 5. Naming Conventions

**Strategic Directives**: `SD-YYYY-MM-DD-[A-Z]`
- Example: SD-2025-01-15-A

**Epic Execution Sequences**: `EES-YYYY-MM-DD-[A-Z]-NN`
- Example: EES-2025-01-15-A-01

**Product Requirements**: `PRD-SD-YYYY-MM-DD-[A-Z]-[descriptor]`
- Example: PRD-SD-2025-01-15-A-platform-foundation

### 6. Available Commands

```bash
# Database Operations
npm run test-database         # Verify all tables accessible
npm run check-directives      # Query pending directives
npm run add-sd <SD-ID>       # Add SD to database
npm run update-status <SD-ID> <status>  # Update status

# Template Generation
npm run new-sd               # Create new SD from template

# Compliance
npm run audit-compliance     # Run LEO Protocol audit
```

### 7. Project Structure

```
EHG_Engineer/
├── database/
│   └── schema/             # SQL schema files
├── docs/
│   ├── templates/          # LEO Protocol templates
│   ├── validation/         # Test reports
│   └── wbs_artefacts/      # SDs, EES, PRDs
├── scripts/                # Utility scripts
├── .env                    # Environment config
└── package.json           # Dependencies
```

### 8. Development Workflow

1. **Create Strategic Directive** using template
2. **Add to database** with proper metadata
3. **Break down into EES** items
4. **Create PRD** for requirements
5. **Track progress** in database
6. **Validate compliance** regularly

### 9. Common Operations

#### Adding a New Strategic Directive
```bash
# 1. Generate template
npm run new-sd

# 2. Edit the generated file
# 3. Add to database
npm run add-sd SD-2025-01-15-B

# 4. Update status when ready
npm run update-status SD-2025-01-15-B active
```

#### Checking System Status
```bash
# Database health
npm run test-database

# Active directives
npm run check-directives

# Compliance check
npm run audit-compliance
```

### 10. Known Issues & Workarounds

#### Supabase Table Creation
- Cannot create tables via client API
- Must use Supabase dashboard or SQL editor
- Schema provided in `database/schema/001_initial_schema.sql`

#### Environment Variables
- Always use `.env` file
- Never commit credentials
- Use `NEXT_PUBLIC_` prefix for client-visible vars

### 11. Error Handling

**Database Errors**:
- Check `.env` credentials
- Verify tables exist in Supabase
- Ensure network connectivity

**Script Errors**:
- Run `npm install` if modules missing
- Check Node.js version (14+)
- Verify file paths are absolute

### 12. Best Practices

**DO**:
- ✅ Use database as single source of truth
- ✅ Follow LEO Protocol communication standards
- ✅ Validate data before database operations
- ✅ Use templates for consistency
- ✅ Document all changes
- ✅ Test scripts before deployment

**DON'T**:
- ❌ Bypass LEO Protocol structure
- ❌ Create tables without migrations
- ❌ Hardcode credentials
- ❌ Skip validation steps
- ❌ Modify templates without approval
- ❌ Push without testing

### 13. Quick Debugging

```bash
# Check database connection
node -e "require('./scripts/verify-connection.js')"

# List all SDs in database
node -e "require('./scripts/check-directives-data.js')"

# Verify specific table
npm run test-database

# Check environment
node -e "console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"
```

### 14. Extension Points

The platform is designed for extension:
- Add new scripts in `scripts/`
- Create new templates in `docs/templates/`
- Extend database schema (create migrations)
- Add new NPM scripts in `package.json`

### 15. Support Resources

- **Templates**: `docs/templates/leo_protocol/`
- **Validation Reports**: `docs/validation/`
- **Strategic Directives**: `docs/wbs_artefacts/strategic_directives/`
- **Database Schema**: `database/schema/001_initial_schema.sql`
- **Example SD**: `SD-2025-01-15-A` (Platform Foundation)

---

**Remember**: This is a minimal, clean implementation. Keep it simple, follow the protocols, and maintain database integrity at all times.