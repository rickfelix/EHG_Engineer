#!/usr/bin/env node

/**
 * Encryption Module for Multi-Application Credential Management
 * LEO Protocol v3.1.5 - Secure credential storage
 * Uses AES-256-GCM for encryption with key derivation
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class CredentialEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.saltLength = 64;
    this.tagLength = 16;
    this.ivLength = 16;
    this.iterations = 100000; // PBKDF2 iterations
    this.keyPath = path.join(__dirname, '../../.leo-keys');
  }

  /**
   * Generate or load the master key
   */
  async getMasterKey() {
    try {
      // Check if key file exists
      await fs.access(this.keyPath);
      const keyData = await fs.readFile(this.keyPath, 'utf8');
      const parsed = JSON.parse(keyData);
      return Buffer.from(parsed.key, 'hex');
    } catch (error) {
      // Generate new key if doesn't exist
      console.log('🔑 Generating new master key...');
      const masterKey = crypto.randomBytes(32);
      const keyData = {
        key: masterKey.toString('hex'),
        created: new Date().toISOString(),
        version: 'v1',
        algorithm: this.algorithm
      };
      
      await fs.writeFile(
        this.keyPath,
        JSON.stringify(keyData, null, 2),
        { mode: 0o600 } // Read/write for owner only
      );
      
      console.log('✅ Master key generated and saved to .leo-keys');
      console.log('⚠️  IMPORTANT: Back up .leo-keys file securely!');
      
      return masterKey;
    }
  }

  /**
   * Derive a key from master key and salt
   */
  deriveKey(masterKey, salt) {
    return crypto.pbkdf2Sync(masterKey, salt, this.iterations, 32, 'sha256');
  }

  /**
   * Encrypt data
   */
  async encrypt(data, appId = 'default') {
    try {
      const masterKey = await this.getMasterKey();
      
      // Generate salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive key from master key
      const key = this.deriveKey(masterKey, salt);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(data), 'utf8'),
        cipher.final()
      ]);
      
      // Get auth tag
      const authTag = cipher.getAuthTag();
      
      // Combine salt, iv, authTag, and encrypted data
      const combined = Buffer.concat([
        salt,
        iv,
        authTag,
        encrypted
      ]);
      
      // Return base64 encoded
      return {
        encrypted: combined.toString('base64'),
        metadata: {
          appId,
          algorithm: this.algorithm,
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data
   */
  async decrypt(encryptedData, metadata = {}) {
    try {
      const masterKey = await this.getMasterKey();
      
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract components
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const authTag = combined.slice(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength
      );
      const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);
      
      // Derive key
      const key = this.deriveKey(masterKey, salt);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt credentials for an application
   */
  async encryptAppCredentials(appId, credentials) {
    const result = await this.encrypt(credentials, appId);
    const credPath = path.join(__dirname, `../../applications/${appId}/.env.encrypted`);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(credPath), { recursive: true });
    
    // Save encrypted credentials
    await fs.writeFile(credPath, JSON.stringify(result, null, 2));
    
    return credPath;
  }

  /**
   * Decrypt credentials for an application
   */
  async decryptAppCredentials(appId) {
    const credPath = path.join(__dirname, `../../applications/${appId}/.env.encrypted`);
    
    try {
      const encryptedFile = await fs.readFile(credPath, 'utf8');
      const { encrypted, metadata } = JSON.parse(encryptedFile);
      return await this.decrypt(encrypted, metadata);
    } catch (error) {
      throw new Error(`Failed to decrypt credentials for ${appId}: ${error.message}`);
    }
  }

  /**
   * Rotate encryption key
   */
  async rotateKey() {
    console.log('🔄 Starting key rotation...');
    
    // Generate new master key
    const newMasterKey = crypto.randomBytes(32);
    const timestamp = new Date().toISOString();
    
    // Backup old key
    const backupPath = `${this.keyPath}.backup-${Date.now()}`;
    try {
      await fs.access(this.keyPath);
      await fs.copyFile(this.keyPath, backupPath);
      console.log(`📦 Old key backed up to ${backupPath}`);
    } catch (error) {
      console.log('📝 No existing key to backup');
    }
    
    // Save new key
    const keyData = {
      key: newMasterKey.toString('hex'),
      created: timestamp,
      rotated: timestamp,
      version: 'v1',
      algorithm: this.algorithm
    };
    
    await fs.writeFile(
      this.keyPath,
      JSON.stringify(keyData, null, 2),
      { mode: 0o600 }
    );
    
    console.log('✅ Key rotation complete');
    console.log('⚠️  Re-encrypt all credentials with: npm run reencrypt-all');
    
    return true;
  }

  /**
   * Validate encryption setup
   */
  async validateSetup() {
    try {
      // Test encryption/decryption
      const testData = { test: 'data', timestamp: Date.now() };
      const encrypted = await this.encrypt(testData);
      const decrypted = await this.decrypt(encrypted.encrypted, encrypted.metadata);
      
      if (JSON.stringify(testData) !== JSON.stringify(decrypted)) {
        throw new Error('Encryption validation failed');
      }
      
      console.log('✅ Encryption module validated successfully');
      return true;
    } catch (error) {
      console.error('❌ Encryption validation failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new CredentialEncryption();

// CLI interface if run directly
if (require.main === module) {
  const encryption = new CredentialEncryption();
  
  async function cli() {
    const command = process.argv[2];
    
    switch (command) {
      case 'validate':
        await encryption.validateSetup();
        break;
        
      case 'rotate':
        await encryption.rotateKey();
        break;
        
      case 'encrypt':
        if (!process.argv[3]) {
          console.error('Usage: node encryption.js encrypt <json-string>');
          process.exit(1);
        }
        const data = JSON.parse(process.argv[3]);
        const result = await encryption.encrypt(data);
        console.log(JSON.stringify(result, null, 2));
        break;
        
      case 'decrypt':
        if (!process.argv[3]) {
          console.error('Usage: node encryption.js decrypt <encrypted-string>');
          process.exit(1);
        }
        const decrypted = await encryption.decrypt(process.argv[3]);
        console.log(JSON.stringify(decrypted, null, 2));
        break;
        
      default:
        console.log(`
Credential Encryption Module - LEO Protocol v3.1.5

Usage:
  node encryption.js <command>

Commands:
  validate    Test encryption/decryption
  rotate      Rotate master key
  encrypt     Encrypt JSON data
  decrypt     Decrypt encrypted data

Examples:
  node encryption.js validate
  node encryption.js encrypt '{"key":"value"}'
  node encryption.js decrypt <encrypted-string>
        `);
    }
  }
  
  cli().catch(console.error);
}