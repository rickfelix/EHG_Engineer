/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: shared module-level Supabase service client for the
 * sd-creation pipeline + source adapters. Mirrors the single module-scope singleton the
 * pre-refactor scripts/leo-create-sd.js created at import time (one client per process).
 */
import { createSupabaseServiceClient } from '../supabase-client.js';

export const supabase = createSupabaseServiceClient();
