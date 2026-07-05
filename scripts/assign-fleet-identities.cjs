#!/usr/bin/env node
/**
 * Fleet Identity Assignment — Assigns colors and callsigns to active worker sessions
 *
 * Called by the coordinator during `/coordinator start` or on its cron loop.
 * Preserves existing assignments — only assigns new workers that lack an identity.
 * Sends SET_IDENTITY coordination messages so workers display their identity.
 *
 * Usage:
 *   node scripts/assign-fleet-identities.cjs
 *   node scripts/assign-fleet-identities.cjs --force          # Reassign all workers
 *   node scripts/assign-fleet-identities.cjs --exclude-session <id>
 */

const COLORS = ['blue', 'green', 'purple', 'orange', 'cyan', 'pink', 'yellow', 'red'];
const NATO = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

// SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-C (FR-4): this file used to carry its OWN
// hardcoded 4-rung TIER_CALLSIGNS map + a tierRankOf() that defaulted any unrecognized
// value to 4 — a THIRD independent hardcoded-4-rung assumption alongside tier-ladder.cjs's
// LADDER and sd-tier-rank.mjs's rung literals. Both are now derived from the shared
// lib/fleet/tier-ladder.cjs module so K (ladderTopRank()) is never assumed to be 4.
const { resolveWorkerTierRank, ladderTopRank, stampRankForWorker } = require('../lib/fleet/tier-ladder.cjs');

// QF-20260627-108 (FR-1): the chairman effort-encoded callsign scheme. A worker's callsign is
// derived from its metadata.tier_rank (the source-of-truth), NOT flat first-available NATO order —
// otherwise the 5-min cron re-clobbers the effort names every pass. Shared by the cron AND
// worker-checkin self-assign so both honor it.
//
// buildTierCallsignBands(topRank) partitions the fixed 8-letter NATO pool into `topRank` bands,
// top-heavy: the bottom floor(K/2) bands get 1 letter each (reserved from the END of the pool,
// so the LOWEST rank gets the LAST letter), and the remaining upper bands split what's left as
// evenly as possible (extra letters going to the TOP band(s) first). At K=4 this reproduces the
// legacy map byte-for-byte: {4:[Alpha,Bravo,Charlie], 3:[Delta,Echo,Foxtrot], 2:[Golf], 1:[Hotel]}.
// Every band is guaranteed >=1 letter (cycling the pool) even when K exceeds the pool size.
function buildTierCallsignBands(topRank) {
  const K = Math.max(1, Math.trunc(Number(topRank)) || 1);
  const bands = {};
  const lowerCount = Math.floor(K / 2);
  const upperCount = K - lowerCount;
  const pool = NATO.slice();
  const reserved = lowerCount > 0 ? pool.splice(pool.length - lowerCount, lowerCount) : [];
  const base = Math.floor(pool.length / upperCount);
  let remainder = pool.length % upperCount;
  let idx = 0;
  for (let rank = K; rank > lowerCount; rank--) {
    let size = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    bands[rank] = pool.slice(idx, idx + size);
    idx += size;
  }
  for (let i = 0; i < lowerCount; i++) {
    bands[i + 1] = [reserved[lowerCount - 1 - i]];
  }
  // Safety floor: K > NATO.length can leave a band empty (e.g. upperCount > pool.length).
  // pickCallsignForTier/callsignInTierBand index pool[0], so an empty band must never occur.
  for (let rank = 1; rank <= K; rank++) {
    if (!bands[rank] || bands[rank].length === 0) bands[rank] = [NATO[(rank - 1) % NATO.length]];
  }
  return bands;
}

// Resolve a worker's tier rank from metadata.tier_rank, delegating to the shared
// lib/fleet/tier-ladder.cjs resolver (bounds against the CURRENT ladderTopRank(), defaults an
// unstamped/invalid value to the top rung — conservative-UP, matching dispatch's default).
function tierRankOf(worker) {
  return resolveWorkerTierRank(worker);
}

// SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001 (FR-3): deterministic + unique + logged pool extension.
// The old `base + '-' + (usedSet.size + 1)` seeded the suffix from set CARDINALITY, which is neither
// unique nor deterministic vs existing suffixes — two concurrent exhausted picks both returned e.g.
// "Golf-6", and used={Golf,Golf-3} regenerated the already-present "Golf-3" (the Alpha-6/Alpha-7
// artifact). Instead pick the FIRST FREE `base-N` (N>=2) not in usedSet, and LOG so pool exhaustion is
// visible, never silent. Shared by BOTH allocators below so pickCallsignForTier and nextAvailable stay
// byte-identical in format (or dedupeAssignedCallsigns string-equality stops reconciling duplicates).
function extendCallsign(base, usedSet, poolLabel) {
  let n = 2;
  while (usedSet.has(`${base}-${n}`)) n++;
  const extended = `${base}-${n}`;
  console.error(`[fleet-identity] ${poolLabel} pool exhausted — extended deterministically to ${extended}`);
  return extended;
}

// Pick the first FREE callsign within the worker's tier band (effort-encoded SoT), wrapping with a
// numeric suffix only when the band is exhausted. Drop-in replacement for nextAvailable(NATO, ...).
// Bands are computed fresh from the CURRENT ladderTopRank() on every call (SD-LEO-INFRA-AUTO-TIERING-
// ACTIVATION-001-C) so a live fleet resize (K != 4) is picked up without a code change here.
function pickCallsignForTier(tierRank, usedSet) {
  const topRank = ladderTopRank();
  const bands = buildTierCallsignBands(topRank);
  const pool = bands[tierRank] || bands[topRank];
  for (const c of pool) {
    if (!usedSet.has(c)) return c;
  }
  return extendCallsign(pool[0], usedSet, `tier-${tierRank}`);
}

// True when a callsign already belongs to the worker's correct tier band, so the cron KEEPS it
// instead of reclobbering. A callsign from the wrong band (e.g. a tier-2 worker still holding
// "Bravo") returns false → it is re-derived, so the chairman scheme self-heals.
function callsignInTierBand(callsign, tierRank) {
  if (!callsign) return false;
  const topRank = ladderTopRank();
  const bands = buildTierCallsignBands(topRank);
  const pool = bands[tierRank] || bands[topRank];
  const base = String(callsign).split('-')[0];
  return pool.includes(base);
}

// SD-LEO-INFRA-ASSIGN-FLEET-IDENTITY-001: hoisted to module scope (was nested in main())
// and exported so scripts/worker-checkin.cjs can self-assign an identity at check-in using the
// SAME pool/picker — both writers must allocate identically (including the wrap-suffix format),
// or dedupeAssignedCallsigns string equality breaks and duplicates stop reconciling.
function nextAvailable(pool, usedSet) {
  for (const item of pool) {
    if (!usedSet.has(item)) return item;
  }
  // All used — extend deterministically (SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001 FR-3):
  // first FREE base-N, identical format to pickCallsignForTier so both writers reconcile.
  return extendCallsign(pool[0], usedSet, 'nato');
}

// QF-20260508-648: writer/consumer asymmetry — lib/coordinator/resolve.cjs
// setActiveCoordinator() writes metadata.is_coordinator=true; this consumer
// must filter it out so coordinator sessions aren't assigned worker callsigns.
function filterOutCoordinators(rows) {
  return (rows || []).filter(w => w && w.metadata?.is_coordinator !== true);
}

// QF-20260528-581 (Bug B): filter out test/ghost sessions that consume the clean
// NATO letter pool and churn real workers into overflow suffixes (Alpha-9 etc.).
//
// Mirrors the canonical coordinator "active worker" cohort used by the dashboard
// and coaching loop:
//   scripts/fleet-dashboard.cjs:150-153  — claude_sessions WHERE sd_key IS NOT NULL
//   scripts/fleet-coaching.cjs:308-312   — claude_sessions WHERE sd_key IS NOT NULL
// Those count a real worker as one that holds (or has held) an SD claim. A genuine
// ghost (drain_test_*, test_execute_*, never-claimed) has sd_key=null AND is absent
// from that cohort. We keep workers momentarily BETWEEN SDs (sd_key null) by also
// accepting any session in `claimedSessionIds` (the dashboard cohort, passed in by
// main()) or one that already carries a fleet_identity (only ever assigned by this
// script to a real worker). claimed_at is NOT usable here: release_sd() nulls it
// (database/migrations/...consolidate_sd_claims..., release_sd RPC), so a released
// worker looks identical to a never-claimed ghost on that column alone.
//
// `claimedSessionIds` — Set of session_ids that currently hold an SD claim (kept
// DB-free so this stays a pure, unit-testable function). Pass an empty Set to rely
// on per-row signals (sd_key / fleet_identity) only.
// SD-FDBK-INFRA-SHARED-FLEET-WORKER-001: DEFENSIVE FALLBACK ONLY. The canonical fixture check is
// the shared lib/fleet/session-predicates.mjs isFixtureSession (a strict superset that also catches
// *-probe-* and QF-TEST-* — bug 7b59dac8, where qf-route-probe-A/B consumed callsign Charlie).
// main() dynamic-imports that predicate and injects it into filterOutGhostSessions; this local list
// only runs if the function is called WITHOUT an injected predicate (never in production).
const GHOST_SESSION_ID_PREFIXES = ['drain_test_', 'test_execute_', 'test-session-', 'test_session_'];

function isTestSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  return GHOST_SESSION_ID_PREFIXES.some(p => sessionId.startsWith(p));
}

function filterOutGhostSessions(rows, claimedSessionIds = new Set(), isFixture = isTestSessionId) {
  const claimed = claimedSessionIds instanceof Set ? claimedSessionIds : new Set(claimedSessionIds || []);
  const fixtureCheck = typeof isFixture === 'function' ? isFixture : isTestSessionId;
  return (rows || []).filter(w => {
    if (!w) return false;
    // Fixture/test/probe session_ids never get a callsign, even if otherwise active. The shared
    // isFixtureSession (injected by main) catches *-probe-*/QF-TEST-* the local prefix list missed.
    if (fixtureCheck(w.session_id)) return false;
    // Currently claiming an SD → real worker.
    if (w.sd_key) return true;
    // Between SDs but in the canonical claim cohort → real worker, momentarily idle.
    if (claimed.has(w.session_id)) return true;
    // Already assigned a fleet identity by this script → was a real worker.
    if (w.metadata?.fleet_identity?.callsign) return true;
    // Otherwise: never claimed, no identity → genuine ghost, drop it.
    return false;
  });
}

// QF-20260528-581 (Bug A): collision dedup for ALREADY-assigned workers.
// After session_id rotation two assigned rows can share the SAME callsign (observed:
// "Alpha" on two sessions). `assigned` arrives heartbeat-DESC (most recent first), so
// the FIRST occurrence of a callsign is the most-recent heartbeat and is KEPT; later
// duplicates are demoted for reassignment to the next free callsign.
// Returns { kept: [...], demoted: [...] } — main() keeps `kept` as assigned and pushes
// `demoted` into needsAssignment. Pure + DB-free for unit testing.
function dedupeAssignedCallsigns(assigned) {
  const seenCallsigns = new Set();
  const kept = [];
  const demoted = [];
  for (const w of assigned || []) {
    if (!w) continue;
    const callsign = w.metadata?.fleet_identity?.callsign;
    if (!callsign) {
      // No callsign — not really "assigned"; treat as needing assignment.
      demoted.push(w);
      continue;
    }
    if (seenCallsigns.has(callsign)) {
      demoted.push(w);
    } else {
      seenCallsigns.add(callsign);
      kept.push(w);
    }
  }
  return { kept, demoted };
}

// SD-FDBK-ENH-COORDINATOR-TOOLING-DELTA-001: reserve callsigns/colors held by recently-seen,
// non-terminated sessions that are temporarily OUT of the 5-min active-view (parked between SDs
// or briefly stale-heartbeat). Without this, the reap cycle dropping a parked worker frees its
// callsign for a NEW worker; when the parked worker returns it collides and gets re-assigned a
// different callsign — making callsigns FLAP (e.g. Charlie->Echo->Delta->Charlie). Mutates and
// returns the used-sets so identity is idempotent per session_id (a session keeps its callsign
// until terminated). Pure + DB-free for unit testing.
function reserveParkedIdentities(usedCallsigns, usedColors, recentSessions, activeSessionIds) {
  for (const s of recentSessions || []) {
    if (!s || activeSessionIds.has(s.session_id)) continue; // active sessions are already reserved
    const id = s.metadata?.fleet_identity;
    if (id?.callsign) usedCallsigns.add(id.callsign);
    if (id?.color) usedColors.add(id.color);
  }
  return { usedCallsigns, usedColors };
}

// QF-20260703-040: SET_IDENTITY was only ever sent to a NEWLY-assigning worker, so a session whose
// identity changed via some OTHER path (e.g. dedupeAssignedCallsigns demoting it but the resulting
// message never being consumed by a dead/dormant session) kept a stale local statusline file
// forever — the chairman saw 3x "Charlie". Compares the CURRENTLY-desired identity against the
// last one actually broadcast (metadata.fleet_identity_last_sent, distinct from fleet_identity
// itself so a partially-failed send is retried next tick) — true means re-send is due.
function identityNeedsRebroadcast(worker, expectedIdentity) {
  const lastSent = worker?.metadata?.fleet_identity_last_sent;
  if (!lastSent) return true;
  return lastSent.callsign !== expectedIdentity.callsign
    || lastSent.color !== expectedIdentity.color
    || lastSent.display_name !== expectedIdentity.display_name;
}

const ANSI = {
  red: '\x1b[31m', blue: '\x1b[34m', green: '\x1b[32m', yellow: '\x1b[33m',
  purple: '\x1b[35m', orange: '\x1b[38;5;208m', pink: '\x1b[38;5;213m', cyan: '\x1b[36m',
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m'
};

async function main() {
  require('dotenv').config();
  const fs = require('fs');
  const path = require('path');
  const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
  const supabase = createSupabaseServiceClient();

  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2: single-writer mutation guard.
  // Dynamic import of .mjs guard from .cjs context; async context already established.
  // Finding 1: resolveOwnSessionId resolves env-first with .claude/session-id.json fallback,
  // so an out-of-band cron run with an empty env var still resolves the real id and can block a rogue.
  const { guardMutation: _guardMutation, resolveOwnSessionId: _resolveOwnSessionId } = await import('../lib/coordinator-mutation-guard.mjs');
  const _mySessionId = _resolveOwnSessionId();
  const _fleetGuard = await _guardMutation(supabase, _mySessionId, 'assign-fleet-identities');
  if (!_fleetGuard.allowed) {
    console.log('[FLEET-IDENTITY] mutation blocked by coordinator guard — not the canonical coordinator; skipping assignment.');
    return;
  }

  // Parse flags
  const args = process.argv.slice(2);
  const forceReassign = args.includes('--force');
  let excludeSession = null;
  const excludeIdx = args.indexOf('--exclude-session');
  if (excludeIdx !== -1 && args[excludeIdx + 1]) {
    excludeSession = args[excludeIdx + 1];
  }

  // Fallback: read this session's ID to auto-exclude (coordinator excludes itself)
  if (!excludeSession) {
    try {
      const sessionFile = path.resolve(__dirname, '../.claude/session-id.json');
      if (fs.existsSync(sessionFile)) {
        excludeSession = JSON.parse(fs.readFileSync(sessionFile, 'utf8')).session_id;
      }
    } catch { /* ignore */ }
  }

  // Query active worker sessions (heartbeat < 5 min)
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  let query = supabase
    .from('claude_sessions')
    .select('session_id, sd_key, metadata, heartbeat_at')
    .gte('heartbeat_at', fiveMinAgo)
    .neq('status', 'terminated');

  if (excludeSession) {
    query = query.neq('session_id', excludeSession);
  }

  const { data: rawWorkers, error } = await query.order('heartbeat_at', { ascending: false });

  if (error) {
    console.error('Error querying workers:', error.message);
    process.exit(1);
  }

  const nonCoordinators = filterOutCoordinators(rawWorkers);

  // QF-20260528-581 (Bug B): drop test/ghost sessions before they consume the NATO pool.
  // claimedSessionIds = the canonical "currently claiming" cohort (mirrors the dashboard's
  // claude_sessions WHERE sd_key IS NOT NULL). Built from the rows we already have — no
  // extra DB round-trip. Workers between SDs are retained via fleet_identity (see fn doc).
  const claimedSessionIds = new Set(
    (rawWorkers || []).filter(w => w && w.sd_key).map(w => w.session_id)
  );
  // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001 (bug 7b59dac8): inject the SHARED fixture predicate so
  // *-probe-* / QF-TEST-* fixtures never consume a callsign. Dynamic import: .cjs reading the .mjs SoT.
  const { isFixtureSession } = await import('../lib/fleet/session-predicates.mjs');
  const workers = filterOutGhostSessions(nonCoordinators, claimedSessionIds, isFixtureSession);

  if (!workers || workers.length === 0) {
    console.log('No active workers found.');
    return;
  }

  // Read CLAUDE_SESSION_IDs from marker files for collision detection
  const markerDir = path.resolve(__dirname, '../.claude/session-identity');
  const markerCsids = {};
  if (fs.existsSync(markerDir)) {
    for (const f of fs.readdirSync(markerDir).filter(f => /^pid-\d+\.json$/.test(f))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(markerDir, f), 'utf8'));
        if (data.session_id && data.claude_session_id) {
          markerCsids[data.session_id] = data.claude_session_id;
        }
      } catch { /* skip */ }
    }
  }

  // Deduplicate workers: if two share the same session_id but have different
  // CLAUDE_SESSION_IDs in markers, treat them as distinct (pending sweep split)
  const uniqueWorkers = [];
  const seen = new Set();
  for (const w of workers) {
    const csid = markerCsids[w.session_id] || w.session_id;
    if (!seen.has(csid)) {
      seen.add(csid);
      uniqueWorkers.push(w);
    }
  }

  // SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-C (FR-4): this cron is the only reader that sees the
  // WHOLE live fleet, so it is the authoritative writer of the fleet-relative dense tier_rank. A
  // lone worker's own check-in self-report (worker-checkin.cjs mergeCheckinModelEffort) only knows
  // its own capabilityScore against a cached ladder; this refresh corrects every worker to the true
  // 1..K dense rank across all CURRENTLY live workers, before tierRankOf()/callsignInTierBand() below
  // read it for banding decisions.
  const liveFleet = uniqueWorkers.map(w => ({ model: w.metadata?.model, effort: w.metadata?.effort }));
  for (const worker of uniqueWorkers) {
    // QF-20260705-394: stampRankForWorker floors the live dense rank at the STATIC
    // rankForModelEffort — a K<4 live fleet must never compress the strongest workers
    // below the static space SD min_tier_rank thresholds are written in (this cron was
    // the recurring 4->3 clobber writer in the 2026-07-05 dispatch-refusal incident).
    const freshRank = stampRankForWorker(worker, liveFleet);
    if (worker.metadata?.tier_rank !== freshRank) {
      const metadata = { ...(worker.metadata || {}), tier_rank: freshRank };
      const { error: rankErr } = await supabase
        .from('claude_sessions')
        .update({ metadata })
        .eq('session_id', worker.session_id);

      if (rankErr) {
        console.error(`  Failed to refresh tier_rank for ${worker.session_id.substring(0, 12)}: ${rankErr.message}`);
      } else {
        worker.metadata = metadata; // keep in-memory copy fresh for this run's banding decisions
      }
    }
  }

  // Separate workers into already-assigned and new
  const assignedRaw = [];
  const needsAssignment = [];

  for (const worker of uniqueWorkers) {
    const identity = worker.metadata?.fleet_identity;
    // QF-20260627-108 (FR-1): a worker is "assigned" ONLY if its callsign is in its tier band
    // (effort-encoded SoT). A callsign from the wrong band (e.g. a tier-2 worker still holding
    // "Bravo") is re-derived, so the chairman scheme self-heals instead of being preserved-wrong.
    if (identity?.callsign && identity?.color && !forceReassign
        && callsignInTierBand(identity.callsign, tierRankOf(worker))) {
      assignedRaw.push(worker);
    } else {
      needsAssignment.push(worker);
    }
  }

  // QF-20260528-581 (Bug A): resolve duplicate callsigns within the assigned set
  // (e.g. "Alpha" on two sessions after session_id rotation). Keep the most-recent
  // heartbeat (assignedRaw is heartbeat-DESC → first occurrence wins); demote the
  // losers into needsAssignment so they get the next free callsign.
  const { kept: assigned, demoted } = dedupeAssignedCallsigns(assignedRaw);
  for (const w of demoted) {
    const dupCallsign = w.metadata?.fleet_identity?.callsign;
    const dupCount = assignedRaw.filter(a => a.metadata?.fleet_identity?.callsign === dupCallsign).length;
    console.log(`${ANSI.dim}↻ collision: ${dupCallsign} was on ${dupCount} sessions, reassigning ${w.session_id.substring(0, 12)}...${ANSI.reset}`);
    needsAssignment.push(w);
  }

  // Collect already-used callsigns and colors — from the deduped `kept` set only,
  // so a demoted duplicate's callsign/color is free for reassignment.
  const usedCallsigns = new Set(assigned.map(w => w.metadata.fleet_identity.callsign));
  const usedColors = new Set(assigned.map(w => w.metadata.fleet_identity.color));

  // SD-FDBK-ENH-COORDINATOR-TOOLING-DELTA-001: also reserve callsigns/colors of recently-seen,
  // non-terminated sessions that are temporarily OUT of the 5-min active-view (parked between SDs
  // or briefly stale-heartbeat after the reap), so a new worker never steals a parked worker's
  // callsign and cause it to flap when it returns. 60-min window keeps the NATO pool from being
  // permanently consumed by long-dead (but un-terminated) sessions; the reaper marks truly dead
  // sessions 'terminated', which frees their callsign here.
  const reserveWindow = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recentSessions } = await supabase
    .from('claude_sessions')
    .select('session_id, metadata')
    .neq('status', 'terminated')
    .gte('heartbeat_at', reserveWindow);
  const activeSessionIds = new Set(uniqueWorkers.map(w => w.session_id));
  reserveParkedIdentities(usedCallsigns, usedColors, recentSessions, activeSessionIds);

  // nextAvailable is now module-scoped (hoisted above) and shared with worker-checkin.cjs.

  // Refresh display_name for assigned workers whose SD changed, AND re-affirm SET_IDENTITY to
  // ANY assigned worker whose current identity differs from what was last actually broadcast
  // (QF-20260703-040) — covers the case where fleet_identity changed via a path other than this
  // loop (e.g. a dedupe demotion) but the worker never consumed that SET_IDENTITY message.
  let refreshed = 0;
  for (const w of assigned) {
    const id = w.metadata.fleet_identity;
    const currentSdLabel = w.sd_id || 'idle';
    const expectedDisplayName = `${id.callsign} | ${currentSdLabel}`;
    const expectedIdentity = { callsign: id.callsign, color: id.color, display_name: expectedDisplayName };
    if (identityNeedsRebroadcast(w, expectedIdentity)) {
      const metadata = { ...(w.metadata || {}) };
      metadata.fleet_identity = { ...id, display_name: expectedDisplayName };
      metadata.fleet_identity_last_sent = expectedIdentity;
      await supabase
        .from('claude_sessions')
        .update({ metadata })
        .eq('session_id', w.session_id);
      // Send updated identity message so worker's local file refreshes
      await supabase
        .from('session_coordination')
        .insert({
          target_session: w.session_id,
          target_sd: w.sd_id || null,
          message_type: 'SET_IDENTITY',
          subject: `Identity update: ${id.callsign} now on ${currentSdLabel}`,
          body: `Your display name updated to "${expectedDisplayName}" (SD changed).`,
          payload: { color: id.color, callsign: id.callsign, display_name: expectedDisplayName },
          sender_type: 'coordinator',
          expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString()
        });
      refreshed++;
    }
  }

  if (needsAssignment.length === 0) {
    // Show current roster quietly (no "assigning" noise on cron loop)
    console.log('');
    const refreshNote = refreshed > 0 ? `, ${refreshed} name(s) refreshed` : '';
    console.log(`${ANSI.bold}Fleet Identity Roster${ANSI.reset} (${assigned.length} worker${assigned.length !== 1 ? 's' : ''}, all assigned${refreshNote})`);
    for (const w of assigned) {
      const id = w.metadata.fleet_identity;
      const ansi = ANSI[id.color] || '';
      const sdLabel = w.sd_id || 'idle';
      console.log(`  ${ansi}\u25cf${ANSI.reset} ${id.callsign.padEnd(10)} ${ansi}${id.color.padEnd(8)}${ANSI.reset} ${w.session_id.substring(0, 12)}...  ${sdLabel}`);
    }
    console.log('');
    return;
  }

  // Clean up expired SET_IDENTITY messages
  await supabase
    .from('session_coordination')
    .delete()
    .eq('message_type', 'SET_IDENTITY')
    .lt('expires_at', new Date().toISOString())
;

  console.log('');
  console.log(`${ANSI.bold}Fleet Identity Assignment${ANSI.reset}`);
  if (assigned.length > 0) {
    console.log(`${ANSI.dim}${assigned.length} worker(s) already assigned, ${needsAssignment.length} new worker(s) to assign${ANSI.reset}`);
  }
  console.log('');

  // Show existing assignments
  for (const w of assigned) {
    const id = w.metadata.fleet_identity;
    const ansi = ANSI[id.color] || '';
    const sdLabel = w.sd_id || 'idle';
    console.log(`  ${ansi}\u25cf${ANSI.reset} ${id.callsign.padEnd(10)} ${ansi}${id.color.padEnd(8)}${ANSI.reset} ${w.session_id.substring(0, 12)}...  ${sdLabel} ${ANSI.dim}(existing)${ANSI.reset}`);
  }

  // Assign new workers
  let newCount = 0;
  for (const worker of needsAssignment) {
    const callsign = pickCallsignForTier(tierRankOf(worker), usedCallsigns);
    const color = nextAvailable(COLORS, usedColors);
    usedCallsigns.add(callsign);
    usedColors.add(color);

    const sdLabel = worker.sd_id || 'idle';
    const displayName = `${callsign} | ${sdLabel}`;

    // Store identity in session metadata
    const metadata = { ...(worker.metadata || {}) };
    metadata.fleet_identity = {
      color,
      callsign,
      display_name: displayName,
      assigned_at: new Date().toISOString()
    };
    // QF-20260703-040: stamp what we're about to broadcast so a later tick can detect drift.
    metadata.fleet_identity_last_sent = { callsign, color, display_name: displayName };

    const { error: updateErr } = await supabase
      .from('claude_sessions')
      .update({ metadata })
      .eq('session_id', worker.session_id);

    if (updateErr) {
      console.error(`  Failed to update metadata for ${worker.session_id.substring(0, 12)}: ${updateErr.message}`);
      continue;
    }

    // Send SET_IDENTITY coordination message
    const { error: msgErr } = await supabase
      .from('session_coordination')
      .insert({
        target_session: worker.session_id,
        target_sd: worker.sd_id || null,
        message_type: 'SET_IDENTITY',
        subject: `Identity: ${callsign} (${color})`,
        body: `The coordinator assigned you callsign "${callsign}" with color "${color}". Your statusline will update automatically. You may also run: /color ${color}\n\nCommunication: send signals back via /signal (try /signal --help for types). Use it when stuck on a gate >2x, about to bypass, or seeing protocol/spec friction.`,
        payload: { color, callsign, display_name: displayName },
        sender_type: 'coordinator',
        expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString()
      });

    if (msgErr) {
      console.error(`  Failed to send identity to ${worker.session_id.substring(0, 12)}: ${msgErr.message}`);
      continue;
    }

    const ansi = ANSI[color] || '';
    console.log(`  ${ansi}\u25cf${ANSI.reset} ${callsign.padEnd(10)} ${ansi}${color.padEnd(8)}${ANSI.reset} ${worker.session_id.substring(0, 12)}...  ${sdLabel} ${ANSI.bold}(NEW)${ANSI.reset}`);
    newCount++;
  }

  console.log('');
  console.log(`${newCount} new identity assignment(s) sent. Total fleet: ${assigned.length + newCount} worker(s).`);
  console.log('');
}

module.exports = { filterOutCoordinators, filterOutGhostSessions, isTestSessionId, dedupeAssignedCallsigns, reserveParkedIdentities, NATO, COLORS, nextAvailable, extendCallsign, buildTierCallsignBands, tierRankOf, pickCallsignForTier, callsignInTierBand, identityNeedsRebroadcast };

if (require.main === module) {
  main().catch(err => {
    console.error('Fleet identity assignment failed:', err.message);
    process.exit(1);
  });
}
