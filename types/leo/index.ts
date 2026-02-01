/**
 * LEO Protocol TypeScript Data Contracts
 * SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
 *
 * This module exports all LEO protocol data types for use with Supabase.
 *
 * Usage:
 * ```typescript
 * import { createClient } from '@supabase/supabase-js';
 * import type { Database } from './types/leo';
 *
 * const supabase = createClient<Database>(url, key);
 *
 * // Typed query
 * const { data } = await supabase
 *   .from('leo_proposals')
 *   .select('*')
 *   .eq('status', 'approved');
 *
 * // data is correctly typed as LeoProposalRow[]
 * ```
 */

// Database types for Supabase client
export type { Database, Json, TableRow, TableInsert, TableUpdate } from './database';

// Proposal types
export type {
  LeoProposalRow,
  LeoProposalInsert,
  LeoProposalUpdate,
  LeoProposal,
  LeoProposalTransition,
  ProposalStatus,
  ProposalRiskLevel,
  ProposalScopeItem,
  AffectedComponent,
} from './proposals';

// Vetting rubric types
export type {
  LeoVettingRubricRow,
  LeoVettingRubricInsert,
  LeoVettingRubricUpdate,
  LeoVettingRubric,
  RubricStatus,
  RubricWeights,
  RubricCriterion,
  ScoringScale,
} from './rubrics';

// Configuration types
export type {
  LeoPrioritizationConfigRow,
  LeoPrioritizationConfigInsert,
  LeoPrioritizationConfigUpdate,
  LeoPrioritizationConfig,
  LeoAuditConfigRow,
  LeoAuditConfigInsert,
  LeoAuditConfigUpdate,
  LeoAuditConfig,
  ConfigStatus,
  PrioritizationWeights,
  PrioritizationConstraints,
  PiiRedactionRule,
  ActiveConfigsResult,
} from './config';

// Feature flag types
export type {
  LeoFeatureFlagRow,
  LeoFeatureFlagInsert,
  LeoFeatureFlagUpdate,
  LeoFeatureFlag,
  FeatureFlagStatus,
  FlagConditions,
  FlagEvaluationContext,
} from './feature-flags';

// Event types
export type {
  LeoEventRow,
  LeoEventInsert,
  LeoEvent,
  ActorType,
  EventEntityType,
  EventSeverity,
  PiiLevel,
  EventName,
  ProposalEventName,
  FeatureFlagEventName,
  RubricEventName,
  ConfigEventName,
  PromptEventName,
  StatusChangePayload,
  DecisionPayload,
  RolloutChangePayload,
} from './events';

// Prompt types
export type {
  LeoPromptRow,
  LeoPromptInsert,
  LeoPromptUpdate,
  LeoPrompt,
  PromptStatus,
  PromptMetadata,
  ActivePromptResult,
  ComputePromptChecksum,
} from './prompts';
