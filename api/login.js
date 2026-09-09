const crypto = require('crypto');
const { ensureTables, body, errorKind } = require('./_auth.cjs');
const sign = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
const clean = value => String(value || '').trim().slice(0, 200);

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query?.sso) {
    try {
      const token = String(req.query.sso), [payload, signature] = token.split('.');
      const secret = process.env.OPERATIONS_SSO_SECRET || process.env.ADMIN_SESSION_SECRET;
      const expected = crypto.createHmac('sha256', secret || '').update(payload).digest('base64url');
      if (!secret || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('invalid-sso');
      const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (session.role !== 'company' || !Number.isSafeInteger(session.id) || session.expires <= Date.now()) throw new Error('expired-sso');
      const companyPayload = Buffer.from(JSON.stringify({ role:'company', id:session.id, expires:Date.now()+86400000 })).toString('base64url');
      res.setHeader('Set-Cookie', `allhands_company=${companyPayload}.${sign(companyPayload, process.env.ADMIN_SESSION_SECRET)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
      res.setHeader('Location', '/');
      return res.status(302).end();
    } catch {
      return res.status(401).send('운영관리 자동 로그인이 만료되었거나 올바르지 않습니다. 올핸잡에서 다시 시도해 주세요.');
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: '로그인 요청만 사용할 수 있습니다.' });
  try {
    const input = body(req), secret = process.env.ADMIN_SESSION_SECRET;
    if (!secret) return res.status(503).json({ error: '로그인 설정이 필요합니다.' });
    if (input.role === 'admin') {
      if (clean(input.id) !== clean(process.env.ADMIN_EMAIL) || String(input.password || '') !== String(process.env.ADMIN_PASSWORD || '')) {
        return res.status(401).json({ error: '관리자 정보를 확인해 주세요.' });
      }
      const payload = Buffer.from(JSON.stringify({ role: 'admin', expires: Date.now() + 28800000 })).toString('base64url');
      res.setHeader('Set-Cookie', `allhands_admin=${payload}.${sign(payload, secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);
      return res.status(200).json({ ok: true, role: 'admin' });
    }
    const id = clean(input.id), password = String(input.password || '');
    if (!id || !password) return res.status(400).json({ error: '기업 이메일 또는 사업자번호와 비밀번호를 입력해 주세요.' });
    const db = await ensureTables();
    const rows = await db.query("SELECT id, data FROM allhands_signup_applications WHERE kind='company' AND status='active' AND (lower(data->>'companyEmail')=lower($1) OR data->>'businessNumber'=$1 OR data->>'companyPhone'=$1) LIMIT 1", [id]);
    const row = rows[0], hash = crypto.createHash('sha256').update(password).digest('hex');
    if (!row || row.data.passwordHash !== hash) return res.status(401).json({ error: '기업 이메일·사업자번호 또는 비밀번호가 올바르지 않습니다.' });
    const payload = Buffer.from(JSON.stringify({ role: 'company', id: Number(row.id), expires: Date.now() + 86400000 })).toString('base64url');
    res.setHeader('Set-Cookie', `allhands_company=${payload}.${sign(payload, secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
    return res.status(200).json({ ok: true, role: 'company' });
  } catch (error) {
    return res.status(500).json({ error: errorKind(error) });
  }
};
