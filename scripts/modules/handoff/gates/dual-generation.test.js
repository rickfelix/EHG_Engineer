/**
 * Dual Generation Tests
 * SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001
 *
 * Tests for DIGEST mode support in protocol gates and
 * token budget enforcement in file generation.
 *
 * @module dual-generation.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

// Import core-protocol-gate functions
import coreProtocolGate from './core-protocol-gate.js';

// Import protocol-file-read-gate default export
import protocolFileReadGate from './protocol-file-read-gate.js';

describe('Dual Generation - Core Protocol Gate Exports', () => {
  it('should export mode helper functions', () => {
    expect(coreProtocolGate.getProtocolMode).toBeDefined();
    expect(typeof coreProtocolGate.getProtocolMode).toBe('function');

    expect(coreProtocolGate.getProtocolFilename).toBeDefined();
    expect(typeof coreProtocolGate.getProtocolFilename).toBe('function');

    expect(coreProtocolGate.getFullFilename).toBeDefined();
    expect(typeof coreProtocolGate.getFullFilename).toBe('function');
  });

  it('should export mode-specific constants', () => {
    expect(coreProtocolGate.CORE_PROTOCOL_REQUIREMENTS_FULL).toBeDefined();
    expect(coreProtocolGate.CORE_PROTOCOL_REQUIREMENTS_DIGEST).toBeDefined();
    expect(coreProtocolGate.PHASE_PROTOCOL_FILES_FULL).toBeDefined();
    expect(coreProtocolGate.PHASE_PROTOCOL_FILES_DIGEST).toBeDefined();
    expect(coreProtocolGate.HANDOFF_PHASE_FILES_FULL).toBeDefined();
    expect(coreProtocolGate.HANDOFF_PHASE_FILES_DIGEST).toBeDefined();
  });

  it('should export getter functions for mode-aware requirements', () => {
    expect(coreProtocolGate.getCoreProtocolRequirements).toBeDefined();
    expect(typeof coreProtocolGate.getCoreProtocolRequirements).toBe('function');

    expect(coreProtocolGate.getPhaseProtocolFiles).toBeDefined();
    expect(typeof coreProtocolGate.getPhaseProtocolFiles).toBe('function');

    expect(coreProtocolGate.getHandoffPhaseFiles).toBeDefined();
    expect(typeof coreProtocolGate.getHandoffPhaseFiles).toBe('function');
  });

  it('should maintain backward-compatible legacy exports', () => {
    expect(coreProtocolGate.CORE_PROTOCOL_REQUIREMENTS).toBeDefined();
    expect(coreProtocolGate.PHASE_PROTOCOL_FILES).toBeDefined();
    expect(coreProtocolGate.HANDOFF_PHASE_FILES).toBeDefined();
  });
});

describe('Dual Generation - Protocol Mode Detection', () => {
  const originalEnv = process.env.CLAUDE_PROTOCOL_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_PROTOCOL_MODE;
    } else {
      process.env.CLAUDE_PROTOCOL_MODE = originalEnv;
    }
  });

  it('should default to digest mode when env var not set', () => {
    delete process.env.CLAUDE_PROTOCOL_MODE;
    const mode = coreProtocolGate.getProtocolMode();
    expect(mode).toBe('digest');
  });

  it('should return full mode when CLAUDE_PROTOCOL_MODE=full', () => {
    process.env.CLAUDE_PROTOCOL_MODE = 'full';
    const mode = coreProtocolGate.getProtocolMode();
    expect(mode).toBe('full');
  });

  it('should return full mode (case insensitive)', () => {
    process.env.CLAUDE_PROTOCOL_MODE = 'FULL';
    const mode = coreProtocolGate.getProtocolMode();
    expect(mode).toBe('full');
  });

  it('should default to digest for any other value', () => {
    process.env.CLAUDE_PROTOCOL_MODE = 'invalid';
    const mode = coreProtocolGate.getProtocolMode();
    expect(mode).toBe('digest');
  });
});

describe('Dual Generation - Filename Helpers', () => {
  it('should convert filename to DIGEST version', () => {
    const result = coreProtocolGate.getProtocolFilename('CLAUDE_CORE.md');
    // Default mode is digest
    expect(result).toBe('CLAUDE_CORE_DIGEST.md');
  });

  it('should convert DIGEST filename to FULL version', () => {
    const result = coreProtocolGate.getFullFilename('CLAUDE_CORE_DIGEST.md');
    expect(result).toBe('CLAUDE_CORE.md');
  });

  it('should convert CLAUDE_LEAD_DIGEST.md to CLAUDE_LEAD.md', () => {
    expect(coreProtocolGate.getFullFilename('CLAUDE_LEAD_DIGEST.md'))
      .toBe('CLAUDE_LEAD.md');
  });

  it('should convert CLAUDE_PLAN_DIGEST.md to CLAUDE_PLAN.md', () => {
    expect(coreProtocolGate.getFullFilename('CLAUDE_PLAN_DIGEST.md'))
      .toBe('CLAUDE_PLAN.md');
  });

  it('should convert CLAUDE_EXEC_DIGEST.md to CLAUDE_EXEC.md', () => {
    expect(coreProtocolGate.getFullFilename('CLAUDE_EXEC_DIGEST.md'))
      .toBe('CLAUDE_EXEC.md');
  });
});

describe('Dual Generation - Requirement Constants', () => {
  it('should have DIGEST requirements use _DIGEST suffix', () => {
    const digestReqs = coreProtocolGate.CORE_PROTOCOL_REQUIREMENTS_DIGEST;

    expect(digestReqs.SD_START).toContain('CLAUDE_DIGEST.md');
    expect(digestReqs.SD_START).toContain('CLAUDE_CORE_DIGEST.md');
    expect(digestReqs.POST_COMPACTION).toContain('CLAUDE_DIGEST.md');
    expect(digestReqs.POST_COMPACTION).toContain('CLAUDE_CORE_DIGEST.md');
    expect(digestReqs.SESSION_START).toContain('CLAUDE_DIGEST.md');
    expect(digestReqs.SESSION_START).toContain('CLAUDE_CORE_DIGEST.md');
  });

  it('should have FULL requirements without _DIGEST suffix', () => {
    const fullReqs = coreProtocolGate.CORE_PROTOCOL_REQUIREMENTS_FULL;

    expect(fullReqs.SD_START).toContain('CLAUDE.md');
    expect(fullReqs.SD_START).toContain('CLAUDE_CORE.md');
    expect(fullReqs.SD_START.every(f => !f.includes('_DIGEST'))).toBe(true);
  });

  it('should have DIGEST phase files use _DIGEST suffix', () => {
    const digestPhaseFiles = coreProtocolGate.PHASE_PROTOCOL_FILES_DIGEST;

    expect(digestPhaseFiles.LEAD).toBe('CLAUDE_LEAD_DIGEST.md');
    expect(digestPhaseFiles.PLAN).toBe('CLAUDE_PLAN_DIGEST.md');
    expect(digestPhaseFiles.EXEC).toBe('CLAUDE_EXEC_DIGEST.md');
  });

  it('should have FULL phase files without _DIGEST suffix', () => {
    const fullPhaseFiles = coreProtocolGate.PHASE_PROTOCOL_FILES_FULL;

    expect(fullPhaseFiles.LEAD).toBe('CLAUDE_LEAD.md');
    expect(fullPhaseFiles.PLAN).toBe('CLAUDE_PLAN.md');
    expect(fullPhaseFiles.EXEC).toBe('CLAUDE_EXEC.md');
  });

  it('should have DIGEST handoff files use _DIGEST suffix', () => {
    const digestHandoff = coreProtocolGate.HANDOFF_PHASE_FILES_DIGEST;

    expect(digestHandoff['LEAD-TO-PLAN']).toBe('CLAUDE_PLAN_DIGEST.md');
    expect(digestHandoff['PLAN-TO-EXEC']).toBe('CLAUDE_EXEC_DIGEST.md');
    expect(digestHandoff['EXEC-TO-PLAN']).toBe('CLAUDE_PLAN_DIGEST.md');
    expect(digestHandoff['PLAN-TO-LEAD']).toBe('CLAUDE_LEAD_DIGEST.md');
  });
});

describe('Dual Generation - Mode-Aware Getters', () => {
  const originalEnv = process.env.CLAUDE_PROTOCOL_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_PROTOCOL_MODE;
    } else {
      process.env.CLAUDE_PROTOCOL_MODE = originalEnv;
    }
  });

  it('should return DIGEST requirements when mode is digest', () => {
    delete process.env.CLAUDE_PROTOCOL_MODE;
    const reqs = coreProtocolGate.getCoreProtocolRequirements();

    expect(reqs.SD_START).toContain('CLAUDE_DIGEST.md');
    expect(reqs.SD_START).toContain('CLAUDE_CORE_DIGEST.md');
  });

  it('should return FULL requirements when mode is full', () => {
    process.env.CLAUDE_PROTOCOL_MODE = 'full';
    const reqs = coreProtocolGate.getCoreProtocolRequirements();

    expect(reqs.SD_START).toContain('CLAUDE.md');
    expect(reqs.SD_START).toContain('CLAUDE_CORE.md');
    expect(reqs.SD_START.every(f => !f.includes('_DIGEST'))).toBe(true);
  });

  it('should return DIGEST phase files when mode is digest', () => {
    delete process.env.CLAUDE_PROTOCOL_MODE;
    const files = coreProtocolGate.getPhaseProtocolFiles();

    expect(files.LEAD).toBe('CLAUDE_LEAD_DIGEST.md');
  });

  it('should return FULL phase files when mode is full', () => {
    process.env.CLAUDE_PROTOCOL_MODE = 'full';
    const files = coreProtocolGate.getPhaseProtocolFiles();

    expect(files.LEAD).toBe('CLAUDE_LEAD.md');
  });

  it('should return DIGEST handoff files when mode is digest', () => {
    delete process.env.CLAUDE_PROTOCOL_MODE;
    const files = coreProtocolGate.getHandoffPhaseFiles();

    expect(files['LEAD-TO-PLAN']).toBe('CLAUDE_PLAN_DIGEST.md');
  });

  it('should return FULL handoff files when mode is full', () => {
    process.env.CLAUDE_PROTOCOL_MODE = 'full';
    const files = coreProtocolGate.getHandoffPhaseFiles();

    expect(files['LEAD-TO-PLAN']).toBe('CLAUDE_PLAN.md');
  });
});

describe('Dual Generation - DIGEST Files Exist', () => {
  it('should have CLAUDE_DIGEST.md file', () => {
    const filePath = path.join(PROJECT_ROOT, 'CLAUDE_DIGEST.md');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should have CLAUDE_CORE_DIGEST.md file', () => {
    const filePath = path.join(PROJECT_ROOT, 'CLAUDE_CORE_DIGEST.md');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should have CLAUDE_LEAD_DIGEST.md file', () => {
    const filePath = path.join(PROJECT_ROOT, 'CLAUDE_LEAD_DIGEST.md');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should have CLAUDE_PLAN_DIGEST.md file', () => {
    const filePath = path.join(PROJECT_ROOT, 'CLAUDE_PLAN_DIGEST.md');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should have CLAUDE_EXEC_DIGEST.md file', () => {
    const filePath = path.join(PROJECT_ROOT, 'CLAUDE_EXEC_DIGEST.md');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe('Dual Generation - Token Budget Enforcement', () => {
  const TOKEN_BUDGET = 25000;
  const CHARS_PER_TOKEN = 4;

  function estimateTokens(content) {
    return Math.ceil(content.length / CHARS_PER_TOKEN);
  }

  it('should have all DIGEST files combined under token budget', () => {
    const digestFiles = [
      'CLAUDE_DIGEST.md',
      'CLAUDE_CORE_DIGEST.md',
      'CLAUDE_LEAD_DIGEST.md',
      'CLAUDE_PLAN_DIGEST.md',
      'CLAUDE_EXEC_DIGEST.md'
    ];

    let totalTokens = 0;
    for (const filename of digestFiles) {
      const filePath = path.join(PROJECT_ROOT, filename);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        totalTokens += estimateTokens(content);
      }
    }

    expect(totalTokens).toBeLessThan(TOKEN_BUDGET);
    console.log(`   Total DIGEST tokens: ${totalTokens} (${Math.round(totalTokens / TOKEN_BUDGET * 100)}% of budget)`);
  });

  it('should have DIGEST files significantly smaller than FULL files', () => {
    const pairs = [
      ['CLAUDE.md', 'CLAUDE_DIGEST.md'],
      ['CLAUDE_CORE.md', 'CLAUDE_CORE_DIGEST.md'],
      ['CLAUDE_LEAD.md', 'CLAUDE_LEAD_DIGEST.md'],
      ['CLAUDE_PLAN.md', 'CLAUDE_PLAN_DIGEST.md'],
      ['CLAUDE_EXEC.md', 'CLAUDE_EXEC_DIGEST.md']
    ];

    for (const [fullFile, digestFile] of pairs) {
      const fullPath = path.join(PROJECT_ROOT, fullFile);
      const digestPath = path.join(PROJECT_ROOT, digestFile);

      if (fs.existsSync(fullPath) && fs.existsSync(digestPath)) {
        const fullSize = fs.statSync(fullPath).size;
        const digestSize = fs.statSync(digestPath).size;

        // DIGEST should be at least 50% smaller
        expect(digestSize).toBeLessThan(fullSize * 0.5);
      }
    }
  });
});

describe('Dual Generation - Manifest File', () => {
  const manifestPath = path.join(PROJECT_ROOT, 'claude-generation-manifest.json');

  it('should have manifest file', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('should have valid JSON in manifest', () => {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    expect(manifest.generated_at).toBeDefined();
    expect(manifest.git_commit).toBeDefined();
    expect(manifest.db_snapshot_hash).toBeDefined();
    expect(manifest.files).toBeDefined();
  });

  it('should have both FULL and DIGEST files in manifest', () => {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    // Check FULL files
    expect(manifest.files['CLAUDE.md']).toBeDefined();
    expect(manifest.files['CLAUDE.md'].type).toBe('full');

    // Check DIGEST files
    expect(manifest.files['CLAUDE_DIGEST.md']).toBeDefined();
    expect(manifest.files['CLAUDE_DIGEST.md'].type).toBe('digest');
  });

  it('should have content hashes for all files', () => {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    for (const [_filename, fileInfo] of Object.entries(manifest.files)) {
      expect(fileInfo.content_hash).toBeDefined();
      expect(typeof fileInfo.content_hash).toBe('string');
      expect(fileInfo.content_hash.length).toBe(16);
    }
  });

  it('should have token estimates for all files', () => {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    for (const [_filename, fileInfo] of Object.entries(manifest.files)) {
      expect(fileInfo.estimated_tokens).toBeDefined();
      expect(typeof fileInfo.estimated_tokens).toBe('number');
      expect(fileInfo.estimated_tokens).toBeGreaterThan(0);
    }
  });
});

describe('Dual Generation - Protocol File Read Gate', () => {
  const originalEnv = process.env.CLAUDE_PROTOCOL_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_PROTOCOL_MODE;
    } else {
      process.env.CLAUDE_PROTOCOL_MODE = originalEnv;
    }
  });

  it('should return DIGEST file for LEAD-TO-PLAN handoff by default', () => {
    delete process.env.CLAUDE_PROTOCOL_MODE;
    const requirements = protocolFileReadGate.getHandoffFileRequirements();
    expect(requirements['LEAD-TO-PLAN']).toBe('CLAUDE_PLAN_DIGEST.md');
  });

  it('should return FULL file for LEAD-TO-PLAN handoff when mode=full', () => {
    process.env.CLAUDE_PROTOCOL_MODE = 'full';
    const requirements = protocolFileReadGate.getHandoffFileRequirements();
    expect(requirements['LEAD-TO-PLAN']).toBe('CLAUDE_PLAN.md');
  });

  it('should return DIGEST file for PLAN-TO-EXEC handoff by default', () => {
    delete process.env.CLAUDE_PROTOCOL_MODE;
    const requirements = protocolFileReadGate.getHandoffFileRequirements();
    expect(requirements['PLAN-TO-EXEC']).toBe('CLAUDE_EXEC_DIGEST.md');
  });

  it('should have consistent constants between read-gate and core-gate', () => {
    // DIGEST constants should match between files
    expect(protocolFileReadGate.HANDOFF_FILE_REQUIREMENTS_DIGEST['LEAD-TO-PLAN'])
      .toBe(coreProtocolGate.HANDOFF_PHASE_FILES_DIGEST['LEAD-TO-PLAN']);
    expect(protocolFileReadGate.HANDOFF_FILE_REQUIREMENTS_DIGEST['PLAN-TO-EXEC'])
      .toBe(coreProtocolGate.HANDOFF_PHASE_FILES_DIGEST['PLAN-TO-EXEC']);

    // FULL constants should match between files
    expect(protocolFileReadGate.HANDOFF_FILE_REQUIREMENTS_FULL['LEAD-TO-PLAN'])
      .toBe(coreProtocolGate.HANDOFF_PHASE_FILES_FULL['LEAD-TO-PLAN']);
    expect(protocolFileReadGate.HANDOFF_FILE_REQUIREMENTS_FULL['PLAN-TO-EXEC'])
      .toBe(coreProtocolGate.HANDOFF_PHASE_FILES_FULL['PLAN-TO-EXEC']);
  });
});
