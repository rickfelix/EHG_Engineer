// Simple test to establish baseline
describe('Basic Tests', () => {
  test('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle strings', () => {
    expect('hello' + ' world').toBe('hello world');
  });

  test('should handle arrays', () => {
    const arr = [1, 2, 3];
    expect(arr.length).toBe(3);
    expect(arr[0]).toBe(1);
  });

  test('should handle objects', () => {
    const obj = { name: 'test', value: 123 };
    expect(obj.name).toBe('test');
    expect(obj.value).toBe(123);
  });
});

describe('Error Handling', () => {
  test('should throw error when expected', () => {
    const throwError = () => {
      throw new Error('Test error');
    };
    expect(throwError).toThrow('Test error');
  });
});