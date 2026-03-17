// Service Tasks Claim Edge Function
// Venture Factory: Atomically claims a pending task with optimistic locking
// SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-B
// Extended: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-F (input validation against artifact_schema)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyJWT, getCorsHeaders } from '../_shared/auth.ts';

/**
 * Validates input_params against a JSON Schema definition from ehg_services.artifact_schema.
 * Uses basic validation (type checking, required fields, enum matching) without external deps.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
function validateAgainstSchema(
  data: Record<string, unknown>,
  schema: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (schema.type !== 'object') {
    return { valid: true, errors: [] }; // Only validate object schemas
  }

  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];

  // Check required fields
  for (const field of required) {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate each provided field against its schema
  for (const [key, value] of Object.entries(data)) {
    const propSchema = properties[key];
    if (!propSchema) continue; // Extra fields are allowed

    // M-2 fix: Skip null values for optional fields (null is valid for non-required fields)
    if (value === null && !required.includes(key)) continue;

    // Type checking
    if (propSchema.type === 'string' && typeof value !== 'string') {
      errors.push(`Field '${key}' must be a string, got ${typeof value}`);
    } else if (propSchema.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
      errors.push(`Field '${key}' must be an integer`);
    } else if (propSchema.type === 'number' && typeof value !== 'number') {
      errors.push(`Field '${key}' must be a number, got ${typeof value}`);
    } else if (propSchema.type === 'array' && !Array.isArray(value)) {
      errors.push(`Field '${key}' must be an array, got ${typeof value}`);
    }

    // Enum validation
    if (propSchema.enum && Array.isArray(propSchema.enum)) {
      if (!propSchema.enum.includes(value)) {
        errors.push(`Field '${key}' must be one of: ${(propSchema.enum as string[]).join(', ')}`);
      }
    }

    // Numeric range validation
    if (typeof value === 'number') {
      if (propSchema.minimum !== undefined && value < (propSchema.minimum as number)) {
        errors.push(`Field '${key}' must be >= ${propSchema.minimum}`);
      }
      if (propSchema.maximum !== undefined && value > (propSchema.maximum as number)) {
        errors.push(`Field '${key}' must be <= ${propSchema.maximum}`);
      }
    }

    // String length validation
    if (typeof value === 'string' && propSchema.maxLength !== undefined) {
      if (value.length > (propSchema.maxLength as number)) {
        errors.push(`Field '${key}' exceeds max length of ${propSchema.maxLength}`);
      }
    }

    // Array validation: min items + M-1 fix: recurse into array item schemas
    if (Array.isArray(value)) {
      if (propSchema.minItems !== undefined && value.length < (propSchema.minItems as number)) {
        errors.push(`Field '${key}' must have at least ${propSchema.minItems} items`);
      }
      // Validate array items against items schema if defined
      if (propSchema.items && typeof propSchema.items === 'object') {
        const itemSchema = propSchema.items as Record<string, unknown>;
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (itemSchema.type === 'object' && typeof item === 'object' && item !== null) {
            const itemResult = validateAgainstSchema(item as Record<string, unknown>, itemSchema);
            for (const err of itemResult.errors) {
              errors.push(`${key}[${i}]: ${err}`);
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify JWT before any database operations
    const { user, error: authError, status: authStatus } = await verifyJWT(req);
    if (authError) {
      return new Response(
        JSON.stringify({ error: authError }),
        { status: authStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization')!;
    const body = await req.json();
    const { task_id, claimed_by } = body;

    if (!task_id) {
      return new Response(
        JSON.stringify({ error: 'task_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create authenticated client (RLS enforces venture isolation)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // FR-003: Validate input_params against artifact_schema from ehg_services
    // Look up the task to get its service_id, then fetch the schema
    const { input_params } = body;
    if (input_params !== undefined) {
      // Fetch the task to get service_id
      const { data: taskInfo } = await supabase
        .from('service_tasks')
        .select('service_id')
        .eq('id', task_id)
        .eq('status', 'pending')
        .single();

      if (taskInfo?.service_id) {
        // Fetch artifact_schema from ehg_services
        const { data: serviceInfo } = await supabase
          .from('ehg_services')
          .select('artifact_schema')
          .eq('id', taskInfo.service_id)
          .single();

        if (serviceInfo?.artifact_schema) {
          const validation = validateAgainstSchema(
            input_params as Record<string, unknown>,
            serviceInfo.artifact_schema as Record<string, unknown>
          );

          if (!validation.valid) {
            return new Response(
              JSON.stringify({
                error: 'Input validation failed against service artifact_schema',
                validation_errors: validation.errors,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    }

    // Optimistic locking: conditional UPDATE where status = 'pending'
    // If another agent claimed it first, this returns 0 rows
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('service_tasks')
      .update({
        status: 'claimed',
        claimed_at: now,
        metadata: { claimed_by: claimed_by ?? 'unknown', claimed_at: now },
        updated_at: now,
      })
      .eq('id', task_id)
      .eq('status', 'pending')  // Optimistic lock: only claim if still pending
      .select('id, venture_id, service_id, task_type, status, priority, input_params, claimed_at, metadata')
      .single();

    if (error) {
      // If no rows matched, the task was already claimed or doesn't exist
      if (error.code === 'PGRST116') {
        // Check if task exists but is already claimed
        const { data: existing } = await supabase
          .from('service_tasks')
          .select('id, status')
          .eq('id', task_id)
          .single();

        if (existing && existing.status !== 'pending') {
          return new Response(
            JSON.stringify({ error: 'Task already claimed or completed', current_status: existing.status }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ error: 'Task not found or not accessible' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ task: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
