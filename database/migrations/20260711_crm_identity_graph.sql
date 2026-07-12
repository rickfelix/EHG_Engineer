-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C: Relationship Engine satellite (Â§3.1)
-- Contact/Org identity graph: identity-shared, access-venture-scoped.
-- Every row carries provenance to a real inbound event (never a hand-typed "lead").
--
-- crm_inbound_events lives here (not in the pipeline-transition-engine migration)
-- because it is the shared provenance substrate for BOTH the identity graph and the
-- pipeline-stage engine â€” both FK into it, so it must exist before either.

CREATE TABLE IF NOT EXISTS crm_inbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT,
  provenance_event_id UUID NOT NULL REFERENCES crm_inbound_events(id),
  provenance_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES crm_orgs(id),
  email TEXT,
  full_name TEXT,
  provenance_event_id UUID NOT NULL REFERENCES crm_inbound_events(id),
  provenance_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Access-venture-scoped: which venture(s) may act on an identity-shared contact/org.
CREATE TABLE IF NOT EXISTS crm_contact_venture_access (
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  venture_id UUID NOT NULL REFERENCES ventures(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, venture_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_org_id ON crm_contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contact_venture_access_venture_id ON crm_contact_venture_access(venture_id);

COMMENT ON TABLE crm_orgs IS 'Relationship engine satellite (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C): identity-shared org graph, provenance-stamped to a real inbound event.';
COMMENT ON TABLE crm_contacts IS 'Relationship engine satellite: identity-shared contact graph, provenance-stamped to a real inbound event.';
COMMENT ON TABLE crm_contact_venture_access IS 'Access-venture-scoping join: which venture may read/act on an identity-shared contact.';

-- Service-role-only writes (mirrors apa_standing_assessments' posture, S-1 born-denied
-- principle applied at the DB layer): no anon/authenticated policy is created, so RLS
-- denies all non-service access until the live spine S-1 authority substrate ships and
-- real venture-scoped policies can be layered on top of crm_contact_venture_access.
ALTER TABLE crm_inbound_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON crm_inbound_events FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE crm_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON crm_orgs FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON crm_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE crm_contact_venture_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON crm_contact_venture_access FOR ALL TO service_role USING (true) WITH CHECK (true);
