/**
 * Branding Service — First EHG Venture Factory Shared Service
 * SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-D
 *
 * Generates confidence-scored brand identity artifacts (logo spec, color palette)
 * for ventures. Integrates with service_tasks queue and service_telemetry.
 */


import { createSupabaseServiceClient } from '../supabase-client.js';
const SERVICE_KEY = 'branding';

const CONFIDENCE_THRESHOLDS = {
  auto: 0.85,   // Auto-approve above this
  review: 0.5,  // Needs human review
  draft: 0.0,   // Draft quality, not actionable
};

const REQUIRED_INPUT_FIELDS = ['venture_name', 'industry'];
const OPTIONAL_INPUT_FIELDS = ['target_audience', 'brand_values', 'color_preferences', 'style'];

export class BrandingService {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createSupabaseServiceClient();
    this.serviceId = options.serviceId || null;
  }

  /**
   * Resolve the branding service ID from ehg_services registry.
   */
  async resolveServiceId() {
    if (this.serviceId) return this.serviceId;

    const { data, error } = await this.supabase
      .from('ehg_services')
      .select('id')
      .eq('service_key', SERVICE_KEY)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      throw new Error(`Branding service not found in registry: ${error?.message || 'no data'}`);
    }

    this.serviceId = data.id;
    return this.serviceId;
  }

  /**
   * Generate brand identity artifacts from venture context.
   *
   * @param {object} input - Venture branding input
   * @param {string} input.venture_name - Name of the venture
   * @param {string} input.industry - Industry/sector
   * @param {string} [input.target_audience] - Target audience description
   * @param {string[]} [input.brand_values] - Core brand values
   * @param {string[]} [input.color_preferences] - Preferred colors
   * @param {string} [input.style] - Brand style (modern, classic, playful, etc.)
   * @returns {{ artifacts: object, confidence: number }}
   */
  generateBrandArtifacts(input) {
    const confidence = this.computeConfidence(input);

    const logoSpec = {
      concept: `${input.venture_name} brand mark`,
      style: input.style || 'modern',
      typography: {
        primary: this.selectTypography(input.industry, input.style),
        weight: 'bold',
      },
      icon_suggestion: this.suggestIcon(input.industry),
      layout: 'horizontal',
    };

    const colorPalette = this.generateColorPalette(input);

    const artifacts = {
      brand_name: input.venture_name,
      confidence,
      artifacts: {
        logo_spec: logoSpec,
        color_palette: colorPalette,
        typography: {
          heading: logoSpec.typography.primary,
          body: this.selectBodyFont(input.style),
        },
        brand_guidelines: this.generateGuidelines(input, logoSpec, colorPalette),
      },
    };

    return { artifacts, confidence };
  }

  /**
   * Compute confidence score (0-1) based on input completeness and quality.
   */
  computeConfidence(input) {
    let score = 0;
    const weights = {
      venture_name: 0.2,
      industry: 0.2,
      target_audience: 0.15,
      brand_values: 0.15,
      color_preferences: 0.15,
      style: 0.15,
    };

    for (const [field, weight] of Object.entries(weights)) {
      const value = input[field];
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value) && value.length > 0) {
          score += weight;
        } else if (typeof value === 'string' && value.trim().length > 0) {
          score += weight;
        }
      }
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * Create a pending task in service_tasks queue.
   *
   * @param {string} ventureId - UUID of the venture
   * @param {object} input - Branding input parameters
   * @param {object} [options] - Additional options
   * @param {number} [options.priority=5] - Task priority (lower = higher)
   * @returns {Promise<{ taskId: string, confidence: number, artifacts: object }>}
   */
  async createTask(ventureId, input, options = {}) {
    const serviceId = await this.resolveServiceId();
    const { artifacts, confidence } = this.generateBrandArtifacts(input);

    const { data, error } = await this.supabase
      .from('service_tasks')
      .insert({
        venture_id: ventureId,
        service_id: serviceId,
        task_type: 'brand_generation',
        status: 'pending',
        priority: options.priority || 5,
        artifacts,
        confidence_score: confidence,
        input_params: input,
        metadata: {
          confidence_thresholds: CONFIDENCE_THRESHOLDS,
          confidence_tier: confidence >= CONFIDENCE_THRESHOLDS.auto ? 'auto'
            : confidence >= CONFIDENCE_THRESHOLDS.review ? 'review' : 'draft',
        },
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create branding task: ${error.message}`);
    }

    return { taskId: data.id, confidence, artifacts };
  }

  /**
   * Report task outcomes to service_telemetry.
   *
   * @param {object} params
   * @param {string} params.taskId - UUID of the completed service_task
   * @param {string} params.ventureId - UUID of the venture
   * @param {object} params.outcomes - Structured outcome metrics
   * @param {string} [params.prUrl] - PR URL if applicable
   * @param {string} [params.prStatus] - PR status
   * @param {string} [params.agentVersion] - Venture agent version
   */
  async reportTelemetry({ taskId, ventureId, outcomes, prUrl, prStatus, agentVersion }) {
    const serviceId = await this.resolveServiceId();

    const { error } = await this.supabase
      .from('service_telemetry')
      .insert({
        task_id: taskId,
        venture_id: ventureId,
        service_id: serviceId,
        pr_url: prUrl || null,
        pr_status: prStatus || null,
        outcomes: outcomes || {},
        venture_agent_version: agentVersion || '1.0.0',
      });

    if (error) {
      throw new Error(`Failed to report telemetry: ${error.message}`);
    }

    return { success: true };
  }

  /**
   * Complete a task: update status, record completion, and report telemetry.
   *
   * @param {string} taskId - UUID of the task to complete
   * @param {object} outcomes - Outcome data
   */
  async completeTask(taskId, outcomes = {}) {
    const { data: task, error: fetchError } = await this.supabase
      .from('service_tasks')
      .select('venture_id, service_id, artifacts, confidence_score')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      throw new Error(`Task not found: ${fetchError?.message || 'no data'}`);
    }

    const { error: updateError } = await this.supabase
      .from('service_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      throw new Error(`Failed to complete task: ${updateError.message}`);
    }

    await this.reportTelemetry({
      taskId,
      ventureId: task.venture_id,
      outcomes: {
        ...outcomes,
        confidence_score: task.confidence_score,
        artifacts_generated: true,
      },
    });

    return { success: true };
  }

  // --- Private helpers ---

  selectTypography(industry, style) {
    const fonts = {
      technology: { modern: 'Inter', classic: 'Georgia', playful: 'Poppins' },
      finance: { modern: 'Roboto', classic: 'Merriweather', playful: 'Nunito' },
      health: { modern: 'Open Sans', classic: 'Lora', playful: 'Quicksand' },
      default: { modern: 'Inter', classic: 'Georgia', playful: 'Poppins' },
    };
    const group = fonts[industry?.toLowerCase()] || fonts.default;
    return group[style?.toLowerCase()] || group.modern;
  }

  selectBodyFont(style) {
    const bodyFonts = { modern: 'Inter', classic: 'Source Serif Pro', playful: 'Nunito' };
    return bodyFonts[style?.toLowerCase()] || bodyFonts.modern;
  }

  suggestIcon(industry) {
    const icons = {
      technology: 'circuit-board',
      finance: 'bar-chart',
      health: 'heart-pulse',
      education: 'graduation-cap',
      analytics: 'line-chart',
    };
    return icons[industry?.toLowerCase()] || 'star';
  }

  generateColorPalette(input) {
    if (input.color_preferences && input.color_preferences.length > 0) {
      return input.color_preferences.slice(0, 5);
    }

    const palettes = {
      technology: ['#2563EB', '#3B82F6', '#60A5FA', '#1E293B', '#F8FAFC'],
      finance: ['#059669', '#10B981', '#34D399', '#1F2937', '#F9FAFB'],
      health: ['#DC2626', '#EF4444', '#FCA5A5', '#1E293B', '#FFFFFF'],
      analytics: ['#7C3AED', '#8B5CF6', '#A78BFA', '#1E293B', '#F5F3FF'],
      default: ['#3B82F6', '#6366F1', '#8B5CF6', '#1E293B', '#F8FAFC'],
    };

    return palettes[input.industry?.toLowerCase()] || palettes.default;
  }

  generateGuidelines(input, logoSpec, colorPalette) {
    return [
      `Brand: ${input.venture_name}`,
      `Industry: ${input.industry || 'General'}`,
      `Style: ${input.style || 'Modern'}`,
      `Primary Font: ${logoSpec.typography.primary}`,
      `Primary Color: ${colorPalette[0]}`,
      `Use the logo mark at minimum 32px height.`,
      `Maintain clear space equal to the height of the logo icon around the mark.`,
    ].join('\n');
  }
}

/**
 * Create a BrandingService with default configuration.
 */
export function createBrandingService(options = {}) {
  return new BrandingService(options);
}

export default BrandingService;
