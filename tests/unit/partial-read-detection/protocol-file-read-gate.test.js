/**
 * Protocol File Read Gate Tests
 * SD-LEO-INFRA-DETECT-PARTIAL-PROTOCOL-001
 *
 * Tests for partial read warning and confirmation in protocol-file-read-gate.js
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  validateProtocolFileRead,
  getPartialReadDetails,
  recordPartialReadConfirmation,
  hasPartialReadConfirmation,
  clearProtocolFileReadState,
  markProtocolFileRead
} from '../../../scripts/modules/handoff/gates/protocol-file-read-gate.js';

// Test environment setup
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const SESSION_STATE_FILE = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');
const BACKUP_FILE = SESSION_STATE_FILE + '.test-backup';

// Helper to read session state
function readSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const content = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
      const cleanContent = content.replace(/^\uFEFF/, '');
      return JSON.parse(cleanContent);
    }
  } catch (e) {
    // Ignore
  }
  return {};
}

// Helper to write session state
function writeSessionState(state) {
  const dir = path.dirname(SESSION_STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

describe('Protocol File Read Gate - Partial Read Handling', () => {
  beforeEach(() => {
    // Backup existing state
    if (fs.existsSync(SESSION_STATE_FILE)) {
      fs.copyFileSync(SESSION_STATE_FILE, BACKUP_FILE);
    }
    // Reset state
    writeSessionState({});
  });

  afterEach(() => {
    // Restore backup
    if (fs.existsSync(BACKUP_FILE)) {
      fs.copyFileSync(BACKUP_FILE, SESSION_STATE_FILE);
      fs.unlinkSync(BACKUP_FILE);
    }
  });

  describe('getPartialReadDetails', () => {
    it('should return partial read details from new schema', () => {
      writeSessionState({
        protocolFilesRead: ['CLAUDE_EXEC.md'],
        protocolFileReadStatus: {
          'CLAUDE_EXEC.md': {
            readCount: 1,
            lastReadAt: '2026-01-30T10:00:00.000Z',
            lastReadWasPartial: true,
            lastPartialRead: {
              limit: 200,
              offset: 0,
              readAt: '2026-01-30T10:00:00.000Z'
            }
          }
        }
      });

      const details = getPartialReadDetails('CLAUDE_EXEC.md');
      expect(details).toBeDefined();
      expect(details.limit).toBe(200);
      expect(details.offset).toBe(0);
      expect(details.wasPartial).toBe(true);
    });

    it('should fall back to legacy schema', () => {
      writeSessionState({
        protocolFilesRead: ['CLAUDE_PLAN.md'],
        protocolFilesPartiallyRead: {
          'CLAUDE_PLAN.md': {
            limit: 100,
            offset: 50,
            timestamp: '2026-01-30T10:00:00.000Z',
            wasPartial: true
          }
        }
      });

      const details = getPartialReadDetails('CLAUDE_PLAN.md');
      expect(details).toBeDefined();
      expect(details.limit).toBe(100);
      expect(details.offset).toBe(50);
    });

    it('should return null for full reads', () => {
      writeSessionState({
        protocolFilesRead: ['CLAUDE_CORE.md'],
        protocolFileReadStatus: {
          'CLAUDE_CORE.md': {
            readCount: 1,
            lastReadAt: '2026-01-30T10:00:00.000Z',
            lastReadWasPartial: false,
            lastPartialRead: null
          }
        }
      });

      const details = getPartialReadDetails('CLAUDE_CORE.md');
      expect(details).toBeNull();
    });
  });

  describe('recordPartialReadConfirmation', () => {
    it('should add confirmation event to session state', () => {
      recordPartialReadConfirmation(['CLAUDE_EXEC.md'], 'test-agent');

      const state = readSessionState();
      expect(state.protocolReadConfirmations).toBeDefined();
      expect(state.protocolReadConfirmations.length).toBe(1);
      expect(state.protocolReadConfirmations[0].files).toContain('CLAUDE_EXEC.md');
      expect(state.protocolReadConfirmations[0].confirmedBy).toBe('test-agent');
    });

    it('should append multiple confirmations (append-only)', () => {
      recordPartialReadConfirmation(['CLAUDE_EXEC.md'], 'agent-1');
      recordPartialReadConfirmation(['CLAUDE_PLAN.md'], 'agent-2');

      const state = readSessionState();
      expect(state.protocolReadConfirmations.length).toBe(2);
    });
  });

  describe('hasPartialReadConfirmation', () => {
    it('should return true if file was confirmed', () => {
      recordPartialReadConfirmation(['CLAUDE_EXEC.md', 'CLAUDE_PLAN.md'], 'test-agent');

      expect(hasPartialReadConfirmation('CLAUDE_EXEC.md')).toBe(true);
      expect(hasPartialReadConfirmation('CLAUDE_PLAN.md')).toBe(true);
    });

    it('should return false if file was not confirmed', () => {
      expect(hasPartialReadConfirmation('CLAUDE_LEAD.md')).toBe(false);
    });
  });

  describe('TS-4: Gate warns and requires confirmation for partial reads', () => {
    it('should return requiresConfirmation=true when partial read detected without confirmation', async () => {
      // Setup: mark file as read with partial read details
      writeSessionState({
        protocolFilesRead: ['CLAUDE_EXEC.md'],
        protocolFileReadStatus: {
          'CLAUDE_EXEC.md': {
            readCount: 1,
            lastReadAt: '2026-01-30T10:00:00.000Z',
            lastReadWasPartial: true,
            lastPartialRead: {
              limit: 200,
              offset: 0,
              readAt: '2026-01-30T10:00:00.000Z'
            }
          }
        }
      });

      const result = await validateProtocolFileRead('EXEC-TO-PLAN', {});

      expect(result.pass).toBe(false);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.confirmationPrompt).toContain('CLAUDE_EXEC.md');
      expect(result.partialReadDetails).toBeDefined();
    });

    it('should include limit/offset in warning message', async () => {
      writeSessionState({
        protocolFilesRead: ['CLAUDE_PLAN.md'],
        protocolFileReadStatus: {
          'CLAUDE_PLAN.md': {
            readCount: 1,
            lastReadAt: '2026-01-30T10:00:00.000Z',
            lastReadWasPartial: true,
            lastPartialRead: {
              limit: 150,
              offset: 50,
              readAt: '2026-01-30T10:00:00.000Z'
            }
          }
        }
      });

      const result = await validateProtocolFileRead('PLAN-TO-EXEC', {});

      expect(result.warnings.some(w => w.includes('limit=150'))).toBe(true);
    });
  });

  describe('TS-5: Gate passes after confirmation and records audit event', () => {
    it('should pass with confirmFullRead=true and record confirmation', async () => {
      writeSessionState({
        protocolFilesRead: ['CLAUDE_EXEC.md'],
        protocolFileReadStatus: {
          'CLAUDE_EXEC.md': {
            readCount: 1,
            lastReadAt: '2026-01-30T10:00:00.000Z',
            lastReadWasPartial: true,
            lastPartialRead: {
              limit: 200,
              offset: 0,
              readAt: '2026-01-30T10:00:00.000Z'
            }
          }
        }
      });

      const result = await validateProtocolFileRead('EXEC-TO-PLAN', { confirmFullRead: true });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(85);

      // Verify confirmation was recorded
      const state = readSessionState();
      expect(state.protocolReadConfirmations.length).toBe(1);
      expect(state.protocolReadConfirmations[0].files).toContain('CLAUDE_EXEC.md');
    });

    it('should pass if previous confirmation exists', async () => {
      writeSessionState({
        protocolFilesRead: ['CLAUDE_LEAD.md'],
        protocolFileReadStatus: {
          'CLAUDE_LEAD.md': {
            readCount: 1,
            lastReadAt: '2026-01-30T10:00:00.000Z',
            lastReadWasPartial: true,
            lastPartialRead: {
              limit: 100,
              offset: 0,
              readAt: '2026-01-30T10:00:00.000Z'
            }
          }
        },
        protocolReadConfirmations: [{
          confirmedAt: '2026-01-30T10:05:00.000Z',
          confirmedBy: 'previous-run',
          files: ['CLAUDE_LEAD.md']
        }]
      });

      const result = await validateProtocolFileRead('LEAD-TO-PLAN', {});

      expect(result.pass).toBe(true);
      expect(result.score).toBe(85);
    });
  });

  describe('Full read passes without confirmation', () => {
    it('should pass with score 100 for full reads', async () => {
      writeSessionState({
        protocolFilesRead: ['CLAUDE_EXEC.md'],
        protocolFileReadStatus: {
          'CLAUDE_EXEC.md': {
            readCount: 1,
            lastReadAt: '2026-01-30T10:00:00.000Z',
            lastReadWasPartial: false,
            lastPartialRead: null
          }
        }
      });

      const result = await validateProtocolFileRead('EXEC-TO-PLAN', {});

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      expect(result.requiresConfirmation).toBeUndefined();
    });
  });

  describe('TS-6: Backward compatibility', () => {
    it('should handle session state missing new fields without crashing', async () => {
      writeSessionState({
        protocolFilesRead: ['CLAUDE_PLAN.md']
        // No protocolFileReadStatus or other new fields
      });

      const result = await validateProtocolFileRead('PLAN-TO-EXEC', {});

      // Should pass (no partial read evidence)
      expect(result.pass).toBe(true);
    });
  });

  describe('TS-7: Performance', () => {
    it('should evaluate gate within latency budget (<100ms)', async () => {
      // Setup with many tracked files
      const state = {
        protocolFilesRead: [],
        protocolFileReadStatus: {}
      };

      for (let i = 0; i < 100; i++) {
        state.protocolFilesRead.push(`file_${i}.md`);
        state.protocolFileReadStatus[`file_${i}.md`] = {
          readCount: 1,
          lastReadAt: new Date().toISOString(),
          lastReadWasPartial: false,
          lastPartialRead: null
        };
      }

      // Add the required file
      state.protocolFilesRead.push('CLAUDE_EXEC.md');
      state.protocolFileReadStatus['CLAUDE_EXEC.md'] = {
        readCount: 1,
        lastReadAt: new Date().toISOString(),
        lastReadWasPartial: false,
        lastPartialRead: null
      };

      writeSessionState(state);

      const start = Date.now();
      await validateProtocolFileRead('EXEC-TO-PLAN', {});
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Aggregated warnings for multiple files', () => {
    it('should list all affected files in warning', async () => {
      // This test verifies FR-5 requirement for aggregated warnings
      // In practice, the gate checks one file at a time per handoff type
      // but the warning format should be clear about which file is affected

      writeSessionState({
        protocolFilesRead: ['CLAUDE_EXEC.md'],
        protocolFileReadStatus: {
          'CLAUDE_EXEC.md': {
            readCount: 1,
            lastReadAt: '2026-01-30T10:00:00.000Z',
            lastReadWasPartial: true,
            lastPartialRead: {
              limit: 200,
              offset: null,
              readAt: '2026-01-30T10:00:00.000Z'
            }
          }
        }
      });

      const result = await validateProtocolFileRead('EXEC-TO-PLAN', {});

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('CLAUDE_EXEC.md'))).toBe(true);
    });
  });
});
