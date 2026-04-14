/**
 * Mobile Security Defaults — Shared Module
 * SD-MOBILEFIRST-VENTURE-BUILD-STRATEGY-ORCH-001-C
 *
 * Codifies mobile security patterns as reusable defaults that all
 * mobile Replit templates must include. Extracted as a shared module
 * so future platform-specific templates (Option B migration) inherit
 * these patterns automatically.
 *
 * @module lib/eva/bridge/mobile-security-defaults
 */

/**
 * Security instructions for mobile (Expo/React Native) builds.
 * Included in Replit prompts when target_platform is 'mobile' or 'both'.
 */
export const MOBILE_SECURITY_INSTRUCTIONS = `### Mobile Security Requirements

**Secure Storage**:
- Use \`expo-secure-store\` for tokens, API keys, and sensitive user data
- NEVER store secrets in AsyncStorage — it is unencrypted plaintext on device
- Supabase auth tokens should use SecureStore adapter:
  \`\`\`typescript
  import * as SecureStore from 'expo-secure-store';
  const supabase = createClient(url, key, {
    auth: { storage: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    }}
  });
  \`\`\`

**Certificate Pinning** (Production):
- Pin Supabase API certificates to prevent MITM attacks
- Use \`expo-certificate-transparency\` or custom TLS verification
- At minimum, verify HTTPS is enforced on all API calls

**Deep Link Security**:
- Validate all deep link parameters before navigation
- Never pass authentication tokens via deep link URLs
- Use Universal Links (iOS) / App Links (Android) over custom URL schemes

**App Transport Security**:
- All network requests MUST use HTTPS — no HTTP exceptions
- Configure \`app.json\` with strict transport security settings

**No Embedded Secrets**:
- API keys, database URLs, and service credentials must come from environment variables
- React Native JS bundles can be decompiled — assume all bundled code is public
- Use Supabase Edge Functions for server-side operations requiring elevated access

**OTA Update Security** (Expo Updates):
- Enable code signing for OTA updates when using \`expo-updates\`
- Verify update integrity before applying
- Use release channels to separate staging/production updates`;

/**
 * Security instructions for web builds.
 * Used when target_platform is 'web'.
 */
export const WEB_SECURITY_INSTRUCTIONS = `### Web Security Requirements

**Key Management**:
- \`SUPABASE_ANON_KEY\` is safe for client-side code (designed for browser use with RLS)
- \`SUPABASE_SERVICE_ROLE_KEY\` MUST NEVER appear in client code — it bypasses RLS entirely
- All third-party API keys belong in Supabase Edge Functions only

**SECURITY DEFINER Functions**:
- Avoid \`SECURITY DEFINER\` on PostgreSQL functions — they bypass all RLS policies
- If unavoidable, add explicit \`auth.uid()\` checks inside the function body

**Rate Limiting**:
- Edge Functions handling sensitive operations must implement rate limiting
- Use Supabase built-in rate limiting or in-memory counter per user`;

/**
 * Get the appropriate security instructions for a target platform.
 *
 * @param {'mobile'|'web'|'both'} targetPlatform
 * @returns {string} Security instruction block for Replit prompts
 */
export function getSecurityInstructions(targetPlatform) {
  if (targetPlatform === 'mobile' || targetPlatform === 'both') {
    return MOBILE_SECURITY_INSTRUCTIONS;
  }
  return WEB_SECURITY_INSTRUCTIONS;
}
