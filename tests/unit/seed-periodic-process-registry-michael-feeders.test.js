/**
 * QF-20260907-830: Michael's task_scheduler-venue feeders (tasks-classifier, calendar-read,
 * gmail-triage, oracle-extract, health-sync) were absent from periodic_process_registry --
 * discoverAllProcesses() only finds GHA/scripts-cron processes, never Windows Task Scheduler
 * tasks. seedMichaelFeederCrons() hand-derives rows for exactly these five, sourced from
 * lib/michael/feeder.mjs's own FEEDERS registry so a window change there can never drift this
 * seed out of sync (pure function, no DB -- no real-DB gate needed).
 *
 * QF-20260911-110 / ratification 00f696f1 ("Move them"): todoist-brief and brief-assemble
 * moved from venue 'gha' to 'task_scheduler' -- since seedMichaelFeederCrons() filters live on
 * FEEDERS' own venue field, they are picked up automatically with no change to the seed
 * function itself; only this test's pinned expectation sets needed updating.
 */
import { describe, it, expect } from 'vitest';
import { seedMichaelFeederCrons } from '../../scripts/seed-periodic-process-registry.mjs';
import { FEEDERS } from '../../lib/michael/feeder.mjs';

describe('seedMichaelFeederCrons (QF-20260907-830)', () => {
  it('returns exactly the task_scheduler-venue feeders, none other', async () => {
    const rows = await seedMichaelFeederCrons();
    const expectedIds = Object.entries(FEEDERS)
      .filter(([, reg]) => reg.venue === 'task_scheduler')
      .map(([id]) => id);
    expect(expectedIds.sort()).toEqual(['brief-assemble', 'calendar-read', 'gmail-triage', 'health-sync', 'oracle-extract', 'tasks-classifier', 'todoist-brief'].sort());
    expect(rows.map((r) => r.process_key).sort()).toEqual(expectedIds.map((id) => `host_cron:michael-${id}`).sort());
  });

  it('derives expected_window_et and expected_interval_seconds from the live FEEDERS registry, never hardcoded', async () => {
    const rows = await seedMichaelFeederCrons();
    for (const row of rows) {
      const feederId = row.process_key.replace('host_cron:michael-', '');
      expect(row.expected_window_et).toEqual(FEEDERS[feederId].window);
      expect(row.expected_interval_seconds).toBe(FEEDERS[feederId].intervalMinutes * 60);
    }
  });

  it('every row is self_stamped, standalone_cron, not session-bound, currently expected active', async () => {
    const rows = await seedMichaelFeederCrons();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.process_type).toBe('standalone_cron');
      expect(row.liveness_source).toBe('self_stamped');
      expect(row.session_bound).toBe(false);
      expect(row.currently_expected_active).toBe(true);
      expect(row.liveness_source_ref.venue).toBe('task_scheduler');
    }
  });

  it('excludes non-task_scheduler feeders (seat-classify, retention, youtube-digest)', async () => {
    const rows = await seedMichaelFeederCrons();
    const keys = rows.map((r) => r.process_key);
    for (const nonHostFeeder of ['seat-classify', 'retention', 'youtube-digest']) {
      expect(keys).not.toContain(`host_cron:michael-${nonHostFeeder}`);
    }
  });

  it('QF-20260911-110: includes todoist-brief and brief-assemble now that they are task_scheduler-venue', async () => {
    const rows = await seedMichaelFeederCrons();
    const keys = rows.map((r) => r.process_key);
    expect(keys).toContain('host_cron:michael-todoist-brief');
    expect(keys).toContain('host_cron:michael-brief-assemble');
  });
});
