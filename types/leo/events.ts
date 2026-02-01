/**
 * LEO Events - TypeScript Data Contracts
 * SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
 * Table: leo_events
 */

import { Json } from './database';

/**
 * Actor types for event logging
 */
export type ActorType = 'human' | 'agent' | 'system';

/**
 * Entity types that can generate events
 */
export type EventEntityType =
  | 'proposal'
  | 'rubric'
  | 'prioritization_config'
  | 'audit_config'
  | 'feature_flag'
  | 'prompt';

/**
 * Event severity levels
 */
export type EventSeverity = 'debug' | 'info' | 'warn' | 'error';

/**
 * PII sensitivity levels
 */
export type PiiLevel = 'none' | 'low' | 'high';

/**
 * Common event names for proposal lifecycle
 */
export type ProposalEventName =
  | 'proposal.created'
  | 'proposal.submitted'
  | 'proposal.triaged'
  | 'proposal.vetting_started'
  | 'proposal.approved'
  | 'proposal.rejected'
  | 'proposal.scheduled'
  | 'proposal.started'
  | 'proposal.completed'
  | 'proposal.rolled_back'
  | 'proposal.archived';

/**
 * Common event names for feature flag lifecycle
 */
export type FeatureFlagEventName =
  | 'flag.created'
  | 'flag.enabled'
  | 'flag.disabled'
  | 'flag.expired'
  | 'flag.archived'
  | 'flag.rollout_changed';

/**
 * Common event names for rubric lifecycle
 */
export type RubricEventName =
  | 'rubric.created'
  | 'rubric.published'
  | 'rubric.deprecated';

/**
 * Common event names for config changes
 */
export type ConfigEventName =
  | 'config.created'
  | 'config.activated'
  | 'config.deprecated';

/**
 * Common event names for prompts
 */
export type PromptEventName =
  | 'prompt.created'
  | 'prompt.activated'
  | 'prompt.deprecated';

/**
 * All possible event names (union of all event name types)
 */
export type EventName =
  | ProposalEventName
  | FeatureFlagEventName
  | RubricEventName
  | ConfigEventName
  | PromptEventName
  | string; // Allow custom event names

/**
 * Database row type for leo_events (append-only)
 */
export interface LeoEventRow {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_type: ActorType;
  event_name: string;
  entity_type: EventEntityType;
  entity_id: string | null;
  correlation_id: string;
  request_id: string | null;
  severity: EventSeverity;
  payload: Json;
  pii_level: PiiLevel;
}

/**
 * Insert type for leo_events (no Update since append-only)
 */
export interface LeoEventInsert {
  id?: string;
  created_at?: string;
  actor_user_id?: string | null;
  actor_type: ActorType;
  event_name: EventName;
  entity_type: EventEntityType;
  entity_id?: string | null;
  correlation_id: string;
  request_id?: string | null;
  severity?: EventSeverity;
  payload?: Record<string, unknown> | Json;
  pii_level?: PiiLevel;
}

/**
 * Typed event with parsed payload
 */
export interface LeoEvent<T = Record<string, unknown>> extends Omit<LeoEventRow, 'payload'> {
  payload: T;
}

/**
 * Common payload structures
 */
export interface StatusChangePayload {
  from_status: string;
  to_status: string;
  reason?: string;
}

export interface DecisionPayload {
  decision: 'approved' | 'rejected';
  reason: string;
  decision_by: string;
  score?: number;
}

export interface RolloutChangePayload {
  from_percentage: number;
  to_percentage: number;
  changed_by: string;
}

// Export convenience type aliases (no Update for append-only table)
export type Row = LeoEventRow;
export type Insert = LeoEventInsert;
