import { vi } from 'vitest';
import WSJFPriorityFetcher from '../scripts/wsjf-priority-fetcher.js';

describe('WSJFPriorityFetcher', () => {
  let fetcher;
  let mockSupabase;

  beforeEach(() => {
    fetcher = new WSJFPriorityFetcher();
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis()
    };
    fetcher.supabase = mockSupabase;
  });

  test('should return top 3 by WSJF when WSJF fields exist', async () => {
    const mockData = [
      { id: '1', title: 'High WSJF', status: 'active', wsjf_score: 10, business_value: 30, time_criticality: 20, created_at: '2025-01-01' },
      { id: '2', title: 'Medium WSJF', status: 'draft', wsjf_score: 5, business_value: 15, time_criticality: 10, created_at: '2025-01-02' },
      { id: '3', title: 'Low WSJF', status: 'active', wsjf_score: 2, business_value: 6, time_criticality: 4, created_at: '2025-01-03' },
      { id: '4', title: 'Very Low', status: 'draft', wsjf_score: 1, business_value: 3, time_criticality: 2, created_at: '2025-01-04' }
    ];

    mockSupabase.limit.mockResolvedValue({ data: mockData, error: null });

    const results = await fetcher.getTop3Priorities();

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('1');
    expect(results[0].priority_reason).toContain('WSJF score 10.0');
    expect(results[1].id).toBe('2');
    expect(results[2].id).toBe('3');
  });

  test('should fallback to status/created_at when no WSJF data', async () => {
    const mockData = [
      { id: '1', title: 'In Progress', status: 'in_progress', wsjf_score: 0, business_value: 0, time_criticality: 0, created_at: '2025-01-01' },
      { id: '2', title: 'Active', status: 'active', wsjf_score: 0, business_value: 0, time_criticality: 0, created_at: '2025-01-02' },
      { id: '3', title: 'Draft Old', status: 'draft', wsjf_score: 0, business_value: 0, time_criticality: 0, created_at: '2024-12-01' },
      { id: '4', title: 'Draft New', status: 'draft', wsjf_score: 0, business_value: 0, time_criticality: 0, created_at: '2025-01-03' }
    ];

    mockSupabase.limit.mockResolvedValue({ data: mockData, error: null });

    const results = await fetcher.getTop3Priorities();

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('1'); // in_progress has highest priority
    expect(results[0].priority_reason).toContain('in progress status');
    expect(results[1].id).toBe('2'); // active is second
    expect(results[2].id).toBe('4'); // newer draft over older
  });

  test('should handle empty results gracefully', async () => {
    mockSupabase.limit.mockResolvedValue({ data: [], error: null });

    const results = await fetcher.getTop3Priorities();

    expect(results).toEqual([]);
  });
});