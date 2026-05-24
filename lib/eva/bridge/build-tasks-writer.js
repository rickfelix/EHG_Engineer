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

  let child2;
  if (screens.length === 0) {
    // Minimal-skeleton fallback — never emit an empty build-tasks.md.
    child2 = `

### Child 2 — Core features
- [ ] **2.1 Core feature** — implement the venture's primary user flow end-to-end, scoped to the signed-in user. (No wireframe screens were available at seed time — refine this into per-screen grandchildren from \`docs/\` once the design is in the repo.)`;
  } else {
    const grandchildren = screens
      .map((screen, i) => {
        const sn = screenName(screen, i);
        const purpose =
          screen && typeof screen === 'object' && screen.purpose
            ? ` — ${String(screen.purpose).trim()}`
            : '';
        return `- [ ] **2.${i + 1} ${sn}**${purpose} — build the screen + its data wiring, scoped to the signed-in user.`;
      })
      .join('\n');
    child2 = `

### Child 2 — Core features (one grandchild per screen)
${grandchildren}`;
  }

  const child3 = `

### Child 3 — Monitoring, polish & deploy
- [ ] **3.1 Sentry** verified on client + server (no-ops gracefully when DSN absent).
- [ ] **3.2 AI images (if applicable)** — Google Gemini image editing via \`GEMINI_API_KEY\`; honest fallback when unconfigured.
- [ ] **3.3 Polish** — responsive/mobile-first, a11y (semantic HTML + ARIA).
- [ ] **3.4 Deploy** — Replit hosting (autoscale); confirm the run command + port in \`.replit\`.
`;

  return header + child2 + child3;
}

export default buildBuildTasks;
