/**
 * Orchestrator Trigger Types
 *
 * Implements the three-channel dispatch model from the architecture spec:
 *   - Events: Immediate processing (DFE escalation, gate failure, anomaly)
 *   - Rounds: Scheduled cadence (ops cycles, health checks, portfolio reviews)
 *   - Priority Queue: Planned work by priority ranking (stage progressions, SD creation)
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-K
 *
 * @module lib/eva/orchestrator-trigger-types
 */

// ── Trigger Type Constants ───────────────────────────────

export const TRIGGER_TYPE = Object.freeze({
  EVENT: 'event',
  ROUND: 'round',
  PRIORITY_QUEUE: 'priority_queue',
});

// ── Trigger Type Definitions ─────────────────────────────

const TRIGGER_DEFINITIONS = new Map([
  [TRIGGER_TYPE.EVENT, {
    label: 'Events',
    urgency: 'immediate',
    description: 'Immediate processing for urgent items',
    examples: [
      'DFE escalation',
      'Reality Gate failure',
      'Metric anomaly',
      'Chairman decision submitted',
    ],
    maxLatencyMs: 5_000,
    interruptible: true,
  }],
  [TRIGGER_TYPE.ROUND, {
    label: 'Rounds',
    urgency: 'scheduled',
    description: 'Scheduled cadence processing',
    examples: [
      'Ops cycles (Stage 24-25)',
      'Health checks',
      'Portfolio reviews',
      'Weekly summaries',
    ],
    maxLatencyMs: 60_000,
    interruptible: false,
  }],
  [TRIGGER_TYPE.PRIORITY_QUEUE, {
    label: 'Priority Queue',
    urgency: 'planned',
    description: 'Priority-ranked planned work',
    examples: [
      'Stage progressions',
      'SD creation',
      'Artifact generation',
      'Template extraction',
    ],
    maxLatencyMs: 300_000,
    interruptible: false,
  }],
]);

// ── Event Type → Trigger Type Mapping ───────────────────

const EVENT_TRIGGER_MAP = new Map([
  // Events (immediate)
  ['chairman.override', TRIGGER_TYPE.EVENT],
  ['chairman.approval', TRIGGER_TYPE.EVENT],
  ['chairman.rejection', TRIGGER_TYPE.EVENT],
  ['budget.exceeded', TRIGGER_TYPE.EVENT],
  ['gate.failed', TRIGGER_TYPE.EVENT],
  ['venture.killed', TRIGGER_TYPE.EVENT],
  ['decision.submitted', TRIGGER_TYPE.EVENT],
  ['stage.failed', TRIGGER_TYPE.EVENT],
  ['system.degradation', TRIGGER_TYPE.EVENT],

  // Rounds (scheduled)
  ['stage.completed', TRIGGER_TYPE.ROUND],
  ['venture.created', TRIGGER_TYPE.ROUND],
  ['health.check', TRIGGER_TYPE.ROUND],
  ['portfolio.review', TRIGGER_TYPE.ROUND],
  ['ops.cycle', TRIGGER_TYPE.ROUND],
  ['system.health_change', TRIGGER_TYPE.ROUND],

  // Priority Queue (planned)
  ['stage.progression', TRIGGER_TYPE.PRIORITY_QUEUE],
  ['sd.created', TRIGGER_TYPE.PRIORITY_QUEUE],
  ['artifact.generation', TRIGGER_TYPE.PRIORITY_QUEUE],
  ['gate.evaluated', TRIGGER_TYPE.PRIORITY_QUEUE],
  ['sd.completed', TRIGGER_TYPE.PRIORITY_QUEUE],
]);

// ── Public API ──────────────────────────────────────────

/**
 * Get the trigger type definition.
 * @param {string} triggerType - One of TRIGGER_TYPE values
 * @returns {object|null} Definition or null
 */
export function getTriggerDefinition(triggerType) {
  return TRIGGER_DEFINITIONS.get(triggerType) || null;
}

/**
 * Classify an event type into a trigger channel.
 * @param {string} eventType - Event type string (e.g., 'chairman.override')
 * @returns {string} Trigger type (defaults to PRIORITY_QUEUE for unknown events)
 */
export function classifyEvent(eventType) {
  return EVENT_TRIGGER_MAP.get(eventType) || TRIGGER_TYPE.PRIORITY_QUEUE;
}

/**
 * Get all trigger type definitions.
 * @returns {Map} Trigger definitions
 */
export function getAllTriggerDefinitions() {
  return new Map(TRIGGER_DEFINITIONS);
}

/**
 * Get urgency priority for sorting (lower = more urgent).
 * @param {string} triggerType
 * @returns {number} Priority (0 = immediate, 1 = scheduled, 2 = planned)
 */
export function getUrgencyPriority(triggerType) {
  switch (triggerType) {
    case TRIGGER_TYPE.EVENT: return 0;
    case TRIGGER_TYPE.ROUND: return 1;
    case TRIGGER_TYPE.PRIORITY_QUEUE: return 2;
    default: return 3;
  }
}

/**
 * Sort items by trigger type urgency (events first, then rounds, then queue).
 * @param {Array<{triggerType: string}>} items
 * @returns {Array} Sorted items
 */
export function sortByUrgency(items) {
  return [...items].sort((a, b) =>
    getUrgencyPriority(a.triggerType) - getUrgencyPriority(b.triggerType)
  );
}

/**
 * Create a dispatch request with trigger type classification.
 * @param {object} params
 * @param {string} params.eventType - Event type
 * @param {object} params.payload - Event payload
 * @param {string} [params.ventureId] - Venture ID
 * @param {number} [params.priority] - Manual priority override
 * @returns {object} Dispatch request
 */
export function createDispatchRequest({ eventType, payload, ventureId, priority }) {
  const triggerType = classifyEvent(eventType);
  const definition = getTriggerDefinition(triggerType);

  return {
    eventType,
    triggerType,
    urgency: definition?.urgency || 'planned',
    maxLatencyMs: definition?.maxLatencyMs || 300_000,
    interruptible: definition?.interruptible || false,
    ventureId: ventureId || payload?.ventureId || null,
    payload,
    priority: priority ?? getUrgencyPriority(triggerType),
    createdAt: new Date().toISOString(),
  };
}
