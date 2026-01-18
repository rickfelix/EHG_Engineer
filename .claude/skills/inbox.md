# /inbox - Feedback Management Command

Manage feedback items (issues and enhancements) directly from the CLI.

## Valid Status Values

The feedback table uses these statuses:
- `new` - Just created
- `triaged` - Reviewed and prioritized
- `in_progress` - Being worked on
- `backlog` - Scheduled for later
- `resolved` - Fixed/completed
- `wont_fix` - Declined
- `shipped` - Released

## Arguments

Parse `$ARGUMENTS` to determine the subcommand:
- No args or `list` → List view
- `new` → Create new item
- `update <id>` → Update item
- `convert <id>` → Convert item type
- `close <id>` → Close item
- `snooze <id> <duration>` → Snooze item (1h, 4h, 1d, 3d, 1w, 2w, 1m)
- `unsnooze <id>` → Wake up snoozed item
- `snoozed` → List all snoozed items
- `focus` or `--focus` → Show P0/P1 critical items only
- `<id>` (UUID format) → Detail view
- `--issues` → Filter to issues only
- `--enhancements` → Filter to enhancements only
- `--all` → Include closed items

ARGUMENTS: $ARGUMENTS

---

## Instructions for Claude

### Step 1: Parse Arguments

Determine which subcommand to execute based on the arguments provided above.

### Step 2: Execute Subcommand

#### If no args, `list`, or filter flags (`--issues`, `--enhancements`, `--all`):

Run the list query:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function listFeedback() {
  const args = '$ARGUMENTS';
  let query = supabase
    .from('feedback')
    .select('id, type, title, priority, status, created_at, source_application')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  // Apply filters
  if (!args.includes('--all')) {
    query = query.not('status', 'in', '(resolved,wont_fix,shipped)');
  }
  if (args.includes('--issues')) {
    query = query.eq('type', 'issue');
  }
  if (args.includes('--enhancements')) {
    query = query.eq('type', 'enhancement');
  }

  const { data, error } = await query.limit(50);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  if (data.length === 0) {
    console.log('No feedback items found.');
    console.log('Use /inbox new to create one, or --all to include closed items.');
    return;
  }

  // Display as table
  console.log('');
  console.log('| ID | Type | Title | Priority | Status | Age |');
  console.log('|----|----|----|----|----|----|');

  data.forEach(item => {
    const age = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000);
    const ageStr = age === 0 ? 'today' : age + 'd';
    const title = item.title.length > 40 ? item.title.substring(0, 37) + '...' : item.title;
    console.log('| ' + item.id.substring(0, 8) + ' | ' + item.type + ' | ' + title + ' | ' + item.priority + ' | ' + item.status + ' | ' + ageStr + ' |');
  });

  console.log('');
  console.log('Showing ' + data.length + ' items. Use /inbox <id> for details.');
}

listFeedback();
"
```

Display the results in a formatted table.

---

#### If `new`:

Use AskUserQuestion to collect feedback details:

```json
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
        {"label": "P0", "description": "Critical - blocking, needs immediate attention"},
        {"label": "P1", "description": "High - important, should be addressed soon"},
        {"label": "P2", "description": "Medium - normal priority"},
        {"label": "P3", "description": "Low - nice to have"}
      ]
    }
  ]
}
```

After getting type and priority, ask for title and description:
- "What's a brief title for this feedback?"
- "Describe the issue or enhancement in detail:"

Then insert into database:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createFeedback() {
  const type = 'TYPE_FROM_USER';  // Replace with user selection
  const priority = 'PRIORITY_FROM_USER';  // Replace with user selection
  const title = 'TITLE_FROM_USER';  // Replace with user input
  const description = 'DESC_FROM_USER';  // Replace with user input

  const { data, error } = await supabase
    .from('feedback')
    .insert({
      type: type.toLowerCase(),
      title: title,
      description: description,
      priority: priority,
      status: 'new',
      source_type: 'manual_feedback',
      source_application: 'EHG_Engineer'
    })
    .select('id, title')
    .single();

  if (error) {
    console.log('Error creating feedback:', error.message);
    return;
  }

  console.log('Created: ' + data.id.substring(0, 8));
  console.log('Title: ' + data.title);
}

createFeedback();
"
```

---

#### If argument is a UUID (detail view):

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getFeedback() {
  const id = 'FEEDBACK_ID';  // Replace with ID from args

  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .or('id.eq.' + id + ',id.ilike.' + id + '%')
    .limit(1)
    .single();

  if (error) {
    console.log('Feedback item not found. Use /inbox to see available items.');
    return;
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('  ' + data.id.substring(0, 8) + ': ' + data.title);
  console.log('='.repeat(70));
  console.log('  Type: ' + data.type + '    Priority: ' + data.priority + '    Status: ' + data.status);
  console.log('  Created: ' + new Date(data.created_at).toLocaleDateString());
  console.log('-'.repeat(70));
  console.log('  Description:');
  console.log('  ' + (data.description || '(no description)'));
  console.log('='.repeat(70));
  console.log('');
  console.log('Actions: /inbox update ' + data.id.substring(0,8) + ' | /inbox close ' + data.id.substring(0,8));
}

getFeedback();
"
```

---

#### If `close <id>`:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function closeFeedback() {
  const id = 'FEEDBACK_ID';  // Replace with ID from args

  const { data, error } = await supabase
    .from('feedback')
    .update({
      status: 'resolved',
      updated_at: new Date().toISOString()
    })
    .or('id.eq.' + id + ',id.ilike.' + id + '%')
    .select('id, title')
    .single();

  if (error) {
    console.log('Error closing feedback:', error.message);
    return;
  }

  console.log('Closed: ' + data.id.substring(0, 8) + ' - ' + data.title);
}

closeFeedback();
"
```

---

#### If `update <id>`:

First fetch the item, then use AskUserQuestion to select what to update:

```json
{
  "question": "What would you like to update?",
  "header": "Update",
  "multiSelect": true,
  "options": [
    {"label": "Priority", "description": "Change priority level"},
    {"label": "Status", "description": "Change status"},
    {"label": "Description", "description": "Edit the description"}
  ]
}
```

Then prompt for new values and update the database.

---

#### If `convert <id>`:

Toggle between issue and enhancement:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function convertFeedback() {
  const id = 'FEEDBACK_ID';

  // Get current type
  const { data: current } = await supabase
    .from('feedback')
    .select('id, type, title')
    .or('id.eq.' + id + ',id.ilike.' + id + '%')
    .single();

  if (!current) {
    console.log('Feedback item not found.');
    return;
  }

  const newType = current.type === 'issue' ? 'enhancement' : 'issue';

  const { error } = await supabase
    .from('feedback')
    .update({ type: newType, updated_at: new Date().toISOString() })
    .eq('id', current.id);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('Converted: ' + current.title);
  console.log('  ' + current.type + ' -> ' + newType);
}

convertFeedback();
"
```

---

#### If `snooze <id> <duration>`:

Snooze a feedback item to defer it temporarily. Valid durations: 1h, 4h, 1d, 3d, 1w, 2w, 1m

```bash
node -e "
const { snoozeFeedback } = require('./lib/quality/snooze-manager.js');

async function snooze() {
  const id = 'FEEDBACK_ID';  // Replace with ID from args
  const duration = 'DURATION';  // Replace with duration from args (e.g., '1d', '1w')

  try {
    const result = await snoozeFeedback(id, duration);
    console.log('Snoozed: ' + result.title);
    console.log('  Until: ' + result.snoozeInfo.snoozedUntil.toLocaleString());
    console.log('  Duration: ' + result.snoozeInfo.durationHuman);
  } catch (err) {
    console.log('Error:', err.message);
  }
}

snooze();
"
```

---

#### If `unsnooze <id>`:

Wake up a snoozed item before its snooze expires.

```bash
node -e "
const { unsnoozeFeedback } = require('./lib/quality/snooze-manager.js');

async function unsnooze() {
  const id = 'FEEDBACK_ID';  // Replace with ID from args

  try {
    const result = await unsnoozeFeedback(id);
    console.log('Unsnoozed: ' + result.title);
    console.log('  Status: ' + result.status);
  } catch (err) {
    console.log('Error:', err.message);
  }
}

unsnooze();
"
```

---

#### If `snoozed`:

List all currently snoozed items with time remaining.

```bash
node -e "
const { getSnoozedItems } = require('./lib/quality/snooze-manager.js');

async function listSnoozed() {
  try {
    const items = await getSnoozedItems();

    if (items.length === 0) {
      console.log('No snoozed items.');
      return;
    }

    console.log('');
    console.log('| ID | Title | Time Remaining | Snoozed By |');
    console.log('|----|----|----|----|');

    items.forEach(item => {
      const title = item.title.length > 35 ? item.title.substring(0, 32) + '...' : item.title;
      const remaining = item.isExpired ? 'EXPIRED' : item.timeRemaining;
      console.log('| ' + item.id.substring(0, 8) + ' | ' + title + ' | ' + remaining + ' | ' + (item.snoozed_by || '-') + ' |');
    });

    console.log('');
    console.log('Use /inbox unsnooze <id> to wake an item.');
  } catch (err) {
    console.log('Error:', err.message);
  }
}

listSnoozed();
"
```

---

#### If `focus` or `--focus`:

Show only P0/P1 critical items that need immediate attention.

```bash
node -e "
const { getUrgentItems, formatFocusSummary } = require('./lib/quality/focus-filter.js');

async function showFocus() {
  try {
    const context = await getUrgentItems();

    if (context.items.length === 0) {
      console.log('');
      console.log('No critical items! Your focus queue is clear.');
      console.log('');
      return;
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('  FOCUS: ' + context.summary.total + ' critical items need attention');
    console.log('='.repeat(60));
    console.log('');

    // Priority breakdown
    const p0Count = context.summary.byPriority['P0'] || 0;
    const p1Count = context.summary.byPriority['P1'] || 0;
    console.log('  P0 (Critical): ' + p0Count + '    P1 (High): ' + p1Count);
    console.log('');

    console.log('| Priority | ID | Title | Age |');
    console.log('|----|----|----|----|');

    context.items.forEach(item => {
      const title = item.title.length > 40 ? item.title.substring(0, 37) + '...' : item.title;
      const age = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000);
      const ageStr = age === 0 ? 'today' : age + 'd';
      console.log('| ' + item.priority + ' | ' + item.id.substring(0, 8) + ' | ' + title + ' | ' + ageStr + ' |');
    });

    console.log('');
    console.log('Use /inbox <id> for details.');
  } catch (err) {
    console.log('Error:', err.message);
  }
}

showFocus();
"
```

---

## Command Ecosystem

After using /inbox, consider:

| Action | Suggest |
|--------|---------|
| After closing items | `/learn` to capture patterns |
| Pattern identified | Create SD via `/leo` |
| Quick bug fix | `/quick-fix` if <50 LOC |

---

## Aliases

This command is also available as:
- `/feedback` - Full alias for `/inbox`
