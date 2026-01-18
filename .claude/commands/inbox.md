# /inbox - Feedback Management Command

**Purpose**: Manage feedback items (issues and enhancements) directly from the CLI

## Subcommands

| Command | Description |
|---------|-------------|
| `/inbox` or `/inbox list` | List open feedback items |
| `/inbox list --all` | Include closed items |
| `/inbox list --issues` | Filter to issues only |
| `/inbox list --enhancements` | Filter to enhancements only |
| `/inbox list --mine` | Filter to items assigned to current user |
| `/inbox list --since 7d` | Filter by age (7d, 30d, etc.) |
| `/inbox new` | Create new feedback item |
| `/inbox <id>` | View details of specific item |
| `/inbox update <id>` | Update an existing item |
| `/inbox convert <id>` | Convert issue to enhancement or vice versa |
| `/inbox close <id>` | Close a feedback item |

## Arguments

Parse arguments from `$ARGUMENTS`:
- No args or `list` → List view
- `new` → Create new item
- `update <id>` → Update item
- `convert <id>` → Convert item type
- `close <id>` → Close item
- `<id>` (starts with FB-) → Detail view

## Implementation

### Database Connection

```javascript
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

### List Command (`/inbox` or `/inbox list`)

Query the feedback table with filters:

```javascript
let query = supabase
  .from('feedback')
  .select('id, type, title, priority, status, created_at, source_application')
  .order('priority', { ascending: true })
  .order('created_at', { ascending: true });

// Apply filters based on flags
if (!args.includes('--all')) {
  query = query.not('status', 'in', '(closed,resolved,rejected,snoozed)');
}
if (args.includes('--issues')) {
  query = query.eq('type', 'issue');
}
if (args.includes('--enhancements')) {
  query = query.eq('type', 'enhancement');
}
if (args.includes('--mine')) {
  query = query.eq('assigned_to', currentUserId);
}
// Parse --since flag (e.g., --since 7d)
const sinceMatch = args.match(/--since\s+(\d+)([dhm])/);
if (sinceMatch) {
  const value = parseInt(sinceMatch[1]);
  const unit = sinceMatch[2];
  const ms = unit === 'd' ? value * 86400000 : unit === 'h' ? value * 3600000 : value * 60000;
  const since = new Date(Date.now() - ms).toISOString();
  query = query.gte('created_at', since);
}

const { data, error } = await query.limit(50);
```

Display as table:

```
┌──────────┬─────────────┬────────────────────────────────────────────────┬──────────┬──────────┬───────────┐
│ ID       │ Type        │ Title                                          │ Priority │ Status   │ Age       │
├──────────┼─────────────┼────────────────────────────────────────────────┼──────────┼──────────┼───────────┤
│ FB-0001  │ issue       │ Build fails on CI with timeout                 │ P0       │ open     │ 2d        │
│ FB-0002  │ enhancement │ Add dark mode toggle                           │ P2       │ triaged  │ 5d        │
│ FB-0003  │ issue       │ Login redirect not working                     │ P1       │ open     │ 1d        │
└──────────┴─────────────┴────────────────────────────────────────────────┴──────────┴──────────┴───────────┘

Showing 3 of 3 open items. Use --all to include closed.
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

Query single item with joins:

```javascript
const { data, error } = await supabase
  .from('feedback')
  .select(`
    id, type, title, description, priority, status,
    created_at, updated_at, created_by,
    feedback_sd_map(sd_id)
  `)
  .eq('id', feedbackId)
  .single();
```

Display detailed view:

```
╔════════════════════════════════════════════════════════════════════════════╗
║  FB-0001: Build fails on CI with timeout                                   ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Type: issue            Priority: P0            Status: open               ║
║  Created: 2 days ago    Updated: 1 day ago      By: user@example.com       ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Description:                                                              ║
║  The CI pipeline times out after 10 minutes when running E2E tests.        ║
║  This started happening after the last deployment.                         ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Linked SDs: SD-CI-PERF-001                                                ║
╚════════════════════════════════════════════════════════════════════════════╝

Actions: /inbox update FB-0001 | /inbox close FB-0001 | /inbox convert FB-0001
```

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

console.log(`Updated FB-0001: Priority changed P2 → P0`);
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

console.log(`Converted FB-0001 from ${current.type} to ${newType}`);
```

### Close Command (`/inbox close <id>`)

Set status to closed:

```javascript
const { error } = await supabase
  .from('feedback')
  .update({ status: 'closed', closed_at: new Date(), updated_at: new Date() })
  .eq('id', feedbackId);

console.log(`Closed FB-0001`);
```

## Error Handling

| Error | Message |
|-------|---------|
| Not found | "Feedback item FB-XXXX not found. Use '/inbox list' to see available items." |
| Permission denied | "You don't have permission to access this feedback item." |
| Invalid input | Show specific validation error (e.g., "Priority must be P0-P4") |
| Connection error | "Unable to connect to feedback database. Check your connection and try again." |

## Integration Points

- **Command Ecosystem**: After closing items, suggest `/learn` to capture patterns
- **LEO Protocol**: Can link feedback items to SDs via `feedback_sd_map`
- **Quality Lifecycle**: Part of SD-QUALITY-LIFECYCLE-001 system

## Aliases

This command is also available as:
- `/feedback` - Alias for `/inbox`
- `/issues` - Shortcut for `/inbox list --issues`
