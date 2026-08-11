// SD-LEO-INFRA-VENTURE-STATUS-LANGUAGE-001, FR-3 (TS-4).
//
// THE NEGATIVE CASE IS WRITTEN FIRST AND IS THE PRIMARY ASSERTION, per the PRD's own risk
// mitigation: a build-status-word regex that fires on unrelated prose is worse than no check at
// all (it would make the chairman's decision list noisier, not more honest). The positive case
// (the witnessed incident actually gets flagged) is the easy half.
import { describe, it, expect } from 'vitest';
import {
  renderItem,
  renderLeanDecision,
  ventureStatusContradictionNote,
} from '../../../lib/chairman/decision-layman.mjs';

const NOW = new Date('2026-08-11T01:00:00.000Z');

// The exact measured build status for the witnessed venture (Image Alt Text Generator),
// as lib/governance/venture-build-status.mjs's deriveVentureBuildStatus would return it.
const WITNESSED_STATUS = Object.freeze({
  status: 'not_started',
  evidence: { workflow_status: 'pending', real_build_started: false },
  measured_at: '2026-08-11T00:30:00.000Z',
});
const LIVE_STATUS = Object.freeze({
  status: 'live',
  evidence: { workflow_status: 'completed', real_build_started: true },
  measured_at: '2026-08-11T00:30:00.000Z',
});

describe('ventureStatusContradictionNote — negative cases FIRST (must never false-positive)', () => {
  it('no venture_build_status attached (unrelated row / no venture_id) -- always empty, regardless of prose', () => {
    expect(ventureStatusContradictionNote({}, 'the venture is built and live and deployed')).toBe('');
  });

  it('venture_build_status attached but prose has no build-status word -- empty', () => {
    expect(ventureStatusContradictionNote({ venture_build_status: WITNESSED_STATUS }, 'please review this escalation')).toBe('');
  });

  it('"waiting" alone does NOT trigger -- this module\'s own template vocabulary for elapsed time, not a build claim', () => {
    expect(ventureStatusContradictionNote({ venture_build_status: WITNESSED_STATUS }, 'waiting 9d for a decision')).toBe('');
  });

  it('"ready" alone does NOT trigger -- common benign phrasing unrelated to build state', () => {
    expect(ventureStatusContradictionNote({ venture_build_status: WITNESSED_STATUS }, 'ready for chairman review')).toBe('');
  });

  it('build-status word present but venture_build_status is unknown -- empty (cannot flag what was not measured)', () => {
    expect(ventureStatusContradictionNote({ venture_build_status: { status: 'unknown' } }, 'the venture is built')).toBe('');
  });

  it('prose says "built" and factory AGREES (live) -- empty, no spurious annotation', () => {
    expect(ventureStatusContradictionNote({ venture_build_status: LIVE_STATUS }, 'the venture is built and deployed')).toBe('');
  });
});

describe('ventureStatusContradictionNote — positive control (TS-4)', () => {
  it('the witnessed shape: prose says "built and waiting", factory says not_started -- flags the contradiction', () => {
    const note = ventureStatusContradictionNote({ venture_build_status: WITNESSED_STATUS }, 'the venture is built and waiting for review');
    expect(note).not.toBe('');
    expect(note).toMatch(/not started/i);
    expect(note).toContain(WITNESSED_STATUS.measured_at);
  });

  it('"deployed" and "live" also trigger the check (not just "built")', () => {
    expect(ventureStatusContradictionNote({ venture_build_status: WITNESSED_STATUS }, 'already deployed')).not.toBe('');
    expect(ventureStatusContradictionNote({ venture_build_status: WITNESSED_STATUS }, 'it is live now')).not.toBe('');
  });
});

describe('renderItem integration — flag_review/escalation carry venture_build_status', () => {
  it('negative: an unrelated flag_review renders byte-identical with or without an attached (non-contradicting) status', () => {
    const row = { decision_type: 'flag_review', id: 'fb-1', title: 'Investigate slow query on users table', priority: 'high', created_at: NOW.toISOString() };
    const item = { type: 'flag_review', kind: 'single', rows: [row] };
    const withoutStatus = renderItem(item, NOW);
    const withAgreeing = renderItem({ type: 'flag_review', kind: 'single', rows: [{ ...row, venture_build_status: LIVE_STATUS }] }, NOW);
    expect(withoutStatus).toBe(withAgreeing); // no build-status word in this title, so attaching a status changes nothing
    expect(withoutStatus).not.toMatch(/factory state says/);
  });

  it('positive: a flag_review whose title asserts "built and waiting" for the witnessed venture surfaces factory truth', () => {
    const row = {
      decision_type: 'flag_review',
      id: 'fb-2',
      title: 'Image Alt Text Generator is built and waiting for chairman review',
      priority: 'high',
      created_at: NOW.toISOString(),
      venture_build_status: WITNESSED_STATUS,
    };
    const item = { type: 'flag_review', kind: 'single', rows: [row] };
    const line = renderItem(item, NOW);
    expect(line).toMatch(/factory state says not started/);
    // The ref token must still be the true trailing token (CLI-parseable handle preserved).
    expect(line.trimEnd().endsWith('[ref flag_review:fb-2]')).toBe(true);
  });

  it('grouped types (chairman_approval) are unaffected -- no free text to scan, no venture_build_status lookup attempted', () => {
    const rows = [{ decision_type: 'chairman_approval', id: 'ca-1', venture_name: 'X', stage: 3, created_at: NOW.toISOString(), venture_build_status: WITNESSED_STATUS }];
    const item = { type: 'chairman_approval', kind: 'single', rows };
    const line = renderItem(item, NOW);
    expect(line).not.toMatch(/factory state says/);
  });
});

describe('renderLeanDecision integration', () => {
  it('negative: a decision with no venture_build_status renders byte-identical to pre-SD behavior', () => {
    const row = { id: 'd-1', decision_type: 'session_question', summary: 'Should we raise the price?', created_at: NOW.toISOString() };
    const line = renderLeanDecision(row, NOW);
    expect(line).not.toMatch(/factory state says/);
    expect(line).toContain('[ref session_question:d-1]');
  });

  it('negative: a non-venture decision whose recommendation happens to contain "ready" does not false-positive', () => {
    const row = { id: 'd-2', decision_type: 'session_question', summary: 'Approve the release checklist', brief_data: { recommendation: 'proceed once QA is ready' }, created_at: NOW.toISOString(), venture_build_status: WITNESSED_STATUS };
    const line = renderLeanDecision(row, NOW);
    expect(line).not.toMatch(/factory state says/);
  });

  it('positive: the witnessed shape via brief_data.title surfaces factory truth, ref stays trailing', () => {
    const row = {
      id: 'd-3',
      decision_type: 'session_question',
      venture_id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9',
      brief_data: { title: 'Image Alt Text Generator is built and waiting' },
      created_at: NOW.toISOString(),
      venture_build_status: WITNESSED_STATUS,
    };
    const line = renderLeanDecision(row, NOW);
    expect(line).toMatch(/factory state says not started/);
    expect(line.trimEnd().endsWith('[ref session_question:d-3]')).toBe(true);
  });

  it('positive: a true venture-approval branch (isVentureApproval) also surfaces the contradiction', () => {
    const row = {
      id: 'd-4',
      decision_type: 'chairman_approval',
      venture_id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9',
      lifecycle_stage: 7,
      brief_data: { title: 'built and ready to ship' },
      created_at: NOW.toISOString(),
      venture_build_status: WITNESSED_STATUS,
    };
    const line = renderLeanDecision(row, NOW);
    expect(line).toMatch(/factory state says not started/);
    expect(line.trimEnd().endsWith('[ref chairman_approval:d-4]')).toBe(true);
  });
});
