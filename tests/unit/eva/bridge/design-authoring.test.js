// SD-LEO-FEAT-AUTHOR-VENTURE-DESIGN-001 — the design-AUTHORING layer.
// TS-1 anchor provenance drift-guard, TS-2 full block render order, TS-3 Fable executor
// resolution, TS-4 audit-side byte-identity is enforced by NOT touching
// shared-design-prompts.json (see the static call-site checks), TS-5 guardrail presence.
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDesignInstructionBlock,
  BUILD_PROMPT_IDS,
  GENERATION_INPUTS,
} from '../../../../lib/eva/bridge/design-input-instructions.js';

const require = createRequire(import.meta.url);
const SHARED_PROMPTS = require('../../../../lib/eva/bridge/shared-design-prompts.json');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

describe('TS-1: anchor provenance drift-guard (craft do-rules invert the REAL audit text)', () => {
  it('every craft do_rule anchor appears VERBATIM in its own prompt audit text', () => {
    const craft = GENERATION_INPUTS.craft_do_rules;
    expect(Object.keys(craft).sort()).toEqual(['2', '3', '4']);
    for (const id of Object.keys(craft)) {
      const prompt = SHARED_PROMPTS.find((p) => p.id === Number(id));
      expect(prompt, `prompt ${id} exists in shared-design-prompts.json`).toBeTruthy();
      for (const { rule, anchor } of craft[id]) {
        expect(rule, `rule text present (prompt ${id})`).toBeTruthy();
        expect(anchor, `anchor present for rule "${rule.slice(0, 40)}..."`).toBeTruthy();
        expect(
          prompt.text.includes(anchor),
          `anchor "${anchor}" must appear verbatim in Prompt ${id}'s audit text — drift detected otherwise`
        ).toBe(true);
      }
    }
  });

  it('each craft prompt carries >=8 authored do-rules (FR-1 acceptance)', () => {
    for (const id of ['2', '3', '4']) {
      expect(GENERATION_INPUTS.craft_do_rules[id].length).toBeGreaterThanOrEqual(8);
    }
  });

  it('a mutated anchor is caught (negative control)', () => {
    const prompt2 = SHARED_PROMPTS.find((p) => p.id === 2);
    expect(prompt2.text.includes('this-anchor-does-not-exist-in-the-rubric')).toBe(false);
  });
});

describe('TS-2: full block render order from the REAL rubric JSON', () => {
  const block = buildDesignInstructionBlock(SHARED_PROMPTS);

  it('contains all five sections in order: CRAFT -> CONVERSION -> MOTION -> CHECKLIST -> EXEMPLAR', () => {
    const idx = {
      craft: block.indexOf('DESIGN DO-RULES'),
      conversion: block.indexOf('CONVERSION PSYCHOLOGY'),
      motion: block.indexOf('MOTION GRAMMAR'),
      checklist: block.indexOf('DESIGN VERIFICATION CHECKLIST'),
      exemplar: block.indexOf('STYLE EXEMPLAR'),
    };
    for (const [name, i] of Object.entries(idx)) expect(i, `${name} section present`).toBeGreaterThan(-1);
    expect(idx.craft).toBeLessThan(idx.conversion);
    expect(idx.conversion).toBeLessThan(idx.motion);
    expect(idx.motion).toBeLessThan(idx.checklist);
    expect(idx.checklist).toBeLessThan(idx.exemplar);
  });

  it('renders all 9 named UX Peak principles (FR-2)', () => {
    for (const p of [
      'Smart Default', 'Goal Gradient', 'Reciprocity', 'Endowment', 'Loss Aversion',
      'Contrast', 'Reduce Cognitive Load', 'Social Proof / Halo', 'Overcome the Imagination Gap',
    ]) {
      expect(block, `principle "${p}" rendered`).toContain(p);
    }
  });

  it('still contains the VERBATIM audit checklist (audit-form preserved, wiring-SD behavior intact)', () => {
    const prompt2 = SHARED_PROMPTS.find((p) => p.id === 2);
    expect(block).toContain('Before finishing, verify your output against');
    expect(block).toContain(prompt2.text.slice(0, 120));
  });

  it('is deterministic (pure renderer, no LLM/random)', () => {
    expect(buildDesignInstructionBlock(SHARED_PROMPTS)).toBe(block);
  });

  it('returns empty string when no applicable audit prompts (unchanged guard)', () => {
    expect(buildDesignInstructionBlock([])).toBe('');
    expect(buildDesignInstructionBlock(null)).toBe('');
  });

  it('backward-compat: with empty generation inputs, the block reduces to the checklist-only form', () => {
    const legacy = buildDesignInstructionBlock(SHARED_PROMPTS, {});
    expect(legacy.startsWith('DESIGN VERIFICATION CHECKLIST')).toBe(true);
    expect(legacy).not.toContain('DESIGN DO-RULES');
    expect(legacy).not.toContain('STYLE EXEMPLAR');
  });
});

describe('TS-5: the no-fabrication guardrail (FR-2 hard guardrail)', () => {
  it('any block containing conversion rules carries the NEVER-fabricate guardrail paragraph', () => {
    const block = buildDesignInstructionBlock(SHARED_PROMPTS);
    expect(block).toContain('NEVER fabricate metrics, testimonials, user counts');
    expect(block).toContain('OMIT the element entirely');
  });

  it('the guardrail lives in the authored JSON (removing it there would fail this test)', () => {
    expect(GENERATION_INPUTS.conversion.guardrail).toMatch(/NEVER fabricate/);
  });
});

describe('FR-3: motion grammar constraints', () => {
  const motionText = GENERATION_INPUTS.motion.do_rules.map((r) => r.rule).join(' ');

  it('mandates ONE easing + ONE entrance, forbids layout-property animation, requires reduced-motion safety', () => {
    expect(motionText).toContain('ONE easing curve and ONE entrance pattern');
    expect(motionText).toMatch(/never layout properties \(width\/height\/top\/left\)/);
    expect(motionText).toContain('prefers-reduced-motion');
    expect(motionText).toMatch(/parallax/i);
  });
});

describe('FR-6: MarketLens style exemplar', () => {
  it('carries the provenance citation and few-shot character', () => {
    expect(GENERATION_INPUTS.exemplar.provenance).toBe('marketlens@c962178');
    const block = buildDesignInstructionBlock(SHARED_PROMPTS);
    expect(block).toContain('STYLE EXEMPLAR (marketlens@c962178)');
  });

  it('introduces zero numeric social-proof claims (integrity: no fabricated numbers)', () => {
    for (const line of GENERATION_INPUTS.exemplar.character) {
      expect(/\d/.test(line), `exemplar character line must carry no numbers: "${line.slice(0, 60)}..."`).toBe(false);
    }
  });
});

describe('TS-3: Fable executor resolution (FR-4)', () => {
  const saved = {};
  const VARS = ['CLAUDE_MODEL_DESIGN_GENERATION', 'CLAUDE_MODEL', 'CLAUDE_MODEL_S17_GENERATION', 'CLAUDE_MODEL_S17_ARCHETYPE_GENERATION'];
  for (const v of VARS) saved[v] = process.env[v];
  afterEach(() => {
    for (const v of VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  });

  it("getClaudeModel('design-generation') defaults to claude-fable-5", () => {
    const { getClaudeModel } = require('../../../../lib/config/model-config.js');
    delete process.env.CLAUDE_MODEL_DESIGN_GENERATION;
    delete process.env.CLAUDE_MODEL;
    expect(getClaudeModel('design-generation')).toBe('claude-fable-5');
  });

  it('CLAUDE_MODEL_DESIGN_GENERATION env overrides the default', () => {
    const { getClaudeModel } = require('../../../../lib/config/model-config.js');
    process.env.CLAUDE_MODEL_DESIGN_GENERATION = 'claude-test-override';
    expect(getClaudeModel('design-generation')).toBe('claude-test-override');
  });

  it('the audit slot stays on premium-generation (scorer != builder): claude-opus-4-8 untouched', () => {
    const { getClaudeModel } = require('../../../../lib/config/model-config.js');
    expect(getClaudeModel('premium-generation')).toBe('claude-opus-4-8');
    const observeSrc = fs.readFileSync(path.join(repoRoot, 'lib/eva/bridge/design-fidelity-observe.js'), 'utf8');
    expect(observeSrc).toContain("CLAUDE_MODEL_S17_LEAF_DESIGN_AUDIT || getClaudeModel('premium-generation')");
    expect(observeSrc).not.toContain("getClaudeModel('design-generation')");
  });

  it('both S17 generation call sites resolve via design-generation with their S17 env slots at highest precedence', () => {
    for (const f of ['lib/eva/stage-17/refinement.js', 'lib/eva/stage-17/archetype-generator.js']) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      expect(src, f).toContain("getClaudeModel('design-generation')");
      expect(src, f).toMatch(/CLAUDE_MODEL_S17_(ARCHETYPE_)?GENERATION \|\| getClaudeModel\('design-generation'\)/);
    }
  });
});

describe('TS-4: audit SSOT untouched (cross-repo vendored checksum safety)', () => {
  it('shared-design-prompts.json carries ONLY the original audit entries/keys (no additive mutation)', () => {
    expect(SHARED_PROMPTS.map((p) => p.id)).toEqual([2, 3, 4, 5]);
    for (const p of SHARED_PROMPTS) {
      expect(Object.keys(p).sort()).toEqual(['id', 'label', 'summary', 'text']);
    }
  });

  it('BUILD_PROMPT_IDS is still exactly [2, 3, 4]', () => {
    expect(BUILD_PROMPT_IDS).toEqual([2, 3, 4]);
  });
});
