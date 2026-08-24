/**
 * Dead-letter alarm — SD-LEO-INFRA-COMMS-LANE-TTLS-001 FR-3.
 *
 * When a lane's unread-past-TTL rate (FR-4's gauge) breaches a configured threshold, page the
 * message SENDER's successor/owner (never the recipient/target -- the target is what's dead;
 * paging it again is the failure mode this alarm exists to break).
 *
 * HARD, LOAD-BEARING CONSTRAINT (Solomon + coordinator both flagged it): this alarm must NEVER
 * write a new session_coordination row via ANY path, including an allow-listed module's wrong
 * entry point. The only allow-listed paging surface this module calls is
 * lib/periodic-liveness/ladder-escalation.mjs's emitLadderDigest() SPECIFICALLY -- never its
 * sibling emitCoordinatorRung(), which TESTING evidence 79b9f70c confirmed writes directly to
 * session_coordination and would silently violate this constraint while looking PRD-compliant.
 * emitLadderDigest only ever touches chairman_decisions (via its own recordPending/escalate
 * deps), never session_coordination -- see its own doc comment.
 *
 * SHIPS OBSERVE-ONLY BY DEFAULT. mode defaults to 'observe': breaches are detected and logged,
 * no page is ever sent. A caller must explicitly pass mode:'enforce' to arm live paging, after
 * an initial soak period.
 */
'use strict';

const ALARM_MODES = Object.freeze(['observe', 'enforce']);
const DEFAULT_MODE = 'observe';
const DEFAULT_THRESHOLD_RATE = 0.5;

// Documents the exclusion; tests/static-guards pins that this module's own source never
// references the forbidden name (see lane-dead-letter-alarm-wiring.test.js).
const FORBIDDEN_EMIT_FUNCTION = 'emitCoordinatorRung';

/**
 * Pure: which lanes breach their threshold, given FR-4's gauge output. Never mutates or reads
 * anything beyond the passed-in object.
 * @param {{lanes: Object<string,{total:number, expired_unread:number, rate:number}>}} gaugeResult
 * @param {{thresholdRate?: number}} [opts]
 * @returns {Array<{lane:string, rate:number, expired_unread:number, total:number}>}
 */
function detectBreachedLanes(gaugeResult, { thresholdRate = DEFAULT_THRESHOLD_RATE } = {}) {
  const breached = [];
  const lanes = (gaugeResult && gaugeResult.lanes) || {};
  for (const [lane, stats] of Object.entries(lanes)) {
    if (stats && stats.total > 0 && stats.rate > thresholdRate) {
      breached.push({ lane, rate: stats.rate, expired_unread: stats.expired_unread, total: stats.total });
    }
  }
  return breached;
}

/**
 * Resolve the successor to page: the SENDER's role successor, never the row's
 * recipient/target. No fallback-to-sender path exists -- an unknown role or a role with no
 * live successor resolves to null (skip paging), never to the sender itself.
 * @param {string} senderRole
 * @param {{successors?: Record<string,string|undefined>}} [ctx]
 * @returns {string|null}
 */
function resolveSenderSuccessor(senderRole, { successors = {} } = {}) {
  return successors[senderRole] || null;
}

/**
 * The ONLY allow-listed paging path this module calls: emitLadderDigest specifically. Dynamic
 * import because ladder-escalation.mjs is ESM and this module is CJS -- same interop pattern
 * as lane-contract.cjs's resolveLaneContractMode.
 * @param {object} supabase
 * @param {{lane:string, rate:number, expired_unread:number, total:number, successor:string}} breach
 * @param {{recordPending: Function, escalate: Function}} deps - REQUIRED by emitLadderDigest itself
 */
async function pageViaLadderDigest(supabase, breach, deps = {}) {
  const { emitLadderDigest } = await import('../periodic-liveness/ladder-escalation.mjs');
  const candidate = {
    process_key: `comms_lane_ttl_dead_letter:${breach.lane}`,
    signature: `rate_${Math.round(breach.rate * 100)}pct`,
    display_name: `Dead-letter breach: ${breach.lane} lane (${breach.expired_unread}/${breach.total} expired-unread) -- paging successor ${breach.successor}`,
    required_invocation: null,
  };
  return emitLadderDigest(supabase, [candidate], deps);
}

/**
 * FR-3 entry point: given FR-4's gauge output, detect breaches and (enforce mode only) page the
 * sender's successor via the allow-listed surface. NEVER writes session_coordination via any
 * path -- see module header.
 *
 * @param {{lanes:Object}} gaugeResult - FR-4's computeLaneDeadLetterGauge/summarizeLaneDeadLetterRates output
 * @param {object} supabase
 * @param {{
 *   mode?: 'observe'|'enforce',
 *   thresholdRate?: number,
 *   senderRole: string,
 *   successors?: Record<string,string|undefined>,
 *   pageFn?: Function,
 *   deps?: {recordPending: Function, escalate: Function},
 *   logger?: {warn: Function},
 * }} opts
 * @returns {Promise<{mode:string, breaches:Array, paged:Array}>}
 */
async function runDeadLetterAlarm(gaugeResult, supabase, opts = {}) {
  const {
    mode = DEFAULT_MODE,
    thresholdRate = DEFAULT_THRESHOLD_RATE,
    senderRole,
    successors = {},
    pageFn = pageViaLadderDigest,
    deps = {},
    logger = console,
  } = opts;

  const breaches = detectBreachedLanes(gaugeResult, { thresholdRate });
  if (breaches.length === 0) return { mode, breaches: [], paged: [] };

  const successor = resolveSenderSuccessor(senderRole, { successors });
  const withSuccessor = breaches.map((b) => ({ ...b, successor }));

  if (mode !== 'enforce') {
    for (const b of withSuccessor) {
      logger.warn(`[lane-dead-letter-alarm] OBSERVE: ${b.lane} lane breached (${b.expired_unread}/${b.total}, rate=${b.rate.toFixed(2)}) -- would page successor ${b.successor} (mode=observe, no page sent)`);
    }
    return { mode, breaches: withSuccessor, paged: [] };
  }

  const paged = [];
  for (const b of withSuccessor) {
    if (!b.successor) {
      logger.warn(`[lane-dead-letter-alarm] ENFORCE: ${b.lane} lane breached but no live successor for sender role "${senderRole}" -- skipped, not paged`);
      continue;
    }
    const result = await pageFn(supabase, b, deps);
    paged.push({ ...b, result });
  }
  return { mode, breaches: withSuccessor, paged };
}

module.exports = {
  ALARM_MODES,
  DEFAULT_MODE,
  DEFAULT_THRESHOLD_RATE,
  FORBIDDEN_EMIT_FUNCTION,
  detectBreachedLanes,
  resolveSenderSuccessor,
  pageViaLadderDigest,
  runDeadLetterAlarm,
};
