/**
 * PRD Playwright Generator - PRD Fetching
 */

import { DEFAULT_VIEWPORT_SIZES, DEFAULT_BROWSERS } from './config.js';
import { extractPageObjects, generateSharedSelectors, extractAPIEndpoints } from './utils.js';

export async function fetchPRD(supabase, prdId) {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', prdId)
    .single();

  if (error) {
    console.error('Error fetching PRD:', error);
    return null;
  }

  return data;
}

export async function fetchPlaywrightSpecs(supabase, prdId) {
  const { data, error } = await supabase
    .from('prd_playwright_specifications')
    .select('*')
    .eq('prd_id', prdId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching Playwright specs:', error);
  }

  return data;
}

export async function createDefaultPlaywrightSpecs(supabase, prd, baseUrl) {
  const specs = {
    prd_id: prd.id,
    base_url: baseUrl,
    test_timeout_ms: 30000,
    viewport_sizes: DEFAULT_VIEWPORT_SIZES,
    browsers: DEFAULT_BROWSERS,
    page_objects: extractPageObjects(prd),
    shared_selectors: generateSharedSelectors(),
    api_endpoints: extractAPIEndpoints(prd),
    visual_regression_enabled: true,
    created_by: 'PRD Generator'
  };

  const { data, error } = await supabase
    .from('prd_playwright_specifications')
    .insert(specs)
    .select()
    .single();

  if (error) {
    console.error('Error creating Playwright specs:', error);
    return specs;
  }

  return data;
}

export async function updateTestMappings(supabase, prdId, generatedFiles) {
  const mappings = generatedFiles.map(file => ({
    prd_id: prdId,
    requirement_id: file.requirement_id,
    scenario_id: `${file.requirement_id}-TEST-MAIN`,
    verification_type: 'automated',
    verification_status: 'pending',
    test_file_path: file.file_path,
    test_function_name: `test('${file.requirement_id}')`,
    created_at: new Date().toISOString()
  }));

  if (mappings.length > 0) {
    const { error } = await supabase
      .from('prd_test_verification_mapping')
      .upsert(mappings, { onConflict: 'prd_id,requirement_id,scenario_id' });

    if (error) {
      console.error('Error updating test mappings:', error);
    }
  }
}
