import { Router } from 'express';
import { createAnalysis, completeAnalysis } from '../store.js';
import { config } from '../config.js';
import { validateWebhook } from '../middleware/validate-webhook.js';

const router = Router();

router.post('/github', validateWebhook, (req, res) => {
  const { pull_request, repository } = req.body;
  const analysis = createAnalysis(pull_request.number, repository.full_name);

  // Simulate async completion based on configured result
  setTimeout(() => {
    completeAnalysis(analysis.id, config.defaultResult);
  }, 100);

  res.status(200).json({
    message: 'Webhook received',
    analysis_id: analysis.id,
    status: 'pending'
  });
});

export default router;
