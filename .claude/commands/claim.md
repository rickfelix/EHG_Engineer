# /claim - SD Claim Management Command

Manage SD session claims: view status, release claims, list all active claims.

## Arguments

Parse `$ARGUMENTS` to determine the subcommand:
- No args or `status` → Show current claim status
- `release` → Release current claim
- `list` → List all active claims
- `help` → Show usage help

ARGUMENTS: $ARGUMENTS

---

## Instructions for Claude

### Step 1: Parse Arguments

Determine which subcommand to execute based on the arguments provided above.

### Step 2: Execute Subcommand

#### If no args, `status`, or `s`:

Show the current session's claim status by querying `v_active_sessions`.

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function claimStatus() {
  // Get current session
  const { data: session } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_id, heartbeat_at, status')
    .eq('status', 'active')
    .order('heartbeat_at', { ascending: false })
    .limit(1)
    .single();

  if (!session || !session.sd_id) {
    console.log('');
    console.log('  No active claim');
    console.log('');
    console.log('  You are not currently working on any SD.');
    console.log('  Run /leo next to see the SD queue.');
    console.log('');
    return;
  }

  // Get claim details from v_active_sessions
  const { data: claim } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, sd_title, heartbeat_age_human, heartbeat_age_seconds, computed_status, track, hostname, tty, claimed_at, claim_duration_minutes')
    .eq('session_id', session.session_id)
    .single();

  if (!claim) {
    console.log('');
    console.log('  No active claim found in v_active_sessions');
    console.log('  Session: ' + session.session_id);
    console.log('  SD (from session): ' + session.sd_id);
    console.log('');
    return;
  }

  const staleThreshold = 300; // 5 minutes
  const isStale = claim.heartbeat_age_seconds > staleThreshold;
  const staleIndicator = isStale ? ' [STALE]' : '';

  console.log('');
  console.log('  Claim Status');
  console.log('  ' + '='.repeat(50));
  console.log('  SD:        ' + claim.sd_id);
  if (claim.sd_title) console.log('  Title:     ' + claim.sd_title);
  console.log('  Session:   ' + claim.session_id);
  console.log('  Heartbeat: ' + (claim.heartbeat_age_human || 'unknown') + staleIndicator);
  console.log('  Status:    ' + (claim.computed_status || 'unknown'));
  if (claim.track) console.log('  Track:     ' + claim.track);
  if (claim.claimed_at) console.log('  Claimed:   ' + new Date(claim.claimed_at).toLocaleString());
  if (claim.claim_duration_minutes) console.log('  Duration:  ' + Math.round(claim.claim_duration_minutes) + ' min');
  console.log('  ' + '='.repeat(50));
  if (isStale) {
    console.log('');
    console.log('  Warning: Heartbeat is stale (>' + (staleThreshold / 60) + 'min).');
    console.log('  Other sessions may take over this claim.');
  }
  console.log('');
}

claimStatus();
"
```

Display the results formatted as shown above.

---

#### If `release` or `r`:

Release the current session's claim by calling the `release_sd` RPC.

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function releaseClaim() {
  // Get current session
  const { data: session } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_id')
    .eq('status', 'active')
    .order('heartbeat_at', { ascending: false })
    .limit(1)
    .single();

  if (!session || !session.sd_id) {
    console.log('');
    console.log('  No active claim to release.');
    console.log('  Run /claim status to check your current state.');
    console.log('');
    return;
  }

  const sdId = session.sd_id;
  const sessionId = session.session_id;

  // Release via RPC (use single-param overload to avoid ambiguity)
  const { error: releaseError } = await supabase.rpc('release_sd', {
    p_session_id: sessionId
  });

  if (releaseError) {
    console.log('');
    console.log('  Error releasing claim: ' + releaseError.message);
    console.log('');

    // Fallback: try direct update if RPC fails
    console.log('  Attempting direct release...');
    const { error: directError } = await supabase
      .from('sd_claims')
      .update({ released_at: new Date().toISOString(), release_reason: 'manual' })
      .eq('session_id', sessionId)
      .is('released_at', null);

    if (directError) {
      console.log('  Direct release also failed: ' + directError.message);
      return;
    }
  }

  // Clear claiming_session_id and is_working_on on the SD
  await supabase
    .from('strategic_directives_v2')
    .update({ claiming_session_id: null, is_working_on: false })
    .eq('sd_key', sdId);

  // Clear sd_id on the session
  await supabase
    .from('claude_sessions')
    .update({ sd_id: null })
    .eq('session_id', sessionId);

  console.log('');
  console.log('  Released: ' + sdId);
  console.log('  Session ' + sessionId + ' no longer claims this SD.');
  console.log('');
  console.log('  Run /leo next to pick your next work item.');
  console.log('');
}

releaseClaim();
"
```

---

#### If `list` or `l`:

List all active claims across all sessions.

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function listClaims() {
  const { data: claims, error } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, sd_title, heartbeat_age_human, heartbeat_age_seconds, computed_status, hostname, tty, track')
    .order('heartbeat_age_seconds', { ascending: true });

  if (error) {
    console.log('Error querying active sessions: ' + error.message);
    return;
  }

  if (!claims || claims.length === 0) {
    console.log('');
    console.log('  No active claims.');
    console.log('  All SDs are available for work.');
    console.log('');
    return;
  }

  const staleThreshold = 300;

  console.log('');
  console.log('  Active Claims (' + claims.length + ')');
  console.log('  ' + '='.repeat(90));
  console.log('  ' + 'SD'.padEnd(40) + 'Session'.padEnd(16) + 'Heartbeat'.padEnd(14) + 'Status');
  console.log('  ' + '-'.repeat(90));

  claims.forEach(function(c) {
    const isStale = c.heartbeat_age_seconds > staleThreshold;
    const staleFlag = isStale ? ' [STALE]' : '';
    const sd = (c.sd_id || 'unknown').substring(0, 38).padEnd(40);
    const sess = (c.session_id || '').substring(0, 14).padEnd(16);
    const hb = ((c.heartbeat_age_human || '?') + staleFlag).padEnd(14);
    const status = c.computed_status || '?';
    console.log('  ' + sd + sess + hb + status);
  });

  console.log('  ' + '='.repeat(90));

  const staleCount = claims.filter(function(c) { return c.heartbeat_age_seconds > staleThreshold; }).length;
  if (staleCount > 0) {
    console.log('');
    console.log('  Warning: ' + staleCount + ' stale claim(s) detected (heartbeat >5min).');
    console.log('  Stale claims will be auto-released when another session claims the same SD.');
  }
  console.log('');
}

listClaims();
"
```

---

#### If `help` or `h`:

Display usage information:

```
/claim Command - SD Claim Management

Subcommands:
  /claim              Show current claim status (default)
  /claim status  (s)  Show current claim status
  /claim release (r)  Release your current SD claim
  /claim list    (l)  List all active claims across sessions
  /claim help    (h)  Show this help

Examples:
  /claim               Check if you have an active claim
  /claim release       Free your current SD for other sessions
  /claim list          See who is working on what

Related:
  /leo next            Show SD queue and pick next work
  /leo start <SD-ID>   Claim and start working on an SD
```

---

## Intent Detection Keywords

When the user mentions any of these phrases, suggest `/claim`:
- "claim status", "my claim", "what am I working on"
- "release claim", "release SD", "free SD", "unclaim"
- "who has", "who is working on", "active claims", "active sessions"
- "claim stuck", "claim conflict", "stale claim"

---

## Command Ecosystem

After using /claim, consider:

| Action | Suggest |
|--------|---------|
| After releasing | `/leo next` to pick new work |
| Stale claims found | Release via `/claim release` then `/leo next` |
| Claim conflict | Check `/claim list` to see who owns it |
