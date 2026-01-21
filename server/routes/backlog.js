/**
 * EHG Backlog API Routes
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { dbLoader, openai } from '../config.js';

const router = Router();

// Get strategic directives from backlog
router.get('/strategic-directives', async (req, res) => {
  try {
    const { tier, page, minMustHave, sort = 'sequence' } = req.query;

    let query = dbLoader.supabase
      .from('strategic_directives_backlog')
      .select('*');

    if (tier) {
      query = query.eq('rolled_triage', tier);
    }
    if (page) {
      query = query.eq('page_title', page);
    }
    if (minMustHave) {
      query = query.gte('must_have_pct', parseFloat(minMustHave));
    }

    if (sort === 'priority') {
      query = query.order('must_have_pct', { ascending: false })
                   .order('sequence_rank', { ascending: true });
    } else {
      query = query.order('sequence_rank', { ascending: true });
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get SD detail with backlog items
router.get('/strategic-directives/:sd_id', async (req, res) => {
  try {
    const { sd_id } = req.params;

    const { data: sd, error: sdError } = await dbLoader.supabase
      .from('strategic_directives_backlog')
      .select('*')
      .eq('sd_id', sd_id)
      .single();

    if (sdError) throw sdError;

    const { data: items, error: itemsError } = await dbLoader.supabase
      .from('sd_backlog_map')
      .select('*')
      .eq('sd_id', sd_id)
      .order('stage_number', { ascending: true });

    if (itemsError) throw itemsError;

    res.json({ ...sd, backlog_items: items });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all strategic directives with backlog items (optimized)
router.get('/strategic-directives-with-items', async (req, res) => {
  try {
    const { tier, page, minMustHave, sort = 'sequence' } = req.query;

    let sdQuery = dbLoader.supabase
      .from('strategic_directives_backlog')
      .select('*');

    if (tier) {
      sdQuery = sdQuery.eq('rolled_triage', tier);
    }
    if (page) {
      sdQuery = sdQuery.eq('page_title', page);
    }
    if (minMustHave) {
      sdQuery = sdQuery.gte('must_have_pct', parseFloat(minMustHave));
    }

    if (sort === 'priority') {
      sdQuery = sdQuery.order('must_have_pct', { ascending: false })
                       .order('sequence_rank', { ascending: true });
    } else {
      sdQuery = sdQuery.order('sequence_rank', { ascending: true });
    }

    const { data: sds, error: sdError } = await sdQuery;
    if (sdError) throw sdError;

    if (sds.length === 0) {
      return res.json([]);
    }

    // Get all backlog items for these SDs in a single query
    const sdIds = sds.map(sd => sd.sd_id);
    const { data: allItems, error: itemsError } = await dbLoader.supabase
      .from('sd_backlog_map')
      .select('*')
      .in('sd_id', sdIds)
      .order('stage_number', { ascending: true });

    if (itemsError) throw itemsError;

    // Group items by SD ID
    const itemsMap = {};
    allItems.forEach(item => {
      if (!itemsMap[item.sd_id]) {
        itemsMap[item.sd_id] = [];
      }
      itemsMap[item.sd_id].push(item);
    });

    // Combine SDs with their backlog items
    const result = sds.map(sd => ({
      ...sd,
      backlog_items: itemsMap[sd.sd_id] || []
    }));

    res.json(result);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate AI summary for SD backlog items
router.get('/backlog-summary/:sd_id', async (req, res) => {
  try {
    const { sd_id } = req.params;
    const { force_refresh } = req.query;

    if (!openai) {
      return res.status(503).json({
        error: 'AI service not available',
        fallback: 'OpenAI API key not configured'
      });
    }

    // Check database first (unless force refresh is requested)
    if (!force_refresh) {
      const { data: sdData, error: sdError } = await dbLoader.supabase
        .from('strategic_directives_v2')
        .select('backlog_summary, backlog_summary_generated_at')
        .eq('id', sd_id)
        .single();

      if (!sdError && sdData?.backlog_summary) {
        console.log(`📚 Returning database-stored summary for SD ${sd_id}`);
        return res.json({
          summary: sdData.backlog_summary,
          generated_at: sdData.backlog_summary_generated_at,
          from_database: true
        });
      }
    }

    // Get SD details first for context
    const { data: sdData, error: sdError } = await dbLoader.supabase
      .from('strategic_directives_v2')
      .select('title, description')
      .eq('id', sd_id)
      .single();

    if (sdError) {
      console.error('Error fetching SD details:', sdError);
    }

    // Get backlog items for this SD
    const { data: backlogItems, error } = await dbLoader.supabase
      .from('sd_backlog_map')
      .select('*')
      .eq('sd_id', sd_id)
      .eq('present_in_latest_import', true);

    if (error) {
      console.error('Error fetching backlog items:', error);
      return res.status(500).json({ error: 'Failed to fetch backlog data' });
    }

    if (!backlogItems || backlogItems.length === 0) {
      return res.json({
        summary: 'No backlog items found for this strategic directive.',
        itemCount: 0,
        cached: false
      });
    }

    // Combine SD context with backlog items
    let contextText = '';

    if (sdData) {
      contextText += `Strategic Directive: ${sdData.title}\n`;
      if (sdData.description) {
        contextText += `Description: ${sdData.description}\n\n`;
      }
    }

    // Combine all backlog item data
    const backlogDetails = backlogItems
      .map(item => {
        const parts = [];

        if (item.backlog_title) {
          parts.push(`Title: ${item.backlog_title}`);
        }

        if (item.item_description && item.item_description.trim()) {
          parts.push(`Item Description: ${item.item_description}`);
        }

        if (item.description_raw && item.description_raw.trim()) {
          parts.push(`Raw Description: ${item.description_raw}`);
        }

        if (item.story_description && item.story_description.trim()) {
          parts.push(`Story Description: ${item.story_description}`);
        }

        if (item.extras) {
          try {
            const extras = typeof item.extras === 'string' ? JSON.parse(item.extras) : item.extras;

            if (extras.Description_1) {
              parts.push(`Detailed Description: ${extras.Description_1}`);
            }

            Object.keys(extras).forEach(key => {
              if (key.toLowerCase().includes('desc') && key !== 'Description_1' && extras[key]) {
                parts.push(`${key}: ${extras[key]}`);
              }
            });

            if (extras['Page Title_1']) parts.push(`Page: ${extras['Page Title_1']}`);
            if (extras['Category']) parts.push(`Category: ${extras['Category']}`);
          } catch (e) {
            console.error('Error parsing extras:', e);
          }
        }

        if (item.priority) parts.push(`Priority: ${item.priority}`);
        if (item.phase) parts.push(`Phase: ${item.phase}`);
        if (item.stage_number) parts.push(`Stage: ${item.stage_number}`);
        if (item.story_title && item.story_title !== item.backlog_title) {
          parts.push(`Story: ${item.story_title}`);
        }
        if (item.my_comments && item.my_comments.trim()) {
          parts.push(`Comments: ${item.my_comments}`);
        }
        if (item.acceptance_criteria) {
          parts.push(`Acceptance Criteria: ${item.acceptance_criteria}`);
        }

        return parts.length > 0 ? parts.join('; ') : null;
      })
      .filter(text => text !== null)
      .join('\n\n');

    const fullContext = contextText + (backlogDetails || `${backlogItems.length} backlog items with limited details available.`);

    // Generate AI summary
    try {
      console.log(`🤖 Generating backlog summary for SD ${sd_id}...`);
      console.log(`   Using context: ${fullContext.substring(0, 200)}...`);

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert technical analyst creating detailed summaries of software development backlogs. Focus on extracting specific technical details, features, and implementation requirements from all available descriptions.'
          },
          {
            role: 'user',
            content: `Analyze this strategic directive with ${backlogItems.length} backlog items:\n\n${fullContext}\n\nCreate exactly 7 sentences that:\n1. Identify the core technical capabilities and specific features being built\n2. Highlight the highest priority items with their implementation details\n3. Describe the technical architecture, technologies, and integration points mentioned\n4. Note specific risks, dependencies, or technical challenges found in descriptions\n5. Summarize expected deliverables and measurable business outcomes\n6. Identify implementation phases, stages, and technical milestones\n7. Assess technical complexity, resource needs, and readiness based on all descriptions\n\nBe specific - mention actual features, technologies, and requirements found in the descriptions.`
          }
        ],
        max_tokens: 400,
        temperature: 0.3
      });

      const summary = completion.choices[0].message.content.trim();
      const generated_at = new Date().toISOString();

      // Store in database for permanent storage
      const { error: updateError } = await dbLoader.supabase
        .from('strategic_directives_v2')
        .update({
          backlog_summary: summary,
          backlog_summary_generated_at: generated_at
        })
        .eq('id', sd_id);

      if (updateError) {
        console.warn('⚠️ Failed to save summary to database:', updateError.message);
      } else {
        console.log(`💾 Saved summary to database for SD ${sd_id}`);
      }

      const responseData = {
        summary,
        itemCount: backlogItems.length,
        generated_at,
        from_database: false
      };

      res.json(responseData);

    } catch (aiError) {
      console.error('OpenAI Error:', aiError);
      return res.status(500).json({
        error: 'AI summarization failed',
        fallback: `Contains ${backlogItems.length} backlog items covering various technical requirements and implementation details.`
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
