/**
 * Friday Meeting R&D Proposals Section
 * Gathers and renders R&D proposals for the Friday meeting.
 *
 * SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-B
 */

/**
 * Gather pending R&D proposals from rd_proposals table.
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<{proposals: Array, grouped: Object}>}
 */
export async function gatherRdProposals(deps) {
  const { supabase, logger = console } = deps;

  const { data: proposals, error } = await supabase
    .from('rd_proposals')
    .select('id, title, hypothesis, priority_score, signal_source, evidence, expected_impact, batch_run_id, created_at')
    .eq('status', 'pending_review')
    .order('priority_score', { ascending: false })
    .limit(15);

  if (error) {
    logger.warn(`  [rd-proposals] Query failed: ${error.message}`);
    return { proposals: [], grouped: {} };
  }

  const grouped = {};
  for (const p of proposals || []) {
    const source = p.signal_source || 'composite';
    if (!grouped[source]) grouped[source] = [];
    grouped[source].push(p);
  }

  return { proposals: proposals || [], grouped };
}

/**
 * Render R&D proposals section for the Friday meeting output.
 * @param {Object} data - { proposals, grouped }
 * @returns {string}
 */
export function renderRdProposals(data) {
  const lines = [];
  lines.push('');
  lines.push('  SECTION 5: R&D PROPOSALS');
  lines.push('  ' + '─'.repeat(45));

  if (data.proposals.length === 0) {
    lines.push('  No pending R&D proposals.');
    lines.push('  The skunkworks batch runs every Monday.');
    return lines.join('\n');
  }

  lines.push(`  ${data.proposals.length} pending proposal(s) across ${Object.keys(data.grouped).length} signal source(s):`);
  lines.push('');

  for (const [source, proposals] of Object.entries(data.grouped)) {
    lines.push(`  [${source.toUpperCase()}]`);
    for (const p of proposals) {
      lines.push(`    - ${p.title} (priority: ${p.priority_score})`);
      if (p.hypothesis) {
        lines.push(`      Hypothesis: ${p.hypothesis}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build combined decision payload for AskUserQuestion.
 * Merges consultant findings and R&D proposals into a single decision flow.
 *
 * @param {Array} findings - Consultant findings
 * @param {Array} proposals - R&D proposals
 * @returns {Object|null} AskUserQuestion payload
 */
export function buildCombinedDecisionPayload(findings, proposals) {
  const questions = [];
  let idx = 0;
  const total = findings.length + proposals.length;

  for (const f of findings) {
    idx++;
    questions.push({
      question: `[FINDING] ${f.title}\n${f.description}\nDomain: ${f.analysis_domain || 'unknown'} | Priority: ${f.priority_score} | Action: ${f.action_type}`,
      header: `Item ${idx}/${total} — Consultant Finding`,
      multiSelect: false,
      itemType: 'finding',
      itemId: f.id,
      options: [
        { label: 'Accept', description: 'Act on this finding — EVA will create SD or take recommended action' },
        { label: 'Dismiss', description: 'This finding is not actionable — suppress similar future recommendations' },
        { label: 'Defer', description: 'Review again next week — keep as pending' },
      ],
    });
  }

  for (const p of proposals) {
    idx++;
    questions.push({
      question: `[R&D PROPOSAL] ${p.title}\nHypothesis: ${p.hypothesis || 'N/A'}\nSignal: ${p.signal_source || 'composite'} | Priority: ${p.priority_score}`,
      header: `Item ${idx}/${total} — R&D Proposal`,
      multiSelect: false,
      itemType: 'rd_proposal',
      itemId: p.id,
      options: [
        { label: 'Approve', description: 'Accept this R&D proposal for investigation' },
        { label: 'Dismiss', description: 'Reject this proposal — not worth investigating' },
        { label: 'Defer', description: 'Review again next week — keep as pending' },
      ],
    });
  }

  return questions.length > 0 ? { questions } : null;
}

/**
 * Process a chairman decision on an R&D proposal.
 * @param {Object} deps - { supabase, logger }
 * @param {string} proposalId
 * @param {string} decision - 'Approve' | 'Dismiss' | 'Defer'
 * @param {string} [notes]
 * @returns {Promise<string>} 'accepted' | 'dismissed' | 'deferred'
 */
export async function processRdProposalDecision(deps, proposalId, decision, notes) {
  const { supabase, logger = console } = deps;
  const now = new Date().toISOString();
  const statusMap = { Approve: 'accepted', Dismiss: 'dismissed' };
  const newStatus = statusMap[decision];

  if (newStatus) {
    const update = {
      status: newStatus,
      decided_at: now,
      decided_by: 'chairman',
      reviewed_at: now,
    };
    if (notes) update.decision_notes = notes;

    const { error } = await supabase
      .from('rd_proposals')
      .update(update)
      .eq('id', proposalId);
    if (error) logger.warn(`   Failed to update R&D proposal: ${error.message}`);
    return newStatus === 'accepted' ? 'accepted' : 'dismissed';
  }
  // Defer — leave as pending_review
  return 'deferred';
}
