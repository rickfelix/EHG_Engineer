const DatabaseManager = require('../../src/services/DatabaseManager');

describe('DatabaseManager', () => {
  let dbManager;

  beforeEach(() => {
    dbManager = new DatabaseManager();
  });

  describe('basic functionality', () => {
    test('should be defined', () => {
      expect(DatabaseManager).toBeDefined();
    });

    test('should have required methods', () => {
      expect(typeof dbManager.getActiveStrategicDirectives).toBe('function');
      expect(typeof dbManager.updateProgress).toBe('function');
      expect(typeof dbManager.getStrategicDirective).toBe('function');
      expect(typeof dbManager.updateSDStatus).toBe('function');
      expect(typeof dbManager.createHandoff).toBe('function');
      expect(typeof dbManager.getLatestHandoff).toBe('function');
    });

    test('should initialize with default values', () => {
      expect(dbManager).toBeDefined();
      expect(dbManager.supabase).toBeDefined();
    });
  });

  describe('getActiveStrategicDirectives', () => {
    test('should handle empty results', async () => {
      // Mock Supabase client
      dbManager.supabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: [], error: null })
      };

      const result = await dbManager.getActiveStrategicDirectives();
      expect(result).toEqual([]);
      expect(dbManager.supabase.from).toHaveBeenCalledWith('strategic_directives_v2');
    });

    test('should handle database errors', async () => {
      dbManager.supabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
      };

      const result = await dbManager.getActiveStrategicDirectives();
      expect(result).toEqual([]);
    });

    test('should return active directives', async () => {
      const mockDirectives = [
        { id: 'SD-001', status: 'active', title: 'Test SD 1' },
        { id: 'SD-002', status: 'in_progress', title: 'Test SD 2' }
      ];

      dbManager.supabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: mockDirectives, error: null })
      };

      const result = await dbManager.getActiveStrategicDirectives();
      expect(result).toEqual(mockDirectives);
      expect(dbManager.supabase.in).toHaveBeenCalledWith(
        'status',
        ['draft', 'pending_approval', 'in_progress', 'active']
      );
    });
  });

  describe('updateProgress', () => {
    test('should update progress successfully', async () => {
      dbManager.supabase = {
        from: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [{ id: 'SD-001', metadata: { completion_percentage: 50 } }],
          error: null
        })
      };

      const result = await dbManager.updateProgress('SD-001', 50);
      expect(result).toBe(true);
      expect(dbManager.supabase.update).toHaveBeenCalled();
    });

    test('should handle update errors', async () => {
      dbManager.supabase = {
        from: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Update failed' }
        })
      };

      const result = await dbManager.updateProgress('SD-001', 50);
      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    test('should handle missing configuration gracefully', () => {
      const instance = new DatabaseManager();
      expect(instance).toBeDefined();
    });

    test('should handle missing environment variables', () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const instance = new DatabaseManager();
      expect(instance).toBeDefined();

      // Restore env vars
      if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    });
  });
});