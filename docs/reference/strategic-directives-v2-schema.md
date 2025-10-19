# strategic_directives_v2 Table Schema Documentation

**Generated**: 2025-10-16
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Table**: `strategic_directives_v2`

## Overview

The `strategic_directives_v2` table stores all Strategic Directives (SDs) in the LEO Protocol system. It supports both:
1. **Programmatic SDs** - Created directly by scripts or agents
2. **Directive Lab SDs** - Created through the Directive Lab submission workflow

## Required vs Optional Fields

### Core Required Fields (ALL SDs)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | text | YES | Primary key (e.g., "SD-VIF-001") |
| `sd_key` | text | **YES** | Business key for lookups (MUST match `id`) |
| `title` | text | YES | Short descriptive title |
| `description` | text | YES | Detailed description of what this SD does |
| `status` | text | YES | Workflow status (draft/active/completed/etc) |
| `priority` | text | YES | Priority level (critical/high/medium/low) |
| `category` | text | YES | Category classification |
| `created_at` | timestamp | Auto | Timestamp of creation |
| `updated_at` | timestamp | Auto | Timestamp of last update |

### Strategic Planning Fields (Recommended)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rationale` | text | Recommended | Why this SD exists, business justification |
| `scope` | text | Recommended | What's included/excluded |
| `strategic_objectives` | text/array | Recommended | List of objectives to achieve |
| `success_criteria` | text/array | Recommended | Measurable success metrics |
| `metadata` | jsonb | Optional | Additional structured data |

### Directive Lab Fields (Only for Lab Submissions)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chairman_feedback` | text | NO | Chairman's initial feedback (Directive Lab only) |
| `intent_summary` | text | NO | Extracted intent from submission (Directive Lab only) |
| `screenshot_url` | text | NO | Screenshot from submission (Directive Lab only) |
| `intent_confirmed_at` | timestamp | NO | When intent was confirmed (Directive Lab workflow) |
| `strategic_intent` | text | Optional | Strategic context and integration points |
| `created_by` | text | Optional | Creator identifier (e.g., "LEAD", "Chairman") |

## Critical Fix for Your Error

### The Problem
```javascript
// ❌ WRONG - Missing sd_key
const sd = {
  id: 'SD-VIF-001',
  title: 'My Strategic Directive',
  // ... other fields
};

// Error: null value in column "sd_key" violates not-null constraint
```

### The Solution
```javascript
// ✅ CORRECT - Include both id and sd_key
const sd = {
  id: 'SD-VIF-001',
  sd_key: 'SD-VIF-001',  // MUST be present and match id
  title: 'My Strategic Directive',
  description: 'Detailed description here',
  status: 'draft',
  priority: 'medium',
  category: 'feature-enhancement',
  rationale: 'Why we need this',
  scope: 'What it includes',
  strategic_objectives: ['Objective 1', 'Objective 2'],
  success_criteria: ['Criterion 1', 'Criterion 2'],
  metadata: {}  // Optional JSONB
};
```

## Complete Working Example

```javascript
#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createVIFStrategicDirective() {
  const sd = {
    // REQUIRED: Both id and sd_key MUST be present
    id: 'SD-VIF-001',
    sd_key: 'SD-VIF-001',

    // REQUIRED: Core fields
    title: 'Venture Ideation Framework - Opportunity Discovery',
    description: 'Build AI-powered venture opportunity discovery system with 4 research agents',
    status: 'draft',
    priority: 'high',
    category: 'ai-platform',

    // RECOMMENDED: Strategic planning
    rationale: 'Enable systematic discovery of high-potential venture opportunities',
    scope: '4 AI research agents, Reddit integration, opportunity scoring, blueprint generation',
    strategic_objectives: [
      'Deploy Market Research Agent for trend analysis',
      'Deploy Competitive Intelligence Agent for gap identification',
      'Integrate Reddit API for real-world pain point discovery',
      'Build opportunity scoring algorithm',
      'Generate structured opportunity blueprints'
    ],
    success_criteria: [
      'Market Research Agent generates comprehensive trend reports',
      'Competitive Intelligence Agent identifies market gaps',
      'Reddit integration surfaces 50+ pain points per search',
      'Opportunity scoring achieves 80%+ accuracy',
      'Blueprints contain all required fields for evaluation'
    ],

    // OPTIONAL: Enhanced metadata
    metadata: {
      estimated_hours: 20,
      complexity: 'high',
      requires_design_review: true,
      integration_touchpoints: ['EVA Assistant', 'CrewAI Platform'],
      parent_sd: null,
      relationship: 'standalone'
    }
  };

  // Check if exists (for idempotency)
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('id', 'SD-VIF-001')
    .single();

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update(sd)
      .eq('id', 'SD-VIF-001')
      .select()
      .single();

    if (error) throw error;
    console.log('✅ SD updated:', data.id);
  } else {
    // Insert new
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sd)
      .select()
      .single();

    if (error) throw error;
    console.log('✅ SD created:', data.id);
  }
}

createVIFStrategicDirective().catch(console.error);
```

## Field Details

### status Values
- `draft` - Initial state, not yet approved
- `active` - Approved and ready for execution
- `in_progress` - Currently being implemented
- `completed` - Implementation finished
- `archived` - Historical record

### priority Values
- `critical` - Blocking issue, immediate action required
- `high` - Important, schedule soon
- `medium` - Normal priority
- `low` - Nice to have, when time permits

### category Examples
- `feature-enhancement`
- `testing-infrastructure`
- `admin-tooling`
- `ai-platform`
- `ui-ux-enhancement`
- `bug-fix`
- `technical-debt`

### metadata Structure (JSONB)

The `metadata` field is flexible JSONB. Common patterns:

```javascript
metadata: {
  // Timeline
  timeline: {
    start_date: new Date().toISOString(),
    target_completion: new Date().toISOString(),
    milestones: ['Milestone 1', 'Milestone 2']
  },

  // Business impact
  business_impact: 'Description of business impact',
  technical_impact: 'Description of technical impact',

  // Resources
  resource_requirements: ['Resource 1', 'Resource 2'],
  estimated_hours: 20,
  complexity: 'high|medium|low',

  // Relationships
  parent_sd: 'SD-PARENT-001',
  relationship: 'follow_up|standalone|dependency',
  related_sds: ['SD-001', 'SD-002'],

  // Review
  requires_design_review: true,
  integration_touchpoints: ['System A', 'System B'],

  // Acceptance criteria
  acceptance_criteria: [
    'AC-001: Description',
    'AC-002: Description'
  ]
}
```

## Common Patterns from Codebase

### Pattern 1: Simple SD (No Directive Lab)
```javascript
const sd = {
  id: 'SD-XXX',
  sd_key: 'SD-XXX',
  title: '...',
  description: '...',
  status: 'draft',
  priority: 'medium',
  category: 'feature-enhancement',
  rationale: '...',
  scope: '...',
  strategic_objectives: [...],
  success_criteria: [...],
  metadata: {}
};
```

### Pattern 2: With Strategic Intent
```javascript
const sd = {
  id: 'SD-XXX',
  sd_key: 'SD-XXX',
  title: '...',
  description: '...',
  strategic_intent: 'Context and integration points',  // Added
  rationale: 'Simplicity-first approach',
  // ... rest of fields
};
```

### Pattern 3: UUID for id (Less Common)
```javascript
import { randomUUID } from 'crypto';

const sd = {
  id: randomUUID(),  // UUID instead of SD-XXX
  sd_key: 'SD-XXX',  // Business key still human-readable
  // ... rest of fields
};
```

## Verification Queries

### Check if SD exists
```javascript
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status')
  .eq('sd_key', 'SD-VIF-001')
  .single();
```

### Get all draft SDs
```javascript
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('status', 'draft')
  .order('created_at', { ascending: false });
```

### Update status
```javascript
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ status: 'active' })
  .eq('sd_key', 'SD-VIF-001')
  .select();
```

## Key Takeaways for Your VIF SDs

1. **ALWAYS include `sd_key`** - Set it equal to `id`
2. **Use human-readable IDs** - `SD-VIF-001`, `SD-VIF-002`, etc.
3. **Start with `status: 'draft'`** - Let LEAD agent activate
4. **Provide rich metadata** - Helps with planning and tracking
5. **Skip Directive Lab fields** - They're only for Lab submissions
6. **Arrays can be text or JSONB** - Supabase handles both:
   ```javascript
   // Both work:
   strategic_objectives: ['Obj 1', 'Obj 2']  // Preferred
   strategic_objectives: 'Obj 1\nObj 2'      // Also works
   ```

## Error Messages and Solutions

### Error: `null value in column "sd_key" violates not-null constraint`
**Solution**: Add `sd_key: 'SD-XXX'` matching your `id` value

### Error: `duplicate key value violates unique constraint`
**Solution**: SD with that `id` or `sd_key` already exists. Use UPDATE instead of INSERT, or choose a different ID

### Error: `invalid input syntax for type json`
**Solution**: Ensure `metadata` is a valid JSON object, not a string

### Error: `relation "strategic_directives_v2" does not exist`
**Solution**: Wrong database connection. Verify you're using EHG_Engineer database (dedlbzhpgkmetvhbkyzq)

## References

- **Example Scripts**:
  - `/mnt/c/_EHG/EHG_Engineer/scripts/create-sd-041c.js` - Simple SD
  - `/mnt/c/_EHG/EHG_Engineer/scripts/create-sd-agent-platform-001.js` - Rich metadata
  - `/mnt/c/_EHG/EHG_Engineer/scripts/create-auth-setup-sd.js` - Critical priority

- **Connection Pattern**:
  - `/mnt/c/_EHG/EHG_Engineer/scripts/lib/supabase-connection.js` - Proper connection setup

---

**Generated from codebase analysis**
**Last updated**: 2025-10-16
**LEO Protocol**: v4.2.0
