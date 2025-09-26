// Intentional failing test to verify recovery mechanism
describe('Recovery Mechanism Test', () => {
  test('this test should fail', () => {
    expect(true).toBe(false);
  });

  test('another failing test', () => {
    expect(1 + 1).toBe(3);
  });

  test('third failing test', () => {
    const result = undefined;
    expect(result.property).toBe('value');
  });
});