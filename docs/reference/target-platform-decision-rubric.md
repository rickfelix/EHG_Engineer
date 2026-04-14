# Target Platform Decision Rubric

## Overview

Every EHG venture must have `target_platform` set before Stage 15 (Design/Wireframes). This field controls which Stitch screens are generated, which Replit template is used, and which security patterns are applied.

## Decision Matrix

| Signal | Mobile | Web | Both |
|--------|--------|-----|------|
| **Primary audience** | B2C consumers | B2B enterprise / dashboards | Consumer app + admin panel |
| **Location services needed** | Yes | No | Mixed |
| **Camera/push notifications** | Yes | No | Consumer needs push, admin doesn't |
| **Complex data entry** | No | Yes (forms, tables, spreadsheets) | Consumer simple, admin complex |
| **SEO discovery important** | No | Yes | Landing page web, app mobile |
| **Multi-monitor workflow** | No | Yes | No |
| **Offline capability needed** | Yes | No | Consumer offline, admin online |
| **App Store presence** | Yes | No | Consumer yes, admin no |

## Quick Decision Flow

```
Is the primary user a consumer on their phone?
├── YES → Is SEO important for discovery?
│   ├── YES → target_platform = 'both' (PWA web + native mobile)
│   └── NO → target_platform = 'mobile'
└── NO → Is this a dashboard/admin/analytics tool?
    ├── YES → target_platform = 'web'
    └── NO → target_platform = 'both'
```

## Platform Implications

### target_platform = 'mobile'
- **Replit template**: Expo (React Native)
- **Stitch screens**: Mobile viewport designs only
- **Build output**: iOS + Android via Expo EAS Build
- **Testing**: Expo Go QR code on physical device
- **Distribution**: App Store + Google Play
- **Cost**: $99/yr Apple + $25 Google

### target_platform = 'web'
- **Replit template**: React + Vite or Next.js
- **Stitch screens**: Desktop viewport designs only
- **Build output**: Static site or SSR web app
- **Testing**: Browser preview in Replit
- **Distribution**: URL (Replit hosting or custom domain)
- **Cost**: Replit hosting (included)

### target_platform = 'both'
- **Replit template**: Expo (handles web + mobile from single codebase)
- **Stitch screens**: Both viewports, mobile-first ordering
- **Build output**: Native mobile + Expo web
- **Testing**: Expo Go for mobile, browser for web
- **Distribution**: App Stores + URL
- **Cost**: $99/yr Apple + $25 Google + hosting

## Default Behavior

- **Default**: `target_platform = 'both'` (mobile-first with web support)
- **Rationale**: Expo handles both platforms from one codebase, maximizing reach
- **Override**: Set explicitly when venture has clear single-platform focus

## When to Revisit

Re-evaluate target_platform when:
1. User research reveals unexpected platform preference
2. Feature requirements change (e.g., adding camera support → consider mobile)
3. Revenue data shows one platform dominating (>80% of users)
4. Competitive analysis shows platform gap

## Database Field

```sql
-- ventures.target_platform
-- Values: 'mobile', 'web', 'both'
-- Default: 'both'
-- Set before Stage 15 (Design/Wireframes)
ALTER TABLE ventures ADD COLUMN target_platform TEXT DEFAULT 'both';
```

## Related SDs
- SD-MOBILEFIRST-VENTURE-BUILD-STRATEGY-ORCH-001-A: Template selection
- SD-MOBILEFIRST-VENTURE-BUILD-STRATEGY-ORCH-001-B: Wireframe filtering
- SD-MOBILEFIRST-VENTURE-BUILD-STRATEGY-ORCH-001-C: Security defaults
