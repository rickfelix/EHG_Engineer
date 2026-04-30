import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  PRIORITY_VALUES,
  SD_TYPES,
  APP_TYPE_VALUES,
  MIN_SPRINT_ITEMS,
  SD_BRIDGE_REQUIRED_FIELDS,
  MIN_SPRINT_DURATION_DAYS,
  MAX_SPRINT_DURATION_DAYS,
} from '../../../../lib/eva/stage-templates/stage-19.js';

describe('stage-19 — Sprint Planning', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-19');
    expect(TEMPLATE.slug).toBe('sprint-planning');
    expect(TEMPLATE.title).toBe('Sprint Planning');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('sprint_name');
    expect(d).toHaveProperty('sprint_duration_days');
    expect(d).toHaveProperty('sprint_goal');
    expect(Array.isArray(d.items)).toBe(true);
    expect(d.total_items).toBe(0);
    expect(d.total_story_points).toBe(0);
    expect(Array.isArray(d.sd_bridge_payloads)).toBe(true);
  });

  it('validate() returns invalid when sprint_name is missing', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validate() returns valid for minimal valid sprint', () => {
    const data = {
      sprint_name: 'Sprint 1',
      sprint_duration_days: 7,
      sprint_goal: 'Ship the MVP feature',
      items: [{
        title: 'Task A', description: 'Do it', priority: 'high',
        type: 'feature', scope: 'backend', success_criteria: 'done',
        target_application: 'EHG',
      }],
    };
    const result = TEMPLATE.validate(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('exports PRIORITY_VALUES array', () => {
    expect(Array.isArray(PRIORITY_VALUES)).toBe(true);
    expect(PRIORITY_VALUES).toContain('critical');
    expect(PRIORITY_VALUES).toContain('low');
  });

  it('exports SD_TYPES array', () => {
    expect(Array.isArray(SD_TYPES)).toBe(true);
    expect(SD_TYPES).toContain('feature');
    expect(SD_TYPES).toContain('bugfix');
  });

  it('exports APP_TYPE_VALUES array', () => {
    expect(Array.isArray(APP_TYPE_VALUES)).toBe(true);
    expect(APP_TYPE_VALUES).toContain('mobile');
    expect(APP_TYPE_VALUES).toContain('web');
  });

  it('exports MIN_SPRINT_ITEMS as a positive number', () => {
    expect(typeof MIN_SPRINT_ITEMS).toBe('number');
    expect(MIN_SPRINT_ITEMS).toBeGreaterThan(0);
  });

  it('exports SD_BRIDGE_REQUIRED_FIELDS array with key fields', () => {
    expect(Array.isArray(SD_BRIDGE_REQUIRED_FIELDS)).toBe(true);
    expect(SD_BRIDGE_REQUIRED_FIELDS).toContain('title');
    expect(SD_BRIDGE_REQUIRED_FIELDS).toContain('description');
    expect(SD_BRIDGE_REQUIRED_FIELDS).toContain('priority');
  });

  it('exports MIN/MAX sprint duration constants', () => {
    expect(typeof MIN_SPRINT_DURATION_DAYS).toBe('number');
    expect(typeof MAX_SPRINT_DURATION_DAYS).toBe('number');
    expect(MIN_SPRINT_DURATION_DAYS).toBeGreaterThan(0);
    expect(MAX_SPRINT_DURATION_DAYS).toBeGreaterThan(MIN_SPRINT_DURATION_DAYS);
  });
});
