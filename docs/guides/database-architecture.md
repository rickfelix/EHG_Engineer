# EHG_Engineer Database Architecture Guide


## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, migration, schema

## Critical Understanding: Multiple Database Architecture

### Overview
EHG_Engineer operates with a **multi-database architecture** that must be clearly understood to avoid confusion:

1. **EHG_Engineer Database** (`dedlbzhpgkmetvhbkyzq`) - The LEO Protocol system database
2. **Application Databases** - Each managed application has its own separate Supabase instance

## Database Architecture

```
┌─────────────────────────────────────────┐
│       EHG_Engineer Application          │
│         (LEO Protocol System)            │
│                                         │
│  Database: dedlbzhpgkmetvhbkyzq         │
│  Purpose: LEO workflow management       │
│  Contains:                              │
│  - strategic_directives_v2              │
│  - product_requirements_v2              │
│  - execution_sequences_v2               │
│  - sdip_submissions (new)               │
│  - sdip_groups (new)                    │
└─────────────────────────────────────────┘
                    │
                    │ Manages
                    ▼
    ┌──────────────────────────────────┐
    │     Managed Applications          │
    ├──────────────────────────────────┤
    │                                   │
    │  EHG Application                  │
    │  Database: liapbndqlqxdcgpwntbv   │
    │  Purpose: Portfolio management    │
    │                                   │
    │  EHG-Platform                     │
    │  Database: nxchardjdnvvlufhrumr   │
    │  Purpose: Alternative/staging     │
    │                                   │
    │  EHG-Platform-Dev                 │
    │  Database: jmqfmjadlvgyduupeexl   │
    │  Purpose: Development version     │
    └──────────────────────────────────┘
```

## Strategic Directives Table Schema (strategic_directives_v2)

### Required Fields (NOT NULL)
```sql
- id VARCHAR(50) PRIMARY KEY
- title VARCHAR(500) NOT NULL
- version VARCHAR(20) NOT NULL DEFAULT '1.0'
- status VARCHAR(50) NOT NULL -- Values: 'draft', 'active', 'superseded', 'archived'
- category VARCHAR(50) NOT NULL
- priority VARCHAR(20) NOT NULL -- Values: 'critical', 'high', 'medium', 'low'
- description TEXT NOT NULL
- rationale TEXT NOT NULL
- scope TEXT NOT NULL
```

### Optional Fields
```sql
- legacy_id VARCHAR(50)
- strategic_intent TEXT
- approved_by VARCHAR(100)
- approval_date TIMESTAMP
- effective_date TIMESTAMP
- expiry_date TIMESTAMP
- review_schedule VARCHAR(100)
```

### JSONB Fields (Arrays/Objects)
```sql
- key_changes JSONB DEFAULT '[]'
- strategic_objectives JSONB DEFAULT '[]'
- success_criteria JSONB DEFAULT '[]'
- key_principles JSONB DEFAULT '[]'
- implementation_guidelines JSONB DEFAULT '[]'
- dependencies JSONB DEFAULT '[]'
- risks JSONB DEFAULT '[]'
- success_metrics JSONB DEFAULT '[]'
- stakeholders JSONB DEFAULT '[]'
- metadata JSONB DEFAULT '{}'
```

## Environment Configuration

### Required Environment Variables
```bash
# For EHG_Engineer database operations
NEXT_PUBLIC_SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_key>  # If available

# OpenAI for intelligent features
OPENAI_API_KEY=<api_key>  # Optional but recommended
```

### Script Template for Database Operations
```javascript
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Use environment variables with fallbacks
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Always check for required fields
const strategicDirective = {
  // Required fields
  id: 'SD-YYYY-MMDD-XXX',
  title: 'Title',
  version: '1.0',
  status: 'active', // Must be one of: draft, active, superseded, archived
  category: 'category_name',
  priority: 'high', // Must be one of: critical, high, medium, low
  description: 'Description',
  rationale: 'Rationale',
  scope: 'Scope',
  
  // JSONB fields
  strategic_objectives: [],
  success_criteria: [],
  key_changes: [],
  
  // Metadata
  created_by: 'LEAD',
  created_at: new Date().toISOString()
};
```

## Common Issues and Solutions

### Issue 1: Missing Required Fields
**Error**: `null value in column "X" violates not-null constraint`
**Solution**: Always include all required fields when creating records

### Issue 2: Wrong Environment Variables
**Error**: `supabaseUrl is required`
**Solution**: Check .env file for correct variable names (NEXT_PUBLIC_SUPABASE_URL)

### Issue 3: Table Not Found
**Error**: `Could not find the table 'X' in the schema cache`
**Solution**: Table doesn't exist in this database - check if you're using the correct database

### Issue 4: Invalid Enum Values
**Error**: `violates check constraint`
**Solution**: Use only allowed values for status, priority fields

## SDIP Integration Points

### New Tables for SDIP
1. **sdip_submissions** - Stores individual feedback submissions
2. **sdip_groups** - Groups multiple submissions for combined analysis

### Integration with Existing Tables
- Creates records in `strategic_directives_v2` when SD is generated
- Links to PRDs through `product_requirements_v2`
- No direct integration with managed application databases

## Best Practices

1. **Always verify database context** - Know which database you're working with
2. **Check schema before operations** - Don't assume column names
3. **Use proper environment variables** - Check .env for correct names
4. **Include all required fields** - Database constraints are strict
5. **Document database changes** - Update this guide when schema changes

## Migration Scripts

### Run SDIP Database Migration
```bash
# Create SDIP tables
psql $DATABASE_URL < database/schema/006_sdip_schema.sql
```

### Verify Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'sdip%';
```

## Troubleshooting Checklist

- [ ] Correct database URL in environment?
- [ ] All required fields included?
- [ ] Using valid enum values?
- [ ] Table exists in database?
- [ ] Proper authentication token?
- [ ] JSONB fields properly formatted?

---

*Last Updated: 2025-09-03*
*Critical for: SDIP Implementation, LEO Protocol Operations*