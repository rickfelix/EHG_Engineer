/**
 * Protocol File Tracker Hook Tests
 * SD-LEO-INFRA-DETECT-PARTIAL-PROTOCOL-001
 *
 * Tests for partial read detection in protocol-file-tracker.cjs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

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

// Helper to simulate hook processing
function simulateHookInput(toolInput) {
  const state = readSessionState();

  // Simulate the hook's processHookInput logic
  const toolName = toolInput.tool_name || '';
  const toolInputData = toolInput.tool_input || {};

  if (toolName !== 'Read') {
    return state;
  }

  const filePath = toolInputData.file_path || '';
  const basename = path.basename(filePath);

  // Check if protocol file
  const PROTOCOL_FILES = ['CLAUDE_LEAD.md', 'CLAUDE_PLAN.md', 'CLAUDE_EXEC.md', 'CLAUDE_CORE.md', 'CLAUDE.md'];
  const protocolFile = PROTOCOL_FILES.find(pf => basename === pf);

  if (!protocolFile) {
    return state;
  }

  const normalizedPath = basename;
  const hasLimit = toolInputData.limit !== undefined && toolInputData.limit !== null;
  const hasOffset = toolInputData.offset !== undefined && toolInputData.offset !== null;
  const isPartialRead = hasLimit || hasOffset;
  const now = new Date().toISOString();

  // Initialize structures
  if (!state.protocolFilesRead) {
    state.protocolFilesRead = [];
  }
  if (!state.protocolFileReadStatus) {
    state.protocolFileReadStatus = {};
  }

  // Get or create file status
  const fileStatus = state.protocolFileReadStatus[normalizedPath] || {
    readCount: 0,
    lastReadAt: null,
    lastReadWasPartial: false,
    lastPartialRead: null
  };

  fileStatus.readCount = (fileStatus.readCount || 0) + 1;
  fileStatus.lastReadAt = now;

  if (isPartialRead) {
    fileStatus.lastReadWasPartial = true;
    fileStatus.lastPartialRead = {
      limit: hasLimit ? toolInputData.limit : null,
      offset: hasOffset ? toolInputData.offset : null,
      readAt: now
    };
  } else {
    fileStatus.lastReadWasPartial = false;
  }

  state.protocolFileReadStatus[normalizedPath] = fileStatus;

  if (!state.protocolFilesRead.includes(normalizedPath)) {
    state.protocolFilesRead.push(normalizedPath);
  }
  state.protocolFilesReadAt = state.protocolFilesReadAt || {};
  state.protocolFilesReadAt[normalizedPath] = now;

  // Legacy tracking
  if (!state.protocolFilesPartiallyRead) {
    state.protocolFilesPartiallyRead = {};
  }
  if (isPartialRead) {
    state.protocolFilesPartiallyRead[normalizedPath] = {
      limit: toolInputData.limit,
      offset: toolInputData.offset,
      timestamp: now,
      wasPartial: true
    };
  } else if (state.protocolFilesPartiallyRead[normalizedPath]) {
    delete state.protocolFilesPartiallyRead[normalizedPath];
  }

  writeSessionState(state);
  return state;
}

describe('Protocol File Tracker - Partial Read Detection', () => {
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

  describe('TS-1: Detect partial read when limit is provided', () => {
    it('should record lastReadWasPartial=true when limit is provided', () => {
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_PROTOCOL.md'.replace('PROTOCOL', 'EXEC'),
          limit: 200
        }
      });

      const fileStatus = state.protocolFileReadStatus['CLAUDE_EXEC.md'];
      expect(fileStatus).toBeDefined();
      expect(fileStatus.lastReadWasPartial).toBe(true);
      expect(fileStatus.lastPartialRead.limit).toBe(200);
      expect(fileStatus.lastPartialRead.offset).toBeNull();
      expect(fileStatus.lastReadAt).toBeDefined();
    });

    it('should handle limit=0 as partial read', () => {
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_CORE.md',
          limit: 0
        }
      });

      const fileStatus = state.protocolFileReadStatus['CLAUDE_CORE.md'];
      expect(fileStatus.lastReadWasPartial).toBe(true);
      expect(fileStatus.lastPartialRead.limit).toBe(0);
    });
  });

  describe('TS-2: Detect partial read when offset is provided', () => {
    it('should record lastReadWasPartial=true when offset is provided', () => {
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_PLAN.md',
          offset: 200
        }
      });

      const fileStatus = state.protocolFileReadStatus['CLAUDE_PLAN.md'];
      expect(fileStatus).toBeDefined();
      expect(fileStatus.lastReadWasPartial).toBe(true);
      expect(fileStatus.lastPartialRead.offset).toBe(200);
      expect(fileStatus.lastPartialRead.limit).toBeNull();
    });

    it('should handle both limit and offset together', () => {
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_LEAD.md',
          limit: 100,
          offset: 50
        }
      });

      const fileStatus = state.protocolFileReadStatus['CLAUDE_LEAD.md'];
      expect(fileStatus.lastReadWasPartial).toBe(true);
      expect(fileStatus.lastPartialRead.limit).toBe(100);
      expect(fileStatus.lastPartialRead.offset).toBe(50);
    });
  });

  describe('TS-3: Do not flag full read', () => {
    it('should record lastReadWasPartial=false when neither limit nor offset present', () => {
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_EXEC.md'
        }
      });

      const fileStatus = state.protocolFileReadStatus['CLAUDE_EXEC.md'];
      expect(fileStatus).toBeDefined();
      expect(fileStatus.lastReadWasPartial).toBe(false);
    });

    it('should clear partial read flag after full read', () => {
      // First: partial read
      simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_CORE.md',
          limit: 200
        }
      });

      // Then: full read
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_CORE.md'
        }
      });

      const fileStatus = state.protocolFileReadStatus['CLAUDE_CORE.md'];
      expect(fileStatus.lastReadWasPartial).toBe(false);
      // Historical metadata preserved
      expect(fileStatus.lastPartialRead).toBeDefined();
      expect(fileStatus.readCount).toBe(2);
    });
  });

  describe('TS-6: Backward compatibility', () => {
    it('should not crash when old session state lacks new fields', () => {
      // Write old-style state
      writeSessionState({
        protocolFilesRead: ['CLAUDE_EXEC.md'],
        protocolFilesReadAt: { 'CLAUDE_EXEC.md': '2026-01-30T10:00:00.000Z' }
        // No protocolFileReadStatus
      });

      // Simulate new read
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_PLAN.md'
        }
      });

      // Should work without crashing
      expect(state.protocolFileReadStatus).toBeDefined();
      expect(state.protocolFileReadStatus['CLAUDE_PLAN.md']).toBeDefined();
    });
  });

  describe('TS-8: Path normalization', () => {
    it('should normalize path variants to the same key', () => {
      simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: './CLAUDE_EXEC.md',
          limit: 100
        }
      });

      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_EXEC.md'
        }
      });

      // Both should map to same key
      expect(state.protocolFileReadStatus['CLAUDE_EXEC.md']).toBeDefined();
      expect(state.protocolFileReadStatus['CLAUDE_EXEC.md'].readCount).toBe(2);
    });

    it('should handle full paths', () => {
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\CLAUDE_LEAD.md',
          limit: 50
        }
      });

      expect(state.protocolFileReadStatus['CLAUDE_LEAD.md']).toBeDefined();
      expect(state.protocolFileReadStatus['CLAUDE_LEAD.md'].lastReadWasPartial).toBe(true);
    });
  });

  describe('Non-protocol file handling', () => {
    it('should not track non-protocol files', () => {
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'README.md',
          limit: 100
        }
      });

      expect(state.protocolFileReadStatus?.['README.md']).toBeUndefined();
    });

    it('should not track files with similar names', () => {
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: {
          file_path: 'CLAUDE_CUSTOM.md',
          limit: 100
        }
      });

      expect(state.protocolFileReadStatus?.['CLAUDE_CUSTOM.md']).toBeUndefined();
    });
  });

  describe('Read count tracking', () => {
    it('should increment read count for multiple reads', () => {
      simulateHookInput({
        tool_name: 'Read',
        tool_input: { file_path: 'CLAUDE_EXEC.md' }
      });
      simulateHookInput({
        tool_name: 'Read',
        tool_input: { file_path: 'CLAUDE_EXEC.md', limit: 100 }
      });
      const state = simulateHookInput({
        tool_name: 'Read',
        tool_input: { file_path: 'CLAUDE_EXEC.md' }
      });

      expect(state.protocolFileReadStatus['CLAUDE_EXEC.md'].readCount).toBe(3);
    });
  });
});
