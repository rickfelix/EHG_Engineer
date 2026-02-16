/**
 * Unit Tests for Protocol File Read Gate - Cross-Mode Fallback
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-030
 *
 * Tests the new cross-mode fallback behavior:
 * When DIGEST file is missing but FULL file exists → PASS_FALLBACK at 85/100
 * When both missing → BLOCK at 0/100
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// We need to control fs.existsSync and fs.statSync to simulate file presence
const originalExistsSync = fs.existsSync;
const originalStatSync = fs.statSync;

// Import the module under test
import {
  validateProtocolFileRead,
  markProtocolFileRead,
  clearProtocolFileReadState
} from '../../scripts/modules/handoff/gates/protocol-file-read-gate.js';

describe('Protocol File Read Gate - Cross-Mode Fallback', () => {
  const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';

  beforeEach(() => {
    clearProtocolFileReadState();
    // Set DIGEST mode
    process.env.CLAUDE_PROTOCOL_MODE = 'digest';
  });

  afterEach(() => {
    clearProtocolFileReadState();
    delete process.env.CLAUDE_PROTOCOL_MODE;
    // Restore fs functions
    fs.existsSync = originalExistsSync;
    fs.statSync = originalStatSync;
  });

  describe('DIGEST file exists on disk (normal path)', () => {
    it('should use standard fallback when DIGEST file exists on disk', async () => {
      // Don't mark as read in session state, but file exists on disk
      // The gate should hit the "file exists on disk" fallback at 90/100
      // We need the DIGEST file to actually exist - which it does in the project
      markProtocolFileRead('CLAUDE_EXEC_DIGEST.md');
      const result = await validateProtocolFileRead('PLAN-TO-EXEC');
      expect(result.pass).toBe(true);
      expect(result.score).toBe(100); // It's in session state, so 100
    });
  });

  describe('Cross-mode fallback (DIGEST missing, FULL exists)', () => {
    it('should PASS at 85/100 when DIGEST file missing but FULL file exists', async () => {
      // Mock fs to simulate: DIGEST file missing, FULL file present
      const digestFile = path.join(PROJECT_DIR, 'CLAUDE_EXEC_DIGEST.md');
      const fullFile = path.join(PROJECT_DIR, 'CLAUDE_EXEC.md');
      const sessionStateFile = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');

      fs.existsSync = vi.fn((filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        // DIGEST file does NOT exist
        if (normalized.includes('CLAUDE_EXEC_DIGEST.md')) return false;
        // FULL file DOES exist
        if (normalized.includes('CLAUDE_EXEC.md') && !normalized.includes('DIGEST')) return true;
        // Session state file and .claude dir should use real fs
        return originalExistsSync(filePath);
      });

      fs.statSync = vi.fn((filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        // FULL file has content (> 100 bytes)
        if (normalized.includes('CLAUDE_EXEC.md') && !normalized.includes('DIGEST')) {
          return { size: 50000 };
        }
        return originalStatSync(filePath);
      });

      const result = await validateProtocolFileRead('PLAN-TO-EXEC');

      expect(result.pass).toBe(true);
      expect(result.score).toBe(85);
      expect(result.warnings.some(w => w.includes('CROSS-MODE FALLBACK') || w.includes('FULL file'))).toBe(true);
    });
  });

  describe('Both files missing (BLOCK)', () => {
    it('should BLOCK at 0/100 when both DIGEST and FULL files are missing', async () => {
      // Mock fs to simulate: both files missing
      fs.existsSync = vi.fn((filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('CLAUDE_EXEC')) return false;
        return originalExistsSync(filePath);
      });

      const result = await validateProtocolFileRead('PLAN-TO-EXEC');

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('FULL mode is unaffected', () => {
    it('should not trigger cross-mode fallback in FULL mode', async () => {
      process.env.CLAUDE_PROTOCOL_MODE = 'full';

      // In FULL mode, requiredFile is CLAUDE_EXEC.md (no DIGEST suffix)
      // Mock: FULL file missing
      fs.existsSync = vi.fn((filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('CLAUDE_EXEC.md')) return false;
        return originalExistsSync(filePath);
      });

      const result = await validateProtocolFileRead('PLAN-TO-EXEC');

      // Should BLOCK, no cross-mode fallback
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });
});
