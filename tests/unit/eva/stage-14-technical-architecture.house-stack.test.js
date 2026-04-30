/**
 * Tests for stage-14-technical-architecture.js — SYSTEM_PROMPT inclusion and
 * removal of free-choice scaffolding strings.
 *
 * SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001
 *
 * These tests verify the SYSTEM_PROMPT-level constraint by reading the source
 * file as text. End-to-end LLM tests require a mocked LLM client and are
 * deferred — the validate-house-stack-adherence tests already prove the
 * post-parse enforcement (belt-and-suspenders layer 2).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EHG_HOUSE_TECH_STACK,
  EHG_HOUSE_AUTH_STRATEGY,
  HOUSE_STACK_LAYER_NAMES,
} from '../../../lib/eva/config/house-tech-stack.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STAGE_14_PATH = path.resolve(
  __dirname,
  '../../../lib/eva/stage-templates/analysis-steps/stage-14-technical-architecture.js'
);
const SOURCE = fs.readFileSync(STAGE_14_PATH, 'utf8');

describe('Stage 14 SYSTEM_PROMPT — house-stack constraint', () => {
  it('imports EHG_HOUSE_TECH_STACK from house-tech-stack config', () => {
    expect(SOURCE).toMatch(/EHG_HOUSE_TECH_STACK/);
    expect(SOURCE).toMatch(/from '\.\.\/\.\.\/config\/house-tech-stack\.js'/);
  });

  it('imports validateHouseStackAdherence', () => {
    expect(SOURCE).toMatch(/validateHouseStackAdherence/);
    expect(SOURCE).toMatch(/HouseStackDeviationError/);
  });

  it('removes all 6 free-choice scaffolding strings', () => {
    // Original prompt scaffolding strings that should no longer appear
    const removedMarkers = [
      'AWS/GCP/Vercel/etc',
      'React/Vue/etc',
      'REST/GraphQL/etc',
      'Node.js/Python/etc',
      'PostgreSQL/MongoDB/etc',
      'JWT/OAuth2/Session-based/etc',
    ];
    for (const marker of removedMarkers) {
      expect(SOURCE).not.toContain(marker);
    }
  });

  it('uses house-stack values via interpolation in SYSTEM_PROMPT', () => {
    // Each layer's technology should appear in the source via template interpolation
    for (const layerName of HOUSE_STACK_LAYER_NAMES) {
      expect(SOURCE).toContain(`EHG_HOUSE_TECH_STACK.${layerName}.technology`);
    }
    expect(SOURCE).toContain('EHG_HOUSE_AUTH_STRATEGY.technology');
  });

  it('SYSTEM_PROMPT instructs LLM to honor house stack as a hard constraint', () => {
    expect(SOURCE).toMatch(/EHG House Tech Stack is fixed/i);
    expect(SOURCE).toMatch(/do NOT deviate/i);
    expect(SOURCE).toMatch(/architecture_override_request/);
  });

  it('analyzeStage14 accepts architecture_override_request param', () => {
    expect(SOURCE).toMatch(/architecture_override_request/);
    expect(SOURCE).toMatch(/overrideRequest/);
  });

  it('analyzeStage14 calls validateHouseStackAdherence after normalization', () => {
    expect(SOURCE).toMatch(/validateHouseStackAdherence\(/);
    expect(SOURCE).toMatch(/HouseStackDeviationError/);
  });

  it('legacyPayload includes override_reason for downstream consumers', () => {
    expect(SOURCE).toMatch(/override_reason: overrideReason/);
  });
});
