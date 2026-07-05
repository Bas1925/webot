// Netlify Function: POST /api/lead (rewritten from netlify.toml).
// Env vars: MONGODB_URI, DB_NAME, LEADS_COLLECTION, GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO, CORS_ORIGIN
const { processLead } = require('../../lib/lead');

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const headers = (extra) => Object.assign({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'X-Content-Type-Options': 'nosniff',
}, extra || {});

const clientIp = (event) =>
  (event.headers['x-nf-client-connection-ip'] ||
    (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    '');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: headers({
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }),
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers(), body: JSON.stringify({ ok: false, error: 'method not allowed' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const result = await processLead(body, {
    ip: clientIp(event),
    userAgent: event.headers['user-agent'] || event.headers['User-Agent'] || '',
    rateLimit: false, // in-memory limiter is unreliable across serverless invocations
  });

  return {
    statusCode: result.status,
    headers: headers(),
    body: JSON.stringify(result.body),
  };
};
