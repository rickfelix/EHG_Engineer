/**
 * Tests for scripts/ci/no-self-approval-chairman-decisions.mjs
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F FR-2.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findSelfApprovalWrites,
  scanDirectoryForSelfApproval,
} from '../../../scripts/ci/no-self-approval-chairman-decisions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('findSelfApprovalWrites', () => {
  it('flags the real multi-line self-approval shape (from and update on separate lines)', () => {
    const source = `
      await supabase
        .from('chairman_decisions')
        .update({ status: 'approved', decision: 'approve', resolved_at: new Date().toISOString() })
        .eq('id', decisionId);
    `;
    const matches = findSelfApprovalWrites(source);
    expect(matches.length).toBe(1);
  });

  it('flags when only status:"approved" is set (no decision field)', () => {
    const source = `
      await supabase
        .from('chairman_decisions')
        .update({ status: 'approved' })
        .eq('id', decisionId);
    `;
    expect(findSelfApprovalWrites(source).length).toBe(1);
  });

  it('flags when only decision:"approve" is set (no status field)', () => {
    const source = `
      await supabase
        .from('chairman_decisions')
        .update({ decision: 'approve' })
        .eq('id', decisionId);
    `;
    expect(findSelfApprovalWrites(source).length).toBe(1);
  });

  it('does NOT flag a legitimate SELECT against chairman_decisions', () => {
    const source = `
      const { data, error } = await supabase
        .from('chairman_decisions')
        .select('id, decision, summary, status')
        .eq('venture_id', ventureId)
        .in('decision', APPROVED_DECISIONS)
        .limit(1);
    `;
    expect(findSelfApprovalWrites(source).length).toBe(0);
  });

  it('does NOT flag an UPDATE that sets an unrelated field (e.g. brief_data on a pending row)', () => {
    const source = `
      await supabase
        .from('chairman_decisions')
        .update({ brief_data: briefData, health_score: 80 })
        .eq('id', decisionId);
    `;
    expect(findSelfApprovalWrites(source).length).toBe(0);
  });

  it('does NOT flag an UPDATE to a different table that happens to mention chairman_decisions in a comment', () => {
    const source = `
      // creates a chairman_decisions row elsewhere
      await supabase
        .from('other_table')
        .update({ status: 'approved' })
        .eq('id', x);
    `;
    expect(findSelfApprovalWrites(source).length).toBe(0);
  });

  it('returns zero matches on an empty/no-touch file', () => {
    expect(findSelfApprovalWrites('export function foo() { return 1; }')).toEqual([]);
  });
});

describe('scanDirectoryForSelfApproval', () => {
  it('finds zero offenders in the real lib/eva/stage-templates/analysis-steps/ directory (post C4.1 fix)', () => {
    const dir = path.join(REPO_ROOT, 'lib/eva/stage-templates/analysis-steps');
    const offenders = scanDirectoryForSelfApproval(dir);
    expect(offenders).toEqual([]);
  });

  it('does not false-positive on stage-22-distribution-setup.js\'s real legitimate chairman_decisions calls', () => {
    const filePath = path.join(REPO_ROOT, 'lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js');
    const text = fs.readFileSync(filePath, 'utf8');
    expect(findSelfApprovalWrites(text)).toEqual([]);
  });

  it('flags a synthetic offender file via dependency injection (no real file touched)', () => {
    const offenderSource = `
      await supabase
        .from('chairman_decisions')
        .update({ status: 'approved', decision: 'approve' })
        .eq('id', decisionId);
    `;
    const io = {
      readdirSync: () => ['fake-offender.js', 'fake-clean.js'],
      readFileSync: (filePath) => (String(filePath).includes('fake-offender') ? offenderSource : 'export const x = 1;'),
    };
    const offenders = scanDirectoryForSelfApproval('/fake/dir', io);
    expect(offenders.length).toBe(1);
    expect(offenders[0].file).toContain('fake-offender.js');
  });
});
