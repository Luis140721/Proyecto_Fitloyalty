const { generateToken, hashToken } = require('../src/lib/invitations');

describe('tokens de invitación', () => {
  test('genera un token URL-safe de 32 bytes', () => {
    const token = generateToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  test('hashea el token con SHA-256 de forma determinista', () => {
    const first = hashToken('token-de-prueba');
    const second = hashToken('token-de-prueba');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken('otro-token')).not.toBe(first);
  });
});
