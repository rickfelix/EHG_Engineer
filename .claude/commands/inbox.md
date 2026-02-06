# /inbox - Unified Inbox Command

**Purpose**: View and manage the unified inbox across feedback, issue patterns, audit findings, and SDs

## Subcommands

| Command | Description |
|---------|-------------|
| `/inbox` or `/inbox list` | Show unified inbox (all sources, lifecycle sections) |
| `/inbox list --verbose` | Show detailed view with source info and linked items |
| `/inbox list --all` | Include older completed items (30 days) |
| `/inbox list --issues` | Filter feedback to issues only |
| `/inbox list --enhancements` | Filter feedback to enhancements only |
| `/inbox new` | Create new feedback item |
| `/inbox <id>` | View details of specific item |
| `/inbox update <id>` | Update an existing item |
| `/inbox convert <id>` | Convert issue to enhancement or vice versa |
| `/inbox close <id>` | Close a feedback item |
| `/inbox focus` | Show only NEW and ON THE SHELF items |

## Arguments

Parse arguments from `$ARGUMENTS`:
- No args or `list` → Unified list view
- `focus` → Filtered view (NEW + ON THE SHELF only)
- `new` → Create new item
- `update <id>` → Update item
- `convert <id>` → Convert item type
- `close <id>` → Close item
- `<id>` (UUID or pattern ID) → Detail view

## Implementation

### Unified List Command (`/inbox` or `/inbox list`)

**Use the unified inbox builder CLI script:**

```bash
# Default concise view
node scripts/leo-unified-inbox.js

# Verbose view with linked items
node scripts/leo-unified-inbox.js --verbose

# JSON output for further processing
node scripts/leo-unified-inbox.js --format json

# Include more completed items
node scripts/leo-unified-inbox.js --completed-days 30
```

This displays the five lifecycle sections:
1. **NEW** — Unaddressed feedback and active patterns
2. **ON THE SHELF** — Backlogged items
3. **PENDING SDs** — Draft/planning SDs awaiting work
4. **IN PROGRESS** — Active SDs being worked on
5. **COMPLETED** — Recently resolved items

**Smart deduplication**: Feedback and patterns linked to SDs (via `resolution_sd_id` or `assigned_sd_id`) appear under their covering SD, not as separate entries.

**After displaying, show hint:**
```
Tip: /inbox <id> for details | /inbox new to create | /leo assist to process autonomously
```

### Focus View (`/inbox focus`)

Run the unified builder and filter to show only NEW and ON THE SHELF sections:

```bash
node scripts/leo-unified-inbox.js --format json
```

Then display only the NEW and ON_THE_SHELF sections from the JSON output. This is the "what needs attention" view.

### Database Connection

```javascript
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

### Create Command (`/inbox new`)

Use AskUserQuestion to collect input:

```javascript
{
  "questions": [
    {
      "question": "What type of feedback is this?",
      "header": "Type",
      "multiSelect": false,
      "options": [
        {"label": "Issue", "description": "Bug, error, or problem to fix"},
        {"label": "Enhancement", "description": "New feature or improvement"}
      ]
    },
    {
      "question": "What priority level?",
      "header": "Priority",
      "multiSelect": false,
      "options": [
        {"label": "P0 - Critical", "description": "Blocking, needs immediate attention"},
        {"label": "P1 - High", "description": "Important, should be addressed soon"},
        {"label": "P2 - Medium", "description": "Normal priority"},
        {"label": "P3 - Low", "description": "Nice to have"}
      ]
    }
  ]
}
```

Then prompt for title and description using standard input.

Insert into database:

```javascript
const { data, error } = await supabase
  .from('feedback')
  .insert({
    type: type.toLowerCase(),
    title: title,
    description: description,
    priority: priority,
    status: 'open',
    source_type: 'manual_feedback',
    source_application: 'EHG_Engineer',
    created_by: currentUserId
  })
  .select('id')
  .single();

console.log(`Created ${data.id}: ${title}`);
```

### Detail View (`/inbox <id>`)

For feedback items (UUID format):

```javascript
const { data, error } = await supabase
  .from('feedback')
  .select('*')
  .eq('id', feedbackId)
  .single();
```

For pattern items (PAT-* format):

```javascript
const { data, error } = await supabase
  .from('issue_patterns')
  .select('*')
  .eq('pattern_id', patternId)
  .single();
```

For SD items (SD-* format):

```javascript
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', sdKey)
  .single();
```

Display detailed view with all fields.

### Update Command (`/inbox update <id>`)

Fetch current values and show pre-filled form:

```javascript
const { data: current } = await supabase
  .from('feedback')
  .select('*')
  .eq('id', feedbackId)
  .single();

// Use AskUserQuestion with current values as defaults
{
  "question": "What would you like to update?",
  "header": "Update",
  "multiSelect": true,
  "options": [
    {"label": "Priority", "description": `Currently: ${current.priority}`},
    {"label": "Status", "description": `Currently: ${current.status}`},
    {"label": "Description", "description": "Edit the description"}
  ]
}

// After selection, update the fields
const { error } = await supabase
  .from('feedback')
  .update({ priority: newPriority, status: newStatus, updated_at: new Date() })
  .eq('id', feedbackId);

console.log(`Updated ${feedbackId}: Priority changed ${old} → ${new}`);
```

### Convert Command (`/inbox convert <id>`)

Toggle between issue and enhancement:

```javascript
const { data: current } = await supabase
  .from('feedback')
  .select('id, type, title')
  .eq('id', feedbackId)
  .single();

const newType = current.type === 'issue' ? 'enhancement' : 'issue';

// Confirm before converting
{
  "question": `Convert "${current.title}" from ${current.type} to ${newType}?`,
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, convert", "description": "Change the type"},
    {"label": "No, cancel", "description": "Keep current type"}
  ]
}

// If confirmed
const { error } = await supabase
  .from('feedback')
  .update({ type: newType, updated_at: new Date() })
  .eq('id', feedbackId);
```

### Close Command (`/inbox close <id>`)

```javascript
const { error } = await supabase
  .from('feedback')
  .update({ status: 'closed', resolved_at: new Date(), updated_at: new Date() })
  .eq('id', feedbackId);
```

## Error Handling

| Error | Message |
|-------|---------|
| Not found | "Item not found. Use '/inbox' to see available items." |
| Permission denied | "You don't have permission to access this item." |
| Invalid input | Show specific validation error |
| Connection error | "Unable to connect to database. Check your connection and try again." |

## Integration Points

- **Unified Builder**: `lib/inbox/unified-inbox-builder.js` aggregates all sources
- **CLI Script**: `scripts/leo-unified-inbox.js` for terminal output
- **Command Ecosystem**: After closing items, suggest `/learn` to capture patterns
- **LEO Protocol**: Items linked to SDs via `resolution_sd_id` / `assigned_sd_id`
- **`/leo assist`**: For autonomous inbox processing

## Aliases

This command is also available as:
- `/feedback` - Alias for `/inbox`
