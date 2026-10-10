const crypto = require('crypto');
const { ensureTables, valid, body, errorKind } = require('./_auth.cjs');

function operationPhotoUrl(pathname, companyId, admin) {
  const secret = process.env.OPERATIONS_SSO_SECRET;
  if (!secret || !pathname) return '';
  const payload = Buffer.from(JSON.stringify({ pathname, companyId: companyId || '', admin: Boolean(admin), expires: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `https://allhands-job.vercel.app/api/file-view?pathname=${encodeURIComponent(pathname)}&operationsToken=${payload}.${signature}`;
}

module.exports = async (req, res) => {
  try {
    const admin = valid(req, 'allhands_admin');
    const company = valid(req, 'allhands_company', 'company');
    if (!admin && !company) return res.status(401).json({ error: '운영관리 사이트에서 기업 또는 관리자 로그인이 필요합니다.' });

    const db = await ensureTables();
    const ownerCompanyId = company ? String(company.id) : null;

    if (req.method === 'POST') {
      const input = body(req);
      if (input.action === 'selection-status') {
        const appId = Number(input.applicationId);
        const nextStatus = String(input.status || '').trim();
        if (!appId || !['면접 대상', '면접 합격', '면접 불합격'].includes(nextStatus)) return res.status(400).json({ error: '변경할 면접 결과를 확인해 주세요.' });
        const rows = await db.query(
          admin
            ? 'SELECT id FROM allhands_job_applications WHERE id=$1'
            : "SELECT a.id FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2",
          admin ? [appId] : [appId, ownerCompanyId]
        );
        if (!rows[0]) return res.status(404).json({ error: '권한이 없거나 지원자를 찾지 못했습니다.' });
        await db.query('UPDATE allhands_job_applications SET status=$1 WHERE id=$2', [nextStatus, appId]);
        return res.status(200).json({ ok: true, message: `${nextStatus}으로 처리했습니다.` });
      }
      if (input.action === 'add-interview-candidate') {
        const sourceId = Number(input.sourceApplicationId);
        const targetJobId = String(input.targetJobId || '').trim();
        if (!sourceId || !/^db-\d+$/.test(targetJobId)) return res.status(400).json({ error: '지원자와 대상 공고를 확인해 주세요.' });
        const sources = await db.query(
          admin
            ? 'SELECT id,worker_data FROM allhands_job_applications WHERE id=$1'
            : "SELECT a.id,a.worker_data FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2",
          admin ? [sourceId] : [sourceId, ownerCompanyId]
        );
        const source = sources[0];
        const targetId = Number(targetJobId.slice(3));
        const targets = await db.query(
          admin
            ? "SELECT id,data FROM allhands_job_posts WHERE id=$1 AND status='active'"
            : "SELECT id,data FROM allhands_job_posts WHERE id=$1 AND status='active' AND data->>'ownerCompanyId'=$2",
          admin ? [targetId] : [targetId, ownerCompanyId]
        );
        const target = targets[0];
        if (!source || !target) return res.status(404).json({ error: '권한이 없거나 대상 공고를 찾지 못했습니다.' });
        const memberId = String(source.worker_data?.memberId || '');
        if (memberId) {
          const existing = await db.query("SELECT id FROM allhands_job_applications WHERE job_id=$1 AND worker_data->>'memberId'=$2 LIMIT 1", [targetJobId, memberId]);
          if (existing[0]) return res.status(409).json({ error: '이미 이 공고의 면접 리스트에 등록된 지원자입니다.' });
        }
        const jobTitle = String(target.data?.title || target.data?.jobTitle || '채용 공고');
        const note = { transferredFromApplicationId: sourceId, transferredAt: new Date().toISOString() };
        const created = await db.query('INSERT INTO allhands_job_applications (job_id,job_title,worker_data,status,employer_note) VALUES ($1,$2,$3::jsonb,$4,$5::jsonb) RETURNING id', [targetJobId, jobTitle, JSON.stringify(source.worker_data || {}), '면접 대상', JSON.stringify(note)]);
        return res.status(201).json({ ok: true, id: created[0].id, message: '다른 공고의 면접 리스트에 추가했습니다.' });
      }
      if (input.action === 'interview-schedule') {
        const appId = Number(input.applicationId), interviewAt = String(input.interviewAt || '').trim().slice(0, 80), interviewPlace = String(input.interviewPlace || '').trim().slice(0, 500);
        if (!appId || !interviewAt || !interviewPlace) return res.status(400).json({ error: '면접 일시와 장소를 입력해 주세요.' });
        const rows = await db.query(
          admin
            ? 'SELECT id,job_title,worker_data,employer_note FROM allhands_job_applications WHERE id=$1'
            : "SELECT a.id,a.job_title,a.worker_data,a.employer_note FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2",
          admin ? [appId] : [appId, ownerCompanyId]
        );
        const application = rows[0], workerId = Number(application?.worker_data?.memberId);
        if (!application) return res.status(404).json({ error: '권한이 없거나 지원자를 찾지 못했습니다.' });
        const interview = { interviewAt, interviewPlace, requestedAt: new Date().toISOString(), resumeRequested: true };
        const note = { ...(application.employer_note || {}), interview, resumeRequested: true };
        await db.query("UPDATE allhands_job_applications SET status='면접 일정 안내',employer_note=$1::jsonb WHERE id=$2", [JSON.stringify(note), appId]);
        if (Number.isSafeInteger(workerId)) {
          const workers = await db.query("SELECT data FROM allhands_signup_applications WHERE id=$1 AND kind='worker' AND status='active' LIMIT 1", [workerId]);
          if (workers[0]) {
            let senderName = 'all hands JOB 관리자';
            if (company) {
              const sender = await db.query('SELECT data FROM allhands_signup_applications WHERE id=$1 LIMIT 1', [Number(company.id)]);
              senderName = String(sender[0]?.data?.companyName || sender[0]?.data?.company || '기업 회원');
            }
            const message = `[면접 일정 안내]\n\n공고: ${application.job_title}\n일시: ${interviewAt}\n장소·방식: ${interviewPlace}\n\n면접 전 간편 이력서를 작성해 추가 제출해 주세요. 내 정보 메뉴의 이력서 작성에서 작성할 수 있습니다.`;
            await db.query('INSERT INTO allhands_messages (sender_kind,sender_id,sender_name,recipient_kind,recipient_id,recipient_name,subject,body,attachments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', [admin ? 'admin' : 'company', admin ? null : Number(company.id), senderName, 'worker', workerId, String(workers[0].data?.name || application.worker_data?.name || '구직자'), `[${application.job_title}] 면접 일정 및 이력서 요청`, message, '[]']);
          }
        }
        return res.status(200).json({ ok: true, message: '면접 일정과 간편 이력서 제출 요청을 전달했습니다.' });
      }
      if (input.action === 'payslip-message-send') {
        const document = input.document && typeof input.document === 'object' ? input.document : {};
        const appId = Number(document.applicationId);
        if (!appId) return res.status(400).json({ error: '대상 인력을 확인해 주세요.' });
        const people = await db.query(
          admin
            ? 'SELECT id,worker_data FROM allhands_job_applications WHERE id=$1'
            : "SELECT a.id,a.worker_data FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2",
          admin ? [appId] : [appId, ownerCompanyId]
        );
        const person = people[0], workerId = Number(person?.worker_data?.memberId);
        if (!person || !Number.isSafeInteger(workerId)) return res.status(400).json({ error: '플랫폼 회원 계정이 연결된 인력에게만 쪽지를 보낼 수 있습니다.' });
        const workers = await db.query("SELECT data FROM allhands_signup_applications WHERE id=$1 AND kind='worker' AND status='active' LIMIT 1", [workerId]);
        if (!workers[0]) return res.status(400).json({ error: '수신자의 활성화된 구직자 계정을 찾을 수 없습니다.' });
        let senderName = 'all hands JOB 관리자';
        if (company) {
          const sender = await db.query('SELECT data FROM allhands_signup_applications WHERE id=$1 LIMIT 1', [Number(company.id)]);
          senderName = String(sender[0]?.data?.companyName || sender[0]?.data?.company || '기업 회원');
        }
        const subject = String(document.subject || '').trim().slice(0, 160);
        const messageBody = String(document.body || '').trim().slice(0, 3000);
        if (!subject || !messageBody) return res.status(400).json({ error: '명세서 내용이 준비되지 않았습니다.' });
        const sent = await db.query(
          'INSERT INTO allhands_messages (sender_kind,sender_id,sender_name,recipient_kind,recipient_id,recipient_name,subject,body,attachments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id,created_at',
          [admin ? 'admin' : 'company', admin ? null : Number(company.id), senderName, 'worker', workerId, String(workers[0].data?.name || person.worker_data?.name || '구직자'), subject, messageBody, '[]']
        );
        const delivery = { applicationId: appId, month: String(document.month || ''), payDate: String(document.payDate || ''), deliveryMethod: '플랫폼 쪽지', deliveredAt: new Date().toISOString(), messageId: sent[0].id };
        const saved = await db.query('INSERT INTO allhands_operation_documents (owner_company_id,document_type,data) VALUES ($1,$2,$3::jsonb) RETURNING id,updated_at', [ownerCompanyId, 'payslip-delivery', JSON.stringify(delivery)]);
        return res.status(201).json({ ok: true, id: saved[0].id, messageId: sent[0].id, updatedAt: saved[0].updated_at });
      }
      if (input.action === 'quote-save' || input.action === 'contract-save' || input.action === 'dispatch-contract-save' || input.action === 'assignment-to-save' || input.action === 'invoice-save' || input.action === 'job-client-save' || input.action === 'payroll-calculation-save' || input.action === 'payslip-delivery-save') {
        const documentType = input.action === 'quote-save' ? 'quote' : input.action === 'invoice-save' ? 'invoice' : input.action === 'job-client-save' ? 'job-client' : input.action === 'payroll-calculation-save' ? 'payroll-calculation' : input.action === 'payslip-delivery-save' ? 'payslip-delivery' : input.action === 'dispatch-contract-save' ? 'dispatch-contract' : input.action === 'assignment-to-save' ? 'assignment-to' : 'contract';
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
        ...(previous.operation || {}),
        attendance: String(input.attendance || ''),
        workDays: String(input.workDays || ''),
        workHours: String(input.workHours || ''),
        dailyRate: String(input.dailyRate || ''),
        grossPay: String(input.grossPay || ''),
        netPay: String(input.netPay || ''),
        payDate: String(input.payDate || ''),
        assignmentDate: String(input.assignmentDate || previous.operation?.assignmentDate || ''),
        resignationDate: String(input.resignationDate || previous.operation?.resignationDate || ''),
        bankName: String(input.bankName || previous.operation?.bankName || ''),
        accountNumber: String(input.accountNumber || previous.operation?.accountNumber || ''),
        accountHolder: String(input.accountHolder || previous.operation?.accountHolder || ''),
        assignedJobId: String(input.assignedJobId || previous.operation?.assignedJobId || ''),
        hourlyRate: String(input.hourlyRate || previous.operation?.hourlyRate || '10320'),
        workType: String(input.workType || previous.operation?.workType || '주간'),
        socialInsurance: input.socialInsurance && typeof input.socialInsurance === 'object' ? input.socialInsurance : (previous.operation?.socialInsurance || {}),
        attendanceCalendar: input.attendanceCalendar && typeof input.attendanceCalendar === 'object' ? input.attendanceCalendar : (previous.operation?.attendanceCalendar || {}),
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
      const memberIds = people.map(item => Number(item.worker_data?.memberId)).filter(Number.isSafeInteger);
      if (memberIds.length) {
        const workers = await db.query("SELECT id,data FROM allhands_signup_applications WHERE kind='worker' AND id=ANY($1::bigint[])", [memberIds]);
        const photoByMemberId = new Map(workers.map(worker => [Number(worker.id), String(worker.data?.photoPath || '')]));
        people.forEach(person => {
          const memberId = Number(person.worker_data?.memberId);
          const photoPath = photoByMemberId.get(memberId);
          if (photoPath) person.worker_data = { ...person.worker_data, photoPath, photoUrl: operationPhotoUrl(photoPath, ownerCompanyId, admin) };
        });
      }
      const documents = await db.query(
        admin
          ? 'SELECT id,document_type,data,updated_at FROM allhands_operation_documents ORDER BY updated_at DESC LIMIT 100'
          : 'SELECT id,document_type,data,updated_at FROM allhands_operation_documents WHERE owner_company_id=$1 ORDER BY updated_at DESC LIMIT 100',
        admin ? [] : [ownerCompanyId]
      );
      const messages = await db.query(
        admin
          ? "SELECT id,recipient_id,created_at,read_at FROM allhands_messages WHERE sender_kind='admin' AND sender_id IS NULL ORDER BY created_at DESC LIMIT 300"
          : "SELECT id,recipient_id,created_at,read_at FROM allhands_messages WHERE sender_kind='company' AND sender_id=$1 ORDER BY created_at DESC LIMIT 300",
        admin ? [] : [Number(company.id)]
      );
      let companyName = '';
      if (company) {
        const companyRows = await db.query('SELECT data FROM allhands_signup_applications WHERE id=$1 LIMIT 1', [Number(company.id)]);
        const companyData = companyRows[0]?.data || {};
        companyName = String(companyData.companyName || companyData.company || companyData.name || '').trim();
      }
      return res.status(200).json({ jobs, people, documents, messages, role: admin ? 'admin' : 'company', companyName });
    }

    return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
  } catch (error) {
    return res.status(500).json({ error: errorKind(error) });
  }
};
