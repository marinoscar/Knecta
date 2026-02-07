import { encrypt, decrypt, getEncryptionKey } from './encryption.util';
import { randomBytes } from 'crypto';

describe('Encryption Utility', () => {
  const testKey = randomBytes(32); // Valid 32-byte key

  describe('encrypt', () => {
    it('should return a string in iv:authTag:ciphertext format', () => {
      const result = encrypt('test-password', testKey);
      const parts = result.split(':');
      expect(parts).toHaveLength(3);
      // Each part should be valid base64
      parts.forEach((part) => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      });
    });

    it('should produce different ciphertexts for the same plaintext (random IV)', () => {
      const result1 = encrypt('same-password', testKey);
      const result2 = encrypt('same-password', testKey);
      expect(result1).not.toEqual(result2);
    });

    it('should handle empty string', () => {
      const result = encrypt('', testKey);
      const decrypted = decrypt(result, testKey);
      expect(decrypted).toBe('');
    });

    it('should handle special characters', () => {
      const text = 'p@$$w0rd!#%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encrypt(text, testKey);
      const decrypted = decrypt(encrypted, testKey);
      expect(decrypted).toBe(text);
    });

    it('should handle unicode characters', () => {
      const text = 'пароль密码パスワード';
      const encrypted = encrypt(text, testKey);
      const decrypted = decrypt(encrypted, testKey);
      expect(decrypted).toBe(text);
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted value correctly', () => {
      const original = 'my-secret-database-password';
      const encrypted = encrypt(original, testKey);
      const decrypted = decrypt(encrypted, testKey);
      expect(decrypted).toBe(original);
    });

    it('should throw error for tampered ciphertext', () => {
      const encrypted = encrypt('test', testKey);
      const parts = encrypted.split(':');
      parts[2] = Buffer.from('tampered').toString('base64');
      const tampered = parts.join(':');
      expect(() => decrypt(tampered, testKey)).toThrow();
    });

    it('should throw error for tampered auth tag', () => {
      const encrypted = encrypt('test', testKey);
      const parts = encrypted.split(':');
      parts[1] = Buffer.from(randomBytes(16)).toString('base64');
      const tampered = parts.join(':');
      expect(() => decrypt(tampered, testKey)).toThrow();
    });

    it('should throw error for wrong key', () => {
      const encrypted = encrypt('test', testKey);
      const wrongKey = randomBytes(32);
      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it('should throw error for invalid format', () => {
      expect(() => decrypt('not:valid', testKey)).toThrow(
        'Invalid encrypted format',
      );
      expect(() => decrypt('single', testKey)).toThrow(
        'Invalid encrypted format',
      );
    });
  });

  describe('getEncryptionKey', () => {
    const originalEnv = process.env.ENCRYPTION_KEY;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.ENCRYPTION_KEY = originalEnv;
      } else {
        delete process.env.ENCRYPTION_KEY;
      }
    });

    it('should throw if ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => getEncryptionKey()).toThrow(
        'ENCRYPTION_KEY environment variable is not set',
      );
    });

    it('should accept a base64-encoded 32-byte key', () => {
      const key = randomBytes(32);
      process.env.ENCRYPTION_KEY = key.toString('base64');
      const result = getEncryptionKey();
      expect(result).toEqual(key);
      expect(result.length).toBe(32);
    });

    it('should accept a 32-character UTF-8 key', () => {
      process.env.ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz012345'; // exactly 32 chars
      const result = getEncryptionKey();
      expect(result.length).toBe(32);
    });

    it('should throw for invalid key length', () => {
      process.env.ENCRYPTION_KEY = 'too-short';
      expect(() => getEncryptionKey()).toThrow(
        'ENCRYPTION_KEY must be exactly 32 bytes',
      );
    });
  });
});
