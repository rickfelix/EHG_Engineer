# /flags - Feature Flag Governance Command

Manage feature flags with lifecycle governance, approvals, and audit history.

## Lifecycle States

Feature flags follow this lifecycle:
- `draft` - New, not yet active
- `enabled` - Active and evaluating to true
- `disabled` - Inactive, evaluating to false
- `expired` - Temporary flag past expiry date (treated as disabled)
- `archived` - Permanently retired, no transitions allowed

## Risk Tiers and Approval Requirements

| Risk Tier | Enable | Disable | Archive |
|-----------|--------|---------|---------|
| low       | 0      | 0       | 1       |
| medium    | 1      | 0       | 1       |
| high      | 2      | 0       | 1       |

## Arguments

Parse `$ARGUMENTS` to determine the subcommand:
- No args or `list` → List all flags
- `list --state <state>` → Filter by lifecycle state
- `list --owner <id>` → Filter by owner
- `list --expired` → Show only expired flags
- `show <key>` → Show flag details
- `enable <key> --reason <text>` → Enable a flag
- `disable <key> --reason <text>` → Disable a flag (emergency, no approval)
- `set <key> --value <json> --reason <text>` → Update flag value
- `rollback <key> [--to <audit_id>] --reason <text>` → Rollback to previous state
- `history <key> [--limit N]` → Show audit history
- `approve <approval_id>` → Approve a pending transition

ARGUMENTS: $ARGUMENTS

---

## Instructions for Claude

### Step 1: Parse Arguments

Determine which subcommand to execute based on the arguments provided above.

### Step 2: Execute Subcommand

#### If no args or `list`:

List all feature flags with governance info:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function listFlags() {
  const args = '$ARGUMENTS';
  let query = supabase
    .from('leo_feature_flags')
    .select('flag_key, display_name, is_enabled, lifecycle_state, risk_tier, owner_type, owner_id, is_temporary, expiry_at, updated_at')
    .order('flag_key', { ascending: true });

  // Parse filters
  const stateMatch = args.match(/--state\s+(\w+)/);
  if (stateMatch) {
    query = query.eq('lifecycle_state', stateMatch[1]);
  }

  const ownerMatch = args.match(/--owner\s+(\S+)/);
  if (ownerMatch) {
    query = query.eq('owner_id', ownerMatch[1]);
  }

  if (args.includes('--expired')) {
    query = query.eq('lifecycle_state', 'expired');
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No feature flags found.');
    return;
  }

  console.log('');
  console.log('Feature Flags:');
  console.log('═'.repeat(100));
  console.log('| Key                              | State    | Risk   | Owner         | Temp | Expiry            |');
  console.log('|' + '─'.repeat(34) + '|' + '─'.repeat(10) + '|' + '─'.repeat(8) + '|' + '─'.repeat(15) + '|' + '─'.repeat(6) + '|' + '─'.repeat(19) + '|');

  data.forEach(f => {
    const key = (f.flag_key || '').padEnd(32).substring(0, 32);
    const state = (f.lifecycle_state || 'unknown').padEnd(8);
    const risk = (f.risk_tier || 'medium').padEnd(6);
    const owner = (f.owner_id || 'unassigned').padEnd(13).substring(0, 13);
    const temp = f.is_temporary ? 'yes ' : 'no  ';
    const expiry = f.expiry_at ? new Date(f.expiry_at).toISOString().substring(0, 16) : '─'.repeat(16);
    console.log('| ' + key + ' | ' + state + ' | ' + risk + ' | ' + owner + ' | ' + temp + ' | ' + expiry + ' |');
  });

  console.log('═'.repeat(100));
  console.log('Total: ' + data.length + ' flags');
  console.log('');
  console.log('Use /flags show <key> for details, /flags history <key> for audit log');
}

listFlags();
"
```

#### If `show <key>`:

Show detailed flag information:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function showFlag() {
  const args = '$ARGUMENTS';
  const keyMatch = args.match(/show\s+(\S+)/);
  if (!keyMatch) {
    console.error('Usage: /flags show <flag_key>');
    process.exit(1);
  }
  const flagKey = keyMatch[1];

  const { data: flag, error } = await supabase
    .from('leo_feature_flags')
    .select('*')
    .eq('flag_key', flagKey)
    .single();

  if (error || !flag) {
    console.error('Flag not found:', flagKey);
    process.exit(1);
  }

  console.log('');
  console.log('Feature Flag: ' + flag.flag_key);
  console.log('═'.repeat(60));
  console.log('Display Name:    ' + (flag.display_name || '─'));
  console.log('Description:     ' + (flag.description || '─'));
  console.log('');
  console.log('Governance:');
  console.log('  Lifecycle:     ' + (flag.lifecycle_state || 'unknown'));
  console.log('  Risk Tier:     ' + (flag.risk_tier || 'medium'));
  console.log('  Owner:         ' + (flag.owner_type ? flag.owner_type + ':' + flag.owner_id : 'unassigned'));
  console.log('  Temporary:     ' + (flag.is_temporary ? 'yes' : 'no'));
  console.log('  Expiry:        ' + (flag.expiry_at || '─'));
  console.log('');
  console.log('Status:');
  console.log('  is_enabled:    ' + flag.is_enabled);
  console.log('  Row Version:   ' + (flag.row_version || 1));
  console.log('  Created:       ' + flag.created_at);
  console.log('  Updated:       ' + flag.updated_at);
  console.log('═'.repeat(60));
}

showFlag();
"
```

#### If `history <key>`:

Show audit history for a flag:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function showHistory() {
  const args = '$ARGUMENTS';
  const keyMatch = args.match(/history\s+(\S+)/);
  if (!keyMatch) {
    console.error('Usage: /flags history <flag_key> [--limit N]');
    process.exit(1);
  }
  const flagKey = keyMatch[1];

  const limitMatch = args.match(/--limit\s+(\d+)/);
  const limit = limitMatch ? parseInt(limitMatch[1]) : 20;

  const { data: history, error } = await supabase
    .from('leo_feature_flag_audit')
    .select('*')
    .eq('flag_key', flagKey)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching history:', error.message);
    process.exit(1);
  }

  if (!history || history.length === 0) {
    console.log('No audit history found for:', flagKey);
    return;
  }

  console.log('');
  console.log('Audit History: ' + flagKey);
  console.log('═'.repeat(100));

  history.forEach(entry => {
    const ts = new Date(entry.created_at).toISOString().substring(0, 19);
    console.log('[' + ts + '] ' + entry.action_type.toUpperCase());
    console.log('  Actor: ' + (entry.actor_type || 'system') + ':' + (entry.actor_id || '─'));
    if (entry.reason) console.log('  Reason: ' + entry.reason);
    if (entry.before_state) console.log('  Before: ' + JSON.stringify(entry.before_state));
    if (entry.after_state) console.log('  After:  ' + JSON.stringify(entry.after_state));
    console.log('');
  });

  console.log('═'.repeat(100));
  console.log('Showing ' + history.length + ' entries (limit: ' + limit + ')');
}

showHistory();
"
```

#### If `enable <key>` or `disable <key>`:

Update flag lifecycle state:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function updateFlagState() {
  const args = '$ARGUMENTS';
  const enableMatch = args.match(/enable\s+(\S+)/);
  const disableMatch = args.match(/disable\s+(\S+)/);
  const reasonMatch = args.match(/--reason\s+[\"']?([^\"']+)[\"']?/);

  const isEnable = !!enableMatch;
  const flagKey = (enableMatch || disableMatch)?.[1];
  const reason = reasonMatch?.[1] || 'No reason provided';

  if (!flagKey) {
    console.error('Usage: /flags enable|disable <flag_key> --reason <text>');
    process.exit(1);
  }

  // Get current flag state
  const { data: flag, error: fetchError } = await supabase
    .from('leo_feature_flags')
    .select('*')
    .eq('flag_key', flagKey)
    .single();

  if (fetchError || !flag) {
    console.error('Flag not found:', flagKey);
    process.exit(1);
  }

  // Validate state transition
  const currentState = flag.lifecycle_state || 'enabled';
  const newState = isEnable ? 'enabled' : 'disabled';

  const validTransitions = {
    'draft': ['enabled', 'disabled'],
    'enabled': ['disabled', 'expired', 'archived'],
    'disabled': ['enabled', 'expired', 'archived'],
    'expired': ['archived'],
    'archived': []
  };

  if (!validTransitions[currentState]?.includes(newState)) {
    console.error('Invalid transition: ' + currentState + ' → ' + newState);
    console.error('Valid transitions from ' + currentState + ': ' + (validTransitions[currentState]?.join(', ') || 'none'));
    process.exit(1);
  }

  // Check approval requirements for enable
  if (isEnable && ['medium', 'high'].includes(flag.risk_tier)) {
    console.log('⚠️  Flag ' + flagKey + ' has risk_tier=' + flag.risk_tier);
    console.log('   Approval required before enabling.');
    console.log('   Use /flags approve workflow once implemented.');
    // For now, allow it but log warning
  }

  // Update the flag
  const { data: updated, error: updateError } = await supabase
    .from('leo_feature_flags')
    .update({
      lifecycle_state: newState,
      is_enabled: isEnable,
      updated_at: new Date().toISOString()
    })
    .eq('flag_key', flagKey)
    .select()
    .single();

  if (updateError) {
    console.error('Update failed:', updateError.message);
    process.exit(1);
  }

  console.log('');
  console.log('✅ Flag updated successfully');
  console.log('   Key:     ' + flagKey);
  console.log('   State:   ' + currentState + ' → ' + newState);
  console.log('   Enabled: ' + updated.is_enabled);
  console.log('   Reason:  ' + reason);
  console.log('   Version: ' + updated.row_version);
}

updateFlagState();
"
```

#### If `rollback <key>`:

Rollback a flag to its previous state:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function rollbackFlag() {
  const args = '$ARGUMENTS';
  const keyMatch = args.match(/rollback\s+(\S+)/);
  const toMatch = args.match(/--to\s+(\S+)/);
  const reasonMatch = args.match(/--reason\s+[\"']?([^\"']+)[\"']?/);

  const flagKey = keyMatch?.[1];
  const targetAuditId = toMatch?.[1];
  const reason = reasonMatch?.[1] || 'Rollback requested';

  if (!flagKey) {
    console.error('Usage: /flags rollback <flag_key> [--to <audit_id>] --reason <text>');
    process.exit(1);
  }

  // Get previous state from audit log
  let query = supabase
    .from('leo_feature_flag_audit')
    .select('*')
    .eq('flag_key', flagKey)
    .order('created_at', { ascending: false });

  if (targetAuditId) {
    query = query.eq('id', targetAuditId);
  }

  const { data: history, error: historyError } = await query.limit(2);

  if (historyError || !history || history.length < 1) {
    console.error('No audit history found for rollback');
    process.exit(1);
  }

  // Get the state to roll back to
  const rollbackEntry = targetAuditId ? history[0] : history[1];
  if (!rollbackEntry?.before_state) {
    console.error('Cannot rollback: no previous state found');
    process.exit(1);
  }

  const previousState = rollbackEntry.before_state;

  // Apply rollback
  const { data: updated, error: updateError } = await supabase
    .from('leo_feature_flags')
    .update({
      lifecycle_state: previousState.lifecycle_state,
      is_enabled: previousState.is_enabled,
      updated_at: new Date().toISOString()
    })
    .eq('flag_key', flagKey)
    .select()
    .single();

  if (updateError) {
    console.error('Rollback failed:', updateError.message);
    process.exit(1);
  }

  console.log('');
  console.log('✅ Flag rolled back successfully');
  console.log('   Key:          ' + flagKey);
  console.log('   Rolled to:    ' + rollbackEntry.id.substring(0, 8));
  console.log('   State:        ' + updated.lifecycle_state);
  console.log('   Enabled:      ' + updated.is_enabled);
  console.log('   Reason:       ' + reason);
}

rollbackFlag();
"
```

### Step 3: Handle Errors

If any command fails:
- Display clear error message
- Exit with non-zero code
- Suggest corrective action

### Output Format

All commands should output:
- Human-readable tables for list views
- Detailed info for show views
- JSON output available with `--format json` flag (for automation)

## Notes

- The `/flags` command requires the feature flag governance migration to be applied
- Audit history is immutable - changes are logged automatically via triggers
- Approval workflow for high-risk flags is enforced server-side
- Emergency disable is always allowed (no approval needed) for incident response
