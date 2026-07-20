/**
 * NPM Install Mutex — Coordination-based dependency lock
 *
 * Prevents node_modules corruption when parallel CC sessions run npm install
 * simultaneously. Uses the session_coordination table as a distributed lock.
 *
 * Usage:
 *   const { acquireLock, waitForLock, releaseLock } = require('./npm-install-lock');
 *   const lock = await acquireLock(supabase, sessionId);
 *   if (lock.held) {
 *     console.log(`Waiting — session ${lock.holder} is installing...`);
 *     await waitForLock(supabase, { timeout: 120000 });
 *   } else if (lock.acquired) {
 *     try { await runNpmInstall(); }
 *     finally { await releaseLock(supabase, sessionId); }
 *   }
 *
 * SD: SD-MAN-INFRA-FLEET-NPM-INSTALL-001
 */

const LOCK_TYPE = 'NODE_MODULES';
const LOCK_TTL_MS = 120_000; // 2 minutes
const POLL_INTERVAL_MS = 5_000; // 5 seconds

/**
 * Find the active NODE_MODULES lock in session_coordination.
 * @returns {Promise<object|null>} The active lock row, or null.
 */
async function findActiveLock(supabase) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: this previously scanned only
  // the newest 20 unread INFO rows and filtered for the lock CLIENT-side — routine INFO
  // traffic (roll_calls, reservations) pushed the lock row out of the window, so a held lock
  // could be invisible (concurrent installs — the exact corruption this mutex exists to stop).
  // Server-side payload->> filters pin the read to actual lock rows (~1); client-side
  // predicate retained as defense in depth.
  const { data: existing } = await supabase
    .from('session_coordination')
    .select('id, payload, created_at')
    .eq('message_type', 'INFO')
    .is('read_at', null)
    .eq('payload->>lock_type', LOCK_TYPE)
    .eq('payload->>status', 'locked')
    .order('created_at', { ascending: false })
    .limit(20);

  return (existing || []).find(
    m => m.payload?.lock_type === LOCK_TYPE && m.payload?.status === 'locked'
  ) || null;
}

/**
 * Try to acquire the NODE_MODULES lock.
 * @returns {Promise<{acquired: boolean}|{held: boolean, holder: string, age_ms: number}>}
 */
async function acquireLock(supabase, sessionId) {
  const activeLock = await findActiveLock(supabase);

  if (activeLock) {
    const age = Date.now() - new Date(activeLock.created_at).getTime();
    if (age < LOCK_TTL_MS) {
      return { held: true, holder: activeLock.payload.holder_session, age_ms: age };
    }
    // Stale lock — auto-expire it
    await supabase
      .from('session_coordination')
      .update({ read_at: new Date().toISOString() })
      .eq('id', activeLock.id);
  }

  // Claim the lock
  const { error } = await supabase.from('session_coordination').insert({
    message_type: 'INFO',
    target_session: 'broadcast',
    subject: 'NODE_MODULES_LOCK',
    body: `Session ${sessionId.slice(0, 8)} is running npm install`,
    payload: {
      lock_type: LOCK_TYPE,
      status: 'locked',
      holder_session: sessionId,
      locked_at: new Date().toISOString()
    },
    sender_type: 'system'
  });

  if (error) {
    return { acquired: false, error: error.message };
  }
  return { acquired: true };
}

/**
 * Wait until the NODE_MODULES lock is released or expires.
 * @param {object} options - { timeout, pollInterval, onPoll }
 * @returns {Promise<{resolved: boolean, reason: string}>}
 */
async function waitForLock(supabase, options = {}) {
  const timeout = options.timeout || LOCK_TTL_MS;
  const pollInterval = options.pollInterval || POLL_INTERVAL_MS;
  const onPoll = options.onPoll || (() => {});
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const activeLock = await findActiveLock(supabase);

    if (!activeLock) {
      return { resolved: true, reason: 'lock_released' };
    }

    const age = Date.now() - new Date(activeLock.created_at).getTime();
    if (age >= LOCK_TTL_MS) {
      // Auto-expire stale lock
      await supabase
        .from('session_coordination')
        .update({ read_at: new Date().toISOString() })
        .eq('id', activeLock.id);
      return { resolved: true, reason: 'lock_expired' };
    }

    onPoll({ elapsed: Date.now() - start, lockAge: age, holder: activeLock.payload.holder_session });
    await new Promise(r => setTimeout(r, pollInterval));
  }

  return { resolved: false, reason: 'timeout' };
}

/**
 * Release the NODE_MODULES lock held by this session.
 * @returns {Promise<{released: boolean}>}
 */
async function releaseLock(supabase, sessionId) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: previously read ALL unread
  // INFO rows (unbounded — silently capped at the PostgREST 1000-row max, so this session's
  // lock row could fall outside the page and never be released until TTL expiry). Server-side
  // payload->> filters bound the read to THIS session's lock rows (~1); the client-side
  // predicate below is retained as defense in depth.
  const { data: all } = await supabase
    .from('session_coordination')
    .select('id, payload')
    .eq('message_type', 'INFO')
    .is('read_at', null)
    .eq('payload->>lock_type', LOCK_TYPE)
    .eq('payload->>holder_session', sessionId);

  for (const m of (all || [])) {
    if (m.payload?.lock_type === LOCK_TYPE && m.payload?.holder_session === sessionId) {
      await supabase
        .from('session_coordination')
        .update({ read_at: new Date().toISOString() })
        .eq('id', m.id);
    }
  }

  return { released: true };
}

module.exports = { acquireLock, waitForLock, releaseLock, LOCK_TYPE, LOCK_TTL_MS, POLL_INTERVAL_MS };
