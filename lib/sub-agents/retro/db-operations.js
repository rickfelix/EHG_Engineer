/**
 * RETRO Sub-Agent Database Operations
 * Extracted from retro.js for modularity
 */

/**
 * Check if a VALID completion retrospective already exists for this SD
 *
 * A retrospective is considered valid for completion if:
 * 1. It was created AFTER the EXEC-TO-PLAN handoff (timing check)
 * 2. It has status = 'PUBLISHED'
 * 3. It has quality_score >= 70
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Result with found flag and retrospective data
 */
export async function checkExistingRetrospective(supabase, sdId) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

  let sdUuid = sdId;
  if (!isUUID) {
    // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Use sd_key instead of legacy_id (column dropped 2026-01-24)
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('sd_key', sdId)
      .single();
    if (sd) {
      sdUuid = sd.id;
    }
  }

  const { data: execHandoff } = await supabase
    .from('sd_phase_handoffs')
    .select('created_at')
    .or(`sd_id.eq.${sdUuid},sd_id.eq.${sdId}`)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: retros, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', sdUuid)
    .order('created_at', { ascending: false });

  if (error) {
    return { found: false, error: error.message };
  }

  if (!retros || retros.length === 0) {
    return { found: false };
  }

  const execHandoffTime = execHandoff?.created_at ? new Date(execHandoff.created_at) : null;

  for (const retro of retros) {
    const retroCreatedAt = new Date(retro.created_at);
    const isAfterExec = !execHandoffTime || retroCreatedAt >= execHandoffTime;
    const isPublished = retro.status === 'PUBLISHED';
    const hasQuality = retro.quality_score >= 70;

    if (isAfterExec && isPublished && hasQuality) {
      console.log('   ✅ Valid completion retrospective found (created after EXEC-TO-PLAN)');
      return { found: true, ...retro };
    }
  }

  const latestRetro = retros[0];
  const reasons = [];

  if (execHandoffTime && new Date(latestRetro.created_at) < execHandoffTime) {
    reasons.push('created before EXEC-TO-PLAN handoff');
  }
  if (latestRetro.status !== 'PUBLISHED') {
    reasons.push(`status is '${latestRetro.status}' (needs PUBLISHED)`);
  }
  if (latestRetro.quality_score < 70) {
    reasons.push(`quality_score is ${latestRetro.quality_score} (needs >= 70)`);
  }

  console.log(`   ⚠️  Found ${retros.length} retrospective(s), but none qualify as completion retro:`);
  console.log(`      Latest (${latestRetro.id}): ${reasons.join(', ')}`);
  console.log('   ℹ️  Will enhance existing retrospective with completion content');

  return {
    found: false,
    needs_enhancement: true,
    existing_retro_id: latestRetro.id,
    existing_retro: latestRetro,
    reasons
  };
}

/**
 * Gather SD metadata
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 */
export async function gatherSDMetadata(supabase, sdId) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

  let sd = null;
  let error = null;

  if (isUUID) {
    const result = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .maybeSingle();
    sd = result.data;
    error = result.error;
  } else {
    const idResult = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .maybeSingle();

    if (idResult.data) {
      sd = idResult.data;
      error = idResult.error;
    } else {
      // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Use sd_key instead of legacy_id (column dropped 2026-01-24)
      const sdKeyResult = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('sd_key', sdId)
        .maybeSingle();
      sd = sdKeyResult.data;
      error = sdKeyResult.error;
    }
  }

  if (error || !sd) {
    return { found: false, error: error?.message };
  }

  return { found: true, ...sd };
}

/**
 * Store retrospective in database
 * @param {Object} supabase - Supabase client
 * @param {Object} retrospective - Retrospective data to store
 */
export async function storeRetrospective(supabase, retrospective) {
  try {
    const { data, error } = await supabase
      .from('retrospectives')
      .insert(retrospective)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Enhance an existing retrospective with completion content
 * @param {Object} supabase - Supabase client
 * @param {string} existingId - ID of the retrospective to enhance
 * @param {Object} newRetro - Generated completion retrospective
 * @param {Object} existing - Existing retrospective data
 * @param {Function} semanticDeduplicateArray - Deduplication function
 */
export async function enhanceRetrospective(supabase, existingId, newRetro, existing, semanticDeduplicateArray) {
  try {
    console.log('   📊 Applying semantic deduplication to retrospective arrays...');

    const MAX_KEY_LEARNINGS = 25;
    const MAX_WHAT_WENT_WELL = 20;
    const MAX_IMPROVEMENTS = 15;
    const MAX_ACTION_ITEMS = 20;
    const MAX_PATTERNS = 15;
    const MAX_PROTOCOL_IMPROVEMENTS = 20;

    const mergedKeyLearnings = semanticDeduplicateArray(
      existing.key_learnings,
      newRetro.key_learnings,
      'learning'
    ).slice(0, MAX_KEY_LEARNINGS);

    const mergedWhatWentWell = semanticDeduplicateArray(
      existing.what_went_well,
      newRetro.what_went_well,
      'achievement'
    ).slice(0, MAX_WHAT_WENT_WELL);

    const mergedWhatNeedsImprovement = semanticDeduplicateArray(
      existing.what_needs_improvement,
      newRetro.what_needs_improvement
    ).slice(0, MAX_IMPROVEMENTS);

    const mergedActionItems = semanticDeduplicateArray(
      existing.action_items,
      newRetro.action_items,
      'action'
    ).slice(0, MAX_ACTION_ITEMS);

    const mergedSuccessPatterns = [
      ...new Set([...(existing.success_patterns || []), ...(newRetro.success_patterns || [])])
    ].slice(0, MAX_PATTERNS);

    const mergedFailurePatterns = [
      ...new Set([...(existing.failure_patterns || []), ...(newRetro.failure_patterns || [])])
    ].slice(0, MAX_PATTERNS);

    const enhanced = {
      status: 'PUBLISHED',
      quality_score: Math.max(newRetro.quality_score, existing.quality_score || 0),
      title: `${newRetro.title}`,
      description: `${newRetro.description}\n\n[Original lesson captured during EXEC: ${existing.title}]`,
      key_learnings: mergedKeyLearnings,
      what_went_well: mergedWhatWentWell,
      what_needs_improvement: mergedWhatNeedsImprovement,
      action_items: mergedActionItems,
      success_patterns: mergedSuccessPatterns,
      failure_patterns: mergedFailurePatterns,
      retro_type: 'SD_COMPLETION',
      conducted_date: newRetro.conducted_date,
      objectives_met: newRetro.objectives_met,
      on_schedule: newRetro.on_schedule,
      within_scope: newRetro.within_scope,
      team_satisfaction: newRetro.team_satisfaction,
      velocity_achieved: newRetro.velocity_achieved,
      business_value_delivered: newRetro.business_value_delivered,
      protocol_improvements: (() => {
        const combined = [
          ...(existing.protocol_improvements || []),
          ...(newRetro.protocol_improvements || [])
        ];
        const seen = new Set();
        return combined.filter(imp => {
          const key = `${imp.category || 'UNKNOWN'}:${(imp.improvement || '').substring(0, 50)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, MAX_PROTOCOL_IMPROVEMENTS);
      })(),
      quality_issues: [],
      auto_generated: true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('retrospectives')
      .update(enhanced)
      .eq('id', existingId)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    console.log(`   📝 Enhanced retrospective: merged ${mergedKeyLearnings.length} learnings`);
    console.log(`      Original lesson preserved: "${existing.title}"`);

    return { success: true, id: data.id, enhanced: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Store retrospective contributions from various sources
 * @param {Object} supabase - Supabase client
 * @param {string} retroId - Retrospective ID
 * @param {Object} chairmanInsights - Chairman insights
 * @param {Object} contributions - Sub-agent contributions
 * @param {Array} triangulation - Triangulation data
 */
export async function storeRetrospectiveContributions(supabase, retroId, chairmanInsights, contributions, triangulation) {
  const records = [];

  if (chairmanInsights.citations.length > 0) {
    records.push({
      retro_id: retroId,
      contributor_type: 'chairman',
      contributor_name: 'Chairman',
      observations: chairmanInsights.learnings.map(l => l.text),
      recommendations: chairmanInsights.improvement_areas.map(a => a.observation),
      confidence: 100,
      scope: 'strategic'
    });
  }

  if (triangulation && triangulation.length > 0) {
    const claudeAnalyses = triangulation.filter(t => t.claude_analysis).map(t => t.claude_analysis);
    if (claudeAnalyses.length > 0) {
      records.push({
        retro_id: retroId,
        contributor_type: 'triangulation_partner',
        contributor_name: 'Claude',
        observations: claudeAnalyses.slice(0, 10),
        confidence: 90,
        scope: 'technical'
      });
    }

    const chatgptAnalyses = triangulation.filter(t => t.chatgpt_analysis).map(t => t.chatgpt_analysis);
    if (chatgptAnalyses.length > 0) {
      records.push({
        retro_id: retroId,
        contributor_type: 'triangulation_partner',
        contributor_name: 'ChatGPT',
        observations: chatgptAnalyses.slice(0, 10),
        confidence: 85,
        scope: 'technical'
      });
    }

    const antigravityAnalyses = triangulation.filter(t => t.antigravity_analysis).map(t => t.antigravity_analysis);
    if (antigravityAnalyses.length > 0) {
      records.push({
        retro_id: retroId,
        contributor_type: 'triangulation_partner',
        contributor_name: 'Antigravity',
        observations: antigravityAnalyses.slice(0, 10),
        confidence: 85,
        scope: 'technical'
      });
    }
  }

  for (const [agentCode, contribs] of Object.entries(contributions.by_agent || {})) {
    const observations = contribs
      .filter(c => c.retro_contribution?.observation)
      .map(c => c.retro_contribution.observation);

    if (observations.length > 0) {
      records.push({
        retro_id: retroId,
        contributor_type: 'sub_agent',
        contributor_name: agentCode,
        observations,
        confidence: 80,
        scope: agentCode.toLowerCase()
      });
    }
  }

  if (records.length > 0) {
    const { error } = await supabase
      .from('retrospective_contributions')
      .insert(records);

    if (error) {
      console.log(`   ⚠️ Failed to store contributions: ${error.message}`);
    } else {
      console.log(`   ✅ Stored ${records.length} contributor records`);
    }
  }
}
