/**
 * SD-FDBK-INFRA-ADD-PRD-DATABASE-001
 * Static guard regression-pin for the --content flag wiring.
 *
 * fs.readFileSync + regex on source files (mocking-independent). Asserts that
 * the canonical PRD generation pipeline retains the safety wires that close
 * the original INLINE-mode Catch-22:
 *   - --content flag is parsed in the CLI entry
 *   - createPRDWithValidatedContent is the insertion helper
 *   - validatePRDGrounding + validatePRDQuality run on the --content path
 *   - metadata.created_via='content_arg' literal is set for audit-trail provenance
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readSource(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('SD-FDBK-INFRA-ADD-PRD-DATABASE-001: --content flag static guard', () => {
  describe('scripts/add-prd-to-database.js', () => {
    const src = readSource('scripts/add-prd-to-database.js');

    it('exports extractContentArg parser', () => {
      expect(src).toMatch(/export\s+(?:function\s+)?extractContentArg/);
    });

    it('exports loadContentPayload helper', () => {
      expect(src).toMatch(/export\s+(?:function\s+)?loadContentPayload/);
    });

    it('declares 2MB payload cap', () => {
      expect(src).toMatch(/CONTENT_PAYLOAD_MAX_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
    });

    it('rejects oversized payloads (PAYLOAD_TOO_LARGE)', () => {
      expect(src).toMatch(/PAYLOAD_TOO_LARGE/);
    });

    it('handles file path mode (@<path>)', () => {
      expect(src).toMatch(/rawValue\.startsWith\(['"]@['"]\)/);
    });

    it('handles stdin mode (-)', () => {
      expect(src).toMatch(/rawValue\s*===\s*['"]-['"]/);
    });

    it('passes contentOverride to addPRDToDatabase', () => {
      expect(src).toMatch(/addPRDToDatabase\s*\(\s*sdId\s*,\s*prdTitle\s*,\s*contentOverride\s*\)/);
    });

    it('parses --content BEFORE addPRDToDatabase invocation (gate-route at argv parse)', () => {
      const extractIdx = src.search(/extractContentArg\s*\(\s*argv\s*\)/);
      const callIdx = src.search(/addPRDToDatabase\s*\(\s*sdId\s*,/);
      expect(extractIdx).toBeGreaterThan(0);
      expect(callIdx).toBeGreaterThan(0);
      expect(extractIdx).toBeLessThan(callIdx);
    });
  });

  describe('scripts/prd/index.js', () => {
    const src = readSource('scripts/prd/index.js');

    it('addPRDToDatabase signature accepts contentOverride param', () => {
      expect(src).toMatch(/export\s+async\s+function\s+addPRDToDatabase\s*\([^)]*contentOverride[^)]*\)/);
    });

    it('threads contentOverride into generateAndValidatePRDContent', () => {
      // Looser regex tolerates whitespace/newlines and line breaks between args.
      expect(src).toMatch(/generateAndValidatePRDContent\s*\(/);
      expect(src).toMatch(/\}\s*,\s*contentOverride\s*\)/);
    });

    it('invokes validatePRDGrounding (always, on every path)', () => {
      expect(src).toMatch(/\bvalidatePRDGrounding\s*\(/);
    });

    it('invokes validatePRDQuality on --content path', () => {
      expect(src).toMatch(/\bvalidatePRDQuality\s*\(/);
    });

    it('sets metadata.created_via=content_arg on --content path', () => {
      expect(src).toMatch(/created_via\s*:\s*['"]content_arg['"]/);
    });

    it('skips LLM call when contentOverride is provided', () => {
      // The override branch must short-circuit before generatePRDContentWithLLM.
      const overrideMarker = src.indexOf('CONTENT OVERRIDE');
      expect(overrideMarker).toBeGreaterThan(-1);
      // The if-branch must reference contentOverride and assign llmPrdContent without await on the LLM.
      expect(src).toMatch(/if\s*\(\s*contentOverride\s*\)\s*\{[^}]*llmPrdContent\s*=\s*contentOverride/);
    });

    it('insertion still routes through createPRDWithValidatedContent', () => {
      expect(src).toMatch(/\bcreatePRDWithValidatedContent\s*\(/);
    });
  });
});
