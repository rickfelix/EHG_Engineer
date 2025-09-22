// WebSocket State Relay for OpenAI Realtime API
// Supabase Edge Function for SD-2025-001
// Relays conversation state and metrics to database

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RelayEvent {
  conversation_id: string
  session_id: string
  event_type: string
  data: any
  timestamp: string
}

interface ConversationUpdate {
  conversation_id: string
  updates: {
    ended_at?: string
    duration_seconds?: number
    total_tokens?: number
    input_tokens?: number
    output_tokens?: number
    cost_cents?: number
    summary?: string
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse request body
    const body = await req.json()
    
    // Handle different event types
    switch (body.event_type) {
      case 'session.created':
        // Session started
        console.log('Session created:', body.session_id)
        break

      case 'conversation.item.created':
        // New conversation item (user or assistant message)
        if (body.data.item?.content) {
          await supabase
            .from('voice_usage_metrics')
            .insert({
              conversation_id: body.conversation_id,
              event_type: 'message',
              metadata: {
                role: body.data.item.role,
                content_length: body.data.item.content.length
              }
            })
        }
        break

      case 'response.audio_transcript.delta':
        // Track audio transcription progress
        break

      case 'response.function_call_arguments.done':
        // Function call completed
        const functionCall = body.data
        await supabase
          .from('voice_function_calls')
          .insert({
            conversation_id: body.conversation_id,
            function_name: functionCall.name,
            arguments: functionCall.arguments,
            called_at: new Date().toISOString()
          })
        
        // Also track in metrics
        await supabase
          .from('voice_usage_metrics')
          .insert({
            conversation_id: body.conversation_id,
            event_type: 'function_call',
            function_calls: 1,
            metadata: {
              function_name: functionCall.name
            }
          })
        break

      case 'response.done':
        // Response completed, track tokens and latency
        const response = body.data
        if (response.usage) {
          await supabase
            .from('voice_usage_metrics')
            .insert({
              conversation_id: body.conversation_id,
              event_type: 'response_complete',
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
              latency_ms: response.latency_ms || 0,
              metadata: response.usage
            })

          // Calculate cost (pricing as of Dec 2024)
          // Input: $0.06 per 1M tokens, Output: $0.24 per 1M tokens
          const inputCost = (response.usage.input_tokens / 1000000) * 6 // cents
          const outputCost = (response.usage.output_tokens / 1000000) * 24 // cents
          const totalCostCents = Math.ceil(inputCost + outputCost)

          // Update conversation totals
          await supabase
            .from('voice_conversations')
            .update({
              total_tokens: response.usage.total_tokens,
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
              cost_cents: totalCostCents,
              updated_at: new Date().toISOString()
            })
            .eq('id', body.conversation_id)
        }
        break

      case 'session.updated':
        // Session configuration updated
        console.log('Session updated:', body.session_id)
        break

      case 'conversation.ended':
        // Conversation ended, finalize metrics
        const endTime = new Date().toISOString()
        const { data: conversation } = await supabase
          .from('voice_conversations')
          .select('started_at')
          .eq('id', body.conversation_id)
          .single()

        if (conversation) {
          const duration = Math.floor(
            (new Date(endTime).getTime() - new Date(conversation.started_at).getTime()) / 1000
          )

          await supabase
            .from('voice_conversations')
            .update({
              ended_at: endTime,
              duration_seconds: duration,
              updated_at: endTime
            })
            .eq('id', body.conversation_id)
        }
        break

      case 'error':
        // Log errors
        console.error('Realtime error:', body.data)
        await supabase
          .from('voice_usage_metrics')
          .insert({
            conversation_id: body.conversation_id,
            event_type: 'error',
            metadata: body.data
          })
        break

      default:
        console.log('Unknown event type:', body.event_type)
    }

    // Check for cache opportunities
    if (body.event_type === 'response.done' && body.data.cached_response) {
      const { query_hash, query_text, response_text } = body.data.cached_response
      
      // Check if this response should be cached
      const { data: existing } = await supabase
        .from('voice_cached_responses')
        .select('id')
        .eq('query_hash', query_hash)
        .single()

      if (!existing) {
        await supabase
          .from('voice_cached_responses')
          .insert({
            query_hash,
            query_text,
            response_text,
            created_at: new Date().toISOString()
          })
      } else {
        // Update hit count
        await supabase.rpc('increment', { 
          table_name: 'voice_cached_responses',
          row_id: existing.id,
          column_name: 'hit_count'
        })
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Relay error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})