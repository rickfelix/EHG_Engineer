#!/usr/bin/env node
/**
 * Outcome Tracker
 *
 * Centralizes outcome loop closure for SD completions:
 * - Resolve linked feedback
 * - Record sd_completion signals
 * - Detect recurrence signals
 * - Compute effectiveness metrics
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_MATCH_THRESHOLD = 0.75;
const MATCH_VERSION = 'v1';

function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

function jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = new Set([...setA].filter(t => setB.has(t)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function computePercentChange(preCount, postCount) {
  if (preCount === 0) return null;
  return ((postCount - preCount) / preCount) * 100;
}

function buildWindowBounds(completionTime, windowDays = DEFAULT_WINDOW_DAYS) {
  const completion = new Date(completionTime);
  const preStart = new Date(completion);
  preStart.setDate(preStart.getDate() - windowDays);
  const postEnd = new Date(completion);
  postEnd.setDate(postEnd.getDate() + windowDays);

  return {
    preStart,
    preEnd: completion,
    postStart: completion,
    postEnd
  };
}

async function getSupabaseClient(supabase) {
  if (supabase) return supabase;
  return createSupabaseServiceClient('engineer');
}

async function fetchSd(supabase, sdId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, category, completion_date, status')
    .eq('id', sdId)
    .single();

  if (error) {
    throw new Error(`Failed to load SD ${sdId}: ${error.message}`);
  }

  return data;
}

async function countFeedbackInWindow(supabase, { start, end, sdId, category }) {
  let query = supabase
    .from('leo_feedback')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());

  if (sdId) {
    query = query.eq('sd_id', sdId);
  } else if (category) {
    query = query.eq('category', category);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Failed to count feedback: ${error.message}`);
  }

  return count || 0;
}

async function ensureSdCompletionSignal(supabase, sdId, metadata = {}) {
  const { data: existing, error: readError } = await supabase
    .from('outcome_signals')
    .select('id, metadata')
    .eq('signal_type', 'sd_completion')
    .eq('sd_id', sdId)
    .is('source_feedback_id', null)
    .limit(1);

  if (readError) {
    throw new Error(`Failed to read sd_completion signal: ${readError.message}`);
  }

  if (existing && existing.length > 0) {
    const current = existing[0];
    const merged = { ...(current.metadata || {}), ...metadata };
    const { error } = await supabase
      .from('outcome_signals')
      .update({ metadata: merged })
      .eq('id', current.id);

    if (error) {
      throw new Error(`Failed to update sd_completion metadata: ${error.message}`);
    }

    return { inserted: false, updated: true };
  }

  const { error: insertError } = await supabase
    .from('outcome_signals')
    .insert({
      signal_type: 'sd_completion',
      sd_id: sdId,
      source_feedback_id: null,
      metadata
    });

  if (insertError && insertError.code !== '23505') {
    throw new Error(`Failed to insert sd_completion signal: ${insertError.message}`);
  }

  return { inserted: !insertError, updated: false };
}

export async function recordSdCompleted({ supabase, sdId, actor = 'LeadFinalApprovalExecutor', completionTime = new Date() }) {
  const client = await getSupabaseClient(supabase);
  const resolvedAt = new Date(completionTime).toISOString();

  const { data: feedbackRows, error: feedbackError } = await client
    .from('leo_feedback')
    .select('id, status, resolved_by_sd_id')
    .eq('sd_id', sdId);

  if (feedbackError) {
    throw new Error(`Failed to load linked feedback: ${feedbackError.message}`);
  }

  const linkedFeedback = feedbackRows || [];
  const unresolvedIds = linkedFeedback
    .filter(row => row.status !== 'resolved')
    .map(row => row.id);
  const backfillIds = linkedFeedback
    .filter(row => row.status === 'resolved' && !row.resolved_by_sd_id)
    .map(row => row.id);

  let resolvedCount = 0;
  let backfilledCount = 0;

  if (unresolvedIds.length > 0) {
    const { data: updated, error } = await client
      .from('leo_feedback')
      .update({
        status: 'resolved',
        resolved_at: resolvedAt,
        resolved_by_sd_id: sdId
      })
      .in('id', unresolvedIds)
      .select('id');

    if (error) {
      throw new Error(`Failed to resolve feedback: ${error.message}`);
    }

    resolvedCount = updated?.length || 0;
  }

  if (backfillIds.length > 0) {
    const { data: updated, error } = await client
      .from('leo_feedback')
      .update({ resolved_by_sd_id: sdId })
      .in('id', backfillIds)
      .select('id');

    if (error) {
      throw new Error(`Failed to backfill resolved_by_sd_id: ${error.message}`);
    }

    backfilledCount = updated?.length || 0;
  }

  await ensureSdCompletionSignal(client, sdId, {
    actor,
    source: 'recordSdCompleted',
    resolved_feedback_count: linkedFeedback.length,
    no_linked_feedback: linkedFeedback.length === 0
  });

  await computeEffectiveness({
    supabase: client,
    sdId,
    completionTime,
    linkedFeedbackCount: linkedFeedback.length
  });

  return {
    linkedFeedbackCount: linkedFeedback.length,
    resolvedCount,
    backfilledCount
  };
}

export async function computeEffectiveness({
  supabase,
  sdId,
  completionTime,
  windowDays = DEFAULT_WINDOW_DAYS,
  linkedFeedbackCount = null
}) {
  const client = await getSupabaseClient(supabase);
  const sd = await fetchSd(client, sdId);
  const completion = completionTime || sd.completion_date || new Date();

  const { preStart, preEnd, postStart, postEnd } = buildWindowBounds(completion, windowDays);

  let scope = { type: 'linked', category: null };
  if (linkedFeedbackCount === 0) {
    scope = { type: sd.category ? 'category' : 'global', category: sd.category || null };
  }

  const preCount = await countFeedbackInWindow(client, {
    start: preStart,
    end: preEnd,
    sdId: scope.type === 'linked' ? sdId : null,
    category: scope.type === 'category' ? scope.category : null
  });

  const postCount = await countFeedbackInWindow(client, {
    start: postStart,
    end: postEnd,
    sdId: scope.type === 'linked' ? sdId : null,
    category: scope.type === 'category' ? scope.category : null
  });

  const delta = postCount - preCount;
  const pctChange = computePercentChange(preCount, postCount);

  const metadata = {
    window_days: windowDays,
    scope_type: scope.type,
    scope_category: scope.category,
    no_linked_feedback: linkedFeedbackCount === 0,
    pct_change_null_reason: preCount === 0 ? 'pre_count_zero' : null
  };

  const { error } = await client
    .from('sd_effectiveness_metrics')
    .upsert({
      sd_id: sdId,
      window_start: preStart.toISOString(),
      window_end: postEnd.toISOString(),
      pre_feedback_count: preCount,
      post_feedback_count: postCount,
      delta_count: delta,
      pct_change: pctChange,
      computed_at: new Date().toISOString(),
      metadata
    }, { onConflict: 'sd_id,window_start,window_end' });

  if (error) {
    throw new Error(`Failed to upsert effectiveness metrics: ${error.message}`);
  }

  return {
    preCount,
    postCount,
    delta,
    pctChange,
    scope
  };
}

export async function detectRecurrence({
  supabase,
  newFeedbackId,
  matchThreshold = DEFAULT_MATCH_THRESHOLD
}) {
  const client = await getSupabaseClient(supabase);

  const { data: feedback, error: feedbackError } = await client
    .from('leo_feedback')
    .select('id, title, description, created_at')
    .eq('id', newFeedbackId)
    .single();

  if (feedbackError) {
    throw new Error(`Failed to load feedback: ${feedbackError.message}`);
  }

  const createdAt = new Date(feedback.created_at || Date.now());
  const windowStart = new Date(createdAt);
  windowStart.setDate(windowStart.getDate() - DEFAULT_WINDOW_DAYS);

  const { data: candidateSds, error: sdError } = await client
    .from('strategic_directives_v2')
    .select('id, completion_date')
    .eq('status', 'completed')
    .gte('completion_date', windowStart.toISOString())
    .lte('completion_date', createdAt.toISOString());

  if (sdError) {
    throw new Error(`Failed to load completed SDs: ${sdError.message}`);
  }

  if (!candidateSds || candidateSds.length === 0) {
    return { matched: false, reason: 'no_completed_sd_window' };
  }

  const candidateSdIds = candidateSds.map(sd => sd.id);

  const { data: resolvedPatterns, error: patternError } = await client
    .from('leo_feedback')
    .select('id, title, description, resolved_by_sd_id')
    .eq('status', 'resolved')
    .in('resolved_by_sd_id', candidateSdIds);

  if (patternError) {
    throw new Error(`Failed to load resolved feedback patterns: ${patternError.message}`);
  }

  if (!resolvedPatterns || resolvedPatterns.length === 0) {
    return { matched: false, reason: 'no_resolved_patterns' };
  }

  const newTokens = tokenize([feedback.title, feedback.description].filter(Boolean).join(' '));

  let bestMatch = null;
  for (const pattern of resolvedPatterns) {
    const patternTokens = tokenize([pattern.title, pattern.description].filter(Boolean).join(' '));
    const score = jaccardSimilarity(newTokens, patternTokens);
    if (score >= matchThreshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        score,
        resolvedFeedbackId: pattern.id,
        sdId: pattern.resolved_by_sd_id
      };
    }
  }

  if (!bestMatch) {
    return { matched: false, reason: 'no_match' };
  }

  const { error: insertError } = await client
    .from('outcome_signals')
    .insert({
      signal_type: 'pattern_recurrence',
      sd_id: bestMatch.sdId,
      source_feedback_id: newFeedbackId,
      metadata: {
        match_score: bestMatch.score,
        matched_pattern_id: bestMatch.resolvedFeedbackId,
        match_version: MATCH_VERSION,
        matcher: 'jaccard_tokens'
      }
    });

  if (insertError && insertError.code !== '23505') {
    throw new Error(`Failed to insert pattern_recurrence signal: ${insertError.message}`);
  }

  return {
    matched: true,
    matchScore: bestMatch.score,
    matchedPatternId: bestMatch.resolvedFeedbackId,
    sdId: bestMatch.sdId
  };
}

export async function getOutcomeSummary({ supabase, sdId, windowDays = DEFAULT_WINDOW_DAYS }) {
  const client = await getSupabaseClient(supabase);
  const sd = await fetchSd(client, sdId);
  const completion = sd.completion_date ? new Date(sd.completion_date) : null;

  const completionSignalQuery = client
    .from('outcome_signals')
    .select('id')
    .eq('signal_type', 'sd_completion')
    .eq('sd_id', sdId)
    .is('source_feedback_id', null)
    .limit(1);

  const resolvedFeedbackQuery = client
    .from('leo_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('resolved_by_sd_id', sdId)
    .eq('status', 'resolved');

  const metricsQuery = client
    .from('sd_effectiveness_metrics')
    .select('*')
    .eq('sd_id', sdId)
    .order('computed_at', { ascending: false })
    .limit(1);

  const recurrenceQuery = completion
    ? client
      .from('outcome_signals')
      .select('id', { count: 'exact', head: true })
      .eq('signal_type', 'pattern_recurrence')
      .eq('sd_id', sdId)
      .gte('created_at', completion.toISOString())
      .lte('created_at', new Date(completion.getTime() + windowDays * 24 * 60 * 60 * 1000).toISOString())
    : client
      .from('outcome_signals')
      .select('id', { count: 'exact', head: true })
      .eq('signal_type', 'pattern_recurrence')
      .eq('sd_id', sdId);

  const [
    completionResult,
    resolvedResult,
    metricsResult,
    recurrenceResult
  ] = await Promise.all([
    completionSignalQuery,
    resolvedFeedbackQuery,
    metricsQuery,
    recurrenceQuery
  ]);

  return {
    sd_id: sdId,
    sd_status: sd.status,
    completion_signal: (completionResult.data || []).length > 0,
    resolved_feedback_count: resolvedResult.count || 0,
    recurrence_signal_count: recurrenceResult.count || 0,
    latest_metrics: metricsResult.data?.[0] || null,
    missing_components: {
      completion_signal: (completionResult.data || []).length === 0,
      effectiveness_metrics: !metricsResult.data || metricsResult.data.length === 0
    }
  };
}

export {
  normalizeText,
  tokenize,
  jaccardSimilarity,
  computePercentChange,
  buildWindowBounds
};

