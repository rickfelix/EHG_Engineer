# Navigation Patterns Audit

**SD-UX-DISCOVERY** | Settings Navigation Discovery Spike
**Date**: 2025-12-28
**Status**: Complete

---

## Executive Summary

This audit documents the current navigation patterns in the EHG application, specifically focusing on layout components and settings navigation. The goal is to inform the consolidation efforts in SD-UX-LAYOUT-CONSOLIDATION and SD-UX-USER-PREFERENCES.

### Key Findings

- **3 competing layout patterns** exist in the codebase (AuthenticatedLayout, AdminLayout, ChairmanLayout)
- **7 settings tabs** provide configuration with inconsistent state management approaches
- **3 consolidation opportunities** identified with varying risk levels
- Theme/dark mode handling is scattered across components

### Prioritized Recommendations

1. **Unified Layout Shell** (HIGH priority) - Consolidate to single flexible layout
2. **Settings State Consolidation** (MEDIUM priority) - Unified user preferences store
3. **Sidebar Component Unification** (LOW priority) - After layouts consolidated

---

## Part 1: Layout Component Audit

### 1.1 AuthenticatedLayout

**Location**: `src/components/layout/AuthenticatedLayout.tsx`
**Lines**: ~150
**Usage**: Main application shell for all authenticated routes

#### Component Hierarchy

```
AuthenticatedLayout
├── SidebarProvider (defaultOpen=true)
│   └── ModernNavigationSidebar
├── Header (sticky)
│   ├── SidebarTrigger
│   ├── HeaderSearch (GlobalSearch)
│   ├── BreadcrumbNavigation
│   └── Header Actions
│       ├── PersonaToggle (SD-NAV-PERSONA-001)
│       ├── KeyboardShortcuts
│       ├── CompanySelector
│       ├── ThemeToggle
│       └── UserMenu
├── Main Content
│   ├── DemoModeBanner (SD-UX-001)
│   └── {children}
└── FloatingEVAAssistant
```

#### Key Dependencies

- `useKeyboardNavigation` - Custom navigation hook
- `useEnhancedKeyboardNavigation` - Accessibility enhancements
- `useCommandK` - Command palette integration
- `SidebarProvider` from shadcn/ui

#### Routes Using This Layout

| Route Pattern | Page |
|--------------|------|
| `/dashboard` | Main Dashboard |
| `/ventures/*` | Venture management |
| `/settings/*` | Settings pages |
| `/portfolio/*` | Portfolio views |

---

### 1.2 AdminLayout

**Location**: `src/components/admin/AdminLayout.tsx`
**Lines**: ~180
**Usage**: Admin section with vertical sidebar navigation

#### Component Hierarchy

```
AdminLayout
├── Vertical Sidebar
│   └── ADMIN_NAV_ITEMS (9 items)
│       ├── Dashboard (/admin)
│       ├── Strategic Directives (/admin/directives)
│       ├── Backlog (/admin/backlog)
│       ├── Directive Lab (/admin/directive-lab)
│       ├── UAT Dashboard (/admin/uat)
│       ├── PR Reviews (/admin/pr-reviews)
│       ├── LEO Protocol (/admin/protocol)
│       ├── PRDs (/admin/prds)
│       └── Companies (/admin/companies)
└── Main Content ({children} or <Outlet />)
```

#### Key Dependencies

- `NavLink` from react-router-dom for active state
- `lucide-react` icons for menu items
- No sidebar provider - uses custom card-based sidebar

#### Routes Using This Layout

| Route Pattern | Page |
|--------------|------|
| `/admin` | Admin Dashboard |
| `/admin/directives` | SD Management |
| `/admin/backlog` | Backlog Items |
| `/admin/uat` | UAT Dashboard |
| `/admin/protocol` | LEO Protocol Config |

---

### 1.3 ChairmanLayout

**Location**: `src/components/chairman-v2/ChairmanLayout.tsx`
**Lines**: ~105
**Usage**: Executive dashboard with horizontal tabs

#### Component Hierarchy

```
ChairmanLayout
├── Header
│   ├── Title (configurable)
│   ├── Description
│   └── Settings Button
├── Navigation Tabs (horizontal)
│   ├── Briefing (/chairman)
│   ├── Decisions (/chairman/decisions)
│   └── Portfolio (/chairman/portfolio)
└── Main Content ({children})
```

#### Key Dependencies

- `Tabs` from shadcn/ui
- `useNavigate` and `useLocation` for tab navigation
- Simpler structure, no sidebar

#### Routes Using This Layout

| Route Pattern | Page |
|--------------|------|
| `/chairman` | Executive Briefing |
| `/chairman/decisions` | Decision Queue |
| `/chairman/portfolio` | Portfolio Overview |

---

## Part 2: Settings Navigation Analysis

### 2.1 Settings Router

**Location**: `src/pages/settings/settings.tsx`
**Pattern**: Horizontal tabs with 7 sections

#### Tab Structure

| Tab | Component | Database Table | State Pattern |
|-----|-----------|----------------|---------------|
| Navigation | NavigationSettings | `user_preferences` | useState + Supabase |
| Security | SecuritySettings | `auth.users` | useState + Supabase Auth |
| Notifications | NotificationSettings | `notification_preferences` | useState + Supabase |
| Data | DataSettings | Various | Context |
| Profile | ProfileSettings | `profiles` | React Query |
| Billing | BillingSettings | `subscriptions` | React Query |
| Admin | AdminSettings | Multiple admin tables | useState |

### 2.2 NavigationSettings Component

**Location**: `src/pages/settings/NavigationSettings.tsx`

#### Data Flow

```
Supabase (user_preferences table)
    ↓ useQuery
NavigationSettings State
    ↓ onChange handlers
Collapsible Section Components
    ↓ useMutation
Supabase (user_preferences table)
```

#### State Management

- Uses `useState` for local form state
- Uses `useQuery` for initial data load
- Uses `useMutation` for saves
- Persists route visibility preferences

### 2.3 SecuritySettings Component

**Location**: `src/pages/settings/SecuritySettings.tsx`

#### Data Flow

```
Supabase Auth (auth.users)
    ↓ supabase.auth.getUser()
SecuritySettings State
    ↓ form submission
supabase.auth.updateUser()
    ↓
Supabase Auth (auth.users)
```

#### State Management

- Uses `useState` for form inputs
- Direct Supabase Auth API calls
- No React Query caching

### 2.4 NotificationSettings Component

**Location**: `src/pages/settings/NotificationSettings.tsx`

#### Data Flow

```
Supabase (notification_preferences table)
    ↓ useQuery
Category Toggle Components
    ↓ onChange handlers
useMutation
    ↓
Supabase (notification_preferences table)
```

#### State Management

- Uses React Query for CRUD operations
- Toggle state managed locally before save
- Category-based organization

---

## Part 3: Consolidation Opportunities

### Opportunity 1: Unified Layout Shell

**Severity**: HIGH
**Probability of Regression**: LOW
**Files Affected**: 3 layout files, ~40 route files

#### Current Problem

Three competing layout patterns with different:
- Sidebar implementations
- Header structures
- Navigation patterns

#### Recommended Approach

Create a single `UnifiedLayout` component with configurable variants:

```typescript
<UnifiedLayout
  variant="main" | "admin" | "executive"
  sidebar={true | false}
  header="full" | "minimal" | "tabs"
>
```

#### Migration Steps

1. Create `UnifiedLayout.tsx` with prop-based configuration
2. Implement variant rendering logic
3. Migrate AuthenticatedLayout routes (low risk)
4. Migrate AdminLayout routes (medium risk)
5. Migrate ChairmanLayout routes (low risk)
6. Deprecate old layout components
7. Update route definitions in router config

#### Risk Mitigation

- Feature flag for gradual rollout
- Maintain backward compatibility during transition
- E2E tests for all major routes before migration

---

### Opportunity 2: Settings State Consolidation

**Severity**: MEDIUM
**Probability of Regression**: MEDIUM
**Files Affected**: 7 settings components, 4 database tables

#### Current Problem

Settings use inconsistent state management:
- Some use `useState` + direct Supabase calls
- Some use React Query
- Some use Context
- No unified preferences store

#### Recommended Approach

Create a unified `useUserPreferences` Zustand store:

```typescript
const useUserPreferences = create((set, get) => ({
  navigation: null,
  notifications: null,
  security: null,
  loadPreferences: async () => { ... },
  updatePreference: async (key, value) => { ... },
}));
```

#### Migration Steps

1. Create `useUserPreferences` store with Zustand
2. Add persistence layer with Supabase sync
3. Migrate NavigationSettings first (simplest)
4. Migrate NotificationSettings (uses React Query)
5. Migrate remaining settings components
6. Remove redundant useState/useQuery patterns
7. Update database triggers for real-time sync

#### Risk Mitigation

- Implement optimistic updates with rollback
- Add comprehensive unit tests before migration
- Maintain old hooks during transition period

---

### Opportunity 3: Sidebar Component Unification

**Severity**: LOW
**Probability of Regression**: LOW
**Files Affected**: ModernNavigationSidebar, AdminLayout sidebar

#### Current Problem

Two different sidebar implementations:
- `ModernNavigationSidebar` - Full featured with categories
- AdminLayout inline sidebar - Simple card-based

#### Recommended Approach

Extend `ModernNavigationSidebar` to support both modes:

```typescript
<ModernNavigationSidebar
  mode="full" | "compact" | "admin"
  items={navigationItems}
  showCategories={true | false}
/>
```

#### Migration Steps

1. Add `mode` prop to ModernNavigationSidebar
2. Implement admin mode rendering
3. Update AdminLayout to use ModernNavigationSidebar
4. Test all admin routes
5. Remove inline sidebar from AdminLayout

#### Risk Mitigation

- Low risk due to isolated change
- Can be deferred until after layout unification

---

## Part 4: Route-to-Layout Mapping

| Route Pattern | Current Layout | Recommended |
|--------------|----------------|-------------|
| `/` | None (redirect) | - |
| `/dashboard` | AuthenticatedLayout | UnifiedLayout(main) |
| `/ventures/*` | AuthenticatedLayout | UnifiedLayout(main) |
| `/settings/*` | AuthenticatedLayout | UnifiedLayout(main) |
| `/admin/*` | AdminLayout | UnifiedLayout(admin) |
| `/chairman/*` | ChairmanLayout | UnifiedLayout(executive) |
| `/portfolio/*` | AuthenticatedLayout | UnifiedLayout(main) |

---

## Appendix: File Inventory

### Layout Files

| File | Path | LOC | Last Modified |
|------|------|-----|---------------|
| AuthenticatedLayout | `src/components/layout/` | ~150 | Active |
| AdminLayout | `src/components/admin/` | ~180 | Active |
| ChairmanLayout | `src/components/chairman-v2/` | ~105 | Active |

### Settings Files

| File | Path | LOC | Tables Used |
|------|------|-----|-------------|
| settings.tsx | `src/pages/settings/` | ~200 | Router only |
| NavigationSettings | `src/pages/settings/` | ~300 | user_preferences |
| SecuritySettings | `src/pages/settings/` | ~250 | auth.users |
| NotificationSettings | `src/pages/settings/` | ~280 | notification_preferences |

### Navigation Components

| Component | Path | Usage |
|-----------|------|-------|
| ModernNavigationSidebar | `src/components/navigation/` | AuthenticatedLayout |
| BreadcrumbNavigation | `src/components/navigation/` | AuthenticatedLayout |
| PersonaToggle | `src/components/navigation/` | AuthenticatedLayout header |

---

*Document generated by SD-UX-DISCOVERY*
*For SD-UX-LAYOUT-CONSOLIDATION and SD-UX-USER-PREFERENCES*
