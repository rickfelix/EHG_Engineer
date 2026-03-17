# Configuration Reference

Environment variables used by EHG_Engineer, organized by service. Copy `.env.example` to `.env` and populate with your values.

> **Gap identified:** `SUPABASE_POOLER_URL` is used in `lib/connection-router.js` and several integration tests but is **not** listed in `.env.example`. It should be added.

---

## Supabase

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | — | Supabase project URL. Used by both client-side and server-side code. Aliased as `SUPABASE_URL`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | — | Supabase anonymous key. Used by `createSupabaseClient()` for RLS-respecting operations. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | — | Service role key that **bypasses all RLS**. Used by `createSupabaseServiceClient()`. Never expose to browsers. |
| `SUPABASE_URL` | Optional | — | Alias for `NEXT_PUBLIC_SUPABASE_URL`. Checked as fallback in `lib/supabase-client.js`. |
| `SUPABASE_ANON_KEY` | Optional | — | Alternative anon key name used by `scripts/lib/supabase-connection.js` and the venture-agent package. |
| `SUPABASE_POOLER_URL` | Optional | — | Full PostgreSQL connection string for Supabase's connection pooler. Used by `lib/connection-router.js` for direct `pg.Client` connections and DDL migrations. Format: `postgresql://postgres.PROJECT_ID:PASSWORD@REGION.pooler.supabase.com:5432/postgres` |
| `SUPABASE_DB_PASSWORD` | Optional | — | Database password for building connection strings via `buildConnectionString()`. Required if `SUPABASE_POOLER_URL` is not set and you need direct PG access. |
| `SUPABASE_RLS_AUDITOR_URL` | Optional | — | Connection string for the `rls_auditor` role (read-only on `pg_policies`). Used by `scripts/verify-rls-policies.js`. Rotate every 90 days. |
| `EHG_SUPABASE_URL` | Optional | `https://dedlbzhpgkmetvhbkyzq.supabase.co` | EHG application database URL. Used when `projectKey='ehg'` in `supabase-connection.js`. |
| `EHG_SUPABASE_ANON_KEY` | Optional | — | Anon key for the EHG application database. |
| `EHG_SUPABASE_SERVICE_ROLE_KEY` | Optional | — | Service role key for the EHG application database. |
| `EHG_DB_PASSWORD` | Optional | — | Fallback database password checked after `SUPABASE_DB_PASSWORD`. |
| `DISABLE_SSL_VERIFY` | Optional | `false` | Set to `true` to disable SSL certificate verification in development. Ignored in production (`NODE_ENV=production` always enforces SSL). |

**Example:**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres
```

---

## LLM / AI Providers

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes** (primary) | — | Google Gemini API key. Primary LLM provider for all generation, embedding, and vision tasks. Obtain from [Google AI Studio](https://aistudio.google.com/apikey). Also checked under alias `GOOGLE_AI_API_KEY`. |
| `OPENAI_API_KEY` | Optional | — | OpenAI API key. Secondary fallback provider; also needed for voice/WebRTC features. |
| `ANTHROPIC_API_KEY` | Optional | — | Anthropic API key. Used by `lib/llm/client-factory.js` and `lib/programmatic/tool-loop.js` when preferred provider is not Google. |
| `AI_PROVIDER` | Optional | `google` | Active AI provider. Values: `google`, `openai`, `anthropic`. |
| `AI_MODEL` | Optional | `auto` | Model override. Set to `auto` for automatic selection, or specify a model like `gemini-3.1-pro-preview`, `gpt-5.2`, etc. |
| `GEMINI_IMAGE_MODEL` | Optional | `gemini-3-pro-image-preview` | Model used for image generation tasks in `lib/marketing/ai/image-generator.js`. |

**Provider priority order:** Google Gemini (primary) > OpenAI (secondary) > Ollama (local).

**Example:**

```bash
GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-...
AI_PROVIDER=google
AI_MODEL=auto
```

---

## Local LLM (Ollama)

| Variable | Required | Default | Description |
|---|---|---|---|
| `USE_LOCAL_LLM` | Optional | `false` | Set to `true` to route Haiku-class tasks (classification, fast ops) to local Ollama instead of cloud. |
| `OLLAMA_BASE_URL` | Optional | `http://localhost:11434` | Ollama server URL. |
| `OLLAMA_MODEL` | Optional | `qwen3-coder:30b` | Local model for Haiku-replacement tasks. |
| `OLLAMA_FALLBACK_ENABLED` | Optional | `true` | When `true`, falls back to cloud Haiku if Ollama is unavailable. Set to `false` to disable fallback. |
| `OLLAMA_TIMEOUT_MS` | Optional | `30000` | Request timeout for Ollama calls, in milliseconds. |

**Example:**

```bash
USE_LOCAL_LLM=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3-coder:30b
```

---

## Application

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Optional | `development` | Runtime environment. Values: `development`, `production`, `test`. Controls SSL enforcement, error detail exposure, and behavior guards. |
| `PORT` | Optional | `3000` | HTTP server port. Also accepts `DASHBOARD_PORT` as alias. |
| `DEBUG` | Optional | — | Debug namespace filter. Set to `vision-qa:*` for Vision QA logging, or any truthy value for general debug output in various scripts. |
| `PROJECT_NAME` | Optional | `EHG_Engineer` | Project identifier used in logging and metadata. |
| `LEO_PROTOCOL_VERSION` | Optional | `4.3.3` | Current LEO protocol version. Informational; used in generated metadata. |

**Example:**

```bash
NODE_ENV=development
PORT=3000
DEBUG=vision-qa:*
```

---

## LEO Protocol

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTO_PROCEED` | Optional | — | Controls automatic phase transitions. When truthy (`true`, `1`, `on`), handoffs execute without confirmation prompts. Resolved by `auto-proceed-resolver`. |
| `CLAUDE_PROTOCOL_MODE` | Optional | `full` | Protocol file loading mode. Values: `full` (load full `CLAUDE_*.md` files) or `digest` (load `*_DIGEST.md` variants for smaller context). |
| `LEO_SKIP_HOOKS` | Optional | — | Set to `1` to bypass pre-tool enforcement hooks. Development/debugging only. |
| `LEO_USE_TASK_CONTRACTS` | Optional | `true` | Enable contract-based sub-agent handoffs. Set to `false` to disable (passes full context instead). Reduces context overhead by 50-70%. |
| `LEO_FULL_VALIDATION` | Optional | `true` | Enable full validation on sub-agent results. Set to `false` to skip. |
| `LEO_VALIDATION_SCORE_THRESHOLD` | Optional | `60` | Minimum score (0-100) for sub-agent result validation to pass. |
| `LEO_VALIDATION_MAX_RETRIES` | Optional | `2` | Maximum retry attempts when sub-agent validation fails. |
| `LEO_TESTING_MAX_AGE_HOURS` | Optional | `24` | Maximum age (hours) for test evidence to be considered valid by testing governance. |
| `LEO_EVIDENCE_PACK` | Optional | `false` | Set to `true` to generate evidence packs in the Playwright reporter. |
| `LEO_CLEANUP_TRACES` | Optional | `false` | Set to `true` to auto-delete traces from passing tests. |
| `LEO_CLEANUP_MAX_AGE_DAYS` | Optional | `7` | Maximum age (days) for trace files before cleanup. |

**Example:**

```bash
AUTO_PROCEED=true
LEO_USE_TASK_CONTRACTS=true
LEO_VALIDATION_SCORE_THRESHOLD=60
```

---

## Claude Code Session

| Variable | Required | Default | Description |
|---|---|---|---|
| `CLAUDE_SESSION_ID` | Optional | — | UUID identifying the current Claude Code session. Used by the claim system (`lib/resolve-own-session.cjs`) to correlate sessions with SD claims. |
| `CLAUDE_CODE_SSE_PORT` | Optional | — | Port for the Claude Code SSE endpoint. Used by session identity resolution to discover active sessions. |
| `CLAUDE_PROJECT_DIR` | Optional | `process.cwd()` | Project directory override for the unified state manager. |

---

## Vision QA

| Variable | Required | Default | Description |
|---|---|---|---|
| `VISION_QA_DEFAULT_COST_LIMIT` | Optional | `2.00` | Default cost limit (USD) per Vision QA run. |
| `VISION_QA_MAX_ITERATIONS` | Optional | `30` | Maximum heal-loop iterations for Vision QA. |
| `VISION_QA_CONSENSUS_RUNS` | Optional | `1` | Number of consensus runs per scoring round. |
| `VISION_PERIODIC_SCORING_ENABLED` | Optional | `false` | Set to `true` to enable automated periodic vision scoring via `eva-master-scheduler.js`. |

---

## Notifications / Alerts (Sovereign Alert System)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCORD_ALERT_WEBHOOK` | Optional | — | Discord webhook URL for push notifications on critical system events. Create via Discord Server Settings > Integrations > Webhooks. |
| `RESEND_API_KEY` | Optional | — | [Resend](https://resend.com) API key for emergency email alerts. |
| `RESEND_FROM_EMAIL` | Optional | `EHG Chairman <chairman@ehg.ai>` | Sender address for email alerts. |
| `SOVEREIGN_ALERT_EMAIL` | Optional | — | Recipient email for EMERGENCY-severity alerts. |
| `TELEGRAM_BOT_TOKEN` | Optional | — | Telegram bot token for chairman notifications. Create via @BotFather. |
| `TELEGRAM_CHAT_ID` | Optional | — | Telegram chat/channel ID to receive alerts. |

**Example:**

```bash
DISCORD_ALERT_WEBHOOK=https://discord.com/api/webhooks/123456/abcdef
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=-1001234567890
```

---

## Integrations

| Variable | Required | Default | Description |
|---|---|---|---|
| `TODOIST_API_TOKEN` | Optional | — | Todoist API token for the EVA idea-processing pipeline. Obtain from Todoist Settings > Integrations > Developer. |
| `GOOGLE_CLIENT_ID` | Optional | — | Google OAuth client ID for YouTube integration. Create at [Google Cloud Console](https://console.cloud.google.com/apis/credentials). |
| `GOOGLE_CLIENT_SECRET` | Optional | — | Google OAuth client secret for YouTube integration. |
| `VENTURE_AGENT_KEY` | Optional | — | API key for the venture-agent package. Falls back to `SUPABASE_ANON_KEY` then `SUPABASE_SERVICE_ROLE_KEY` if not set. |

---

## Quick Setup Checklist

For a minimal working setup, you need these four variables:

```bash
# 1. Supabase (required for all database operations)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# 2. LLM (required for AI features)
GEMINI_API_KEY=AIzaSy...
```

Everything else is optional and enables specific features (local LLM, notifications, YouTube sync, etc.).
