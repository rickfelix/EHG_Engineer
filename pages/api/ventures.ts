/**
 * POST /api/ventures
 * SD-STAGE1-ENTRY-UX-001: Create venture with origin tracking
 *
 * Creates a new venture in Stage 1 with origin_type tracking
 * (manual, competitor_clone, or blueprint)
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Request body validation schema
const CreateVentureSchema = z.object({
  name: z.string().min(1, 'Venture name is required'),
  problem_statement: z.string().min(1, 'Problem statement is required'),
  solution: z.string().min(1, 'Solution is required'),
  target_market: z.string().min(1, 'Target market is required'),
  origin_type: z.enum(['manual', 'competitor_clone', 'blueprint']),
  competitor_ref: z.string().nullable().optional(),
  blueprint_id: z.string().nullable().optional()
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // GET: Fetch all ventures
  if (req.method === 'GET') {
    try {
      const { data: ventures, error } = await supabase
        .from('ventures')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch ventures:', error);
        return res.status(500).json({
          error: 'Failed to fetch ventures',
          message: error.message
        });
      }

      return res.status(200).json(ventures || []);
    } catch (error) {
      console.error('Fetch ventures error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // POST: Create new venture
  if (req.method === 'POST') {
    // Validate request body
    const parsed = CreateVentureSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors
      });
    }

    const { name, problem_statement, solution, target_market, origin_type, competitor_ref, blueprint_id } = parsed.data;

    try {
      const { data: venture, error } = await supabase
        .from('ventures')
        .insert({
          name,
          problem_statement,
          solution,
          target_market,
          stage: 1,
          origin_type,
          competitor_ref: competitor_ref || null,
          blueprint_id: blueprint_id || null
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create venture:', error);
        return res.status(500).json({
          error: 'Failed to create venture',
          message: error.message
        });
      }

      return res.status(201).json(venture);

    } catch (error) {
      console.error('Create venture error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Method not allowed
  return res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'POST']
  });
}
