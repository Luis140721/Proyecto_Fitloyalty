import { describe, expect, test } from 'vitest';
import { getToken, setToken, clearToken } from '../src/api';

describe('api: token en localStorage', () => {
  test('should store and clear the token', () => {
    // Arrange
    clearToken();

    // Act
    setToken('abc');
    const guardado = getToken();
    clearToken();

    // Assert
    expect(guardado).toBe('abc');
    expect(getToken()).toBeNull();
  });
});
