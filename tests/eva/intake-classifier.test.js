/**
 * Tests for intake-classifier.js — 3D Classification Engine
 * SD: SD-LEO-FEAT-EVA-INTAKE-REDESIGN-003-C
 */
import { describe, it, expect } from 'vitest';
import {
  buildClassificationPrompt,
  parseAIClassification,
  keywordClassify,
  askUserQuestions,
  mapSelectionToValue,
} from '../../lib/integrations/intake-classifier.js';

describe('buildClassificationPrompt', () => {
  it('includes all 3 dimensions in the prompt', () => {
    const prompt = buildClassificationPrompt('Fix login bug', 'Auth fails on mobile');
    expect(prompt).toContain('Dimension 1');
    expect(prompt).toContain('Dimension 2');
    expect(prompt).toContain('Dimension 3');
    expect(prompt).toContain('ehg_engineer');
    expect(prompt).toContain('ehg_app');
    expect(prompt).toContain('new_venture');
    expect(prompt).toContain('idea');
    expect(prompt).toContain('insight');
  });

  it('includes hierarchy context when provided', () => {
    const prompt = buildClassificationPrompt('Sub-task', 'Details', {
      parentTitle: 'Parent Task',
      siblingTitles: ['Sibling 1', 'Sibling 2'],
    });
    expect(prompt).toContain('Parent Task: Parent Task');
    expect(prompt).toContain('Sibling Tasks: Sibling 1; Sibling 2');
  });
});

describe('parseAIClassification', () => {
  it('parses valid JSON response', () => {
    const response = '{"target_application": "ehg_engineer", "target_aspects": ["eva_pipeline"], "chairman_intent": "idea", "confidence": 0.85, "reasoning": "Pipeline work"}';
    const result = parseAIClassification(response);
    expect(result).not.toBeNull();
    expect(result.target_application).toBe('ehg_engineer');
    expect(result.target_aspects).toEqual(['eva_pipeline']);
    expect(result.chairman_intent).toBe('idea');
    expect(result.confidence).toBe(0.85);
  });

  it('handles markdown code fences', () => {
    const response = '```json\n{"target_application": "ehg_app", "target_aspects": ["dashboard"], "chairman_intent": "insight", "confidence": 0.7}\n```';
    const result = parseAIClassification(response);
    expect(result).not.toBeNull();
    expect(result.target_application).toBe('ehg_app');
  });

  it('rejects invalid application', () => {
    const response = '{"target_application": "invalid_app", "target_aspects": ["foo"], "chairman_intent": "idea", "confidence": 0.9}';
    const result = parseAIClassification(response);
    expect(result).toBeNull();
  });

  it('rejects invalid aspects for chosen application', () => {
    // dashboard is only valid for ehg_app, not ehg_engineer
    const response = '{"target_application": "ehg_engineer", "target_aspects": ["dashboard"], "chairman_intent": "idea", "confidence": 0.9}';
    const result = parseAIClassification(response);
    expect(result).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(parseAIClassification('not json at all')).toBeNull();
    expect(parseAIClassification('{broken')).toBeNull();
  });

  it('clamps confidence to 0-1 range', () => {
    const response = '{"target_application": "ehg_engineer", "target_aspects": ["leo_protocol"], "chairman_intent": "idea", "confidence": 1.5}';
    const result = parseAIClassification(response);
    expect(result.confidence).toBe(1);
  });
});

describe('keywordClassify', () => {
  it('detects ehg_engineer from protocol keywords', () => {
    const result = keywordClassify('Improve LEO protocol handoff gate scoring');
    expect(result.target_application).toBe('ehg_engineer');
    expect(result.confidence).toBe(0.4);
  });

  it('detects ehg_app from UI keywords', () => {
    const result = keywordClassify('Add new dashboard component for navigation');
    expect(result.target_application).toBe('ehg_app');
  });

  it('detects new_venture from business keywords', () => {
    const result = keywordClassify('Research market pricing strategy for new venture');
    expect(result.target_application).toBe('new_venture');
  });

  it('detects question intent', () => {
    const result = keywordClassify('How do we investigate this issue?');
    expect(result.chairman_intent).toBe('question');
  });

  it('detects reference intent', () => {
    const result = keywordClassify('Study this video reference resource');
    expect(result.chairman_intent).toBe('reference');
  });

  it('always returns valid classification', () => {
    const result = keywordClassify('asdf gibberish 12345');
    expect(result.target_application).toBeDefined();
    expect(result.target_aspects.length).toBeGreaterThan(0);
    expect(result.chairman_intent).toBeDefined();
  });
});

describe('askUserQuestions', () => {
  it('application() returns valid AskUserQuestion payload', () => {
    const payload = askUserQuestions.application(null);
    expect(payload.question).toBeDefined();
    expect(payload.header).toBe('Application');
    expect(payload.multiSelect).toBe(false);
    expect(payload.options.length).toBe(3); // 3 apps, no AI shortcut
  });

  it('application() includes Accept AI option when confidence >= 0.8', () => {
    const aiRec = {
      target_application: 'ehg_engineer',
      target_aspects: ['eva_pipeline'],
      chairman_intent: 'idea',
      confidence: 0.85,
      reasoning: 'Pipeline work',
    };
    const payload = askUserQuestions.application(aiRec);
    expect(payload.options.length).toBe(4); // 3 apps + Accept AI
    expect(payload.options[0].label).toContain('Accept AI');
  });

  it('application() excludes Accept AI when confidence < 0.8', () => {
    const aiRec = {
      target_application: 'ehg_engineer',
      target_aspects: ['eva_pipeline'],
      chairman_intent: 'idea',
      confidence: 0.6,
    };
    const payload = askUserQuestions.application(aiRec);
    expect(payload.options.length).toBe(3); // No Accept AI
  });

  it('aspects() returns context-sensitive options', () => {
    const payload = askUserQuestions.aspects('ehg_app', null);
    expect(payload.header).toBe('Aspects');
    expect(payload.multiSelect).toBe(true);
    expect(payload.options.some((o) => o.label === 'dashboard')).toBe(true);
    expect(payload.options.some((o) => o.label === 'leo protocol')).toBe(false);
  });

  it('intent() returns all 5 intents', () => {
    const payload = askUserQuestions.intent(null);
    expect(payload.header).toBe('Intent');
    expect(payload.options.length).toBe(5);
  });
});

describe('mapSelectionToValue', () => {
  it('maps application label to enum value', () => {
    const result = mapSelectionToValue('application', 'EHG App (Frontend/UI)', null);
    expect(result.value).toBe('ehg_app');
    expect(result.acceptedAI).toBe(false);
  });

  it('detects Accept AI selection', () => {
    const aiRec = {
      target_application: 'ehg_engineer',
      target_aspects: ['eva_pipeline'],
      chairman_intent: 'idea',
    };
    const result = mapSelectionToValue(
      'application',
      'Accept AI: EHG Engineer (Backend/Tooling) → [eva_pipeline] → idea',
      aiRec
    );
    expect(result.acceptedAI).toBe(true);
    expect(result.value.target_application).toBe('ehg_engineer');
    expect(result.value.target_aspects).toEqual(['eva_pipeline']);
    expect(result.value.chairman_intent).toBe('idea');
  });

  it('maps aspect labels back to enum values', () => {
    const result = mapSelectionToValue('aspects', ['leo protocol', 'eva pipeline'], null);
    expect(result.value).toEqual(['leo_protocol', 'eva_pipeline']);
  });

  it('maps intent label to enum value', () => {
    const result = mapSelectionToValue(
      'intent',
      'Insight — A realization or pattern worth noting',
      null
    );
    expect(result.value).toBe('insight');
  });
});
