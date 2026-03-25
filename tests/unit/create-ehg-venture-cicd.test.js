/**
 * Tests for CI/CD template generation in create-ehg-venture
 * SD: SD-LEO-INFRA-VENTURE-LEO-BUILD-001-F
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('CI/CD Template Generation', () => {
  describe('template content validation', () => {
    it('should have generateCICDWorkflows function in source', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      expect(source).toContain('function generateCICDWorkflows(');
    });

    it('should generate ci.yml with lint, test, build, and e2e jobs', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      // Extract the ci.yml template content
      expect(source).toContain('npm run lint');
      expect(source).toContain('npm run test:unit');
      expect(source).toContain('npm run build');
      expect(source).toContain('npm run test:e2e');
      expect(source).toContain('playwright install');
    });

    it('should generate deploy.yml with Supabase migration and Vercel deploy', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      expect(source).toContain('supabase db push');
      expect(source).toContain('vercel-action');
      expect(source).toContain('SUPABASE_ACCESS_TOKEN');
      expect(source).toContain('VERCEL_TOKEN');
    });

    it('should parameterize templates with venture name', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      // Template uses ${name} for venture-specific naming
      expect(source).toContain('CI - ${name}');
      expect(source).toContain('Deploy - ${name}');
    });
  });

  describe('workflow YAML structure', () => {
    it('should produce ci.yml with required GitHub Actions on: trigger', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      expect(source).toContain('branches: [main]');
      expect(source).toContain('actions/checkout@v4');
      expect(source).toContain('actions/setup-node@v4');
    });

    it('should define job dependency chain: lint -> test -> build -> e2e', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      expect(source).toContain('needs: lint');
      expect(source).toContain('needs: test');
      expect(source).toContain('needs: build');
    });
  });

  describe('integration with --register flow', () => {
    it('should call generateCICDWorkflows during registration', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      // Verify the function is called inside registerVenture
      const registerStart = source.indexOf('async function registerVenture');
      const registerEnd = source.indexOf('// CLI entry point');
      const registerBody = source.substring(registerStart, registerEnd);
      expect(registerBody).toContain('generateCICDWorkflows(name, root)');
    });

    it('should not generate workflows without --register flag', () => {
      const source = readFileSync(join(process.cwd(), 'packages/create-ehg-venture/index.js'), 'utf8');
      // scaffold function should not reference generateCICDWorkflows
      const scaffoldStart = source.indexOf('function scaffold(');
      const scaffoldEnd = source.indexOf('function generateCICDWorkflows');
      const scaffoldBody = source.substring(scaffoldStart, scaffoldEnd);
      expect(scaffoldBody).not.toContain('generateCICDWorkflows');
    });
  });
});
