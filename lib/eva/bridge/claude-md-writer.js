/**
 * claude-md-writer
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-A (Child A / FR-1)
 *
 * Pure builder: returns the contents of the venture repo's root `CLAUDE.md` —
 * the persistent, authoritative build context Claude Code auto-reads every
 * session. This is the ONLY reliable enforcement of the backend rules (a pasted
 * prompt gets ignored; a committed CLAUDE.md persists).
 *
 * Lifts the proven contribution-hub / Canvas AI CLAUDE.md structure and pins the
 * hard-won rules: Replit-native (never Supabase), Claude-Code-builds /
 * Replit-hosts / no-Agent, the Clerk VITE_CLERK_PUBLISHABLE_KEY gotcha,
 * object-storage signing via the Replit sidecar (never the GCS local signer),
 * and Gemini as the image provider.
 *
 * Pure (no DB / git / fs) so it is unit-testable in isolation — mirrors the
 * existing seeder helpers (resolveBuildScreens, buildFeaturePrompt). The
 * venture-data fetch + file write happen in Child B inside seedRepo().
 */

const DEFAULT_STACK =
  'TanStack Start + React 19 + Vite + TypeScript (strict) + Tailwind. Package manager: bun.';
const DEFAULT_RUN = 'bun run dev';

/**
 * @param {Object} ctx
 * @param {string} [ctx.name] - venture name (e.g. "Canvas AI")
 * @param {string} [ctx.stack] - one-line stack description
 * @param {string} [ctx.runCommand] - dev run command (default `bun run dev`)
 * @returns {string} CLAUDE.md markdown
 */
export function buildClaudeMd(ctx = {}) {
  const name = (ctx.name && String(ctx.name).trim()) || 'this venture';
  const stack = (ctx.stack && String(ctx.stack).trim()) || DEFAULT_STACK;
  const runCommand = (ctx.runCommand && String(ctx.runCommand).trim()) || DEFAULT_RUN;

  return `# CLAUDE.md — ${name}

> Build instructions for **Claude Code**. This file is read automatically every session and is the **authoritative** build context for this repo. If anything here conflicts with \`replit.md\` (which the Replit Agent may have written and is stale on the backend), **this file wins**.

## Build model (READ THIS)
- **You (Claude Code) build the features here, in this repo**, and commit/push to GitHub. **Replit hosts** the result (it pulls from GitHub). Do **not** rely on the Replit AI Agent — it is metered, undoes Claude Code's work, and has removed load-bearing packages it deemed "orphaned." Keep it OFF this repo.
- Work through **\`docs/build-tasks.md\`** in order (orchestrator → children → grandchildren); do one grandchild task at a time, commit, move on. Lead task is always "discover current state" — do not assume the repo is unbuilt.
- **Building an additional page?** Follow **\`docs/design-prompts.md\`**: use **Prompt 1** (it inherits the landing page's design system from \`src/routes/index.tsx\`) to create the page, then run **Prompts 2-4** (typography, layout, and build-quality audits). The landing page was built by Lovable — do **not** rebuild it.
- **Every venture ships a Feedback page.** Build the \`/feedback\` page with **Prompt 5** in \`docs/design-prompts.md\` and wire the landing footer "Feedback" link to it.
- Keep changes **additive and scoped**; match the existing design system and conventions.

## Backend: Replit-native ONLY — never Supabase
This venture runs on **Replit's native stack**. If the Replit Agent ever wired Supabase, that is technical debt to remove, not a pattern to extend.
- **Data** → **Replit Postgres** (Neon-backed, scale-to-zero). Connect via \`DATABASE_URL\` (Replit injects it once you provision Postgres in the Replit **Database** panel). Use a typed client (Drizzle or \`pg\`). Note: the dev Postgres is Repl-scoped — not reachable from a laptop, so typecheck locally and run/test in Replit.
- **File storage** → **Replit Object Storage** (provisioned via the Object Storage UI panel — one auto-ID'd bucket in \`DEFAULT_OBJECT_STORAGE_BUCKET_ID\`; namespace by key **prefix**, you cannot name buckets). **Sign object URLs via the Replit sidecar** (\`POST http://127.0.0.1:1106/object-storage/signed-object-url\`), **never** the \`@google-cloud/storage\` client's local \`getSignedUrl()\` — the sidecar credentials have no \`client_email\`, so local signing throws *"Cannot sign data without client_email"*. (This applies to BOTH uploads and downloads.)
- **Auth** → **Clerk** via \`@clerk/tanstack-react-start\` (clerk.com hosted — NOT a Replit integration; do NOT use "Replit Auth", which is Agent-only and signs users in with Replit accounts). **#1 gotcha:** Clerk's Vite SDK resolves the **publishable** key via \`import.meta.env\` (VITE_-prefixed ONLY). Name the secret **\`VITE_CLERK_PUBLISHABLE_KEY\`** AND pass it explicitly: \`clerkMiddleware({ publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY })\` + \`<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>\`. Keep \`CLERK_SECRET_KEY\` server-only (do NOT pass \`secretKey\` to clerkMiddleware). On first sign-in, upsert a local \`users\` row keyed by \`clerk_user_id\`; ownership checks are app-level \`where user_id = <clerkUserId>\`.
- **AI images** → **Google Gemini** image editing (\`gemini-2.5-flash-image\` via the Gemini API, raw \`fetch\`, no SDK dep), reads \`GEMINI_API_KEY\` (or \`GOOGLE_API_KEY\`); model id overridable via \`GEMINI_IMAGE_MODEL\`. Chairman-chosen provider — do **NOT** switch to OpenAI/Replicate/etc. without asking. Gemini image output generally needs billing enabled on the Google AI project.
- **Errors** → **Sentry**, no-ops gracefully when its DSN is absent.
- **NEVER** add \`@supabase/supabase-js\`, Supabase URLs/keys, RLS-as-business-logic, or Supabase Edge Functions. Read all backend config from **env vars** — never hardcode secrets.

## Stack & commands
- ${stack}
- Dev: \`${runCommand}\`. After pulling new code/deps OR changing a Secret, **restart** the Repl (a running dev server won't pick up a new package or a changed Secret).

## Hosting (Replit, no Agent)
Replit imports this GitHub repo and runs the dev/start command (see \`.replit\`). To go live: provision Postgres + Object Storage + Clerk in Replit's UI panels (one-click each — **not** the Agent), then publish. Your commits to GitHub flow into Replit.

## Conventions
- TypeScript strict; proper error handling on all async/IO; responsive (mobile-first); semantic HTML + ARIA.
- Secrets via env vars only. Don't commit keys.
- After each grandchild task: a quick build/typecheck, then commit with a clear message.

## CI must enforce this stack (REQUIRED)
- Commit a CI workflow that runs on **every PR to main** and is a **required status check** (so it BLOCKS merge): it runs (a) a venture-stack compliance test — \`tests/stack-compliance.test.js\`, which scans \`src/\` and fails on forbidden tech — no \`@supabase\`, no Replit Auth / OIDC, no CLI-as-product framing — and asserts the REQUIRED stack (Clerk + Replit Postgres) is present — AND (b) the build. Vendor the dependency-free test from \`venture-stack-compliance.test.template.js\` (runs under \`node --test\`, any toolchain). Without this, off-stack code merges unseen: the platform's stage-19 gate scans planning artifacts, **not** your repo code.
`;
}

export default buildClaudeMd;
