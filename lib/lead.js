// Shared lead validation, persistence and optional email notification.
// Used by server.js (local dev) and netlify/functions/lead.js (production).
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.DB_NAME || 'webot';
const COLLECTION = process.env.LEADS_COLLECTION || 'leads';
const LOCAL_FALLBACK = path.join(__dirname, '..', 'leads.local.json');

const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(s);
const clean = (s, n) => (s == null ? '' : String(s)).trim().slice(0, n || 200);
const phoneDigits = (s) => (String(s || '').match(/\d/g) || []).length;
const ALLOWED_DIAL = new Set(['+972', '+20', '+962', '+971', '+973', '+212']);

let _collection = null;
async function getCollection() {
  if (!MONGODB_URI) return null;
  if (_collection) return _collection;
  let MongoClient;
  try { ({ MongoClient } = require('mongodb')); }
  catch (e) { console.warn('[webot] "mongodb" not installed — run `npm install`.'); return null; }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  _collection = client.db(DB_NAME).collection(COLLECTION);
  console.log('[webot] connected to MongoDB →', DB_NAME + '.' + COLLECTION);
  return _collection;
}

async function saveLead(lead) {
  let col = null;
  try { col = await getCollection(); } catch (e) { console.error('[webot] Mongo connect failed:', e.message); }
  if (col) { const r = await col.insertOne(lead); return { where: 'mongodb', id: r.insertedId }; }
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(LOCAL_FALLBACK, 'utf8')); } catch (e) {}
  arr.push(lead);
  fs.writeFileSync(LOCAL_FALLBACK, JSON.stringify(arr, null, 2));
  return { where: 'file' };
}

async function notify(lead) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (e) { return; }
  const t = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await t.sendMail({
    from: 'Webot Leads <' + process.env.GMAIL_USER + '>',
    to: process.env.MAIL_TO || process.env.GMAIL_USER,
    replyTo: lead.email,
    subject: 'New lead: ' + lead.name + ' (' + lead.country + ')',
    text: [
      'Name:   ' + lead.name,
      'Email:  ' + lead.email,
      'Phone:  ' + lead.phoneFull,
      'Country:' + lead.country,
      'Lang:   ' + lead.lang,
      'Page:   ' + lead.page,
      'When:   ' + lead.createdAt.toISOString(),
    ].join('\n'),
  });
}

// Simple in-memory sliding-window rate limiter (per IP). Works for a single
// long-lived Node process; not reliable on serverless (see netlify function).
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = 6;
const _rlHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hits = (_rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  hits.push(now);
  _rlHits.set(ip, hits);
  if (_rlHits.size > 5000) {
    for (const [k, v] of _rlHits) if (!v.some((t) => now - t < RL_WINDOW_MS)) _rlHits.delete(k);
  }
  return hits.length > RL_MAX;
}

async function processLead(body, meta) {
  const ip = clean(meta.ip, 60);
  const userAgent = clean(meta.userAgent, 300);

  if (body._gotcha) return { status: 200, body: { ok: true } };

  if (meta.rateLimit !== false && rateLimited(ip)) {
    return { status: 429, body: { ok: false, error: 'Too many requests. Please try again in a few minutes.' } };
  }

  const name = clean(body.name, 120);
  const email = clean(body.email, 160);
  const phone = clean(body.phone, 40);
  const dialCode = clean(body.country, 8);
  const country = clean(body.countryName, 80);

  if (name.length < 2) return { status: 422, body: { ok: false, error: 'Please enter your full name.' } };
  if (dialCode && !ALLOWED_DIAL.has(dialCode)) return { status: 422, body: { ok: false, error: 'Please select a valid country.' } };
  if (phoneDigits(phone) < 7) return { status: 422, body: { ok: false, error: 'Please enter a valid phone number.' } };
  if (!isEmail(email)) return { status: 422, body: { ok: false, error: 'Please provide a valid email address.' } };

  const lead = {
    name, email, country, dialCode, phone,
    phoneFull: (dialCode ? dialCode + ' ' : '') + phone,
    lang: clean(body.lang, 8),
    page: clean(body.page, 300),
    userAgent,
    ip,
    createdAt: new Date(),
  };

  try {
    const r = await saveLead(lead);
    notify(lead).catch((e) => console.error('[webot] email failed:', e.message));
    console.log('[webot] lead saved (' + r.where + '):', lead.name, lead.email, lead.phoneFull);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    console.error('[webot] lead save failed:', err);
    return { status: 500, body: { ok: false, error: 'server error' } };
  }
}

module.exports = { processLead, rateLimited };
