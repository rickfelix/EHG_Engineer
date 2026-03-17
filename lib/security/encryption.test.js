/**
 * Unit tests for CredentialEncryption module
 * SD-LEO-INFRA-AUTH-MIDDLEWARE-SECURITY-001
 *
 * Tests: encrypt/decrypt round-trip, key generation/loading, key rotation,
 * error handling, PBKDF2 derivation
 *
 * Note: encryption.js is CJS and uses require('fs').promises internally.
 * We test getMasterKey/rotateKey by overriding the keyPath to use a temp dir,
 * and test encrypt/decrypt round-trip using the real crypto module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Import the module (CJS singleton)
const encryption = (await import('./encryption.js')).default;

// Save original keyPath
const originalKeyPath = encryption.keyPath;

describe('CredentialEncryption', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enc-test-'));
    encryption.keyPath = path.join(tmpDir, '.leo-keys');
  });

  afterEach(async () => {
    encryption.keyPath = originalKeyPath;
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch (_e) { /* ignore */ }
  });

  describe('constructor', () => {
    it('has correct algorithm and parameters', () => {
      expect(encryption.algorithm).toBe('aes-256-gcm');
      expect(encryption.saltLength).toBe(64);
      expect(encryption.tagLength).toBe(16);
      expect(encryption.ivLength).toBe(16);
      expect(encryption.iterations).toBe(100000);
    });
  });

  describe('getMasterKey', () => {
    it('generates new key when no key file exists', async () => {
      const result = await encryption.getMasterKey();

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);

      // Verify key file was created
      const keyData = JSON.parse(await fs.readFile(encryption.keyPath, 'utf8'));
      expect(keyData).toHaveProperty('key');
      expect(keyData).toHaveProperty('created');
      expect(keyData).toHaveProperty('version', 'v1');
      expect(keyData).toHaveProperty('algorithm', 'aes-256-gcm');
      expect(keyData.key.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('loads existing key from file', async () => {
      const testKey = crypto.randomBytes(32);
      const keyData = {
        key: testKey.toString('hex'),
        created: new Date().toISOString(),
        version: 'v1',
        algorithm: 'aes-256-gcm'
      };
      await fs.writeFile(encryption.keyPath, JSON.stringify(keyData));

      const result = await encryption.getMasterKey();

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
      expect(result.toString('hex')).toBe(testKey.toString('hex'));
    });

    it('returns consistent key on repeated calls', async () => {
      const key1 = await encryption.getMasterKey();
      const key2 = await encryption.getMasterKey();

      expect(key1.toString('hex')).toBe(key2.toString('hex'));
    });
  });

  describe('deriveKey', () => {
    it('derives a 32-byte key from master key and salt', () => {
      const masterKey = crypto.randomBytes(32);
      const salt = crypto.randomBytes(64);

      const derived = encryption.deriveKey(masterKey, salt);

      expect(derived).toBeInstanceOf(Buffer);
      expect(derived.length).toBe(32);
    });

    it('produces different keys for different salts', () => {
      const masterKey = crypto.randomBytes(32);
      const salt1 = crypto.randomBytes(64);
      const salt2 = crypto.randomBytes(64);

      const key1 = encryption.deriveKey(masterKey, salt1);
      const key2 = encryption.deriveKey(masterKey, salt2);

      expect(key1.toString('hex')).not.toBe(key2.toString('hex'));
    });

    it('produces same key for same inputs (deterministic)', () => {
      const masterKey = crypto.randomBytes(32);
      const salt = crypto.randomBytes(64);

      const key1 = encryption.deriveKey(masterKey, salt);
      const key2 = encryption.deriveKey(masterKey, salt);

      expect(key1.toString('hex')).toBe(key2.toString('hex'));
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('encrypts and decrypts simple data correctly', async () => {
      const testData = { message: 'hello world', count: 42 };
      const encrypted = await encryption.encrypt(testData);

      expect(encrypted).toHaveProperty('encrypted');
      expect(encrypted).toHaveProperty('metadata');
      expect(encrypted.metadata.algorithm).toBe('aes-256-gcm');
      expect(encrypted.metadata.version).toBe('v1');

      const decrypted = await encryption.decrypt(encrypted.encrypted, encrypted.metadata);
      expect(decrypted).toEqual(testData);
    });

    it('encrypts and decrypts nested objects', async () => {
      const testData = {
        credentials: { apiKey: 'sk-123', secret: 'shhh' },
        config: { retries: 3, timeout: 5000 },
        tags: ['production', 'secure']
      };

      const encrypted = await encryption.encrypt(testData, 'my-app');
      expect(encrypted.metadata.appId).toBe('my-app');

      const decrypted = await encryption.decrypt(encrypted.encrypted);
      expect(decrypted).toEqual(testData);
    });

    it('produces different ciphertext for same plaintext (random IV/salt)', async () => {
      const testData = { same: 'data' };

      const enc1 = await encryption.encrypt(testData);
      const enc2 = await encryption.encrypt(testData);

      expect(enc1.encrypted).not.toBe(enc2.encrypted);
    });

    it('uses default appId when not specified', async () => {
      const encrypted = await encryption.encrypt({ test: true });
      expect(encrypted.metadata.appId).toBe('default');
    });
  });

  describe('decrypt error handling', () => {
    it('throws on corrupted ciphertext', async () => {
      // Ensure key exists first
      await encryption.getMasterKey();

      await expect(encryption.decrypt('not-valid-base64!!!')).rejects.toThrow('Decryption failed');
    });

    it('throws on tampered ciphertext', async () => {
      const encrypted = await encryption.encrypt({ data: 'test' });

      // Tamper with the encrypted data
      const tampered = Buffer.from(encrypted.encrypted, 'base64');
      tampered[tampered.length - 1] ^= 0xff;

      await expect(encryption.decrypt(tampered.toString('base64'))).rejects.toThrow('Decryption failed');
    });
  });

  describe('encryptAppCredentials / decryptAppCredentials', () => {
    it('encrypts and saves credentials to file', async () => {
      const creds = { username: 'admin', password: 'secret' };
      const credPath = await encryption.encryptAppCredentials('test-app', creds);

      expect(credPath).toContain('test-app');

      // Verify file was created
      const savedContent = JSON.parse(await fs.readFile(credPath, 'utf8'));
      expect(savedContent).toHaveProperty('encrypted');
      expect(savedContent).toHaveProperty('metadata');
      expect(savedContent.metadata.appId).toBe('test-app');
    });

    it('throws when encrypted file not found', async () => {
      await expect(encryption.decryptAppCredentials('nonexistent'))
        .rejects.toThrow('Failed to decrypt credentials for nonexistent');
    });
  });

  describe('rotateKey', () => {
    it('backs up old key and creates new key', async () => {
      // Create initial key
      const originalKey = await encryption.getMasterKey();

      const result = await encryption.rotateKey();

      expect(result).toBe(true);

      // Verify new key is different
      const newKeyData = JSON.parse(await fs.readFile(encryption.keyPath, 'utf8'));
      expect(newKeyData.key).not.toBe(originalKey.toString('hex'));
      expect(newKeyData).toHaveProperty('rotated');
    });

    it('creates key even when no previous key exists', async () => {
      const result = await encryption.rotateKey();

      expect(result).toBe(true);

      const keyData = JSON.parse(await fs.readFile(encryption.keyPath, 'utf8'));
      expect(keyData).toHaveProperty('key');
      expect(keyData).toHaveProperty('rotated');
      expect(keyData.version).toBe('v1');
    });
  });

  describe('validateSetup', () => {
    it('returns true when encryption round-trip succeeds', async () => {
      const result = await encryption.validateSetup();
      expect(result).toBe(true);
    });
  });
});
