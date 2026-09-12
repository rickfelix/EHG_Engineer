<!-- reasoning_effort: low -->

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
  // Resolve THIS session's own row by CLAUDE_SESSION_ID -- QF-20260912-810 found two stacked
  // defects here: (1) claude_sessions has sd_key, NOT sd_id, so the old select errored and the
  // error was silently discarded, read as 'no claim' while a real claim was live; (2) even with
  // the column fixed, the old 'most-recently-active session in the WHOLE FLEET' heuristic (no
  // session_id filter) picks a DIFFERENT worker's session under the concurrency this fleet runs
  // under by default -- confirmed live: 4 concurrent active sessions, 3 with a MORE recent
  // heartbeat than this one. Scoping by CLAUDE_SESSION_ID (the precedent fix for the identical
  // class in scripts/get-working-on-sd.js, QF-20260703-742) makes this unambiguous.
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.log('');
    console.log('  CLAUDE_SESSION_ID is not set -- cannot resolve which claim belongs to this session.');
    console.log('');
    return;
  }

  const { data: session, error: sessionError } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_key, heartbeat_at, status')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (sessionError) {
    console.log('');
    console.log('  Error querying claude_sessions: ' + sessionError.message);
    console.log('');
    return;
  }

  if (!session || !session.sd_key) {
    console.log('');
    console.log('  No active claim');
    console.log('');
    console.log('  You are not currently working on any SD.');
    console.log('  Run /leo next to see the SD queue.');
    console.log('');
    return;
  }

  // Get claim details from v_active_sessions. Check the error explicitly -- destructuring only
  // data (as this line used to) is the exact shell-masks-vacancy shape QF-20260912-810 fixed
  // above, so the same fix applies here even though this particular query was never observed to
  // actually error (v_active_sessions' own columns are all live).
  const { data: claim, error: claimError } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, sd_title, heartbeat_age_human, heartbeat_age_seconds, computed_status, track, hostname, tty, claimed_at, claim_duration_minutes')
    .eq('session_id', session.session_id)
    .maybeSingle();

  if (claimError) {
    console.log('');
    console.log('  Error querying v_active_sessions: ' + claimError.message);
    console.log('');
    return;
  }

  if (!claim) {
    console.log('');
    console.log('  No active claim found in v_active_sessions');
    console.log('  Session: ' + session.session_id);
    console.log('  SD (from session): ' + session.sd_key);
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
  // Resolve THIS session's own row by CLAUDE_SESSION_ID -- see claimStatus() above for the two
  // stacked defects QF-20260912-810 found (phantom sd_id column, plus a whole-fleet
  // most-recently-active heuristic that picks a DIFFERENT worker's session under concurrency).
  // The second defect made /claim release doubly dangerous: releasing based on the wrong
  // session's row would have run release_sd against ANOTHER worker's live claim, not this one.
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.log('');
    console.log('  CLAUDE_SESSION_ID is not set -- cannot resolve which claim belongs to this session.');
    console.log('');
    return;
  }

  const { data: session, error: sessionError } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_key')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (sessionError) {
    console.log('');
    console.log('  Error querying claude_sessions: ' + sessionError.message);
    console.log('');
    return;
  }

  if (!session || !session.sd_key) {
    console.log('');
    console.log('  No active claim to release.');
    console.log('  Run /claim status to check your current state.');
    console.log('');
    return;
  }

  const sdId = session.sd_key;

  // Release via RPC (use single-param overload to avoid ambiguity)
  const { error: releaseError } = await supabase.rpc('release_sd', {
    p_session_id: sessionId
  });

  if (releaseError) {
    console.log('');
    console.log('  Error releasing claim: ' + releaseError.message);
    console.log('');

    // Fallback: try direct update on claude_sessions if RPC fails. worktree_path/worktree_branch
    // MUST be cleared in the SAME statement as sd_key -- ck_claude_sessions_worktree_state_
    // consistency requires (sd_key IS NOT NULL) OR (worktree_path IS NULL AND worktree_branch IS
    // NULL), so a session that holds a worktree would otherwise fail this UPDATE outright
    // (VALIDATION finding, QF-20260912-810 / SD-LEO-FIX-CLAUDE-COMMANDS-CLAIM-001).
    console.log('  Attempting direct release...');
    const { error: directError } = await supabase
      .from('claude_sessions')
      .update({ sd_key: null, worktree_path: null, worktree_branch: null, released_at: new Date().toISOString(), released_reason: 'manual' })
      .eq('session_id', sessionId);

    if (directError) {
      console.log('  Direct release also failed: ' + directError.message);
      return;
    }
  }

  // Clear claiming_session_id and is_working_on on the SD -- needed for the fallback direct-
  // release path above (release_sd's own RPC body already does this on the success path, and
  // already clears claude_sessions.sd_key too, so no separate 'clear sd_id on the session'
  // step belongs here -- that phantom-column update was the QF-20260912-810 defect).
  await supabase
    .from('strategic_directives_v2')
    .update({ claiming_session_id: null, is_working_on: false })
    .eq('sd_key', sdId);

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
