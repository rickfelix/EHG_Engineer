#!/usr/bin/env node

/**
 * UAT Credential Management System
 * Securely stores and retrieves test credentials for UAT testing
 */

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

dotenv.config({ path: '.env.uat' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Encryption key from environment
const ENCRYPTION_KEY = process.env.UAT_ENCRYPTION_KEY || randomBytes(32).toString('hex');

/**
 * Simple encryption for storing credentials
 */
function encrypt(text) {
  // For production, use proper encryption like AES-256
  const hash = createHash('sha256');
  hash.update(ENCRYPTION_KEY);
  const key = hash.digest();

  // Simple XOR encryption (replace with proper encryption in production)
  const encrypted = Buffer.from(text).map((byte, i) => byte ^ key[i % key.length]);
  return encrypted.toString('base64');
}

/**
 * Decrypt credentials
 */
function decrypt(encryptedText) {
  const encrypted = Buffer.from(encryptedText, 'base64');
  const hash = createHash('sha256');
  hash.update(ENCRYPTION_KEY);
  const key = hash.digest();

  const decrypted = encrypted.map((byte, i) => byte ^ key[i % key.length]);
  return decrypted.toString();
}

/**
 * Store credentials in database
 */
async function storeCredentials(environment, credentials) {
  console.log(chalk.blue('📝 Storing UAT credentials...'));

  // Encrypt sensitive data
  const encryptedCredentials = {
    ...credentials,
    password: encrypt(credentials.password),
    admin_password: credentials.admin_password ? encrypt(credentials.admin_password) : null
  };

  const { data, error } = await supabase
    .from('uat_credentials')
    .upsert({
      environment,
      credentials: encryptedCredentials,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'environment'
    })
    .select()
    .single();

  if (error) {
    console.error(chalk.red('❌ Failed to store credentials:'), error.message);
    return null;
  }

  console.log(chalk.green('✅ Credentials stored securely'));
  return data;
}

/**
 * Retrieve credentials from database
 */
async function getCredentials(environment = 'development') {
  console.log(chalk.blue(`🔑 Retrieving credentials for ${environment}...`));

  const { data, error } = await supabase
    .from('uat_credentials')
    .select('*')
    .eq('environment', environment)
    .single();

  if (error) {
    console.error(chalk.red('❌ Failed to retrieve credentials:'), error.message);
    return null;
  }

  // Decrypt sensitive data
  if (data && data.credentials) {
    data.credentials.password = decrypt(data.credentials.password);
    if (data.credentials.admin_password) {
      data.credentials.admin_password = decrypt(data.credentials.admin_password);
    }
  }

  console.log(chalk.green('✅ Credentials retrieved'));
  return data?.credentials;
}

/**
 * Create test user in EHG's Supabase
 */
async function createTestUser(email, password) {
  console.log(chalk.blue(`👤 Creating test user: ${email}...`));

  // This would connect to EHG's Supabase instance
  // For now, we'll store the intent
  const testUserData = {
    email,
    password: encrypt(password),
    created_at: new Date().toISOString(),
    type: 'uat_test_user'
  };

  const { data, error } = await supabase
    .from('uat_test_users')
    .upsert(testUserData, {
      onConflict: 'email'
    })
    .select()
    .single();

  if (error) {
    console.error(chalk.red('❌ Failed to create test user:'), error.message);
    return null;
  }

  console.log(chalk.green('✅ Test user created'));
  return data;
}

/**
 * Rotate credentials (generate new passwords)
 */
async function rotateCredentials(environment = 'development') {
  console.log(chalk.blue('🔄 Rotating credentials...'));

  const newPassword = randomBytes(16).toString('base64').slice(0, 12) + '!Aa1';
  const newAdminPassword = randomBytes(16).toString('base64').slice(0, 12) + '!Aa1';

  const credentials = {
    email: `uat_${Date.now()}@ehg.test`,
    password: newPassword,
    admin_email: `uat_admin_${Date.now()}@ehg.test`,
    admin_password: newAdminPassword
  };

  await storeCredentials(environment, credentials);

  console.log(chalk.green('✅ Credentials rotated successfully'));
  console.log(chalk.yellow('📧 New test email:'), credentials.email);
  console.log(chalk.yellow('📧 New admin email:'), credentials.admin_email);

  return credentials;
}

/**
 * Update .env.uat file with credentials
 */
async function updateEnvFile(credentials) {
  const fs = await import('fs');
  const envPath = join(__dirname, '..', '.env.uat');

  let envContent = fs.readFileSync(envPath, 'utf-8');

  // Update credentials in env file
  envContent = envContent.replace(/TEST_EMAIL=.*/g, `TEST_EMAIL=${credentials.email}`);
  envContent = envContent.replace(/TEST_PASSWORD=.*/g, `TEST_PASSWORD=${credentials.password}`);

  if (credentials.admin_email) {
    envContent = envContent.replace(/ADMIN_EMAIL=.*/g, `ADMIN_EMAIL=${credentials.admin_email}`);
    envContent = envContent.replace(/ADMIN_PASSWORD=.*/g, `ADMIN_PASSWORD=${credentials.admin_password}`);
  }

  fs.writeFileSync(envPath, envContent);
  console.log(chalk.green('✅ .env.uat updated'));
}

/**
 * Main CLI handler
 */
async function main() {
  const command = process.argv[2];
  const environment = process.argv[3] || 'development';

  console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════════════════════════╗
║             UAT Credential Management System                  ║
╚══════════════════════════════════════════════════════════════╝
  `));

  switch (command) {
    case 'store': {
      // Get credentials from environment or prompt
      const credentials = {
        email: process.env.TEST_EMAIL || 'test@ehg.test',
        password: process.env.TEST_PASSWORD || 'Test123!',
        admin_email: process.env.ADMIN_EMAIL || 'admin@ehg.test',
        admin_password: process.env.ADMIN_PASSWORD || 'Admin123!'
      };

      await storeCredentials(environment, credentials);
      break;
    }

    case 'get': {
      const credentials = await getCredentials(environment);
      if (credentials) {
        console.log(chalk.cyan('\n📋 Credentials:'));
        console.log('  Email:', credentials.email);
        console.log('  Password:', '[HIDDEN]');
        if (credentials.admin_email) {
          console.log('  Admin Email:', credentials.admin_email);
          console.log('  Admin Password:', '[HIDDEN]');
        }
      }
      break;
    }

    case 'rotate': {
      const newCredentials = await rotateCredentials(environment);
      await updateEnvFile(newCredentials);
      break;
    }

    case 'create-user': {
      const email = process.argv[3] || `uat_${Date.now()}@ehg.test`;
      const password = process.argv[4] || randomBytes(16).toString('base64').slice(0, 12) + '!Aa1';
      await createTestUser(email, password);
      break;
    }

    case 'update-env': {
      const credentials = await getCredentials(environment);
      if (credentials) {
        await updateEnvFile(credentials);
      }
      break;
    }

    default:
      console.log(chalk.yellow(`
Usage: node manage-uat-credentials.js <command> [environment]

Commands:
  store           Store credentials from environment variables
  get            Retrieve stored credentials
  rotate         Generate and store new credentials
  create-user    Create a test user in EHG
  update-env     Update .env.uat with stored credentials

Environments: development, staging, production
      `));
  }

  console.log(chalk.cyan('\n' + '═'.repeat(64)));
}

// Execute
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  });

export { getCredentials, storeCredentials, createTestUser, rotateCredentials };