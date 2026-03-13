---
description: "/claim - SD Claim Management Command"
---

# /claim - SD Claim Management

**Command:** /claim $ARGUMENTS

Manage SD claims across Claude Code sessions. Ensures fleet-wide visibility of who is working on what. **Every session MUST have an active claim before doing any SD work.**

## Subcommands

Parse `$ARGUMENTS` to determine the subcommand:

| Input | Subcommand |
|-------|-----------|
| (none), `list`, `l` | List all active sessions and claims |
| `status`, `s` | Show this session's claim |
| `<SD-KEY>` | Claim a specific SD (e.g., `/claim SD-FOO-001`) |
| `release [session-id]` | Release a claim (own session if no ID given) |
| `switch <SD-KEY>` | Atomic release + claim in one step |
| `help` | Show usage help |

---

## Core Rules — READ BEFORE DOING ANYTHING

### Rule 1: One Session = One Claim = One SD

Every session that does work MUST have exactly one SD claimed in `claude_sessions.sd_id`. This is how the coordinator, dashboard, and sweep track fleet activity. **A session with no claim is invisible to fleet management.**

### Rule 2: Claim the SD You Are Actually Working On

If you are implementing Child B, claim Child B — NOT the parent orchestrator. The claim must reflect the **specific SD receiving commits and handoffs right now**.

### Rule 3: Orchestrator Claiming — NEVER Park on a Parent

**Orchestrators coordinate children — they don't receive implementation work directly.**

When you encounter an orchestrator SD:
1. Query its children: `SELECT sd_key, title, status, current_phase FROM strategic_directives_v2 WHERE parent_sd_id = (SELECT id FROM strategic_directives_v2 WHERE sd_key = '<ORCH-SD-KEY>')`
2. Identify the next incomplete child (prefer: EXEC > PLAN > LEAD > DRAFT status)
3. **Claim that child**, not the orchestrator
4. When the child completes, switch your claim to the next incomplete child
5. Only claim the orchestrator itself for its final completion handoff (when all children are done)

If you already have an orchestrator claimed and children remain incomplete:
- Run `/claim switch <CHILD-SD-KEY>` to move your claim to the active child
- The orchestrator doesn't need a claim while children are in progress

### Rule 4: Verify After Claiming

After every claim operation, verify it registered in the DB:
```bash
node --input-type=module -e "
import { claimStatus } from './lib/commands/claim-command.js';
await claimStatus();
"
```

If the output shows `(none - no active claim)`, the claim failed silently. Re-attempt or investigate.

### Rule 5: Claim Before Work, Switch on Completion

| Event | Action |
|-------|--------|
| Starting a new SD | `/claim <SD-KEY>` |
| Finishing current SD, starting next | `/claim switch <NEW-SD-KEY>` |
| SD complete, no immediate next | `/claim release` (frees your session for the queue) |
| Orchestrator child complete, next child ready | `/claim switch <NEXT-CHILD-KEY>` |
| All orchestrator children done | `/claim switch <ORCH-KEY>` for final completion |

---

## Execution

### /claim (no args) or /claim list

Query all active sessions and display claim status:

```bash
node --input-type=module -e "
import { listClaims } from './lib/commands/claim-command.js';
await listClaims();
"
```

After displaying the list, add an assessment:
- Flag sessions that are idle with no claim (potential ghost sessions or idle workers)
- Flag sessions claiming orchestrators when children are incomplete (Rule 3 violation)
- Flag sessions with stale heartbeats that still hold claims

### /claim status

Show this session's claim with orchestrator context:

```bash
node --input-type=module -e "
import { claimStatus } from './lib/commands/claim-command.js';
await claimStatus();
"
```

**After displaying status**, if the claimed SD is an orchestrator, auto-check children:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
s.from('strategic_directives_v2')
  .select('sd_key, title, status, current_phase, progress_percentage')
  .eq('parent_sd_id', '<PARENT-UUID>')
  .order('sd_key')
  .then(r => {
    const children = r.data || [];
    const incomplete = children.filter(c => c.status !== 'completed');
    if (incomplete.length > 0) {
      console.log('\\n⚠ ORCHESTRATOR WARNING: ' + incomplete.length + ' incomplete children:');
      incomplete.forEach(c => console.log('  ' + c.sd_key + ' — ' + c.status + ' ' + (c.current_phase || '')));
      console.log('\\nYou should claim a specific child instead. Run:');
      console.log('  /claim switch ' + incomplete[0].sd_key);
    } else {
      console.log('\\n✓ All children complete — orchestrator claim is correct for final completion.');
    }
  });
" 2>/dev/null
```

### /claim <SD-KEY>

Claim a specific SD. This is the **primary claiming action**.

**Step 1: Pre-flight checks**

Before claiming, check if the target SD is an orchestrator with incomplete children:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Get the target SD
  const { data: sd } = await s.from('strategic_directives_v2')
    .select('id, sd_key, sd_type, status, current_phase')
    .eq('sd_key', '<SD-KEY>')
    .single();
  if (!sd) { console.log('SD not found: <SD-KEY>'); return; }

  // Check if it's an orchestrator (has children)
  const { data: children } = await s.from('strategic_directives_v2')
    .select('sd_key, title, status, current_phase')
    .eq('parent_sd_id', sd.id);

  if (children && children.length > 0) {
    const incomplete = children.filter(c => c.status !== 'completed');
    if (incomplete.length > 0) {
      console.log('ORCHESTRATOR_WITH_CHILDREN');
      console.log(JSON.stringify({ sd_key: sd.sd_key, incomplete_children: incomplete.map(c => ({ sd_key: c.sd_key, title: c.title, status: c.status, phase: c.current_phase })) }));
    } else {
      console.log('ORCHESTRATOR_ALL_DONE');
    }
  } else {
    console.log('NOT_ORCHESTRATOR');
  }
})();
" 2>/dev/null
```

**Step 2: Route based on pre-flight result**

- **`NOT_ORCHESTRATOR`** or **`ORCHESTRATOR_ALL_DONE`**: Proceed with claim (Step 3)
- **`ORCHESTRATOR_WITH_CHILDREN`**: Do NOT claim the orchestrator. Instead:
  1. Display the incomplete children list
  2. Recommend the highest-priority incomplete child
  3. Ask: "This is an orchestrator with N incomplete children. Claiming child X instead. Proceed?"
  4. If confirmed (or AUTO-PROCEED is on), claim the recommended child

**Step 3: Execute claim via claim-guard**

```bash
node --input-type=module -e "
import { claimGuard } from './lib/claim-guard.mjs';
const result = await claimGuard('<TARGET-SD-KEY>', null);
console.log(JSON.stringify(result, null, 2));
"
```

**Step 4: Update SD metadata**

After successful claim, ensure the SD knows who owns it:
```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
s.from('strategic_directives_v2')
  .update({ is_working_on: true })
  .eq('sd_key', '<TARGET-SD-KEY>')
  .select('sd_key, claiming_session_id, is_working_on')
  .then(r => console.log('Claim registered:', JSON.stringify(r.data)));
" 2>/dev/null
```

**Step 5: Verify** (Rule 4)

Run `claimStatus()` to confirm the claim is visible.

### /claim switch <SD-KEY>

Atomic release of current claim + acquisition of new claim. Prevents the window where a session has no claim (invisible to fleet).

1. Get current claim via `claimStatus()`
2. If current claim exists, release it: `releaseClaim(currentSessionId)`
3. Immediately claim the new SD: follow `/claim <SD-KEY>` flow above
4. Verify the switch completed

```bash
# Release current
node --input-type=module -e "
import { releaseClaim } from './lib/commands/claim-command.js';
import { resolveOwnSession } from './lib/resolve-own-session.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await resolveOwnSession(s, { select: 'session_id, sd_id' });
if (data?.sd_id) {
  await releaseClaim(data.session_id);
  console.log('Released: ' + data.sd_id);
}
"

# Then claim new (use /claim <SD-KEY> flow)
```

### /claim release [session-id]

Release a claim. If no session-id given, release this session's own claim.

```bash
# Release own claim
node --input-type=module -e "
import { releaseClaim } from './lib/commands/claim-command.js';
import { resolveOwnSession } from './lib/resolve-own-session.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await resolveOwnSession(s, { select: 'session_id' });
if (data) await releaseClaim(data.session_id);
"

# Release another session's claim
node --input-type=module -e "
import { releaseClaim } from './lib/commands/claim-command.js';
await releaseClaim('<session-id>');
"
```

### /claim help

Display:
```
/claim — SD Claim Management

Usage:
  /claim              List all sessions and their claims
  /claim status       Show this session's claim
  /claim <SD-KEY>     Claim a specific SD
  /claim switch <KEY> Release current claim + claim new SD
  /claim release      Release this session's claim
  /claim release <id> Release another session's claim
  /claim help         Show this help

Rules:
  1. Every session MUST claim an SD before doing work
  2. Claim the SD you are ACTUALLY working on (not a parent)
  3. Never park on an orchestrator — claim a specific child
  4. Always verify after claiming (/claim status)
  5. Switch claims when moving between SDs (/claim switch)

The coordinator sweep auto-detects:
  - Duplicate claims (same SD by multiple sessions)
  - Identity collisions (shared session IDs)
  - Idle sessions with no claims
  - Orchestrators claimed when children are incomplete
```

---

## Orchestrator-Aware Claim Routing (Detail)

When a session attempts to claim an orchestrator SD that has incomplete children, the claim system MUST redirect to a child. This prevents the common failure mode where a worker claims the orchestrator, works on children without claiming them, and becomes invisible to the fleet.

**Decision tree:**

```
/claim SD-ORCH-001
  │
  ├── Has children? ──NO──→ Claim SD-ORCH-001 directly
  │
  YES
  │
  ├── All children completed? ──YES──→ Claim SD-ORCH-001 (final completion)
  │
  NO
  │
  ├── Pick best incomplete child:
  │   Priority: EXEC > PLAN > LEAD > DRAFT
  │   Tiebreak: sd_key order (A before B before C)
  │
  └── Claim child instead
      Display: "Orchestrator SD-ORCH-001 has 3 incomplete children.
               Claiming SD-ORCH-001-A (Phase 1: ...) instead."
```

**When a child completes and the worker is ready for the next:**

```
Child complete → /claim switch <NEXT-CHILD>
  │
  ├── More incomplete children? ──YES──→ Switch to next child
  │
  NO
  │
  └── All children done → /claim switch <ORCH-KEY> for final completion
```

---

## Intent Detection Keywords

When the user mentions any of these phrases, invoke `/claim`:
- "claim status", "my claim", "what am I working on", "what's claimed"
- "release claim", "release SD", "free SD", "unclaim", "drop claim"
- "who has", "who is working on", "active claims", "active sessions", "show claims"
- "claim stuck", "claim conflict", "stale claim", "claimed by another"
- "claim list", "list claims", "all claims"
- "switch to", "move to next", "next child" (in context of SD work)

---

## After Claim Operations

| After | Suggest |
|-------|---------|
| Successful claim | Start work — load phase digest for the SD's current phase |
| Claim on child of orchestrator | Note which orchestrator it belongs to for context |
| Release with no next SD | `npm run sd:next` to see the queue |
| Switch claim | Continue work on new SD |
| Claim failed (already claimed) | `/claim list` to see who has it, coordinate |
| Claim failed (identity issue) | Check `.claude/session-identity/` markers, may need session restart |

---

## Troubleshooting

### "No active session found"
Session not registered in `claude_sessions`. The session-init hook may have failed. Restart the session.

### Claim exists but dashboard shows no worker
Identity collision — multiple sessions sharing one session_id. The coordinator sweep (Layer 1) detects and splits these. Run `/coordinator sweep` to trigger.

### Two sessions claiming same SD
The sweep auto-resolves: keeps oldest claimer, releases duplicate, sends CLAIM_CONFLICT message. If both are active, the sweep keeps the one with the freshest heartbeat.

### Orchestrator claimed but working on child
Run `/claim switch <CHILD-SD-KEY>` to move your claim to the child you're actually implementing.
