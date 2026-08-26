/**
 * SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C (FR-1)
 *
 * telemetry-analytics's capability description must name the concrete sink
 * (venture_usage_events + fn_venture_usage_window_summary) rather than the
 * prior "events land somewhere" placeholder, and DEFAULT_CAPABILITIES_VERSION
 * must be bumped to reflect the change.
 */
import { describe, it, expect } from 'vitest';
import {
  EHG_VENTURE_DEFAULT_CAPABILITIES,
  DEFAULT_CAPABILITIES_VERSION,
} from '../../../lib/eva/config/venture-default-capabilities.js';

describe('SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C FR-1: telemetry-analytics description', () => {
  const telemetryAnalytics = EHG_VENTURE_DEFAULT_CAPABILITIES.find(c => c.capability_id === 'telemetry-analytics');

  it('names venture_usage_events and fn_venture_usage_window_summary explicitly', () => {
    expect(telemetryAnalytics.description).toMatch(/venture_usage_events/);
    expect(telemetryAnalytics.description).toMatch(/fn_venture_usage_window_summary/);
  });

  it('no longer contains the vague "events land somewhere" placeholder', () => {
    expect(telemetryAnalytics.description).not.toMatch(/events land somewhere/);
  });

  it('DEFAULT_CAPABILITIES_VERSION is bumped past 2026.07', () => {
    expect(DEFAULT_CAPABILITIES_VERSION > '2026.07').toBe(true);
  });

  it('does not modify any other capability entry description', () => {
    const feedbackWidget = EHG_VENTURE_DEFAULT_CAPABILITIES.find(c => c.capability_id === 'feedback-widget');
    expect(feedbackWidget.description).toMatch(/venture_user_insert_feedback/);
  });
});
