# EHG Venture Tech Stack Reference

**Version**: 1.0.0
**Status**: Active
**SD**: SD-LEO-INFRA-EHG-VENTURE-FUNDAMENTALS-001

## 10 Non-Negotiable Stack Decisions

Every EHG venture uses these exact technologies. No exceptions for MVP.

| # | Category | Technology | Version | Rationale |
|---|----------|-----------|---------|-----------|
| 1 | Framework | React | 18.x | Component model, ecosystem, hiring pool |
| 2 | Build | Vite | 5.x | Fast HMR, ESM-native, TypeScript out-of-box |
| 3 | Language | TypeScript | 5.x | Type safety, refactoring confidence, IDE support |
| 4 | Styling | Tailwind CSS + shadcn/ui | 3.x | Utility-first, copy-paste components, no vendor lock |
| 5 | Backend | Supabase | 2.x | Auth, DB, storage, realtime — single vendor for solo operator |
| 6 | Data Fetching | TanStack Query | 5.x | Cache management, optimistic updates, devtools |
| 7 | Forms | React Hook Form + Zod | 7.x + 3.x | Uncontrolled perf, schema validation, type inference |
| 8 | State | Zustand | 5.x | Minimal API, no boilerplate, SSR-compatible |
| 9 | Routing | React Router | 6.x | Nested routes, data loaders, industry standard |
| 10 | Design Tokens | @ehg/design-tokens | 1.x | Brand consistency, 3-tier hierarchy (brand/semantic/component) |

## Project Structure Convention

```
venture-name/
├── src/
│   ├── components/         # UI components (shadcn/ui + custom)
│   │   ├── ui/            # shadcn/ui primitives (do not modify)
│   │   └── [feature]/     # Feature-specific components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utility functions, API clients
│   ├── pages/             # Route pages (1 file per route)
│   ├── routes/            # Route definitions
│   └── stores/            # Zustand stores
├── config/                # Design tokens, feature flags
├── public/                # Static assets
├── supabase/              # Supabase migrations, seed data
├── tests/                 # Test files (mirrors src/ structure)
├── tailwind.config.ts     # Extends @ehg/tailwind-preset
├── eslint.config.js       # Extends @ehg/lint-config
├── vite.config.ts         # Standard Vite config
└── package.json           # Dependencies pinned to EHG versions
```

## Shared Packages

| Package | Source | Purpose |
|---------|--------|---------|
| @ehg/design-tokens | EHG app `config/ehg-design-tokens.json` | Brand colors, typography, spacing, component tokens |
| @ehg/tailwind-preset | EHG app `tailwind.config.ts` | Tailwind theme, animations, dark mode, custom shadows |
| @ehg/lint-config | EHG app `eslint.config.js` | ESLint + Prettier rules, TypeScript strictness |

## Dependency Versions (Pinned)

```json
{
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "react-router-dom": "^6.30.0",
  "@tanstack/react-query": "^5.83.0",
  "zustand": "^5.0.0",
  "react-hook-form": "^7.61.0",
  "zod": "^3.25.0",
  "@supabase/supabase-js": "^2.56.0",
  "tailwindcss": "^3.4.0",
  "typescript": "^5.8.0",
  "vite": "^5.4.0"
}
```

## Conventions

### Naming
- **Components**: PascalCase (`VentureCard.tsx`)
- **Hooks**: camelCase with `use` prefix (`useVentures.ts`)
- **Stores**: camelCase with `Store` suffix (`ventureStore.ts`)
- **Utils**: camelCase (`formatCurrency.ts`)
- **Routes**: kebab-case paths (`/admin/venture-detail/:id`)

### Import Order
1. React/framework imports
2. Third-party libraries
3. @ehg/* packages
4. Local components/hooks/utils
5. Types/interfaces
6. Styles/assets

### State Management Rules
- **Server state** → TanStack Query (never Zustand)
- **Client UI state** → Zustand (theme, sidebar, modals)
- **Form state** → React Hook Form (never manual useState)
- **URL state** → React Router search params

### Supabase Patterns
- **Client**: Single instance via `lib/supabase.ts`
- **RLS**: Always enabled, row-level security for multi-tenant
- **Migrations**: In `supabase/migrations/`, timestamped
- **Types**: Generated via `supabase gen types typescript`
