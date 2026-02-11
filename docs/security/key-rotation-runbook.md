# Key Rotation Runbook

## Overview

This runbook covers rotating all compromised credentials found during the security audit (SD-LEO-ORCH-SECURITY-AUDIT-REMEDIATION-001). Follow these steps **after** merging the secrets removal PR.

## Prerequisites

- Admin access to Supabase Dashboard
- Access to OpenAI, Resend, Gemini, and other API provider dashboards
- Local `.env` file updated after each rotation

## 1. Supabase API Keys

### 1.1 Rotate Anon Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) > Your Project > Settings > API
2. Click "Regenerate anon key"
3. Copy the new key
4. Update in **EHG_Engineer**:
   ```bash
   # Edit .env
   SUPABASE_ANON_KEY=<new-key>
   ```
5. Update in **EHG App** (ehg/.env):
   ```bash
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<new-key>
   ```
6. Update in GitHub Actions secrets:
   ```bash
   gh secret set SUPABASE_ANON_KEY --body "<new-key>"
   ```

### 1.2 Rotate Service Role Key

**WARNING**: This key bypasses ALL RLS policies. Handle with extreme care.

1. Go to Supabase Dashboard > Settings > API
2. Click "Regenerate service_role key"
3. Copy the new key
4. Update in **EHG_Engineer** `.env`:
   ```bash
   SUPABASE_SERVICE_ROLE_KEY=<new-key>
   ```
5. Update in GitHub Actions:
   ```bash
   gh secret set SUPABASE_SERVICE_ROLE_KEY --body "<new-key>"
   ```
6. **Do NOT** put this key in any client-side code or public config

### 1.3 Rotate Database Password

1. Go to Supabase Dashboard > Settings > Database
2. Click "Reset database password"
3. Wait 1-2 minutes for propagation
4. Update in `.env`:
   ```bash
   SUPABASE_DB_PASSWORD=<new-password>
   ```

## 2. OpenAI API Key

1. Go to [OpenAI Dashboard](https://platform.openai.com/api-keys)
2. Revoke the compromised key (starts with `sk-proj-`)
3. Create a new key
4. Update in `.env`:
   ```bash
   OPENAI_API_KEY=<new-key>
   ```
5. Update in GitHub Actions:
   ```bash
   gh secret set OPENAI_API_KEY --body "<new-key>"
   ```

## 3. Other API Keys

### Resend API Key
1. Go to [Resend Dashboard](https://resend.com/api-keys)
2. Revoke old key, create new one
3. Update `.env`: `RESEND_API_KEY=<new-key>`

### Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Revoke old key, create new one
3. Update `.env`: `GEMINI_API_KEY=<new-key>`

## 4. Verification

After rotating all keys, verify the system still works:

```bash
# Test Supabase connection
node -e "require('dotenv').config(); const {createClient}=require('@supabase/supabase-js'); createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY).from('strategic_directives_v2').select('count').then(r=>console.log('Supabase OK:', r.status===200)).catch(e=>console.error('FAIL:', e.message))"

# Test database connection
node scripts/lib/supabase-connection.js engineer

# Test LLM
node -e "require('dotenv').config(); fetch('https://api.openai.com/v1/models', {headers:{'Authorization':'Bearer '+process.env.OPENAI_API_KEY}}).then(r=>console.log('OpenAI OK:', r.ok)).catch(e=>console.error('FAIL:', e.message))"
```

## 5. Git History Purge (Optional but Recommended)

Old keys remain in git history even after removal from HEAD. To fully purge:

```bash
# Install BFG Repo-Cleaner
# https://rtyley.github.io/bfg-repo-cleaner/

# Create a file with secrets to remove
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSI..." > secrets-to-remove.txt
# Add all old keys to this file

# Run BFG
java -jar bfg.jar --replace-text secrets-to-remove.txt

# Clean up
git reflog expire --expire=now --all && git gc --prune=now --aggressive

# Force push (COORDINATE WITH TEAM)
git push --force
```

**WARNING**: Force-push rewrites history for all collaborators. Coordinate before executing.

## Rotation Schedule

| Key | Rotation Frequency | Last Rotated |
|-----|--------------------|--------------|
| Supabase Anon Key | After compromise / annually | Pending |
| Supabase Service Role Key | After compromise / annually | Pending |
| Database Password | After compromise / quarterly | Pending |
| OpenAI API Key | After compromise / quarterly | Pending |
| Resend API Key | After compromise / annually | Pending |
| Gemini API Key | After compromise / annually | Pending |
