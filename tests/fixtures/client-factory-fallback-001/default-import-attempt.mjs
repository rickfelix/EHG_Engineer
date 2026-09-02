// SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001 (FR-3a): planted-violation fixture.
// This file deliberately performs a bare DEFAULT import of lib/supabase-client.js
// under a plausible-but-wrong local name -- the exact mistake the SD closes. It must
// fail to load (SyntaxError at link time) now that the default export is removed.
// Do not "fix" this import -- it is the test subject.
import createServiceClient from '../../../lib/supabase-client.js';

export { createServiceClient };
