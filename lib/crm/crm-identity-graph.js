// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C: Relationship Engine satellite (FR-1)
// Contact/Org identity graph — identity-shared, access-venture-scoped, provenance-stamped.

/**
 * Records a real inbound event. Every contact/org/pipeline transition traces back to one
 * of these rows — the stranger-provenance guard (FR-3) is enforced by FK constraints
 * that require this row to exist before any downstream write.
 */
export async function recordInboundEvent(supabase, { source, payload = {} }) {
  if (!source) throw new Error('recordInboundEvent: source is required');
  const { data, error } = await supabase
    .from('crm_inbound_events')
    .insert({ source, payload })
    .select('id, source, fetched_at')
    .single();
  if (error) throw new Error(`recordInboundEvent failed: ${error.message}`);
  return data;
}

export async function createOrg(supabase, { name, domain = null, provenanceEventId, provenanceSource }) {
  if (!name) throw new Error('createOrg: name is required');
  if (!provenanceEventId) throw new Error('createOrg: provenanceEventId is required (stranger-provenance guard)');
  const { data, error } = await supabase
    .from('crm_orgs')
    .insert({ name, domain, provenance_event_id: provenanceEventId, provenance_source: provenanceSource })
    .select('id, name, domain')
    .single();
  if (error) throw new Error(`createOrg failed: ${error.message}`);
  return data;
}

export async function createContact(supabase, { orgId = null, email = null, fullName = null, provenanceEventId, provenanceSource, ventureId }) {
  if (!provenanceEventId) throw new Error('createContact: provenanceEventId is required (stranger-provenance guard)');
  if (!ventureId) throw new Error('createContact: ventureId is required to grant initial venture access');
  const { data: contact, error } = await supabase
    .from('crm_contacts')
    .insert({ org_id: orgId, email, full_name: fullName, provenance_event_id: provenanceEventId, provenance_source: provenanceSource })
    .select('id, org_id, email, full_name')
    .single();
  if (error) throw new Error(`createContact failed: ${error.message}`);

  const { error: accessError } = await supabase
    .from('crm_contact_venture_access')
    .insert({ contact_id: contact.id, venture_id: ventureId });
  if (accessError) {
    // Compensating action: the contact/access-grant pair must be all-or-nothing — a
    // contact with no venture-access grant is an orphan no caller can legitimately reach.
    // supabase-js has no cross-table transaction here, so delete what was just created.
    // The delete's own result MUST be checked — an unchecked failure here would silently
    // leave the exact orphan this compensating action exists to prevent.
    const { error: cleanupError } = await supabase.from('crm_contacts').delete().eq('id', contact.id);
    if (cleanupError) {
      throw new Error(`createContact: venture access grant failed AND compensating delete also failed — orphaned contact ${contact.id}: grant_error=${accessError.message}, cleanup_error=${cleanupError.message}`);
    }
    throw new Error(`createContact: venture access grant failed, compensating delete verified: ${accessError.message}`);
  }

  return contact;
}
