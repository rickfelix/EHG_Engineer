/**
 * LEO Prompts - TypeScript Data Contracts
 * SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
 * Table: leo_prompts
 */

import { Json } from './database';

/**
 * Prompt status values
 */
export type PromptStatus = 'draft' | 'active' | 'deprecated';

/**
 * Prompt metadata structure
 */
export interface PromptMetadata {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: boolean;
  agent_name?: string;
  category?: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * Database row type for leo_prompts
 */
export interface LeoPromptRow {
  id: string;
  created_at: string;
  created_by: string;
  name: string;
  version: number;
  status: PromptStatus;
  prompt_text: string;
  metadata: Json;
  checksum: string;
}

/**
 * Insert type for leo_prompts
 */
export interface LeoPromptInsert {
  id?: string;
  created_at?: string;
  created_by: string;
  name: string;
  version: number;
  status?: PromptStatus;
  prompt_text: string;
  metadata?: PromptMetadata | Json;
  checksum: string; // Must match SHA-256 hash of prompt_text
}

/**
 * Update type for leo_prompts
 */
export interface LeoPromptUpdate {
  id?: string;
  created_at?: string;
  created_by?: string;
  name?: string;
  version?: number;
  status?: PromptStatus;
  prompt_text?: string;
  metadata?: PromptMetadata | Json;
  checksum?: string;
}

/**
 * Typed prompt with parsed metadata
 */
export interface LeoPrompt extends Omit<LeoPromptRow, 'metadata'> {
  metadata: PromptMetadata;
}

/**
 * Result from leo_get_active_prompt function
 */
export interface ActivePromptResult {
  id: string;
  name: string;
  version: number;
  prompt_text: string;
  metadata: PromptMetadata;
  checksum: string;
}

/**
 * Helper function type for computing checksum
 * (Implementation should use crypto.subtle.digest or similar)
 */
export type ComputePromptChecksum = (promptText: string) => Promise<string>;

// Export convenience type aliases
export type Row = LeoPromptRow;
export type Insert = LeoPromptInsert;
export type Update = LeoPromptUpdate;
