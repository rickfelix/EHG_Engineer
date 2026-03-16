import { describe, it, expect, vi } from 'vitest';
import { createJournalEntry, processStage, runProvingLoop } from '../../../../lib/eva/proving/orchestrator.js';

describe('Proving Run Orchestrator', () => {
  describe('createJournalEntry', () => {
    it('creates entry without regression when no previous', () => {
      const entry = createJournalEntry({
        ventureId: 'v1', stageNumber: 1, runNumber: 1,
        assessment: { composite: 80, decision: 'PASS', dimensions: {}, gateType: 'default' },
      });
      expect(entry.ventureId).toBe('v1');
      expect(entry.composite).toBe(80);
      expect(entry.regression).toBe(false);
      expect(entry.previousComposite).toBeNull();
    });

    it('detects regression when score drops', () => {
      const entry = createJournalEntry({
        ventureId: 'v1', stageNumber: 1, runNumber: 2,
        assessment: { composite: 60, decision: 'REVISE', dimensions: {}, gateType: 'default' },
        previousEntry: { composite: 80 },
      });
      expect(entry.regression).toBe(true);
      expect(entry.improvement).toBe(-20);
      expect(entry.previousComposite).toBe(80);
    });

    it('detects improvement when score rises', () => {
      const entry = createJournalEntry({
        ventureId: 'v1', stageNumber: 1, runNumber: 2,
        assessment: { composite: 90, decision: 'PASS', dimensions: {}, gateType: 'default' },
        previousEntry: { composite: 70 },
      });
      expect(entry.regression).toBe(false);
      expect(entry.improvement).toBe(20);
    });
  });

  describe('processStage', () => {
    const goodStageData = {
      files: ['a.js'], lintPassing: true, typeCheckPassing: true, hasEntryPoint: true,
      migrations: ['001.sql'], schema: true, indexes: ['i1'], rls: true,
      endpoints: ['/api'], errorHandling: true, authentication: true, documentation: true,
      testFiles: ['t.js'], coverage: 90, allPassing: true, hasE2E: true,
      prd: true, architecture: true, userStories: ['US-1'], retrospective: true,
    };

    it('passes stage above threshold without fix', async () => {
      const result = await processStage({
        stageNumber: 1, stageData: goodStageData, ventureId: 'v1', runNumber: 1,
      });
      expect(result.escalated).toBe(false);
      expect(result.fixAttempted).toBe(false);
      expect(result.journal.composite).toBeGreaterThanOrEqual(70);
    });

    it('escalates when no fix pattern available', async () => {
      const result = await processStage({
        stageNumber: 1, stageData: {}, ventureId: 'v1', runNumber: 1,
      });
      expect(result.escalated).toBe(true);
      expect(result.fixAttempted).toBe(false);
      expect(result.reason).toBe('No fix pattern available');
    });
  });

  describe('runProvingLoop', () => {
    it('processes all stages and returns summary', async () => {
      const stageData = {
        files: ['a.js'], lintPassing: true, typeCheckPassing: true, hasEntryPoint: true,
        migrations: ['001.sql'], schema: true, indexes: ['i1'], rls: true,
        endpoints: ['/api'], errorHandling: true, authentication: true, documentation: true,
        testFiles: ['t.js'], coverage: 90, allPassing: true, hasE2E: true,
        prd: true, architecture: true, userStories: ['US-1'], retrospective: true,
      };

      const result = await runProvingLoop({
        ventureId: 'v1', runNumber: 1,
        getStageData: async () => stageData,
        startStage: 1, endStage: 3,
      });

      expect(result.journal).toHaveLength(3);
      expect(result.summary.totalStages).toBe(3);
      expect(result.summary.passed).toBe(3);
      expect(result.summary.escalated).toBe(0);
      expect(result.summary.overallScore).toBeGreaterThan(0);
    });

    it('escalates stages with no data', async () => {
      const result = await runProvingLoop({
        ventureId: 'v1', runNumber: 1,
        getStageData: async () => null,
        startStage: 1, endStage: 2,
      });

      expect(result.escalationQueue).toHaveLength(2);
      expect(result.summary.escalated).toBe(2);
      expect(result.summary.passed).toBe(0);
    });

    it('handles getStageData errors gracefully', async () => {
      const result = await runProvingLoop({
        ventureId: 'v1', runNumber: 1,
        getStageData: async () => { throw new Error('DB error'); },
        startStage: 1, endStage: 1,
      });

      expect(result.escalationQueue).toHaveLength(1);
      expect(result.escalationQueue[0].reason).toBe('Failed to load stage data');
    });

    it('supports resume from specific stage', async () => {
      const stageData = { files: ['a.js'], lintPassing: true, typeCheckPassing: true, hasEntryPoint: true, migrations: ['m.sql'], schema: true, indexes: ['i'], rls: true, endpoints: ['/a'], errorHandling: true, authentication: true, documentation: true, testFiles: ['t.js'], coverage: 90, allPassing: true, hasE2E: true, prd: true, architecture: true, userStories: ['US-1'], retrospective: true };
      const result = await runProvingLoop({
        ventureId: 'v1', runNumber: 1,
        getStageData: async () => stageData,
        startStage: 15, endStage: 17,
      });

      expect(result.journal).toHaveLength(3);
      expect(result.journal[0].stageNumber).toBe(15);
    });
  });
});
