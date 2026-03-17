# Configuration Reference

Environment variables, npm scripts, and configuration files for the EHG_Engineer / LEO Protocol system.

---

## Environment Variables

Source: `.env.example`. Copy to `.env` and populate with actual values.

### Database (Required)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (client-safe) | JWT token |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server-side only, bypasses RLS) | JWT token |
| `EHG_SUPABASE_URL` | Yes | EHG application database URL | `https://<project>.supabase.co` |
| `EHG_SUPABASE_ANON_KEY` | Yes | EHG application anon key | JWT token |
| `EHG_SUPABASE_SERVICE_ROLE_KEY` | Yes | EHG application service role key | JWT token |
| `SUPABASE_RLS_AUDITOR_URL` | Optional | Connection string for RLS policy verification | PostgreSQL connection string |

### LLM Providers

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GEMINI_API_KEY` | Yes* | Google Gemini API key (primary LLM provider) | `AIza...` |
| `OPENAI_API_KEY` | Optional | OpenAI API key (fallback, also for voice/WebRTC) | API key string |
| `AI_PROVIDER` | Optional | Active AI provider: `google`, `openai`, `anthropic` | `google` |
| `AI_MODEL` | Optional | Model override. `auto` for automatic selection | `auto` |

*At least one LLM API key is required for AI features.

### Local LLM (Ollama)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `USE_LOCAL_LLM` | Optional | Use local Ollama for Haiku-class tasks | `false` |
| `OLLAMA_BASE_URL` | Optional | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Optional | Local model name | `qwen3-coder:30b` |
| `OLLAMA_FALLBACK_ENABLED` | Optional | Fall back to cloud Haiku if Ollama unavailable | `true` |
| `OLLAMA_TIMEOUT_MS` | Optional | Request timeout in milliseconds | `30000` |

### Vision QA

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `VISION_QA_DEFAULT_COST_LIMIT` | Optional | Max cost per Vision QA run (USD) | `2.00` |
| `VISION_QA_MAX_ITERATIONS` | Optional | Max QA iterations per run | `30` |
| `VISION_QA_CONSENSUS_RUNS` | Optional | Consensus run count | `1` |
| `VISION_PERIODIC_SCORING_ENABLED` | Optional | Enable EVA periodic vision scoring | `false` |

### LEO Protocol

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `LEO_PROTOCOL_VERSION` | Optional | Active protocol version | `4.3.3` |
| `PROJECT_NAME` | Optional | Project identifier | `EHG_Engineer` |
| `RUSSIAN_JUDGE_ENABLED` | Optional | Enable AI quality assessment in LEAD-TO-PLAN | `false` |
| `TDD_PRE_IMPL_GATE_ENABLED` | Optional | Enable TDD pre-implementation gate | `false` |

### Alerts and Notifications

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DISCORD_ALERT_WEBHOOK` | Optional | Discord webhook for system alerts | `https://discord.com/api/webhooks/...` |
| `RESEND_API_KEY` | Optional | Resend API key for emergency email alerts | `re_...` |
| `SOVEREIGN_ALERT_EMAIL` | Optional | Email for emergency alerts | `chairman@domain.com` |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token for notifications | (from @BotFather) |
| `TELEGRAM_CHAT_ID` | Optional | Telegram chat ID for notifications | `-100...` |

### Integrations

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TODOIST_API_TOKEN` | Optional | Todoist API for EVA idea processing pipeline | (from Todoist settings) |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth for YouTube integration | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret | (from Cloud Console) |

### Development

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NODE_ENV` | Optional | Runtime environment | `development` |
| `DEBUG` | Optional | Debug logging namespace | `vision-qa:*` |

---

## npm Scripts

All scripts defined in `package.json`. Run with `npm run <script>`.

### SD Management

| Script | Description |
|--------|-------------|
| `sd:next` | Show intelligent SD queue with track view and recommendations |
| `sd:start` | Start working on an SD (claim + branch) |
| `sd:status` | Show SD progress vs baseline |
| `sd:burnrate` | Velocity and forecasting analysis |
| `sd:baseline` | Manage execution baselines (`create`, `view`) |
| `sd:baseline:intelligent` | AI-powered baseline generation (`--preview`, `--dry-run`) |
| `sd:create` | Create SD with intelligent defaults |
| `sd:branch` | Create feature branch for SD (`--check`, `--auto-stash`) |
| `sd:claim` | Claim an SD for this session |
| `sd:release` | Release SD claim |
| `sd:verify` | Verify SD completion (`--list`, `--complete`) |
| `sd:hierarchy` | Show SD parent-child hierarchy |
| `sd:preflight` | Pre-flight check for child SD creation |
| `sd:new` | Create new SD (legacy) |
| `sd:from-feedback` | Generate SD from feedback |

### Handoff and Protocol

| Script | Description |
|--------|-------------|
| `handoff` | Execute phase handoff |
| `handoff:list` | List handoff history |
| `handoff:stats` | Show handoff statistics |
| `handoff:compliance` | Check handoff compliance |
| `ship:preflight` | Pre-flight checks before shipping |
| `prio:top3` | Show top 3 priorities by WSJF score |
| `leo:execute` | Run LEO orchestrator (enforced mode) |
| `leo:generate` | Regenerate CLAUDE.md from database |
| `leo:status` | Show LEO protocol status |
| `leo:version` | Check protocol version |
| `leo:maintenance` | Run maintenance tasks |
| `leo:cleanup` | Clean up stale protocol data |
| `leo:refresh` | Refresh protocol state |
| `leo:summary` | Generate session summary |
| `leo:discover` | Discover schema constraints |

### PRD Management

| Script | Description |
|--------|-------------|
| `prd:new` | Create PRD and insert into database |
| `prd:validate` | Validate PRD format |
| `prd:fix` | Auto-fix PRD format issues |
| `prd:health` | PRD health check |
| `prd:check` | Check SD's PRD status |
| `prd:report` | Generate PRD format report |
| `prd:tables` | Show PRD table status |
| `prd:orphaned` | Find orphaned PRDs |
| `prd:audit` | Audit all PRD scripts |
| `prd:schema` | Validate PRD schema |

### Testing

| Script | Description |
|--------|-------------|
| `test` | Run all unit tests (vitest) |
| `test:unit` | Run unit tests only |
| `test:integration` | Run integration tests |
| `test:coverage` | Run tests with coverage |
| `test:watch` | Watch mode for tests |
| `test:smoke` | Run smoke tests |
| `test:e2e` | Run E2E tests (Playwright) |
| `test:e2e:security` | Security-specific E2E tests |
| `test:e2e:state-machine` | State machine E2E tests |
| `test:e2e:venture-lifecycle` | Venture lifecycle E2E tests |
| `test:e2e:human` | Human-like E2E test runner |
| `test:uat` | Run UAT test suite |
| `test:scan` | Scan test files (`--register`, `--stats`) |
| `test:select` | Intelligent test selection (`flaky`, `analyze`, `report`) |
| `test:auto:watch` | Auto-run affected tests on change |
| `test:auto:affected` | Run tests affected by current changes |
| `test:auto:parallel` | Run tests in parallel |
| `test:capture` | Capture test results |
| `test:validate` | Validate test system (`--verbose` for full) |

### EVA (Autonomous Executive)

| Script | Description |
|--------|-------------|
| `eva:run` | Run EVA pipeline |
| `eva:stage` | Run specific EVA stage |
| `eva:heal` | Run vision heal loop |
| `eva:rounds` | Run EVA evaluation rounds |
| `eva:health` | EVA system health check |
| `eva:decisions` | View EVA decisions |
| `eva:venture:new` | Create new venture |
| `eva:ideas:sync` | Sync ideas from Todoist |
| `eva:ideas:evaluate` | Evaluate ideas |
| `eva:ideas:post-process` | Post-process evaluated ideas |
| `eva:distill` | Run intake/distillation pipeline |
| `eva:distill:refine` | Refine distilled items |
| `eva:intake:classify` | Classify intake items |
| `eva:intake:pipeline` | Run full intake pipeline |
| `eva:scheduler:start` | Start EVA scheduler daemon |
| `eva:scheduler:status` | Check scheduler status |
| `eva:constitution` | Manage EVA constitution (`view`, `rule`, `amend`, `history`) |
| `eva:okr` | Manage OKRs (`generate`, `review`, `history`, `archive`) |
| `eva:dlq:replay` | Replay dead-letter queue items |

### Database and Schema

| Script | Description |
|--------|-------------|
| `check-db` | Verify database connection |
| `setup-db` | Set up database tables |
| `db:create` | Execute SQL file against database |
| `db:ehg` | Execute SQL against EHG database |
| `schema:snapshot` | Take schema snapshot |
| `schema:audit:tables` | Audit dormant tables |
| `schema:audit:enums` | Audit enum coverage |
| `schema:migration:stats` | Migration statistics |
| `schema:docs` | Generate schema documentation from database |

### RCA (Root Cause Analysis)

| Script | Description |
|--------|-------------|
| `rca:list` | List root cause records |
| `rca:view` | View specific RCA record |
| `rca:trigger` | Trigger RCA analysis |
| `rca:gate-check` | Check RCA gate status |
| `rca:status` | Show RCA system status |
| `rca:capa:generate` | Generate CAPA actions |
| `rca:capa:approve` | Approve CAPA actions |
| `rca:capa:verify` | Verify CAPA implementation |

### Pattern and Learning

| Script | Description |
|--------|-------------|
| `pattern:resolve` | Resolve a detected pattern |
| `pattern:stale` | Detect stale patterns (`--dry-run`) |
| `pattern:ingest` | Ingest lessons learned from markdown |
| `pattern:sync` | Sync pattern triggers |
| `pattern:extract` | Extract patterns from retrospectives |
| `pattern:maintenance` | Run pattern maintenance |
| `pattern:alert` | Create SDs from pattern alerts |

### Session and Context

| Script | Description |
|--------|-------------|
| `session:prologue` | Generate session prologue |
| `session:status` | Show session coordination status |
| `session:cleanup` | Clean up stale sessions |
| `session:info` | Show current session info |
| `session:worktree` | Manage session worktrees |
| `context:refresh` | Regenerate file trees |
| `context:status` | Show memory manager status |
| `context:compact` | Compact context |
| `context:usage` | Show context usage (`--analyze`) |
| `context:monitor` | Monitor context health |

### Security and Compliance

| Script | Description |
|--------|-------------|
| `security:audit` | Run security audit dashboard |
| `security:rls` | Audit RLS policies |
| `audit-compliance` | Run LEO compliance audit |
| `audit:validate` | Validate audit file |
| `audit:ingest` | Ingest audit file |

### Utilities

| Script | Description |
|--------|-------------|
| `lint` | Run ESLint on source files |
| `lint:fix` | Run ESLint with auto-fix |
| `lint:e2e` | Lint E2E test files |
| `data:integrity` | Check JSONB data integrity (`--fix`) |
| `data:heal-metrics` | Heal empty metrics (`--fix`) |
| `llm:audit` | Audit LLM usage (`--strict`) |
| `llm:config` | Show LLM model configuration |
| `llm:canary` | LLM canary deployment control (`status`, `advance`, `pause`, `rollback`) |
| `gate:health` | Gate health check (`--dry-run`, `--refresh`) |
| `chairman:dashboard` | Show chairman dashboard |
| `agent:metrics` | Show agent metrics dashboard |
| `git:recover` | Recover lost git commits |
| `lead:dossier` | Generate LEAD phase dossier |
| `token:budget` | Show token budget status |

---

## Configuration Files

### Core

| File | Purpose |
|------|---------|
| `package.json` | Node.js project configuration, scripts, dependencies |
| `.env` | Environment variables (not committed; see `.env.example`) |
| `tsconfig.json` | TypeScript compiler configuration |

### Testing

| File | Purpose |
|------|---------|
| `vitest.config.js` | Vitest unit test configuration |
| `vitest.e2e.config.ts` | Vitest E2E test configuration |
| `vitest.regression.config.ts` | Vitest regression test configuration |
| `playwright.config.js` | Playwright E2E test configuration |
| `playwright-uat.config.js` | Playwright UAT test configuration |
| `playwright.diagnostic.config.js` | Playwright diagnostic test configuration |

### Code Quality

| File | Purpose |
|------|---------|
| `eslint.config.js` | ESLint flat config (primary) |
| `.eslintrc.json` | ESLint legacy config (compatibility) |

### LEO Protocol

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Auto-generated orchestrator instructions (from `leo_protocol_sections` table) |
| `CLAUDE_CORE.md` | Core protocol rules and error handling |
| `CLAUDE_LEAD.md` | LEAD phase protocol rules |
| `CLAUDE_PLAN.md` | PLAN phase protocol rules |
| `CLAUDE_EXEC.md` | EXEC phase protocol rules |
| `.claude/auto-proceed-state.json` | AUTO-PROCEED execution state |
| `.workflow-patterns.json` | Active workflow pattern triggers |

### Database

| File | Purpose |
|------|---------|
| `database/migrations/` | SQL migration files (applied to Supabase) |
| `database/schema/` | Schema definition files |
| `supabase/config.toml` | Supabase CLI configuration |

### Git

| File | Purpose |
|------|---------|
| `.husky/` | Git hooks (pre-commit, commit-msg) |
| `.gitignore` | Git ignore patterns |

---

*Generated for SD-LEO-DOC-ERROR-CODE-CATALOG-001 | Source: .env.example, package.json, codebase scan*
