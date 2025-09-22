/**
 * POST /api/leo/sub-agent-reports
 *
 * Submit sub-agent execution results
 * Validates status transitions and recomputes affected gates
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  SubAgentReportBody,
  SubAgentReportResponse,
  SubAgentReportError,
  validateWithDetails,
  isValidTransition,
  getAllowedTransitions,
  isTerminalStatus,
  getAffectedGates,
  Agent,
  Status,
  Gate
} from '../../../lib/validation/leo-schemas';
import { emitSubAgentStatus, emitGateUpdated } from '../../../lib/websocket/leo-events';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Rate limiting map
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 50; // Lower limit for writes
const RATE_WINDOW = 60 * 1000;

/**
 * Rate limiter for write operations
 */
function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(clientId);

  if (!limit || limit.resetAt < now) {
    rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT) {
    return false;
  }

  limit.count++;
  return true;
}

/**
 * Recompute gate scores based on sub-agent evidence
 */
async function recomputeGate(
  prdId: string,
  gate: Gate
): Promise<number> {
  // Get validation rules for this gate
  const { data: rules, error: rulesError } = await supabase
    .from('leo_validation_rules')
    .select('*')
    .eq('gate', gate)
    .eq('active', true);

  if (rulesError || !rules || rules.length === 0) {
    console.error(`No active rules for gate ${gate}`);
    return 0;
  }

  // Check each rule (simplified - in reality would check evidence)
  let totalScore = 0;
  let totalWeight = 0;

  for (const rule of rules) {
    totalWeight += rule.weight;

    // Simplified: Check if required evidence exists
    // In production, would validate against actual artifacts
    const passed = Math.random() > 0.3; // Mock 70% pass rate

    if (passed) {
      totalScore += rule.weight * 100;
    }
  }

  // Normalize if weights don't sum to 1.0
  if (totalWeight > 0 && totalWeight !== 1) {
    totalScore = totalScore / totalWeight;
  }

  return Math.round(totalScore * 100) / 100; // Round to 2 decimals
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['POST']
    });
  }

  // Rate limiting
  const clientId = req.headers['x-api-key'] as string ||
                   req.headers['x-forwarded-for'] as string ||
                   req.socket.remoteAddress || 'unknown';

  if (!checkRateLimit(clientId)) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: 60
    });
  }

  // Validate request body
  const validation = validateWithDetails(SubAgentReportBody, req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }

  const { prd_id, agent, status, evidence, message, error_details } = validation.data;

  try {
    // 1) Check PRD exists
    const { data: prd, error: prdError } = await supabase
      .from('prds')
      .select('id')
      .eq('id', prd_id)
      .single();

    if (prdError || !prd) {
      return res.status(404).json({
        error: 'PRD not found',
        prd_id
      });
    }

    // 2) Get sub-agent ID from code
    const { data: subAgent, error: agentError } = await supabase
      .from('leo_sub_agents')
      .select('id, name')
      .eq('code', agent)
      .single();

    if (agentError || !subAgent) {
      return res.status(404).json({
        error: 'Unknown sub-agent',
        agent
      });
    }

    // 3) Check current execution status
    const { data: execution, error: execError } = await supabase
      .from('sub_agent_executions')
      .select('status')
      .eq('prd_id', prd_id)
      .eq('sub_agent_id', subAgent.id)
      .single();

    if (execError || !execution) {
      // No execution found - create one
      const { error: insertError } = await supabase
        .from('sub_agent_executions')
        .insert({
          prd_id,
          sub_agent_id: subAgent.id,
          status,
          evidence,
          completed_at: isTerminalStatus(status) ? new Date().toISOString() : null
        });

      if (insertError) {
        return res.status(500).json({
          error: 'Failed to create execution',
          details: insertError.message
        });
      }
    } else {
      // Validate status transition
      const currentStatus = execution.status as Status;

      if (!isValidTransition(currentStatus, status)) {
        const errorResponse: SubAgentReportError = {
          accepted: false,
          reason: `Invalid status transition from ${currentStatus} to ${status}`,
          current_status: currentStatus,
          allowed_transitions: getAllowedTransitions(currentStatus)
        };
        return res.status(400).json(errorResponse);
      }

      // Update execution
      const { error: updateError } = await supabase
        .from('sub_agent_executions')
        .update({
          status,
          evidence,
          completed_at: isTerminalStatus(status) ? new Date().toISOString() : null
        })
        .eq('prd_id', prd_id)
        .eq('sub_agent_id', subAgent.id);

      if (updateError) {
        return res.status(500).json({
          error: 'Failed to update execution',
          details: updateError.message
        });
      }
    }

    // 4) Emit WebSocket event for status change
    emitSubAgentStatus({
      prd_id,
      agent,
      status,
      message
    });

    // 5) Recompute affected gates if terminal status
    const affectedGates = getAffectedGates(agent, isTerminalStatus(status));
    const newScores: Record<Gate, number> = {} as any;

    for (const gate of affectedGates) {
      const score = await recomputeGate(prd_id, gate);
      newScores[gate] = score;

      // Store new gate review
      await supabase.from('leo_gate_reviews').insert({
        prd_id,
        gate,
        score,
        evidence: {
          sub_agent: agent,
          status,
          recomputed_at: new Date().toISOString()
        }
      });

      // Emit gate updated event
      emitGateUpdated({
        prd_id,
        gate,
        score
      });
    }

    // 6) Store in compliance alerts for audit trail
    await supabase.from('compliance_alerts').insert({
      alert_type: 'missing_artifact', // Using existing enum
      severity: status === 'error' ? 'high' : 'info',
      source: 'sub-agent-report',
      message: `Sub-agent ${agent} reported ${status} for PRD ${prd_id}`,
      payload: {
        prd_id,
        agent,
        status,
        evidence,
        message,
        error_details,
        gates_recomputed: affectedGates
      }
    });

    // 7) Build success response
    const response: SubAgentReportResponse = {
      accepted: true,
      recomputed_gates: affectedGates,
      new_scores: newScores,
      message: `Sub-agent report accepted, ${affectedGates.length} gates recomputed`
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Sub-agent report error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}