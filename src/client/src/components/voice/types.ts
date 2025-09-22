/**
 * TypeScript types for OpenAI Realtime Voice implementation
 */

export interface SessionConfig {
  model?: string;
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  instructions?: string;
  tools?: Tool[];
  temperature?: number;
  maxTokens?: number;
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ConversationItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: any;
}

export interface FunctionCallResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface UsageStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  latencyMs: number;
}

export interface RealtimeSession {
  id: string;
  object: string;
  model: string;
  expires_at: number;
  modalities: string[];
  instructions: string;
  voice: string;
  turn_detection: {
    type: string;
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  };
  tools: Tool[];
  temperature: number;
  max_response_output_tokens: number;
  client_secret: string;
}

export interface VoiceConversation {
  id: string;
  user_id: string;
  session_id: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  total_tokens?: number;
  cost_cents?: number;
  summary?: string;
  metadata?: any;
}

export interface VoiceMetric {
  id: string;
  conversation_id: string;
  timestamp: string;
  input_tokens?: number;
  output_tokens?: number;
  audio_duration_ms?: number;
  function_calls?: number;
  latency_ms?: number;
  event_type: string;
  metadata?: any;
}

export interface CachedResponse {
  id: string;
  query_hash: string;
  query_text: string;
  response_text: string;
  response_audio_base64?: string;
  created_at: string;
  expires_at: string;
  hit_count: number;
}

export interface FunctionCall {
  id: string;
  conversation_id: string;
  function_name: string;
  arguments: any;
  result?: any;
  execution_time_ms?: number;
  success: boolean;
  error_message?: string;
  called_at: string;
}