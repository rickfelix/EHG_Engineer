/**
 * Supabase Query Tool for Programmatic Tool Calling
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Provides a reusable tool that Claude can call to query Supabase tables.
 * Used by all 6 programmatic scripts.
 *
 * @module lib/programmatic/tools/supabase-tool
 */

/**
 * Create a Supabase query tool.
 *
 * @param {Object} supabase - Supabase client instance
 * @returns {{ definition: Object, handler: Function }}
 */
export function createSupabaseTool(supabase) {
  const definition = {
    name: 'supabase_query',
    description:
      'Query a Supabase table and return rows as JSON. ' +
      'Use for reading strategic_directives_v2, product_requirements_v2, ' +
      'sd_phase_handoffs, eva_vision_scores, user_stories, retrospectives, etc.',
    input_schema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'Table name to query',
        },
        select: {
          type: 'string',
          description: 'Columns to select (e.g. "id,title,status" or "*")',
        },
        filters: {
          type: 'array',
          description: 'Array of filter conditions',
          items: {
            type: 'object',
            properties: {
              col: { type: 'string', description: 'Column name' },
              op: {
                type: 'string',
                enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'],
                description: 'Filter operator',
              },
              val: { description: 'Value to compare against' },
            },
            required: ['col', 'op', 'val'],
          },
        },
        limit: {
          type: 'number',
          description: 'Maximum number of rows to return (default: 50)',
        },
        order: {
          type: 'object',
          description: 'Sort order',
          properties: {
            col: { type: 'string' },
            ascending: { type: 'boolean' },
          },
        },
      },
      required: ['table', 'select'],
    },
  };

  async function handler(input, { dryRun } = {}) {
    const { table, select, filters = [], limit = 50, order } = input;

    if (dryRun) {
      return JSON.stringify({ dry_run: true, table, select, filters, message: 'Dry run — no DB call made' });
    }

    let query = supabase.from(table).select(select);

    for (const f of filters) {
      switch (f.op) {
        case 'eq':   query = query.eq(f.col, f.val); break;
        case 'neq':  query = query.neq(f.col, f.val); break;
        case 'gt':   query = query.gt(f.col, f.val); break;
        case 'gte':  query = query.gte(f.col, f.val); break;
        case 'lt':   query = query.lt(f.col, f.val); break;
        case 'lte':  query = query.lte(f.col, f.val); break;
        case 'like': query = query.like(f.col, f.val); break;
        case 'ilike':query = query.ilike(f.col, f.val); break;
        case 'is':   query = query.is(f.col, f.val); break;
        case 'in':   query = query.in(f.col, f.val); break;
        default:     query = query.eq(f.col, f.val);
      }
    }

    if (order) {
      query = query.order(order.col, { ascending: order.ascending ?? true });
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      return JSON.stringify({ error: error.message, table });
    }

    return JSON.stringify(data ?? []);
  }

  return { definition, handler };
}

/**
 * Create a Supabase upsert tool.
 *
 * @param {Object} supabase - Supabase client instance
 * @returns {{ definition: Object, handler: Function }}
 */
export function createSupabaseUpsertTool(supabase) {
  const definition = {
    name: 'supabase_upsert',
    description: 'Insert or update a row in a Supabase table.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        data: { type: 'object', description: 'Row data to insert/update' },
        onConflict: {
          type: 'string',
          description: 'Column(s) to use for conflict resolution (e.g. "id" or "sd_id,scored_at")',
        },
      },
      required: ['table', 'data'],
    },
  };

  async function handler(input, { dryRun } = {}) {
    const { table, data, onConflict } = input;

    if (dryRun) {
      return JSON.stringify({ dry_run: true, table, data, message: 'Dry run — no DB write made' });
    }

    let query = supabase.from(table).upsert(data);
    if (onConflict) query = supabase.from(table).upsert(data, { onConflict });

    const { data: result, error } = await query.select();

    if (error) {
      return JSON.stringify({ error: error.message, table });
    }

    return JSON.stringify(result ?? {});
  }

  return { definition, handler };
}
