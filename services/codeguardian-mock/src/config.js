export const config = {
  port: parseInt(process.env.MOCK_PORT || '4000', 10),
  defaultResult: process.env.MOCK_ANALYSIS_RESULT || 'success',
  version: '0.1.0'
};
