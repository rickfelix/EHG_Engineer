/**
 * Secret Redactor Utility
 *
 * Redacts secrets and PII from text strings using pattern-based detection.
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-08 (TR-4)
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md
 */

// Patterns for detecting secrets that should be redacted
const SECRET_PATTERNS = [
  // API keys and tokens
  { pattern: /api[_-]?key\s*[=:]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi, replacement: 'api_key=[REDACTED]' },
  { pattern: /apikey\s*[=:]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi, replacement: 'apikey=[REDACTED]' },
  { pattern: /secret[_-]?key\s*[=:]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi, replacement: 'secret_key=[REDACTED]' },
  { pattern: /access[_-]?token\s*[=:]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi, replacement: 'access_token=[REDACTED]' },
  { pattern: /refresh[_-]?token\s*[=:]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi, replacement: 'refresh_token=[REDACTED]' },

  // Authorization headers
  { pattern: /Authorization:\s*Bearer\s+[a-zA-Z0-9_\-\.]+/gi, replacement: 'Authorization: Bearer [REDACTED]' },
  { pattern: /Authorization:\s*Basic\s+[a-zA-Z0-9+\/=]+/gi, replacement: 'Authorization: Basic [REDACTED]' },

  // Passwords
  { pattern: /password\s*[=:]\s*['"]?([^\s'"]+)['"]?/gi, replacement: 'password=[REDACTED]' },
  { pattern: /passwd\s*[=:]\s*['"]?([^\s'"]+)['"]?/gi, replacement: 'passwd=[REDACTED]' },

  // Database connection strings
  { pattern: /postgres:\/\/[^@]+@/gi, replacement: 'postgres://[REDACTED]@' },
  { pattern: /mysql:\/\/[^@]+@/gi, replacement: 'mysql://[REDACTED]@' },
  { pattern: /mongodb:\/\/[^@]+@/gi, replacement: 'mongodb://[REDACTED]@' },

  // AWS credentials
  { pattern: /AKIA[A-Z0-9]{16}/g, replacement: '[AWS_KEY_REDACTED]' },
  { pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*['"]?([a-zA-Z0-9+\/=]{40})['"]?/gi, replacement: 'aws_secret_access_key=[REDACTED]' },

  // Supabase
  { pattern: /SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*['"]?([^\s'"]+)['"]?/gi, replacement: 'SUPABASE_SERVICE_ROLE_KEY=[REDACTED]' },
  { pattern: /SUPABASE_ANON_KEY\s*[=:]\s*['"]?([^\s'"]+)['"]?/gi, replacement: 'SUPABASE_ANON_KEY=[REDACTED]' },
  { pattern: /eyJ[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, replacement: '[JWT_REDACTED]' },

  // Private keys
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, replacement: '[PRIVATE_KEY_REDACTED]' },
  { pattern: /-----BEGIN\s+ENCRYPTED\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+ENCRYPTED\s+PRIVATE\s+KEY-----/g, replacement: '[ENCRYPTED_PRIVATE_KEY_REDACTED]' },

  // GitHub tokens
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: '[GITHUB_TOKEN_REDACTED]' },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, replacement: '[GITHUB_OAUTH_REDACTED]' },
  { pattern: /ghu_[a-zA-Z0-9]{36}/g, replacement: '[GITHUB_USER_TOKEN_REDACTED]' },

  // OpenAI/Anthropic keys
  { pattern: /sk-[a-zA-Z0-9]{48}/g, replacement: '[OPENAI_KEY_REDACTED]' },
  { pattern: /sk-ant-[a-zA-Z0-9\-]{80,}/g, replacement: '[ANTHROPIC_KEY_REDACTED]' },

  // ── Venture-stack secrets (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 C3 / SECURITY VB-3) ──
  // The venture build stack is Clerk (auth) + Gemini/Google AI + Replit (host) — NOT the
  // Supabase/GitHub the platform scanner already knew. Without these, a ventures secret
  // leaking into a seeded/pushed artifact scanned PASS (false negative). label is used by
  // scanSecrets() to name the leak class in the blocking-gate message.
  // Clerk live secret key (sk_live_/sk_test_) — the high-blast-radius one.
  { pattern: /sk_(?:live|test)_[a-zA-Z0-9]{20,}/g, replacement: '[CLERK_SECRET_KEY_REDACTED]', label: 'clerk_secret_key' },
  // Clerk publishable key (pk_live_/pk_test_) — lower sensitivity but named in VB-3.
  { pattern: /pk_(?:live|test)_[a-zA-Z0-9]{20,}/g, replacement: '[CLERK_PUBLISHABLE_KEY_REDACTED]', label: 'clerk_publishable_key' },
  // Google AI / Gemini API key (AIza + 35 chars).
  { pattern: /AIza[a-zA-Z0-9_\-]{35}/g, replacement: '[GOOGLE_AI_KEY_REDACTED]', label: 'google_ai_key' },
  // Replit DB URL (carries an embedded credential) + REPLIT_* env-style secrets.
  { pattern: /https?:\/\/[^\s'"@]+:[^\s'"@]+@[^\s'"]*\.replit\.[a-z]+/gi, replacement: '[REPLIT_DB_URL_REDACTED]', label: 'replit_db_url' },
  { pattern: /REPLIT_[A-Z0-9_]*(?:TOKEN|KEY|SECRET|DB_URL|PASSWORD)\s*[=:]\s*['"]?([^\s'"]+)['"]?/gi, replacement: 'REPLIT_SECRET=[REDACTED]', label: 'replit_secret' },

  // Generic secret patterns
  { pattern: /secret\s*[=:]\s*['"]?([^\s'"]{16,})['"]?/gi, replacement: 'secret=[REDACTED]' },
  { pattern: /token\s*[=:]\s*['"]?([^\s'"]{16,})['"]?/gi, replacement: 'token=[REDACTED]' },
  { pattern: /credential\s*[=:]\s*['"]?([^\s'"]{16,})['"]?/gi, replacement: 'credential=[REDACTED]' }
];

/**
 * Redact secrets from a string
 * @param {string} text - Text to redact
 * @returns {string} Redacted text
 */
export function redactSecrets(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let redacted = text;

  for (const { pattern, replacement } of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
}

/**
 * Redact secrets from an object recursively
 * @param {any} obj - Object to redact
 * @param {Set<any>} seen - Set of seen objects (circular reference protection)
 * @returns {any} Redacted object
 */
export function redactObject(obj, seen = new Set()) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactSecrets(obj);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // Circular reference protection
  if (seen.has(obj)) {
    return '[CIRCULAR_REFERENCE]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, seen));
  }

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    // Redact values for known sensitive keys
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('api_key') ||
      lowerKey.includes('credential') ||
      lowerKey.includes('private_key')
    ) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactObject(value, seen);
    }
  }

  return redacted;
}

/**
 * Check if text contains any secrets
 * @param {string} text - Text to check
 * @returns {boolean} True if secrets detected
 */
export function containsSecrets(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  for (const { pattern } of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Scan text for secrets and report WHICH classes matched.
 *
 * Unlike containsSecrets (boolean), this returns the distinct category labels so a
 * blocking gate (e.g. the venture push path, SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001
 * C3 / VB-3) can tell the operator exactly what leaked. Category is the pattern's
 * `label` when present, else a slug derived from its replacement token.
 *
 * @param {string} text
 * @returns {{ found: boolean, categories: string[] }}
 */
export function scanSecrets(text) {
  if (!text || typeof text !== 'string') {
    return { found: false, categories: [] };
  }
  const categories = new Set();
  for (const { pattern, replacement, label } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      const category = label
        || String(replacement).replace(/[=:].*$/, '').replace(/[\[\]]/g, '').replace(/_?REDACTED/i, '').replace(/_+$/,'').toLowerCase()
        || 'secret';
      categories.add(category);
    }
  }
  return { found: categories.size > 0, categories: [...categories] };
}

export default {
  redactSecrets,
  redactObject,
  containsSecrets,
  scanSecrets,
  SECRET_PATTERNS
};
