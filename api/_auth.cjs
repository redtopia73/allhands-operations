const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

function sql() {
  if (!process.env.DATABASE_URL) throw new Error('database-not-configured');
  return neon(process.env.DATABASE_URL);
}

// The operations site uses the exact same database as allhands-job.
// Keeping the shared tables available also makes a newly connected database safe to open.
async function ensureTables() {
  const db = sql();
  await db.query("CREATE TABLE IF NOT EXISTS allhands_signup_applications (id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, data JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE TABLE IF NOT EXISTS allhands_job_posts (id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE TABLE IF NOT EXISTS allhands_job_applications (id BIGSERIAL PRIMARY KEY, job_id TEXT NOT NULL, job_title TEXT NOT NULL, worker_data JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'applied', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("ALTER TABLE allhands_job_applications ADD COLUMN IF NOT EXISTS employer_note JSONB");
  await db.query("CREATE TABLE IF NOT EXISTS allhands_messages (id BIGSERIAL PRIMARY KEY, sender_kind TEXT NOT NULL, sender_id BIGINT, sender_name TEXT NOT NULL, recipient_kind TEXT NOT NULL, recipient_id BIGINT, recipient_name TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("ALTER TABLE allhands_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ");
  await db.query("ALTER TABLE allhands_messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb");
  await db.query("CREATE TABLE IF NOT EXISTS allhands_operation_documents (id BIGSERIAL PRIMARY KEY, owner_company_id TEXT, document_type TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  return db;
}

function cookie(req, name) {
  return ((req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '=')) || '').slice(name.length + 1);
}
function valid(req, name, role) {
  const token = cookie(req, name), secret = process.env.ADMIN_SESSION_SECRET;
  if (!token || !secret || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return value.expires > Date.now() && (!role || value.role === role) ? value : null;
  } catch { return null; }
}
function body(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}
function errorKind(error) {
  const message = String(error?.message || '');
  if (message.includes('database-not-configured')) return 'DATABASE_URL 환경변수가 설정되지 않았습니다.';
  if (/connection|string|url|endpoint|password|auth/i.test(message)) return '데이터베이스 연결 설정을 확인해 주세요.';
  return '운영 데이터베이스를 준비하지 못했습니다.';
}

module.exports = { sql, ensureTables, cookie, valid, body, errorKind };
