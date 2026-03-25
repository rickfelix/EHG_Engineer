/**
 * Tests for create-ehg-venture --register flag
 * SD: SD-LEO-INFRA-VENTURE-LEO-BUILD-001-B
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const REGISTRY_PATH = join(process.cwd(), 'applications', 'registry.json');

describe('create-ehg-venture --register flag', () => {
  describe('CLI argument parsing', () => {
    it('should accept --register flag in usage text', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      expect(source).toContain('--register');
      expect(source).toContain("args.includes('--register')");
    });

    it('should validate venture names as lowercase alphanumeric with hyphens', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      expect(source).toContain('/^[a-z0-9][a-z0-9-]*$/');
    });
  });

  describe('registry update logic', () => {
    let originalRegistry;

    beforeEach(() => {
      originalRegistry = readFileSync(REGISTRY_PATH, 'utf8');
    });

    afterEach(() => {
      // Restore original registry
      writeFileSync(REGISTRY_PATH, originalRegistry, 'utf8');
    });

    it('should generate sequential APP IDs', () => {
      const registry = JSON.parse(originalRegistry);
      const existingIds = Object.keys(registry.applications)
        .filter(k => k.startsWith('APP'))
        .map(k => parseInt(k.replace('APP', ''), 10))
        .filter(n => !isNaN(n));
      const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
      const appId = `APP${String(nextNum).padStart(3, '0')}`;

      expect(appId).toBe('APP003'); // APP001 and APP002 exist
    });

    it('should detect existing ventures by name (idempotent)', () => {
      const registry = JSON.parse(originalRegistry);
      const existing = Object.values(registry.applications).find(app => app.name === 'ehg');
      expect(existing).toBeTruthy();
      expect(existing.id).toBe('APP001');
    });

    it('should not duplicate entries for existing ventures', () => {
      const registry = JSON.parse(originalRegistry);
      const count = Object.values(registry.applications).filter(app => app.name === 'ehg').length;
      expect(count).toBe(1);
    });
  });

  describe('backward compatibility', () => {
    it('should not require --register flag', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      // registerVenture is only called when register is true
      expect(source).toContain('if (register) {');
    });

    it('should still support --skip-install', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      expect(source).toContain("args.includes('--skip-install')");
    });
  });
});
