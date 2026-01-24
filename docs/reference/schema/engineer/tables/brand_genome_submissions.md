# brand_genome_submissions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-24T03:07:02.107Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| created_by | `uuid` | **NO** | - | - |
| submission_status | `text` | **NO** | `'draft'::text` | - |
| genome_version | `text` | YES | - | Human-readable unique identifier (BG-V{venture_num}-{version}) |
| brand_data | `jsonb` | **NO** | `'{}'::jsonb` | Comprehensive JSONB structure for ICP, tone, claims, colors, typography, positioning, and values |
| completeness_score | `numeric(5,2)` | YES | - | Calculated score (0-100) measuring how many required brand fields are populated |
| required_fields_missing | `ARRAY` | YES | - | - |
| color_distance_min | `numeric(5,2)` | YES | - | Minimum color distance to other ventures (prevents brand confusion) |
| similar_ventures | `ARRAY` | YES | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| previous_version_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| published_at | `timestamp with time zone` | YES | - | - |
| archived_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `brand_genome_submissions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `brand_genome_submissions_previous_version_id_fkey`: previous_version_id → brand_genome_submissions(id)

### Unique Constraints
- `unique_venture_version`: UNIQUE (venture_id, version)

### Check Constraints
- `brand_genome_submissions_submission_status_check`: CHECK ((submission_status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
- `completeness_range`: CHECK (((completeness_score >= (0)::numeric) AND (completeness_score <= (100)::numeric)))
- `draft_no_publish_date`: CHECK ((((submission_status = 'draft'::text) AND (published_at IS NULL)) OR ((submission_status <> 'draft'::text) AND (published_at IS NOT NULL))))
- `valid_genome_version`: CHECK ((genome_version ~ '^BG-V\d+-\d{3,}$'::text))

## Indexes

- `brand_genome_submissions_pkey`
  ```sql
  CREATE UNIQUE INDEX brand_genome_submissions_pkey ON public.brand_genome_submissions USING btree (id)
  ```
- `idx_brand_genome_completeness`
  ```sql
  CREATE INDEX idx_brand_genome_completeness ON public.brand_genome_submissions USING btree (completeness_score DESC)
  ```
- `idx_brand_genome_created_at`
  ```sql
  CREATE INDEX idx_brand_genome_created_at ON public.brand_genome_submissions USING btree (created_at DESC)
  ```
- `idx_brand_genome_created_by`
  ```sql
  CREATE INDEX idx_brand_genome_created_by ON public.brand_genome_submissions USING btree (created_by)
  ```
- `idx_brand_genome_data_gin`
  ```sql
  CREATE INDEX idx_brand_genome_data_gin ON public.brand_genome_submissions USING gin (brand_data)
  ```
- `idx_brand_genome_status`
  ```sql
  CREATE INDEX idx_brand_genome_status ON public.brand_genome_submissions USING btree (submission_status)
  ```
- `idx_brand_genome_venture_id`
  ```sql
  CREATE INDEX idx_brand_genome_venture_id ON public.brand_genome_submissions USING btree (venture_id)
  ```
- `idx_brand_genome_version_num`
  ```sql
  CREATE INDEX idx_brand_genome_version_num ON public.brand_genome_submissions USING btree (genome_version)
  ```
- `unique_venture_version`
  ```sql
  CREATE UNIQUE INDEX unique_venture_version ON public.brand_genome_submissions USING btree (venture_id, version)
  ```

## RLS Policies

### 1. admin_update_brand_genome_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = created_by) OR (venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT uca.company_id
           FROM user_company_access uca
          WHERE ((uca.user_id = auth.uid()) AND (uca.role = ANY (ARRAY['admin'::text, 'owner'::text]))))))))`
- **With Check**: `((auth.uid() = created_by) OR (venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT uca.company_id
           FROM user_company_access uca
          WHERE ((uca.user_id = auth.uid()) AND (uca.role = ANY (ARRAY['admin'::text, 'owner'::text]))))))))`

### 2. delete_brand_genome_policy (DELETE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = created_by) AND (submission_status = 'draft'::text))`

### 3. insert_brand_genome_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `((auth.uid() = created_by) AND ((venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.created_by = auth.uid()))) OR (venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT uca.company_id
           FROM user_company_access uca
          WHERE (uca.user_id = auth.uid())))))))`

### 4. select_brand_genome_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `((venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT uca.company_id
           FROM user_company_access uca
          WHERE (uca.user_id = auth.uid()))))) OR (auth.uid() = created_by))`

### 5. update_brand_genome_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = created_by) AND (submission_status = 'draft'::text))`
- **With Check**: `((auth.uid() = created_by) AND (submission_status = 'draft'::text))`

## Triggers

### brand_genome_archived_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_brand_genome_archived_at_timestamp()`

### brand_genome_calculate_completeness

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION calculate_brand_completeness()`

### brand_genome_calculate_completeness

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION calculate_brand_completeness()`

### brand_genome_generate_version

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION generate_genome_version()`

### brand_genome_published_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_brand_genome_published_at_timestamp()`

### brand_genome_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_timestamp()`

### brand_genome_validate_colors

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION validate_color_distance()`

### brand_genome_validate_colors

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION validate_color_distance()`

---

[← Back to Schema Overview](../database-schema-overview.md)
