const { ensureTables, valid, body } = require('./_auth.cjs');

const clean = value => String(value || '').trim();
const attendanceStatuses = ['정상근무', '출근', '지각', '결근', '휴무'];
const companyScoreKeys = ['payAccuracy', 'payTimeliness', 'conditionMatch', 'communication', 'safety'];

function scoreValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

async function applications(db, workerId) {
  return db.query(
    "SELECT a.id,a.job_id,a.job_title,a.status,a.employer_note,j.data AS job_data,c.data AS company_data FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text JOIN allhands_signup_applications c ON c.id=NULLIF(j.data->>'ownerCompanyId','')::BIGINT WHERE a.worker_data->>'memberId'=$1 AND COALESCE(a.employer_note->'operation'->>'assignmentDate','')<>'' AND c.kind='company' AND c.status='active' AND c.data->>'membershipTier'='operations' ORDER BY a.created_at DESC",
    [String(workerId)]
  );
}

module.exports = async (req, res) => {
  try {
    const worker = valid(req, 'allhands_worker', 'worker');
    if (!worker) return res.status(401).json({ error: '올핸잡에서 운영관리 메뉴를 통해 접속해 주세요.' });

    const db = await ensureTables();
    const rows = await applications(db, worker.id);

    if (req.method === 'GET') {
      const notices = await db.query("SELECT id,data,created_at FROM allhands_operation_documents WHERE document_type='worker-notice' ORDER BY created_at DESC LIMIT 100");
      const requests = await db.query("SELECT id,data,created_at FROM allhands_operation_documents WHERE document_type IN ('worker-certificate-request','worker-attendance-request') AND data->>'workerId'=$1 ORDER BY created_at DESC LIMIT 100", [String(worker.id)]);
      const contracts = await db.query("SELECT id,data,created_at FROM allhands_operation_documents WHERE document_type='employment-contract' AND data->>'workerId'=$1 ORDER BY created_at DESC LIMIT 30", [String(worker.id)]);
      const applicationIds = rows.map(row => String(row.id));
      const deliveries = applicationIds.length
        ? await db.query("SELECT id,data,created_at FROM allhands_operation_documents WHERE document_type='payslip-delivery' AND data->>'applicationId'=ANY($1::text[]) ORDER BY created_at DESC LIMIT 100", [applicationIds])
        : [];
      const payslipMessages = await db.query("SELECT id,subject,body,created_at FROM allhands_messages WHERE recipient_kind='worker' AND recipient_id=$1 AND subject LIKE '%임금명세서%' ORDER BY created_at DESC LIMIT 100", [Number(worker.id)]);
      const companyIds = new Set(rows.map(row => String(row.job_data?.ownerCompanyId || '')));
      const reviews = companyIds.size
        ? await db.query("SELECT company_id,scores,comment,status,updated_at FROM allhands_company_reviews WHERE worker_id=$1 AND company_id=ANY($2::bigint[])", [Number(worker.id), [...companyIds].filter(Boolean).map(Number)])
        : [];
      const links = await db.query("SELECT data FROM allhands_operation_documents WHERE document_type='job-client' AND data->>'jobId'=ANY($1::text[])", [rows.map(row => String(row.job_id || ''))]);
      const clients = Object.fromEntries(links.map(link => [String(link.data?.jobId || ''), clean(link.data?.clientName)]).filter(([, name]) => name));
      const items = rows.map(row => ({ ...row, client_name: clients[String(row.job_id || '')] || '' }));
      return res.status(200).json({
        items,
        notices: notices.filter(item => item.data?.scope === 'all' || companyIds.has(String(item.data?.companyId || ''))).map(item => ({ id: item.id, ...item.data, createdAt: item.created_at })),
        requests: requests.map(item => ({ id: item.id, ...item.data, createdAt: item.created_at })),
        contracts: contracts.map(item => ({ id: item.id, ...item.data, createdAt: item.created_at })),
        companyReviews: reviews.map(item => ({ companyId: String(item.company_id), scores: item.scores || {}, comment: item.comment || '', status: item.status, updatedAt: item.updated_at })),
        payslips: deliveries.map(item => ({ id: item.id, ...item.data, createdAt: item.created_at })),
        payslipMessages: payslipMessages.map(item => ({ id: item.id, subject: item.subject, body: item.body, createdAt: item.created_at }))
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않은 요청입니다.' });

    const input = body(req);
    const applicationId = Number(input.applicationId);
    // Neon can return BIGINT ids as strings. Compare the identifier value, not its JS type.
    const target = rows.find(row => String(row.id) === String(applicationId));
    if (!target) return res.status(404).json({ error: '배치된 근무 정보를 찾지 못했습니다.' });
    const previous = target.employer_note || {};

    if (input.action === 'company-review') {
      const companyId = Number(target.job_data?.ownerCompanyId);
      if (!Number.isSafeInteger(companyId)) return res.status(400).json({ error: '평가할 업체 정보를 확인하지 못했습니다.' });
      const scores = {};
      for (const key of companyScoreKeys) {
        const value = scoreValue(input.scores?.[key]);
        if (!value) return res.status(400).json({ error: '모든 평가 항목을 1~5점으로 입력해 주세요.' });
        scores[key] = value;
      }
      const comment = clean(input.comment).slice(0, 1000);
      await db.query(`INSERT INTO allhands_company_reviews (company_id,worker_id,scores,comment,status)
        VALUES ($1,$2,$3::jsonb,$4,'published')
        ON CONFLICT (company_id,worker_id)
        DO UPDATE SET scores=EXCLUDED.scores,comment=EXCLUDED.comment,status='published',updated_at=NOW()`,
        [companyId, Number(worker.id), JSON.stringify(scores), comment]);
      return res.status(200).json({ ok: true, message: '업체 평가를 저장했습니다. 업체 신뢰정보에 반영됩니다.' });
    }

    if (input.action === 'attendance-month') {
      const month = clean(input.month);
      const records = Array.isArray(input.records) ? input.records : [];
      if (!/^\d{4}-\d{2}$/.test(month) || records.length > 31) return res.status(400).json({ error: '근태 입력 내용을 확인해 주세요.' });

      const next = [];
      for (const row of records) {
        const workDate = clean(row?.workDate);
        const attendance = clean(row?.attendance) || '휴무';
        if (!workDate.startsWith(month + '-') || !attendanceStatuses.includes(attendance)) return res.status(400).json({ error: '근태 상태를 확인해 주세요.' });
        const record = {
          workDate,
          attendance,
          normalHours: Math.max(0, Math.min(24, Number(row?.normalHours) || 0)),
          overtimeHours: Math.max(0, Math.min(16, Number(row?.overtimeHours) || 0)),
          reportedAt: new Date().toISOString()
        };
        if (record.normalHours > 0 || record.overtimeHours > 0 || record.attendance !== '휴무') next.push(record);
      }

      const old = Array.isArray(previous.workerAttendance) ? previous.workerAttendance : [];
      const workerAttendance = [...old.filter(row => !String(row?.workDate || '').startsWith(month + '-')), ...next];
      await db.query(
        'UPDATE allhands_job_applications SET employer_note=$1::jsonb WHERE id=$2',
        [JSON.stringify({ ...previous, workerAttendance }), target.id]
      );
      return res.status(200).json({ ok: true, message: '근태를 저장했고 기업 담당자에게 전달했습니다.' });
    }

    if (input.action === 'contract-sign') {
      const documentId = Number(input.documentId);
      const signature = clean(input.signature).slice(0, 80);
      if (!documentId || !signature) return res.status(400).json({ error: '서명 정보를 확인해 주세요.' });
      const docs = await db.query("SELECT id,data FROM allhands_operation_documents WHERE id=$1 AND document_type='employment-contract' AND data->>'workerId'=$2", [documentId, String(worker.id)]);
      if (!docs[0]) return res.status(404).json({ error: '서명 요청을 찾지 못했습니다.' });
      const contract = { ...(docs[0].data || {}), status: '근로자 서명 완료', workerSignature: signature, signedAt: new Date().toISOString() };
      await db.query('UPDATE allhands_operation_documents SET data=$1::jsonb,updated_at=NOW() WHERE id=$2', [JSON.stringify(contract), documentId]);
      return res.status(200).json({ ok: true, message: '근로계약서 서명을 완료했습니다.' });
    }

    if (input.action === 'request') {
      const kind = ['certificate', 'attendance'].includes(input.kind) ? input.kind : 'attendance';
      const requestDate = kind === 'attendance' ? clean(input.requestDate) : '';
      if (kind === 'attendance' && !/^\d{4}-\d{2}-\d{2}$/.test(requestDate)) return res.status(400).json({ error: '근태 발생일을 선택해 주세요.' });
      const request = {
        kind,
        requestType: clean(input.requestType).slice(0, 60),
        requestDate,
        content: clean(input.content).slice(0, 1000),
        status: '결재 대기',
        applicationId: target.id,
        workerId: worker.id,
        workerName: target.worker_data?.name || '',
        companyId: String(target.job_data?.ownerCompanyId || ''),
        jobTitle: target.job_title,
        requestedAt: new Date().toISOString()
      };
      await db.query(
        'INSERT INTO allhands_operation_documents (owner_company_id,document_type,data) VALUES ($1,$2,$3::jsonb)',
        [request.companyId, kind === 'certificate' ? 'worker-certificate-request' : 'worker-attendance-request', JSON.stringify(request)]
      );
      return res.status(201).json({ ok: true, message: kind === 'certificate' ? '증명서 발급을 신청했습니다.' : '근태 신청을 등록했습니다.' });
    }

    return res.status(400).json({ error: '요청을 확인해 주세요.' });
  } catch {
    return res.status(500).json({ error: '개인 운영관리 정보를 처리하지 못했습니다.' });
  }
};

