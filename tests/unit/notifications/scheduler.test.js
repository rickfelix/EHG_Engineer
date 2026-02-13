/**
 * Tests for lib/notifications/scheduler.js
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Covers: runDailyDigestScheduler, runWeeklySummaryScheduler
 * Focus: timezone-aware scheduling, preference processing, error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the orchestrator to avoid real email sending
vi.mock('../../../lib/notifications/orchestrator.js', () => ({
  sendDailyDigest: vi.fn(),
  sendWeeklySummary: vi.fn()
}));

import { runDailyDigestScheduler, runWeeklySummaryScheduler } from '../../../lib/notifications/scheduler.js';
import { sendDailyDigest, sendWeeklySummary } from '../../../lib/notifications/orchestrator.js';

describe('scheduler', () => {
  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();
    sendDailyDigest.mockResolvedValue({ status: 'sent' });
    sendWeeklySummary.mockResolvedValue({ status: 'sent' });

    mockSupabase = {
      from: vi.fn()
    };
  });

  /**
   * Helper: create a mock for chairman_preferences query that returns preferences
   */
  function preferencesChain({ data = [], error = null } = {}) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data, error })
        })
      })
    };
  }

  /**
   * Helper: create a mock for chairman email lookup (getChairmanEmail)
   * This is called with .eq('chairman_id', x).eq('preference_key', 'notification_email').single()
   */
  function emailChain({ data = null, error = null } = {}) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data, error })
          })
        })
      })
    };
  }

  describe('runDailyDigestScheduler', () => {
    it('returns empty array when no preferences found', async () => {
      mockSupabase.from.mockReturnValue(preferencesChain({ data: [] }));

      const results = await runDailyDigestScheduler(mockSupabase);
      expect(results).toEqual([]);
      expect(sendDailyDigest).not.toHaveBeenCalled();
    });

    it('returns empty array when preferences query returns null', async () => {
      mockSupabase.from.mockReturnValue(preferencesChain({ data: null }));

      const results = await runDailyDigestScheduler(mockSupabase);
      expect(results).toEqual([]);
    });

    it('skips chairmen with disabled daily digest', async () => {
      mockSupabase.from.mockReturnValue(
        preferencesChain({
          data: [{
            chairman_id: 'c1',
            preference_value: JSON.stringify({ enabled: false, timezone: 'UTC', send_time: '08:00' })
          }]
        })
      );

      const results = await runDailyDigestScheduler(mockSupabase);
      expect(results).toEqual([]);
      expect(sendDailyDigest).not.toHaveBeenCalled();
    });

    it('skips chairmen outside the send window', async () => {
      // Use a send time far from current time to ensure we're outside the window
      const farTime = '03:33'; // unlikely to match current time within 15 min
      const now = new Date();
      const currentHour = now.getHours();
      // If by coincidence we ARE at 03:33, use 15:33 instead
      const safeTime = (currentHour >= 3 && currentHour <= 4) ? '15:33' : farTime;

      mockSupabase.from.mockReturnValue(
        preferencesChain({
          data: [{
            chairman_id: 'c1',
            preference_value: JSON.stringify({ enabled: true, timezone: 'UTC', send_time: safeTime })
          }]
        })
      );

      const results = await runDailyDigestScheduler(mockSupabase);
      expect(results).toEqual([]);
    });

    it('skips chairmen without email', async () => {
      // Create a time that matches "now" in UTC
      const now = new Date();
      const utcH = String(now.getUTCHours()).padStart(2, '0');
      const utcM = String(now.getUTCMinutes()).padStart(2, '0');
      const sendTime = `${utcH}:${utcM}`;

      let callIdx = 0;
      mockSupabase.from.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          // Preferences query
          return preferencesChain({
            data: [{
              chairman_id: 'c1',
              preference_value: JSON.stringify({ enabled: true, timezone: 'UTC', send_time: sendTime })
            }]
          });
        }
        // Email lookup - no email found + no auth fallback
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          }),
          auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: null }) } }
        };
      });

      // Also mock auth on supabase root for the fallback
      mockSupabase.auth = {
        admin: { getUserById: vi.fn().mockResolvedValue({ data: null }) }
      };

      const results = await runDailyDigestScheduler(mockSupabase);
      expect(results).toEqual([]);
    });

    it('sends digest and records result when all conditions met', async () => {
      const now = new Date();
      const utcH = String(now.getUTCHours()).padStart(2, '0');
      const utcM = String(now.getUTCMinutes()).padStart(2, '0');
      const sendTime = `${utcH}:${utcM}`;

      let callIdx = 0;
      mockSupabase.from.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          return preferencesChain({
            data: [{
              chairman_id: 'c1',
              preference_value: JSON.stringify({ enabled: true, timezone: 'UTC', send_time: sendTime })
            }]
          });
        }
        // Email lookup
        return emailChain({
          data: { preference_value: JSON.stringify({ email: 'chairman@ehg.ai' }) }
        });
      });

      const results = await runDailyDigestScheduler(mockSupabase);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ chairmanId: 'c1', status: 'sent' });
      expect(sendDailyDigest).toHaveBeenCalledTimes(1);
    });

    it('handles sendDailyDigest throwing an error', async () => {
      sendDailyDigest.mockRejectedValue(new Error('Send failed'));

      const now = new Date();
      const utcH = String(now.getUTCHours()).padStart(2, '0');
      const utcM = String(now.getUTCMinutes()).padStart(2, '0');
      const sendTime = `${utcH}:${utcM}`;

      let callIdx = 0;
      mockSupabase.from.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          return preferencesChain({
            data: [{
              chairman_id: 'c1',
              preference_value: JSON.stringify({ enabled: true, timezone: 'UTC', send_time: sendTime })
            }]
          });
        }
        return emailChain({
          data: { preference_value: JSON.stringify({ email: 'chairman@ehg.ai' }) }
        });
      });

      const results = await runDailyDigestScheduler(mockSupabase);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      expect(results[0].error).toBe('Send failed');
    });

    it('handles preference_value as pre-parsed object', async () => {
      const now = new Date();
      const utcH = String(now.getUTCHours()).padStart(2, '0');
      const utcM = String(now.getUTCMinutes()).padStart(2, '0');
      const sendTime = `${utcH}:${utcM}`;

      let callIdx = 0;
      mockSupabase.from.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          return preferencesChain({
            data: [{
              chairman_id: 'c1',
              // Pre-parsed object (not a JSON string)
              preference_value: { enabled: true, timezone: 'UTC', send_time: sendTime }
            }]
          });
        }
        return emailChain({
          data: { preference_value: { email: 'chairman@ehg.ai' } }
        });
      });

      const results = await runDailyDigestScheduler(mockSupabase);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('sent');
    });
  });

  describe('runWeeklySummaryScheduler', () => {
    it('returns empty array when no preferences found', async () => {
      mockSupabase.from.mockReturnValue(preferencesChain({ data: [] }));

      const results = await runWeeklySummaryScheduler(mockSupabase);
      expect(results).toEqual([]);
      expect(sendWeeklySummary).not.toHaveBeenCalled();
    });

    it('skips chairmen with disabled weekly summary', async () => {
      mockSupabase.from.mockReturnValue(
        preferencesChain({
          data: [{
            chairman_id: 'c1',
            preference_value: JSON.stringify({ enabled: false, timezone: 'UTC', send_day: 1, send_time: '08:00' })
          }]
        })
      );

      const results = await runWeeklySummaryScheduler(mockSupabase);
      expect(results).toEqual([]);
    });

    it('skips when not the correct day of week', async () => {
      // Set send_day to a day that is definitely NOT today
      const now = new Date();
      const todayDay = now.getDay(); // 0=Sun through 6=Sat
      // Pick a different day (adjust for getDayInTimezone using 0=Sun, 1=Mon, etc.)
      const notTodayDay = todayDay === 3 ? 5 : 3;

      mockSupabase.from.mockReturnValue(
        preferencesChain({
          data: [{
            chairman_id: 'c1',
            preference_value: JSON.stringify({
              enabled: true,
              timezone: 'UTC',
              send_day: notTodayDay,
              send_time: '00:00'
            })
          }]
        })
      );

      const results = await runWeeklySummaryScheduler(mockSupabase);
      expect(results).toEqual([]);
    });

    it('handles sendWeeklySummary throwing an error', async () => {
      sendWeeklySummary.mockRejectedValue(new Error('Summary send failed'));

      // We need to match both day and time
      const now = new Date();
      // Get the current day in UTC using the same method the scheduler uses
      const dayStr = now.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
      const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const currentDay = dayMap[dayStr] ?? 0;

      const utcH = String(now.getUTCHours()).padStart(2, '0');
      const utcM = String(now.getUTCMinutes()).padStart(2, '0');
      const sendTime = `${utcH}:${utcM}`;

      let callIdx = 0;
      mockSupabase.from.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          return preferencesChain({
            data: [{
              chairman_id: 'c1',
              preference_value: JSON.stringify({
                enabled: true,
                timezone: 'UTC',
                send_day: currentDay,
                send_time: sendTime
              })
            }]
          });
        }
        return emailChain({
          data: { preference_value: JSON.stringify({ email: 'chairman@ehg.ai' }) }
        });
      });

      const results = await runWeeklySummaryScheduler(mockSupabase);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      expect(results[0].error).toBe('Summary send failed');
    });
  });
});
