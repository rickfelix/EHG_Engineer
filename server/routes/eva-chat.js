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
router.get('/conversations/:id/messages', async (req, res) => {
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

    if (!conversation_id) return res.status(400).json({ error: 'conversation_id required' });
    if (!content) return res.status(400).json({ error: 'content required' });
    if (!userId) return res.status(400).json({ error: 'user_id required' });

    const result = await sendMessage(conversation_id, content, userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', message: err.message });
  }
});

export default router;
