import { describe, it, expect } from 'vitest';
import {
  cleanText,
  buildDecisionItems,
  decisionCount,
  refTag,
  renderItem,
  renderDecisionLines,
  renderLeanDecision,
  renderLeanDecisionEmail,
  GROUPABLE_TYPES,
} from '../../lib/chairman/decision-layman.mjs';

const NOW = new Date('2026-06-14T18:00:00Z');
// 21 days ago, 20 days ago, 19 days ago (mirrors the chairman's real 3 Stage-19 approvals)
const D = (days) => new Date(NOW.getTime() - days * 24 * 3600 * 1000).toISOString();

const approval = (id, stage, venture, ageDays) => ({
  id, decision_type: 'chairman_approval', title: `Stage ${stage} Chairman Approval`,
  priority: 'critical', stage, venture_name: venture, blocking: false, created_at: D(ageDays), details: {},
});
const flag = (id, title, ageDays, extra = {}) => ({
  id, decision_type: 'flag_review', title, priority: 'high', stage: null,
  created_at: D(ageDays), details: { category: 'corrective_finding', severity: 'high' }, ...extra,
});

describe('cleanText', () => {
  it('collapses whitespace and truncates on a word boundary', () => {
    const out = cleanText('a  b\n c ' + 'x'.repeat(300), 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('refTag — the real, resolvable reference', () => {
  it('single row -> [ref decision_type:id]', () => {
    expect(refTag([{ decision_type: 'flag_review', id: 'abc-123' }])).toBe('[ref flag_review:abc-123]');
  });
  it('group -> each token is a full, CLI-resolvable decision_type:id', () => {
    expect(refTag([
      { decision_type: 'chairman_approval', id: 'id1' },
      { decision_type: 'chairman_approval', id: 'id2' },
    ])).toBe('[refs chairman_approval:id1, chairman_approval:id2]');
  });
});

describe('grouping', () => {
  it('collapses multiple chairman_approval rows into ONE group item, others stay singles', () => {
    const rows = [
      approval('a1', 19, 'Alpha', 21),
      flag('f1', 'permission denied in dashboard', 8),
      approval('a2', 19, 'Beta', 20),
      approval('a3', 19, 'Gamma', 19),
    ];
    const items = buildDecisionItems(rows);
    const approvalItems = items.filter((i) => i.type === 'chairman_approval');
    expect(approvalItems).toHaveLength(1);
    expect(approvalItems[0].rows).toHaveLength(3);
    expect(items.filter((i) => i.type === 'flag_review')).toHaveLength(1);
    // decision COUNT still reflects every underlying row (3 approvals + 1 flag = 4)
    expect(decisionCount(items)).toBe(4);
  });

  it('approvals and gates are groupable; flags are not', () => {
    expect(GROUPABLE_TYPES.has('chairman_approval')).toBe(true);
    expect(GROUPABLE_TYPES.has('gate_decision')).toBe(true);
    expect(GROUPABLE_TYPES.has('flag_review')).toBe(false);
  });
});

describe('renderItem — chairman_approval', () => {
  it('renders a grouped sign-off line with count, stage, an age range, and a refs list', () => {
    const rows = [approval('id-a', 19, 'Alpha', 21), approval('id-b', 19, 'Beta', 20), approval('id-c', 19, 'Gamma', 19)];
    const line = renderItem(buildDecisionItems(rows)[0], NOW);
    expect(line).toContain('Approve the 3 ventures');
    expect(line).toContain('Stage 19');
    expect(line).toContain('[refs chairman_approval:id-a, chairman_approval:id-b, chairman_approval:id-c]');
    expect(line).toMatch(/waiting 19d–21d/);
  });

  it('renders a single approval with the venture name and its full ref', () => {
    const line = renderItem(buildDecisionItems([approval('id-x', 22, 'DataDistill', 5)])[0], NOW);
    expect(line).toContain('Approve venture “DataDistill”');
    expect(line).toContain('Stage 22');
    expect(line).toContain('[ref chairman_approval:id-x]');
  });
});

describe('renderItem — flag_review shows the text AS RECEIVED (no paraphrase)', () => {
  it('keeps the raw title verbatim and appends the real reference', () => {
    const row = flag('id-flag', '[TRIGGER-AUDIT] F-1 HIGH: unguarded ::UUID casts on metadata in SD-completion AFTER triggers', 4);
    const line = renderItem(buildDecisionItems([row])[0], NOW);
    expect(line).toContain('Review and decide on this high-priority flagged issue');
    expect(line).toContain('[TRIGGER-AUDIT] F-1 HIGH: unguarded ::UUID casts'); // verbatim, not invented
    expect(line).toContain('[ref flag_review:id-flag]');
  });
});

describe('renderItem — gate_decision group surfaces blocking urgency', () => {
  const gate = (id, stage, blocking, ageDays) => ({
    id, decision_type: 'gate_decision', title: `Stage ${stage} Gate Decision`,
    priority: blocking ? 'critical' : 'high', stage, blocking, recommendation: null,
    venture_name: 'V' + stage, created_at: D(ageDays), details: {},
  });
  it('notes how many grouped gates are blocking a venture', () => {
    const rows = [gate('g1', 22, true, 10), gate('g2', 5, false, 1)];
    const line = renderItem(buildDecisionItems(rows)[0], NOW);
    expect(line).toContain('Make 2 venture stage-gate calls');
    expect(line).toContain('1 of these is blocking a venture');
    expect(line).toContain('[refs gate_decision:g1, gate_decision:g2]');
  });
});

describe('renderDecisionLines — integration', () => {
  it('sorts, groups, counts, and produces one line per item', () => {
    const rows = [
      flag('f1', 'permission denied', 8),
      approval('a1', 19, 'Alpha', 21),
      approval('a2', 19, 'Beta', 20),
    ];
    const { count, lines } = renderDecisionLines(rows, NOW);
    expect(count).toBe(3);          // every underlying decision counted
    expect(lines).toHaveLength(2);  // approvals grouped -> 2 lines
  });

  it('emits no emoji characters anywhere in the rendered lines', () => {
    const rows = [approval('a1', 19, 'Alpha', 21), flag('f1', 'x', 8)];
    const { lines } = renderDecisionLines(rows, NOW);
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const l of lines) expect(emoji.test(l)).toBe(false);
  });

  it('every line carries a resolvable [ref ...] anchor', () => {
    const rows = [approval('a1', 19, 'Alpha', 21), flag('f1', 'x', 8)];
    const { lines } = renderDecisionLines(rows, NOW);
    for (const l of lines) expect(l).toMatch(/\[refs? \w+:/);
  });
});

// ── SD-LEO-INFRA-LEAN-DECISION-EMAIL-001: lean, decision-specific on-demand email ──
// These read the BASE chairman_decisions row shape (real decision_type + brief_data), NOT the lossy view.
const baseSessionQuestion = (id, ageDays, brief = {}) => ({
  id, decision_type: 'session_question', summary: brief.title || 'a question',
  brief_data: brief, lifecycle_stage: 0, blocking: false, venture_id: null, created_at: D(ageDays),
});
const baseVentureApproval = (id, stage, ageDays, brief = {}) => ({
  id, decision_type: 'chairman_approval', summary: `Stage ${stage} approval`,
  brief_data: brief, lifecycle_stage: stage, blocking: false, venture_id: `v-${id}`, created_at: D(ageDays),
});

describe('renderLeanDecision (FR-1)', () => {
  it('renders a session_question as its QUESTION + recommendation, NOT a venture sign-off', () => {
    const row = baseSessionQuestion('dq1', 1, {
      title: 'Decide canonical S5 financial truth: contract 7.7:1 vs artifact 38.17:1',
      recommendation: 'use the contract',
      context: 'the artifact and the contract disagree',
    });
    const line = renderLeanDecision(row, NOW);
    expect(line).toContain('Decide canonical S5 financial truth');
    expect(line).toContain('Recommendation: use the contract');
    expect(line).toContain('Context: the artifact and the contract disagree');
    expect(line).not.toMatch(/waiting for (your )?sign-off/i);
    expect(line).not.toMatch(/Stage 0/);
    expect(line).toContain('[ref session_question:dq1]'); // REAL type in the ref
  });

  it('keeps venture/stage framing for a true chairman_approval with a venture', () => {
    const row = baseVentureApproval('va1', 12, 2, { title: 'Approve Acme past Stage 12', recommendation: 'proceed' });
    const line = renderLeanDecision(row, NOW);
    expect(line).toMatch(/move past Stage 12/);
    expect(line).toContain('[ref chairman_approval:va1]');
  });

  it('omits the recommendation line when none is present', () => {
    const line = renderLeanDecision(baseSessionQuestion('dq2', 1, { title: 'open question' }), NOW);
    expect(line).not.toMatch(/Recommendation:/);
    expect(line).toContain('open question');
  });
});

describe('renderLeanDecisionEmail (FR-2/FR-3)', () => {
  it('subject is the standout [ACTION NEEDED - ADAM] + the decision title; primary leads', () => {
    const rows = [
      baseVentureApproval('va1', 12, 5, { title: 'Approve Acme' }),
      baseSessionQuestion('dq1', 1, { title: 'Decide S5 financial truth', recommendation: 'contract' }),
    ];
    const { subject, lines } = renderLeanDecisionEmail(rows, NOW, { primaryId: 'dq1' });
    expect(subject).toBe('[ACTION NEEDED - ADAM] Decide S5 financial truth (+1 more)');
    expect(lines[0]).toContain('Decide S5 financial truth'); // primary first
    expect(lines.length).toBe(2);
  });

  it('each pending decision renders by its ACTUAL type (mixed set)', () => {
    const rows = [
      baseSessionQuestion('dq1', 1, { title: 'a governance question' }),
      baseVentureApproval('va1', 7, 3, { title: 'Approve Beta' }),
    ];
    const { lines } = renderLeanDecisionEmail(rows, NOW, { primaryId: 'dq1' });
    const joined = lines.join('\n');
    expect(joined).toContain('Decide: “a governance question”');     // session_question framing
    expect(joined).toMatch(/move past Stage 7/);                      // venture framing
    expect(joined).toContain('[ref session_question:dq1]');
    expect(joined).toContain('[ref chairman_approval:va1]');
  });

  it('the rendered lines carry NONE of the hourly status-block markers', () => {
    const rows = [baseSessionQuestion('dq1', 1, { title: 'q', recommendation: 'r' })];
    const { subject, lines } = renderLeanDecisionEmail(rows, NOW, { primaryId: 'dq1' });
    const blob = subject + '\n' + lines.join('\n');
    for (const marker of ['Workers:', 'rung', 'meta', 'distance-to-quit', 'built', 'active idle']) {
      expect(blob.toLowerCase()).not.toContain(marker.toLowerCase());
    }
  });
});
