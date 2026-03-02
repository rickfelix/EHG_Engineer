import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

describe('A06: Lifecycle Stage Orchestration & Artifact Versioning', () => {
  describe('A06-C1: Stage template file count', () => {
    it('should have at least 25 stage template files', () => {
      const templatesDir = join(ROOT, 'lib', 'eva', 'stage-templates');
      const files = readdirSync(templatesDir).filter(f => /^stage-\d+\.js$/.test(f));
      expect(files.length).toBeGreaterThanOrEqual(25);
    });

    it('should have templates numbered 01 through 25', () => {
      const templatesDir = join(ROOT, 'lib', 'eva', 'stage-templates');
      const files = readdirSync(templatesDir).filter(f => /^stage-\d+\.js$/.test(f));
      const numbers = files.map(f => parseInt(f.match(/stage-(\d+)/)[1], 10)).sort((a, b) => a - b);
      for (let i = 1; i <= 25; i++) {
        expect(numbers).toContain(i);
      }
    });
  });

  describe('A06-C2: Artifact versioning exports', () => {
    it('should export createVersionedArtifact from artifact-versioning.js', async () => {
      const mod = await import('../../../lib/eva/artifact-versioning.js');
      expect(typeof mod.createVersionedArtifact).toBe('function');
    });
  });

  describe('A06-C3: Artifact version chain exports', () => {
    it('should export createChain from artifact-version-chain.js', async () => {
      const mod = await import('../../../lib/eva/artifact-version-chain.js');
      expect(typeof mod.createChain).toBe('function');
    });
  });

  describe('A06-C4: Venture state machine exports', () => {
    it('should export VentureStateMachine from venture-state-machine.js', async () => {
      const mod = await import('../../../lib/agents/venture-state-machine.js');
      expect(typeof mod.VentureStateMachine).toBe('function');
    });
  });
});
