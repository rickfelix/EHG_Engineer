/**
 * EVA Chat API Routes
 *
 * SD: SD-LEO-INFRA-EVA-CHAT-CANVAS-002
 *
 * REST endpoints for EVA Chat conversation management.
 * Delegates to eva-chat-service.js for business logic.
 *
 * @module server/routes/eva-chat
 */

import { Router } from 'express';
import { isValidUuid, validateUuidParam, isValidStringLength } from '../middleware/validate.js';

const router = Router();

/**
 * POST /api/eva/chat/conversations
 * Create a new conversation.
 */
router.post('/conversations', async (req, res) => {
  try {
    const { createConversation } = await import('../../lib/integrations/eva-chat-service.js');
    const userId = req.user?.id || req.body.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id required' });

    const { title, metadata } = req.body;
    const conversation = await createConversation(userId, title, metadata);
    res.status(201).json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create conversation', message: err.message });
  }
});

/**
 * GET /api/eva/chat/conversations
 * List conversations for the authenticated user.
 */
router.get('/conversations', async (req, res) => {
  try {
    const { listConversations } = await import('../../lib/integrations/eva-chat-service.js');
    const userId = req.user?.id || req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id required' });

    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const conversations = await listConversations(userId, limit, offset);
    res.json({ conversations, limit, offset });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list conversations', message: err.message });
  }
});

/**
 * GET /api/eva/chat/conversations/:id/messages
 * Get messages for a conversation.
 */
router.get('/conversations/:id/messages', validateUuidParam('id'), async (req, res) => {
  try {
    const { getMessages } = await import('../../lib/integrations/eva-chat-service.js');
    const messages = await getMessages(req.params.id);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get messages', message: err.message });
  }
});

/**
 * POST /api/eva/chat/message
 * Send a message and get EVA's response.
 * FR-003: POST /api/eva-chat/message
 */
router.post('/message', async (req, res) => {
  try {
    const { sendMessage } = await import('../../lib/integrations/eva-chat-service.js');
    const { conversation_id, content, user_id } = req.body;
    const userId = req.user?.id || user_id;

    if (!conversation_id || !isValidUuid(conversation_id)) return res.status(400).json({ error: 'conversation_id required and must be a valid UUID' });
    if (!content || !isValidStringLength(content, 10000)) return res.status(400).json({ error: 'content required and must be under 10000 characters' });
    if (!userId) return res.status(400).json({ error: 'user_id required' });

    const result = await sendMessage(conversation_id, content, userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', message: err.message });
  }
});

/**
 * POST /api/eva/chat/stream
 * SSE streaming endpoint — streams EVA response tokens in real-time.
 * SD: SD-LEO-INFRA-EVA-CHAT-CANVAS-004 (Phase 3)
 */
router.post('/stream', async (req, res) => {
  const { conversation_id, content, user_id } = req.body;
  const userId = req.user?.id || user_id;

  if (!conversation_id || !isValidUuid(conversation_id)) return res.status(400).json({ error: 'conversation_id required and must be a valid UUID' });
  if (!content || !isValidStringLength(content, 10000)) return res.status(400).json({ error: 'content required and must be under 10000 characters' });
  if (!userId) return res.status(400).json({ error: 'user_id required' });

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    const { streamMessage } = await import('../../lib/integrations/eva-chat-service.js');
    await streamMessage(conversation_id, content, userId, {
      onToken(token) {
        if (!aborted) {
          res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
        }
      },
      onComplete(message) {
        if (!aborted) {
          res.write(`data: ${JSON.stringify({ type: 'done', message })}\n\n`);
          res.end();
        }
      },
      onError(error) {
        if (!aborted) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
          res.end();
        }
      }
    });
  } catch (err) {
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  }
});

export default router;
