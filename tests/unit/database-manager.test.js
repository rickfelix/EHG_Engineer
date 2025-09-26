const DatabaseManager = require('../../src/services/DatabaseManager');

describe('DatabaseManager', () => {
  describe('basic functionality', () => {
    test('should be defined', () => {
      expect(DatabaseManager).toBeDefined();
    });

    test('should have required methods', () => {
      const instance = new DatabaseManager();
      expect(typeof instance.getActiveStrategicDirectives).toBe('function');
      expect(typeof instance.updateProgress).toBe('function');
    });
  });

  describe('error handling', () => {
    test('should handle missing configuration gracefully', () => {
      const instance = new DatabaseManager();
      expect(instance).toBeDefined();
    });
  });
});