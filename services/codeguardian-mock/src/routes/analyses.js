import { Router } from 'express';
import { getAnalysis, listAnalyses } from '../store.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ analyses: listAnalyses() });
});

router.get('/:id', (req, res) => {
  const analysis = getAnalysis(req.params.id);
  if (!analysis) {
    return res.status(404).json({ error: 'Analysis not found' });
  }
  res.json(analysis);
});

export default router;
