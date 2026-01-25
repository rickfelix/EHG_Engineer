/**
 * Secret Redactor Unit Tests
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-08 (TR-4, TS-5)
 * Tests pattern-based secret redaction
 */

import { describe, it, expect } from '@jest/globals';
import { redactSecrets, redactObject, containsSecrets } from '../../../scripts/modules/session-summary/secret-redactor.js';

describe('SecretRedactor', () => {
  describe('redactSecrets', () => {
    it('should redact api_key patterns', () => {
      expect(redactSecrets('api_key=ABC123SECRET456789')).toBe('api_key=[REDACTED]');
      expect(redactSecrets('api-key: super_secret_key_12345')).toContain('[REDACTED]');
      expect(redactSecrets('APIKEY=mysecretapikey12345')).toContain('[REDACTED]');
    });

    it('should redact Authorization Bearer tokens', () => {
      expect(redactSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token')).toBe('Authorization: Bearer [REDACTED]');
    });

    it('should redact Authorization Basic tokens', () => {
      expect(redactSecrets('Authorization: Basic dXNlcjpwYXNzd29yZA==')).toBe('Authorization: Basic [REDACTED]');
    });

    it('should redact password patterns', () => {
      expect(redactSecrets('password=hunter2')).toBe('password=[REDACTED]');
      expect(redactSecrets('PASSWORD: supersecret123')).toContain('[REDACTED]');
      expect(redactSecrets('passwd=mypass')).toContain('[REDACTED]');
    });

    it('should redact database connection strings', () => {
      expect(redactSecrets('postgres://user:password@localhost/db')).toBe('postgres://[REDACTED]@localhost/db');
      expect(redactSecrets('mysql://admin:secret123@mysql.server.com/mydb')).toBe('mysql://[REDACTED]@mysql.server.com/mydb');
      expect(redactSecrets('mongodb://root:pass@mongo.host/admin')).toBe('mongodb://[REDACTED]@mongo.host/admin');
    });

    it('should redact AWS credentials', () => {
      expect(redactSecrets('AKIAIOSFODNN7EXAMPLE')).toBe('[AWS_KEY_REDACTED]');
      expect(redactSecrets('aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toContain('[REDACTED]');
    });

    it('should redact Supabase keys', () => {
      expect(redactSecrets('SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret')).toContain('[REDACTED]');
      expect(redactSecrets('SUPABASE_ANON_KEY=public_anon_key_value')).toContain('[REDACTED]');
    });

    it('should redact JWTs', () => {
      // JWT pattern requires at least 50 chars in first segment
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImV4dHJhIjoiZGF0YXRvbWFrZWl0bG9uZ2VyIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
      expect(redactSecrets(jwt)).toBe('[JWT_REDACTED]');
    });

    it('should redact private keys', () => {
      const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7etc\n-----END PRIVATE KEY-----';
      expect(redactSecrets(privateKey)).toBe('[PRIVATE_KEY_REDACTED]');
    });

    it('should redact GitHub tokens', () => {
      expect(redactSecrets('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('[GITHUB_TOKEN_REDACTED]');
      expect(redactSecrets('gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('[GITHUB_OAUTH_REDACTED]');
    });

    it('should redact OpenAI/Anthropic keys', () => {
      expect(redactSecrets('sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('[OPENAI_KEY_REDACTED]');
      const anthropicKey = 'sk-ant-' + 'x'.repeat(80);
      expect(redactSecrets(anthropicKey)).toBe('[ANTHROPIC_KEY_REDACTED]');
    });

    it('should redact generic secret patterns', () => {
      expect(redactSecrets('secret=very_secret_value_123')).toContain('[REDACTED]');
      expect(redactSecrets('token: my_access_token_12345')).toContain('[REDACTED]');
      expect(redactSecrets('credential=some_credential_value')).toContain('[REDACTED]');
    });

    it('should handle null and undefined input', () => {
      expect(redactSecrets(null)).toBeNull();
      expect(redactSecrets(undefined)).toBeUndefined();
    });

    it('should handle non-string input', () => {
      expect(redactSecrets(12345)).toBe(12345);
      expect(redactSecrets({})).toEqual({});
    });

    it('should preserve non-sensitive text', () => {
      const text = 'This is a normal log message without any secrets';
      expect(redactSecrets(text)).toBe(text);
    });

    it('should handle multiple secrets in one string', () => {
      // api_key pattern requires at least 16 chars
      const text = 'api_key=secret_key_value_1234567890 and password=hunter2';
      const result = redactSecrets(text);
      expect(result).toContain('api_key=[REDACTED]');
      expect(result).toContain('password=[REDACTED]');
      expect(result).not.toContain('secret_key_value');
      expect(result).not.toContain('hunter2');
    });
  });

  describe('redactObject', () => {
    it('should redact secrets in object values', () => {
      const obj = {
        message: 'Error: api_key=secret_value_that_is_long_enough_123',
        code: 'AUTH_ERROR'
      };

      const result = redactObject(obj);

      expect(result.message).toContain('[REDACTED]');
      expect(result.message).not.toContain('secret_value_that_is_long');
      expect(result.code).toBe('AUTH_ERROR');
    });

    it('should redact nested objects', () => {
      const obj = {
        level1: {
          level2: {
            secret: 'password=hunter2'
          }
        }
      };

      const result = redactObject(obj);

      expect(result.level1.level2.secret).toContain('[REDACTED]');
    });

    it('should redact arrays', () => {
      const arr = [
        'normal text',
        'api_key=secret_value_12345',
        { nested: 'password=test123' }
      ];

      const result = redactObject(arr);

      expect(result[0]).toBe('normal text');
      expect(result[1]).toContain('[REDACTED]');
      expect(result[2].nested).toContain('[REDACTED]');
    });

    it('should redact values of sensitive keys', () => {
      const obj = {
        username: 'john',
        password: 'super_secret',
        api_key: 'my_api_key',
        token: 'access_token_value',
        normal_field: 'normal value'
      };

      const result = redactObject(obj);

      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.normal_field).toBe('normal value');
    });

    it('should handle circular references', () => {
      const obj = { name: 'test' };
      obj.self = obj;

      const result = redactObject(obj);

      expect(result.name).toBe('test');
      expect(result.self).toBe('[CIRCULAR_REFERENCE]');
    });

    it('should handle null and undefined', () => {
      expect(redactObject(null)).toBeNull();
      expect(redactObject(undefined)).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(redactObject(42)).toBe(42);
      expect(redactObject(true)).toBe(true);
      expect(redactObject('simple string')).toBe('simple string');
    });
  });

  describe('containsSecrets', () => {
    it('should detect API keys', () => {
      expect(containsSecrets('api_key=secret123456789012')).toBe(true);
    });

    it('should detect Bearer tokens', () => {
      expect(containsSecrets('Authorization: Bearer sometoken')).toBe(true);
    });

    it('should detect passwords', () => {
      expect(containsSecrets('password=mypassword')).toBe(true);
    });

    it('should detect database URLs', () => {
      expect(containsSecrets('postgres://user:pass@host/db')).toBe(true);
    });

    it('should return false for clean text', () => {
      expect(containsSecrets('This is normal text')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(containsSecrets(null)).toBe(false);
      expect(containsSecrets(undefined)).toBe(false);
    });

    it('should handle non-strings', () => {
      expect(containsSecrets(12345)).toBe(false);
      expect(containsSecrets({})).toBe(false);
    });
  });

  describe('Edge Cases (TS-5)', () => {
    it('should redact secrets appearing at start of string', () => {
      // api_key pattern requires at least 16 chars
      expect(redactSecrets('api_key=start_secret_value_12345')).toContain('[REDACTED]');
    });

    it('should redact secrets appearing at end of string', () => {
      // api_key pattern requires at least 16 chars
      expect(redactSecrets('end with api_key=endsecretvalue_123456')).toContain('[REDACTED]');
    });

    it('should handle empty strings', () => {
      expect(redactSecrets('')).toBe('');
    });

    it('should handle very long strings', () => {
      const longString = 'x'.repeat(10000) + 'api_key=secret123' + 'x'.repeat(10000);
      const result = redactSecrets(longString);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('secret123');
    });

    it('should not produce false positives for short values', () => {
      // api_key pattern requires at least 16 chars after =
      expect(redactSecrets('api_key=short')).toBe('api_key=short');
    });

    it('should handle special regex characters in surrounding text', () => {
      expect(redactSecrets('[test] api_key=secret_value_12345 {info}')).toContain('[REDACTED]');
    });
  });
});
