import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, OVERRIDE_TOKEN, FLOWS, PROMPT_INJECTION_BOUNDARY_MARKER, OVERRIDE_CONTRACT_MARKER } from '../_internal/system-prompt.js';

describe('SYSTEM_PROMPT', () => {
  it('contains the verbatim Override token marker', () => {
    expect(SYSTEM_PROMPT).toContain(OVERRIDE_TOKEN);
    expect(OVERRIDE_TOKEN).toBe('Override:');
  });

  it('contains the verbatim prompt-injection boundary marker', () => {
    expect(SYSTEM_PROMPT).toContain(PROMPT_INJECTION_BOUNDARY_MARKER);
  });

  it('contains the Override contract marker', () => {
    expect(SYSTEM_PROMPT).toContain(OVERRIDE_CONTRACT_MARKER);
  });

  it('declares all 6 flow names', () => {
    for (const flow of FLOWS) {
      expect(SYSTEM_PROMPT).toContain(flow);
    }
  });

  it('FLOWS contains exactly 6 items in canonical order', () => {
    expect(FLOWS).toEqual(['research', 'decision', 'draft', 'action_prep', 'platform', 'pure_human']);
  });
});
