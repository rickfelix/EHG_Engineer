/**
 * build-tasks-writer
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-A (Child A / FR-2)
 *
 * Pure builder: returns the contents of the venture repo's `docs/build-tasks.md`
 * — a FULLY VENTURE-DERIVED orchestrator → children → grandchildren build
 * decomposition (chairman decision: derive from the venture's own artifacts, not
 * a fixed template). The per-feature grandchildren come from the venture's
 * screens; the lead task is always "discover current state" (do not assume the
 * repo is unbuilt — the conduit/Agent may have built much already).
 *
 * Minimal-skeleton fallback: when the venture has no screens, emit a still-valid,
 * non-empty decomposition (never an empty build-tasks.md).
 *
 * Pure (no DB / git / fs); the venture-data fetch happens in Child B inside
 * seedRepo(), which passes the resolved screens here.
 */

/** Normalize a screen entry (string or {name|screen_name}) to a trimmed name. */
function screenName(screen, i) {
  if (typeof screen === 'string') return screen.trim() || `Screen ${i + 1}`;
  if (screen && typeof screen === 'object') {
    return String(screen.name || screen.screen_name || `Screen ${i + 1}`).trim();
  }
  return `Screen ${i + 1}`;
}

/**
 * The landing page is built by Lovable (Stitch → Lovable → GitHub → Replit), so it is
 * NOT emitted as a build task — Claude Code builds the ADDITIONAL pages here. Identify
 * the landing screen by the same name/purpose heuristic the S17 page-type-classifier
 * uses. Conservative: only screens that match are skipped; if none match, none are
 * skipped (the "discover current state, do not duplicate" lead task still neutralizes
 * any accidental landing rebuild — degrade to current behavior, never lose a page).
 * SD-S17S19-LANDINGFIRST-BUILD-TRIM-ORCH-001-B / FR-3.
 */
function isLandingScreen(screen, i) {
  const purpose = (screen && typeof screen === 'object' && screen.purpose) || '';
  const hay = `${screenName(screen, i)} ${purpose}`.toLowerCase();
  return /landing|home(?!\s*screen)|hero|welcome|marketing/.test(hay);
}

/**
 * @param {Object} ctx
 * @param {string} [ctx.name] - venture name
 * @param {Array<string|{name?:string,screen_name?:string,purpose?:string}>} [ctx.screens]
 * @returns {string} docs/build-tasks.md markdown (always non-empty)
 */
export function buildBuildTasks(ctx = {}) {
  const name = (ctx.name && String(ctx.name).trim()) || 'Venture';
  const screens = Array.isArray(ctx.screens) ? ctx.screens : [];

  const header = `# Build Tasks — ${name}

> Orchestrator → children → grandchildren. Work top-down, one grandchild at a
> time; commit after each. **Lead task is always "discover current state"** —
> inspect the existing repo (schema, server fns, routes, data layer) before
> building; the design conduit or Replit Agent may have built much already, so
> build ON it, do not duplicate.

## Orchestrator: ${name} build

### Child 1 — Discover current state & Replit-native backend
- [ ] **1.1 Discover** — inventory existing routes, schema, server functions, and data layer. Note what is already built. Do NOT assume a blank repo.
- [ ] **1.2 Replit-native data** — Replit Postgres via \`DATABASE_URL\` (Drizzle or \`pg\`); remove any Supabase coupling. Schema in code.
- [ ] **1.3 Object Storage** — Replit Object Storage (default bucket, key-prefix namespacing); sign URLs via the Replit sidecar, never the GCS local signer.
- [ ] **1.4 Auth (Clerk)** — \`@clerk/tanstack-react-start\`; \`VITE_CLERK_PUBLISHABLE_KEY\` (prefixed + passed explicitly) + \`CLERK_SECRET_KEY\`; upsert a local \`users\` row keyed by \`clerk_user_id\`; app-level ownership scoping.`;

  // FR-3: reference docs/design-prompts.md as the per-page build playbook.
  const promptsGuide =
    '> For each page below: follow **Prompt 1** in `docs/design-prompts.md` (it inherits ' +
    "the landing page's design system), then run **Prompts 2-4** (typography, layout, and " +
    "build-quality audits). Fill Prompt 1's brief from the matching screen in `docs/wireframes.md`. " +
    'Every venture also ships a **Feedback page** — build it with **Prompt 5**.';

  let child2;
  if (screens.length === 0) {
    // Minimal-skeleton fallback — never emit an empty build-tasks.md.
    child2 = `

### Child 2 — Additional pages
${promptsGuide}
- [ ] **2.1 Core feature** — implement the venture's primary user flow end-to-end, scoped to the signed-in user. (No wireframe screens were available at seed time — add per-page grandchildren via \`docs/design-prompts.md\` + \`docs/wireframes.md\` once the design is in the repo.)`;
  } else {
    // FR-3: the landing page is built by Lovable, so omit it from the per-screen grandchildren.
    const additional = screens.filter((s, i) => !isLandingScreen(s, i));
    const skippedLanding = screens.length > additional.length;
    if (additional.length === 0) {
      // Only a landing page exists — Lovable built it; nothing additional to scaffold yet.
      child2 = `

### Child 2 — Additional pages
${promptsGuide}
- [ ] **2.1 Additional pages** — the landing page was built by Lovable; build any additional pages using \`docs/design-prompts.md\` Prompt 1 + the audits, driven by \`docs/wireframes.md\`.`;
    } else {
      const grandchildren = additional
        .map((screen, i) => {
          const sn = screenName(screen, i);
          const purpose =
            screen && typeof screen === 'object' && screen.purpose
              ? ` — ${String(screen.purpose).trim()}`
              : '';
          return `- [ ] **2.${i + 1} ${sn}**${purpose} — build the page (follow docs/design-prompts.md Prompt 1, then the audits), scoped to the signed-in user.`;
        })
        .join('\n');
      const landingNote = skippedLanding
        ? '\n> The landing page was built by Lovable and is intentionally omitted here — do not rebuild it.'
        : '';
      child2 = `

### Child 2 — Additional pages (one grandchild per page; follow docs/design-prompts.md)
${promptsGuide}${landingNote}
${grandchildren}`;
    }
  }

  // Every venture ships a Feedback page (docs/design-prompts.md Prompt 5), regardless
  // of which wireframe screens exist — append it as a required Child-2 task.
  child2 += `
- [ ] **Feedback page (required in every venture)** — build the \`/feedback\` page following \`docs/design-prompts.md\` **Prompt 5**; wire the landing footer "Feedback" link to it.`;

  const child3 = `

### Child 3 — Monitoring, polish & deploy
- [ ] **3.1 Sentry** verified on client + server (no-ops gracefully when DSN absent).
- [ ] **3.2 AI images (if applicable)** — Google Gemini image editing via \`GEMINI_API_KEY\`; honest fallback when unconfigured.
- [ ] **3.3 Polish** — responsive/mobile-first, a11y (semantic HTML + ARIA).
- [ ] **3.4 Stack-enforcing CI (REQUIRED)** — commit a CI workflow that, on every PR to main, runs (a) the venture-stack compliance test \`tests/stack-compliance.test.js\` (scan \`src/\` and fail on forbidden tech — no \`@supabase\`, no Replit Auth / OIDC, no CLI-as-product framing — and assert the REQUIRED stack is present: Clerk + Replit Postgres) AND (b) the build. Make the CI check a **required status check** (branch protection) so off-stack code or a broken build cannot merge. Vendor the test from the provided template (\`venture-stack-compliance.test.template.js\`); it is dependency-free (\`node --test\`) so it runs under any toolchain. This is the per-PR code gate the artifact-level stage-19 gate cannot provide.
- [ ] **3.5 Deploy** — Replit hosting (autoscale); confirm the run command + port in \`.replit\`.
`;

  return header + child2 + child3;
}

export default buildBuildTasks;
