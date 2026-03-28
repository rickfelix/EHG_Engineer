const REQUIRED_HEADERS = ['x-github-event', 'x-github-delivery'];
const REQUIRED_FIELDS = ['action', 'pull_request', 'repository'];

export function validateWebhook(req, res, next) {
  const missing = REQUIRED_HEADERS.filter(h => !req.headers[h]);
  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Missing required headers',
      missing_headers: missing
    });
  }

  const missingFields = REQUIRED_FIELDS.filter(f => !req.body?.[f]);
  if (missingFields.length > 0) {
    return res.status(400).json({
      error: 'Missing required fields',
      missing_fields: missingFields
    });
  }

  next();
}
