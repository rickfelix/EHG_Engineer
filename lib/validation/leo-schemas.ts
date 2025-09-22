/**
 * LEO Protocol Validation Schemas
 * 
 * Zod schemas for type-safe API validation
 * Includes status machine validation
 */

import { z } from 'zod';

// ============================================
// Enums
// ============================================

export const AgentEnum = z.enum([
  'SECURITY',
  'TESTING',
  'PERFORMANCE',
  'DATABASE',
  'DESIGN'
]);

export const StatusEnum = z.enum([
  'pending',
  'running',
  'pass',
  'fail',
  'error',
  'timeout'
]);

export const GateEnum = z.enum(['2A', '2B', '2C', '2D', '3']);

export const SeverityEnum = z.enum(['info', 'warning', 'error', 'critical']);

// ============================================
// API Request/Response Schemas
// ============================================

/**
 * GET /api/leo/gate-scores query parameters
 */
export const GateScoresQuery = z.object({
  prd_id: z.string().min(1, 'PRD ID is required')
});

/**
 * POST /api/leo/sub-agent-reports request body
 */
export const SubAgentReportBody = z.object({
  prd_id: z.string().min(1, 'PRD ID is required'),
  agent: AgentEnum,
  status: StatusEnum,
  evidence: z.record(z.any()).default({}),
  message: z.string().optional(),
  error_details: z.string().optional()
});

/**
 * Response for successful sub-agent report
 */
export const SubAgentReportResponse = z.object({
  accepted: z.boolean(),
  recomputed_gates: z.array(GateEnum),
  new_scores: z.record(GateEnum, z.number()),
  message: z.string().optional()
});

/**
 * Response for failed sub-agent report
 */
export const SubAgentReportError = z.object({
  accepted: z.literal(false),
  reason: z.string(),
  current_status: StatusEnum.optional(),
  allowed_transitions: z.array(StatusEnum).optional()
});

/**
 * Gate scores response
 */
export const GateScoresResponse = z.object({
  prd_id: z.string(),
  gates: z.record(GateEnum, z.object({
    score: z.number().min(0).max(100),
    passed: z.boolean(),
    last_updated: z.string().datetime()
  })),
  history: z.array(z.object({
    gate: GateEnum,
    score: z.number(),
    evidence: z.record(z.any()),
    created_at: z.string().datetime()
  })),
  last_updated: z.string().datetime().nullable(),
  total_gates: z.literal(5)
});

// ============================================
// WebSocket Event Schemas
// ============================================

/**
 * Base WebSocket event structure
 */
const WSEventBase = z.object({
  v: z.literal(1),  // Version
  ts: z.string().datetime()
});

/**
 * Gate updated event
 */
export const WSGateUpdatedEvent = WSEventBase.extend({
  prd_id: z.string(),
  gate: GateEnum,
  score: z.number().min(0).max(100),
  passed: z.boolean().optional()
});

/**
 * Sub-agent status event
 */
export const WSSubAgentStatusEvent = WSEventBase.extend({
  prd_id: z.string(),
  agent: AgentEnum,
  status: StatusEnum,
  message: z.string().optional()
});

/**
 * Drift detected event
 */
export const WSDriftDetectedEvent = WSEventBase.extend({
  type: z.enum(['filesystem_drift', 'boundary_violation', 'missing_artifact']),
  count: z.number(),
  files: z.array(z.string()).optional(),
  severity: SeverityEnum
});

// ============================================
// Status Machine Validation
// ============================================

/**
 * Valid status transitions
 * Maps current status to allowed next statuses
 */
const STATUS_TRANSITIONS: Record<z.infer<typeof StatusEnum>, z.infer<typeof StatusEnum>[]> = {
  pending: ['running'],
  running: ['pass', 'fail', 'error', 'timeout'],
  pass: [],     // Terminal state
  fail: [],     // Terminal state
  error: [],    // Terminal state
  timeout: []   // Terminal state
};

/**
 * Check if a status transition is valid
 */
export function isValidTransition(
  from: z.infer<typeof StatusEnum>,
  to: z.infer<typeof StatusEnum>
): boolean {
  const allowedTransitions = STATUS_TRANSITIONS[from];
  return allowedTransitions?.includes(to) ?? false;
}

/**
 * Get allowed transitions from current status
 */
export function getAllowedTransitions(
  currentStatus: z.infer<typeof StatusEnum>
): z.infer<typeof StatusEnum>[] {
  return STATUS_TRANSITIONS[currentStatus] ?? [];
}

/**
 * Check if status is terminal (no further transitions)
 */
export function isTerminalStatus(
  status: z.infer<typeof StatusEnum>
): boolean {
  return STATUS_TRANSITIONS[status]?.length === 0;
}

// ============================================
// Gate Recomputation Mapping
// ============================================

/**
 * Map agent to affected gates
 */
export const AGENT_TO_GATES: Record<z.infer<typeof AgentEnum>, z.infer<typeof GateEnum>[]> = {
  SECURITY: ['2C', '3'],
  TESTING: ['2D', '3'],
  PERFORMANCE: ['2D', '3'],
  DATABASE: ['2B', '3'],
  DESIGN: ['2B', '3']
};

/**
 * Get gates that should be recomputed for an agent
 */
export function getAffectedGates(
  agent: z.infer<typeof AgentEnum>,
  isFinalStatus: boolean = false
): z.infer<typeof GateEnum>[] {
  const gates = [...AGENT_TO_GATES[agent]];
  
  // Only include Gate 3 if this is a final status (pass/fail)
  if (!isFinalStatus) {
    const index = gates.indexOf('3');
    if (index > -1) {
      gates.splice(index, 1);
    }
  }
  
  return gates;
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate and parse with better error messages
 */
export function validateWithDetails<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map(err => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
  
  return { success: false, errors };
}

// ============================================
// Type Exports
// ============================================

export type Agent = z.infer<typeof AgentEnum>;
export type Status = z.infer<typeof StatusEnum>;
export type Gate = z.infer<typeof GateEnum>;
export type Severity = z.infer<typeof SeverityEnum>;

export type GateScoresQueryType = z.infer<typeof GateScoresQuery>;
export type SubAgentReportBodyType = z.infer<typeof SubAgentReportBody>;
export type SubAgentReportResponseType = z.infer<typeof SubAgentReportResponse>;
export type GateScoresResponseType = z.infer<typeof GateScoresResponse>;

export type WSGateUpdatedEventType = z.infer<typeof WSGateUpdatedEvent>;
export type WSSubAgentStatusEventType = z.infer<typeof WSSubAgentStatusEvent>;
export type WSDriftDetectedEventType = z.infer<typeof WSDriftDetectedEvent>;