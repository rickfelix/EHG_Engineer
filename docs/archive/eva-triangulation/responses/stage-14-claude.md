# Stage 14 "Technical Architecture" -- Claude Response

> Independent response to the Stage 14 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Architecture generation | N/A (GUI is data model only) | None (all user-provided) | **5 Critical** | Without AI generation, users must design a 4-layer architecture from scratch. The analysisStep is essential. | CLOSE | The LLM has the product roadmap (typed deliverables) and sales model -- it can propose technology stacks. |
| Stage 13 → 14 mapping | None | None | **5 Critical** | Architecture is disconnected from product roadmap. "Feature" deliverables don't inform application architecture. | CLOSE | Typed deliverables from Stage 13 should directly map to architecture components. |
| Data modeling depth | Entities, fields, PKs, FKs, RLS, ERD | "data" layer with technology + components | **3 Medium** | At BLUEPRINT phase, full entity modeling is premature. Stage 14 should define the data architecture approach, not individual tables. | ADAPT | Challenge: The GUI's ERD builder is execution-level detail. At BLUEPRINT, "PostgreSQL with multi-tenant schema" is sufficient. Entity modeling belongs in THE BUILD LOOP. |
| Security/compliance layer | None (GUI focuses on data only) | None (not in 4-layer model) | **4 High** | Enterprise sales model (Stage 12) requires security architecture. Without it, Stage 15 can't plan security resources. | ADD | Not as a 5th required layer, but as a cross-cutting concern that applies to all layers. |
| Sales model → architecture alignment | None | None | **4 High** | Self-serve needs scalable frontend + CDN. Enterprise needs multi-tenant + SSO + audit. Without alignment, architecture is generic. | ADD | Stage 12 sales_model should filter architecture patterns. |
| Scalability approach | None | None | **3 Medium** | At BLUEPRINT, high-level scaling strategy matters (horizontal vs vertical, caching approach). Detailed capacity planning is premature. | ADD | One field (scaling_strategy) is sufficient. Don't add capacity planning. |
| Technology cost signals | None | None | **2 Low** | Stage 16 (Financial Projections) needs technology cost estimates. But actual costs are Stage 15/16 territory. | DEFER | Architecture should note cost-sensitive choices (e.g., "serverless to minimize fixed costs") in rationale, not add cost fields. |
| Constraint categorization | None | Generic name/description | **2 Low** | Current constraints are sufficient. Categorizing (performance, security, budget) adds schema complexity with minimal benefit. | KEEP | The constraint description already captures the type implicitly. |
| Mobile/native layer | None | Fixed 4-layer model | **3 Medium** | If Stage 13 roadmap includes mobile deliverables, the 4-layer model has no place for native architecture. | ADAPT | Add mobile as a conditional layer (not always required). |

### 2. AnalysisStep Design

**Input (from prior stages)**:
- **Stage 7**: Pricing model (SaaS → cloud architecture; transactional → event-driven; marketplace → two-sided)
- **Stage 8**: BMC Key Activities (what the product DOES → architecture requirements)
- **Stage 12**: Sales model (self-serve → scalable frontend, CDN, product analytics; enterprise → multi-tenant, SSO, audit logs, API-first)
- **Stage 12**: Customer journey touchpoint_types (automated → event-driven; manual → admin tools)
- **Stage 13**: Product roadmap milestones with typed deliverables. Feature deliverables → application architecture. Infrastructure deliverables → DevOps. Integration deliverables → API/protocol decisions. Content deliverables → CMS/CDN.
- **Stage 13**: Milestone priority (now/next/later) → architecture must support "now" deliverables first

**Process (single LLM call)**:
1. **Layer technology selection**: For each of the 4 required layers, select technology based on product roadmap and sales model. E.g., Stage 13 has mobile deliverables → add React Native to frontend. Stage 12 is enterprise → add PostgreSQL with RLS to data.
2. **Component mapping**: Map Stage 13 typed deliverables to layer components. Each feature deliverable becomes one or more components across layers.
3. **Integration point definition**: For each Stage 13 integration-type deliverable, define the integration point (source, target, protocol).
4. **Security overlay**: Based on Stage 12 sales_model, add security requirements as cross-cutting concerns.
5. **Scaling strategy**: Based on Stage 12 funnel metrics and Stage 11 tier sizes, recommend horizontal/vertical/serverless.

**Output**: Complete Stage 14 data (architecture_summary, 4 layers with technology/components/rationale, integration_points, constraints, security_requirements, scaling_strategy)

### 3. Layer Model Decision

**Keep the 4 required layers. Add conditional layers based on product roadmap.**

The fixed `['frontend', 'backend', 'data', 'infra']` model is a good foundation. Every software product needs all four. But some products need additional layers:

| Condition | Additional Layer | Source |
|-----------|-----------------|--------|
| Stage 13 has mobile deliverables | `mobile` | Deliverable type analysis |
| Stage 12 sales_model is `marketplace` | `platform` (matching/escrow/trust) | Sales model |
| Stage 13 has content deliverables | `content` (CMS/CDN) | Deliverable type |

**Implementation**: Keep 4 layers mandatory. Add `additional_layers` array for conditional layers (same schema: technology, components, rationale). The analysisStep determines which additional layers are needed.

### 4. Stage 13 → 14 Consumption Mapping

**Map deliverable types to architecture concerns.**

| Stage 13 Deliverable Type | Architecture Impact |
|--------------------------|-------------------|
| `feature` | Application components in frontend + backend layers |
| `infrastructure` | infra layer components (CI/CD, monitoring, hosting) |
| `integration` | integration_points (API protocols, webhooks, data sync) |
| `content` | Content delivery components (CMS, CDN, static hosting) |

The analysisStep should:
1. Read all "now" priority milestones from Stage 13
2. Extract their typed deliverables
3. For each deliverable, add corresponding components to the appropriate layer
4. For each integration deliverable, create an integration_point

This creates traceability: every architecture component maps back to a product deliverable.

### 5. Data Modeling Depth Decision

**Stage 14 defines the data ARCHITECTURE, not the data MODEL.**

At BLUEPRINT phase, the right level is:
- ✅ Database technology choice (PostgreSQL, MongoDB, etc.)
- ✅ Data architecture approach (relational, document, event-sourced)
- ✅ Multi-tenancy strategy (shared schema, schema-per-tenant, database-per-tenant)
- ✅ Data access patterns (ORM, raw SQL, GraphQL)
- ❌ Individual entities/tables
- ❌ Field definitions
- ❌ Foreign key relationships
- ❌ ERD diagrams

The GUI's entity-level modeling is execution detail that belongs in THE BUILD LOOP (Stages 17-22). Stage 14 should answer "what database technology and what architecture pattern?" not "what tables do we need?"

### 6. Security/Compliance Architecture Decision

**Add security as a cross-cutting concern, not a 5th layer.**

Security architecture should vary based on Stage 12 sales_model:

| Sales Model | Security Requirements |
|-------------|---------------------|
| self-serve | OAuth2/OIDC, API rate limiting, basic RBAC |
| inside-sales | + Data isolation per trial, demo environments |
| enterprise | + SSO/SAML, fine-grained RBAC, audit logging, compliance (SOC2/GDPR), encryption at rest |
| marketplace | + Trust & safety, payment PCI compliance, fraud detection |
| channel | + Multi-tenant isolation, partner API security, white-label auth |

**Schema addition**:
```javascript
security_requirements: {
  type: 'object',
  properties: {
    auth_approach: { type: 'string', required: true },  // e.g., "OAuth2 with SAML SSO for enterprise"
    data_isolation: { type: 'string' },  // e.g., "Schema-per-tenant with RLS"
    compliance_targets: { type: 'array' },  // e.g., ["SOC2", "GDPR"]
    encryption: { type: 'string' },  // e.g., "AES-256 at rest, TLS 1.3 in transit"
  },
}
```

### 7. Integration Points Enhancement

**Keep current structure. Add connection to Stage 13 deliverables.**

Current: name, source_layer, target_layer, protocol.

Add:
- `deliverable_ref`: Optional reference to Stage 13 integration deliverable that this integration point serves.

This creates traceability without changing the core schema. The analysisStep auto-populates this when generating integration points from Stage 13 deliverables.

### 8. Constraint Categorization Decision

**Keep generic constraints. Don't categorize.**

Current `constraints[]` with name/description is sufficient because:
1. The description implicitly captures the category ("Performance: must handle 10K concurrent users")
2. Adding a `category` enum adds schema complexity for minimal analytical value
3. Constraints are consumed by humans, not by downstream stages
4. The analysisStep can suggest well-described constraints that naturally cluster by category

### 9. CLI Superiorities (preserve these)

- **4 mandatory layers**: Forces comprehensive architecture thinking. Every venture must address frontend, backend, data, and infrastructure.
- **Technology + rationale per layer**: Justification is required, not optional. Prevents cargo-cult technology choices.
- **Components per layer**: Granular tracking of what each layer contains.
- **Integration points with protocols**: Explicit protocol specification (REST, gRPC, WebSocket) is precise and actionable.
- **Exported constants**: `REQUIRED_LAYERS`, `MIN_INTEGRATION_POINTS` enable cross-stage validation.

### 10. Recommended Stage 14 Schema

```javascript
const TEMPLATE = {
  id: 'stage-14',
  slug: 'technical-architecture',
  title: 'Technical Architecture',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    architecture_summary: { type: 'string', minLength: 20, required: true },

    // === Existing (unchanged) ===
    layers: {
      type: 'object', required: true,
      properties: {
        frontend: { technology, components[], rationale },
        backend:  { technology, components[], rationale },
        data:     { technology, components[], rationale },
        infra:    { technology, components[], rationale },
      },
    },

    // === NEW: additional layers (conditional on product roadmap) ===
    additional_layers: {
      type: 'array',
      items: {
        name: { type: 'string', required: true },
        technology: { type: 'string', required: true },
        components: { type: 'array', minItems: 1 },
        rationale: { type: 'string', required: true },
      },
    },

    // === Updated: integration_points with deliverable_ref ===
    integration_points: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        source_layer: { type: 'string', required: true },
        target_layer: { type: 'string', required: true },
        protocol: { type: 'string', required: true },
        deliverable_ref: { type: 'string' },  // NEW: Stage 13 deliverable reference
      },
    },

    // === Existing (unchanged) ===
    constraints: {
      type: 'array',
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
      },
    },

    // === NEW: security requirements (cross-cutting) ===
    security_requirements: {
      type: 'object',
      properties: {
        auth_approach: { type: 'string', required: true },
        data_isolation: { type: 'string' },
        compliance_targets: { type: 'array' },
        encryption: { type: 'string' },
      },
    },

    // === NEW: scaling strategy ===
    scaling_strategy: { type: 'string' },  // e.g., "Horizontal with auto-scaling, CDN for static assets"

    // === Existing derived (unchanged) ===
    layer_count: { type: 'number', derived: true },
    total_components: { type: 'number', derived: true },
    all_layers_defined: { type: 'boolean', derived: true },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 11. Minimum Viable Change (priority-ordered)

1. **P0: Add `analysisStep` for architecture generation**. Single LLM call consuming Stages 7/8/12/13. Maps product roadmap deliverables to architecture components. Sales model drives security and scalability decisions.

2. **P0: Wire Stage 13 deliverable types → architecture layers**. Feature deliverables → frontend/backend components. Infrastructure → infra layer. Integration → integration_points. Content → content delivery.

3. **P1: Add `security_requirements` object**. auth_approach (required), data_isolation, compliance_targets, encryption. Driven by Stage 12 sales_model.

4. **P1: Add `additional_layers` array**. For conditional layers (mobile, platform, content) based on Stage 13 deliverables.

5. **P1: Add `scaling_strategy` field**. High-level scaling approach based on funnel volume (Stage 12) and tier sizes (Stage 11).

6. **P2: Add `deliverable_ref` to integration_points**. Traceability from architecture back to product roadmap.

7. **P3: Do NOT add entity-level data modeling**. That's BUILD phase (Stages 17-22).
8. **P3: Do NOT categorize constraints**. Generic name/description is sufficient.
9. **P3: Do NOT add cost estimation fields**. Stage 16's job (Financial Projections).
10. **P3: Do NOT make the 4-layer model dynamic**. All products need all 4 layers. Additional layers are additive, not replacements.

### 12. Cross-Stage Impact

| Change | Stage 15 (Resource Planning) | Stage 16 (Financial Projections) | Stage 17+ (BUILD LOOP) |
|--------|----------------------------|---------------------------------|----------------------|
| Technology selections | Team skills map to technology choices (React → frontend devs, PostgreSQL → DBA) | Technology licensing costs (open source vs commercial) | Technology stack is set; build loop implements it |
| Security requirements | Security team/skills needed for compliance targets | Compliance audit costs (SOC2, penetration testing) | Security architecture implemented in build |
| Scaling strategy | Infrastructure team size depends on scaling complexity | Hosting/cloud costs tied to scaling approach | Scaling implemented and tested |
| Component count | More components → more resources needed | More components → more development cost | Each component becomes a build task |
| Additional layers | Extra layers = extra skills (mobile devs, platform engineers) | Extra layer costs | Additional build streams |

### 13. Dependency Conflicts (with Stages 1-13 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 13 → 14 (typed deliverables → architecture mapping) | **OK** | Stage 13 consensus added deliverable types (feature/infrastructure/integration/content). Direct input to architecture decisions. |
| Stage 12 → 14 (sales_model → security requirements) | **OK** | Stage 12 has clean 6-value enum. Maps directly to security profiles. |
| Stage 12 → 14 (funnel stages → scaling strategy) | **OK** | Stage 12 funnel_stages with conversion_rate_estimate provide volume signals. |
| Stage 11 → 14 (tier sizes → scaling approach) | **OK** | Stage 11 TAM/SAM/SOM per tier give scale context. |

### 14. Contrarian Take

**Arguing AGAINST adding security_requirements and scaling_strategy:**

1. **Security requirements are technology-specific, not architecture-level.** "OAuth2 with SAML SSO" is a technology choice, not an architecture decision. At BLUEPRINT, the architecture should say "the system requires authentication and authorization" -- the specific implementation (SAML vs OAuth vs Passkeys) is a build decision. By specifying "SAML" at Stage 14, we lock into a protocol before understanding implementation constraints.

2. **Scaling strategy is premature.** Most ventures die from lack of customers, not lack of scale. "Horizontal auto-scaling" sounds impressive in a Blueprint but is irrelevant if the venture never reaches 100 users. At BLUEPRINT phase, the architecture should assume modest scale and design for simplicity. Scaling decisions should be deferred to when actual usage data exists.

3. **Additional layers add schema complexity.** Every conditional layer is a special case the validation code must handle. The 4-layer model is elegant BECAUSE it's universal. Adding mobile/platform/content layers makes every downstream stage check "does this venture have a mobile layer?" -- complexity propagation.

4. **What could go wrong**: Ventures spend time designing enterprise security architecture and auto-scaling strategies for products that don't have a single customer yet. The architecture becomes aspirational rather than actionable.

**Counter-argument**: Without security requirements, Stage 15 can't plan for compliance resources. Without scaling strategy, infrastructure costs in Stage 16 are guesswork. The fields are lightweight and generated by the analysisStep -- they don't require user thought.

**Verdict**: Keep security_requirements (enterprise sales model truly requires it). Make scaling_strategy optional (useful but not critical). Keep additional_layers (the analysisStep decides, not the user).
