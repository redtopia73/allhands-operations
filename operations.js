const { ensureTables, valid, body, errorKind } = require('./_auth.cjs');

module.exports = async (req, res) => {
  try {
    const admin = valid(req, 'allhands_admin');
    const company = valid(req, 'allhands_company', 'company');
    if (!admin && !company) return res.status(401).json({ error: '운영관리 사이트에서 기업 또는 관리자 로그인이 필요합니다.' });

    const db = await ensureTables();
    const ownerCompanyId = company ? String(company.id) : null;

    if (req.method === 'POST') {
      const input = body(req);
      if (input.action === 'quote-save' || input.action === 'contract-save' || input.action === 'dispatch-contract-save' || input.action === 'assignment-to-save') {
        const documentType = input.action === 'quote-save' ? 'quote' : input.action === 'dispatch-contract-save' ? 'dispatch-contract' : input.action === 'assignment-to-save' ? 'assignment-to' : 'contract';
        const document = input.document && typeof input.document === 'object' ? input.document : {};
        const rows = await db.query(
          'INSERT INTO allhands_operation_documents (owner_company_id,document_type,data) VALUES ($1,$2,$3::jsonb) RETURNING id,updated_at',
          [ownerCompanyId, documentType, JSON.stringify(document)]
        );
        return res.status(201).json({ ok: true, id: rows[0].id, updatedAt: rows[0].updated_at });
      }

      const appId = Number(input.applicationId);
      if (!appId) return res.status(400).json({ error: '대상 인력을 확인해 주세요.' });
      const rows = await db.query(
        admin
          ? 'SELECT employer_note FROM allhands_job_applications WHERE id=$1'
          : "SELECT a.employer_note FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2",
        admin ? [appId] : [appId, ownerCompanyId]
      );
      if (!rows[0]) return res.status(404).json({ error: '권한이 없거나 대상 인력이 없습니다.' });
      const previous = rows[0].employer_note || {};
      const operation = {
        attendance: String(input.attendance || ''),
        workDays: String(input.workDays || ''),
        workHours: String(input.workHours || ''),
        dailyRate: String(input.dailyRate || ''),
        grossPay: String(input.grossPay || ''),
        netPay: String(input.netPay || ''),
        payDate: String(input.payDate || ''),
        updatedAt: new Date().toISOString()
      };
      await db.query('UPDATE allhands_job_applications SET employer_note=$1::jsonb WHERE id=$2', [JSON.stringify({ ...previous, operation }), appId]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const jobs = await db.query(
        admin
          ? "SELECT id,data FROM allhands_job_posts WHERE status='active' ORDER BY updated_at DESC"
          : "SELECT id,data FROM allhands_job_posts WHERE status='active' AND data->>'ownerCompanyId'=$1 ORDER BY updated_at DESC",
        admin ? [] : [ownerCompanyId]
      );
      const people = await db.query(
        admin
          ? 'SELECT id,job_id,job_title,worker_data,status,employer_note FROM allhands_job_applications ORDER BY created_at DESC LIMIT 300'
          : "SELECT a.id,a.job_id,a.job_title,a.worker_data,a.status,a.employer_note FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE j.data->>'ownerCompanyId'=$1 ORDER BY a.created_at DESC LIMIT 300",
        admin ? [] : [ownerCompanyId]
      );
      const documents = await db.query(
        admin
          ? 'SELECT id,document_type,data,updated_at FROM allhands_operation_documents ORDER BY updated_at DESC LIMIT 100'
          : 'SELECT id,document_type,data,updated_at FROM allhands_operation_documents WHERE owner_company_id=$1 ORDER BY updated_at DESC LIMIT 100',
        admin ? [] : [ownerCompanyId]
      );
      return res.status(200).json({ jobs, people, documents, role: admin ? 'admin' : 'company' });
    }

    return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
  } catch (error) {
    return res.status(500).json({ error: errorKind(error) });
  }
};
