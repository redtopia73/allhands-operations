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
    if (company) {
      const memberships = await db.query("SELECT data FROM allhands_signup_applications WHERE id=$1 AND kind='company' AND status='active' LIMIT 1", [Number(company.id)]);
      if (memberships[0]?.data?.membershipTier !== 'operations') return res.status(403).json({ error: '운영관리회원 권한이 필요합니다. 올핸잡 관리자에게 운영관리회원 승인을 요청해 주세요.' });
    }

    if (req.method === 'POST') {
      const input = body(req);
      if (input.action === 'external-approval-create') {
        const documentId = Number(input.documentId);
        const recipientName = String(input.recipientName || '').trim().slice(0, 120);
        const recipientEmail = String(input.recipientEmail || '').trim().toLowerCase().slice(0, 254);
        if (!documentId || !recipientName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return res.status(400).json({ error: '검토 담당자 이름과 올바른 이메일 주소를 입력해 주세요.' });
        const documents = await db.query(
          admin
            ? "SELECT id,document_type,data FROM allhands_operation_documents WHERE id=$1 AND document_type IN ('invoice','payroll-calculation')"
            : "SELECT id,document_type,data FROM allhands_operation_documents WHERE id=$1 AND owner_company_id=$2 AND document_type IN ('invoice','payroll-calculation')",
          admin ? [documentId] : [documentId, ownerCompanyId]
        );
        const documentRow = documents[0];
        if (!documentRow) return res.status(404).json({ error: '검토 요청을 보낼 청구서 또는 급여정산 문서를 찾지 못했습니다.' });
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const event = [{ type: 'created', label: '검토 요청 생성', at: now, actor: admin ? '운영 관리자' : '기업 운영담당자' }];
        const saved = await db.query(
          'INSERT INTO allhands_external_approvals (owner_company_id,document_id,document_type,recipient_name,recipient_email,access_token_hash,document_snapshot,events,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) RETURNING id,expires_at',
          [ownerCompanyId, documentRow.id, documentRow.document_type, recipientName, recipientEmail, tokenHash, JSON.stringify(documentRow.data || {}), JSON.stringify(event), expiresAt]
        );
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'allhands-operations.vercel.app').split(',')[0].trim();
        const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
        return res.status(201).json({ ok: true, id: saved[0].id, approvalUrl: `${protocol}://${host}/approval.html?token=${encodeURIComponent(token)}`, expiresAt: saved[0].expires_at });
      }
      if (input.action === 'workflow-notify') {
        const appId = Number(input.applicationId);
        const step = String(input.step || '').trim();
        const steps = ['resume_request', 'interview_notice', 'start_notice'];
        if (!appId || !steps.includes(step)) return res.status(400).json({ error: '진행할 단계를 확인해 주세요.' });

        const rows = await db.query(
          admin
            ? 'SELECT id,job_title,worker_data,status,employer_note FROM allhands_job_applications WHERE id=$1'
            : "SELECT a.id,a.job_title,a.worker_data,a.status,a.employer_note FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2",
          admin ? [appId] : [appId, ownerCompanyId]
        );
        const application = rows[0];
        if (!application) return res.status(404).json({ error: '권한이 없거나 지원자를 찾지 못했습니다.' });

        const previous = application.employer_note || {};
        const legacyStatus = String(application.status || '');
        const current = ['resume_request', 'interview_notice', 'start_notice'].includes(previous.workflowStage)
          ? previous.workflowStage
          : (/입사일|합격/.test(legacyStatus) ? 'start_notice' : (/면접 일정|면접일 통보/.test(legacyStatus) ? 'interview_notice' : (/면접|이력서 요청/.test(legacyStatus) ? 'resume_request' : 'application')));
        const required = { resume_request: 'application', interview_notice: 'resume_request', start_notice: 'interview_notice' };
        if (current !== required[step]) return res.status(400).json({ error: '이전 단계를 먼저 처리해 주세요.' });

        const interviewAt = String(input.interviewAt || '').trim().slice(0, 80);
        const interviewPlace = String(input.interviewPlace || '').trim().slice(0, 500);
        const startDate = String(input.startDate || '').trim().slice(0, 30);
        if (step === 'interview_notice' && (!interviewAt || !interviewPlace)) return res.status(400).json({ error: '면접 일시와 장소를 입력해 주세요.' });
        if (step === 'start_notice' && !startDate) return res.status(400).json({ error: '입사일을 입력해 주세요.' });

        const now = new Date().toISOString();
        const labels = { resume_request: '이력서 요청', interview_notice: '면접일 통보', start_notice: '입사일 통보' };
        const history = Array.isArray(previous.workflowHistory) ? previous.workflowHistory : [];
        const interview = step === 'interview_notice'
          ? { ...(previous.interview || {}), interviewAt, interviewPlace, requestedAt: now, resumeRequested: true }
          : (previous.interview || {});
        const note = {
          ...previous,
          workflowStage: step,
          workflowHistory: [...history, { step, label: labels[step], sentAt: now, interviewAt: step === 'interview_notice' ? interviewAt : undefined, startDate: step === 'start_notice' ? startDate : undefined }],
          interview,
          resumeRequested: step !== 'resume_request' ? previous.resumeRequested : true,
          startDate: step === 'start_notice' ? startDate : previous.startDate
        };
        const status = step === 'start_notice' ? '입사일 통보 · 합격' : labels[step];
        await db.query('UPDATE allhands_job_applications SET status=$1,employer_note=$2::jsonb WHERE id=$3', [status, JSON.stringify(note), appId]);

        const workerId = Number(application.worker_data?.memberId);
        if (Number.isSafeInteger(workerId)) {
          const workers = await db.query("SELECT data FROM allhands_signup_applications WHERE id=$1 AND kind='worker' AND status='active' LIMIT 1", [workerId]);
          if (workers[0]) {
            let senderName = 'all hands JOB 관리자';
            if (company) {
              const sender = await db.query('SELECT data FROM allhands_signup_applications WHERE id=$1 LIMIT 1', [Number(company.id)]);
              senderName = String(sender[0]?.data?.companyName || sender[0]?.data?.company || '기업 회원');
            }
            const messages = {
              resume_request: `[이력서 제출 요청]\n\n공고: ${application.job_title}\n\n면접 진행을 위해 간편 이력서를 작성해 제출해 주세요. 내 정보 메뉴의 이력서 작성에서 작성할 수 있습니다.`,
              interview_notice: `[면접 일정 안내]\n\n공고: ${application.job_title}\n일시: ${interviewAt}\n장소·방식: ${interviewPlace}\n\n면접 일정이 확정되었습니다.`,
              start_notice: `[입사일 안내]\n\n공고: ${application.job_title}\n입사일: ${startDate}\n\n입사 일정과 준비사항을 확인해 주세요.`
            };
            await db.query('INSERT INTO allhands_messages (sender_kind,sender_id,sender_name,recipient_kind,recipient_id,recipient_name,subject,body,attachments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', [admin ? 'admin' : 'company', admin ? null : Number(company.id), senderName, 'worker', workerId, String(workers[0].data?.name || application.worker_data?.name || '구직자'), `[${application.job_title}] ${labels[step]}`, messages[step], '[]']);
          }
        }
        return res.status(200).json({ ok: true, message: `${labels[step]}을(를) 전달했습니다.` });
      }
      if (input.action === 'workflow-outcome') {
        const appId = Number(input.applicationId);
        const outcome = String(input.outcome || '').trim();
        const labels = { document_rejected: '서류 불합격', interview_rejected: '면접 불합격', interview_no_show: '면접 노쇼', start_attended: '첫 출근 완료', start_no_show: '입사 당일 미출근', resigned: '퇴사 처리' };
        if (!appId || !labels[outcome]) return res.status(400).json({ error: '처리할 결과를 확인해 주세요.' });
        const rows = await db.query(
          admin
            ? 'SELECT id,status,employer_note FROM allhands_job_applications WHERE id=$1'
            : "SELECT a.id,a.status,a.employer_note FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2",
          admin ? [appId] : [appId, ownerCompanyId]
        );
        const application = rows[0];
        if (!application) return res.status(404).json({ error: '권한이 없거나 지원자를 찾지 못했습니다.' });
        const previous = application.employer_note || {};
        const currentStage = String(previous.workflowStage || (/입사일|합격/.test(application.status || '') ? 'start_notice' : (/면접 일정|면접일 통보/.test(application.status || '') ? 'interview_notice' : (/면접|이력서 요청/.test(application.status || '') ? 'resume_request' : 'application'))));
        const allowed = {
          document_rejected: ['application', 'resume_request'],
          interview_rejected: ['interview_notice'],
          interview_no_show: ['interview_notice'],
          start_attended: ['start_notice'],
          start_no_show: ['start_notice'],
          resigned: ['start_notice']
        };
        if (!allowed[outcome].includes(currentStage) || (outcome === 'resigned' && !previous.attendanceStartedAt)) return res.status(400).json({ error: '현재 진행 단계에서는 이 처리를 할 수 없습니다.' });
        const history = Array.isArray(previous.workflowHistory) ? previous.workflowHistory : [];
        const now = new Date().toISOString();
        const operation = { ...(previous.operation || {}) };
        if (outcome === 'start_attended') operation.assignmentDate = String(input.date || now.slice(0, 10)).slice(0, 10);
        if (outcome === 'resigned') operation.resignationDate = String(input.date || now.slice(0, 10)).slice(0, 10);
        const terminal = !['start_attended'].includes(outcome);
        const note = { ...previous, operation, workflowStage: terminal ? 'closed' : 'start_notice', outcome: terminal ? { code: outcome, label: labels[outcome], handledAt: now } : previous.outcome, attendanceStartedAt: outcome === 'start_attended' ? now : previous.attendanceStartedAt, workflowHistory: [...history, { step: outcome, label: labels[outcome], sentAt: now }] };
        const status = outcome === 'start_attended' ? '입사일 통보 · 합격' : outcome === 'resigned' ? '입사일 통보 · 합격 · 퇴사' : labels[outcome];
        await db.query('UPDATE allhands_job_applications SET status=$1,employer_note=$2::jsonb WHERE id=$3', [status, JSON.stringify(note), appId]);
        return res.status(200).json({ ok: true, message: `${labels[outcome]} 처리를 완료했습니다.` });
      }
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
      if (input.action === 'add-interview-candidate' || input.action === 'force-add-applicant') {
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
        const forced = input.action === 'force-add-applicant';
        const note = forced
          ? { forcedAddedFromApplicationId: sourceId, forcedAddedAt: new Date().toISOString(), workflowStage: 'application', workflowHistory: [{ step: 'application', label: '관리자 강제 추가', sentAt: new Date().toISOString() }] }
          : { transferredFromApplicationId: sourceId, transferredAt: new Date().toISOString(), workflowStage: 'resume_request', workflowHistory: [{ step: 'resume_request', label: '이력서 요청', sentAt: new Date().toISOString() }] };
        const created = await db.query('INSERT INTO allhands_job_applications (job_id,job_title,worker_data,status,employer_note) VALUES ($1,$2,$3::jsonb,$4,$5::jsonb) RETURNING id', [targetJobId, jobTitle, JSON.stringify(source.worker_data || {}), forced ? '지원자 확인' : '이력서 요청', JSON.stringify(note)]);
        return res.status(201).json({ ok: true, id: created[0].id, message: forced ? '다른 공고 지원자를 현재 공고에 추가했습니다.' : '다른 공고의 면접 리스트에 추가했습니다.' });
      }
      if (input.action === 'transfer-application') {
        const appId = Number(input.applicationId);
        const targetJobId = String(input.targetJobId || '').trim();
        if (!appId || !/^db-\d+$/.test(targetJobId)) return res.status(400).json({ error: '지원자와 대상 공고를 확인해 주세요.' });
        const sources = await db.query(
          admin
            ? 'SELECT id,job_id,worker_data,employer_note FROM allhands_job_applications WHERE id=$1'
            : "SELECT a.id,a.job_id,a.worker_data,a.employer_note FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2",
          admin ? [appId] : [appId, ownerCompanyId]
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
        if (source.job_id === targetJobId) return res.status(400).json({ error: '현재 공고와 다른 공고를 선택해 주세요.' });
        const memberId = String(source.worker_data?.memberId || '');
        if (memberId) {
          const existing = await db.query("SELECT id FROM allhands_job_applications WHERE job_id=$1 AND worker_data->>'memberId'=$2 AND id<>$3 LIMIT 1", [targetJobId, memberId, appId]);
          if (existing[0]) return res.status(409).json({ error: '이미 대상 공고에 지원 이력이 있는 지원자입니다.' });
        }
        const now = new Date().toISOString();
        const previous = source.employer_note || {};
        const history = Array.isArray(previous.workflowHistory) ? previous.workflowHistory : [];
        const note = { ...previous, transferredFromJobId: source.job_id, transferredAt: now, workflowStage: 'application', workflowHistory: [...history, { step: 'application', label: '다른 공고로 지원 전환', sentAt: now }], interview: null, startDate: '' };
        const jobTitle = String(target.data?.title || target.data?.jobTitle || '채용 공고');
        await db.query('UPDATE allhands_job_applications SET job_id=$1,job_title=$2,status=$3,employer_note=$4::jsonb WHERE id=$5', [targetJobId, jobTitle, '지원자 확인', JSON.stringify(note), appId]);
        return res.status(200).json({ ok: true, message: '지원자를 다른 공고로 전환했습니다.' });
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
        const delivery = { applicationId: appId, month: String(document.month || ''), payDate: String(document.payDate || ''), deliveryMethod: '플랫폼 쪽지', deliveredAt: new Date().toISOString(), messageId: sent[0].id, payslip: document.payslip && typeof document.payslip === 'object' ? document.payslip : null };
        const saved = await db.query('INSERT INTO allhands_operation_documents (owner_company_id,document_type,data) VALUES ($1,$2,$3::jsonb) RETURNING id,updated_at', [ownerCompanyId, 'payslip-delivery', JSON.stringify(delivery)]);
        return res.status(201).json({ ok: true, id: saved[0].id, messageId: sent[0].id, updatedAt: saved[0].updated_at });
      }
      if (input.action === 'system-inquiry') {
        const category = String(input.category || '').trim();
        const subject = String(input.subject || '').trim().slice(0, 160);
        const messageBody = String(input.body || '').trim().slice(0, 3000);
        if (!['오류 신고', '개선 제안', '기타 문의'].includes(category) || !subject || !messageBody) return res.status(400).json({ error: '문의 유형, 제목, 내용을 모두 입력해 주세요.' });
        let senderName = '올핸잡 운영관리자';
        if (company) {
          const senders = await db.query('SELECT data FROM allhands_signup_applications WHERE id=$1 LIMIT 1', [Number(company.id)]);
          senderName = String(senders[0]?.data?.companyName || senders[0]?.data?.company || senders[0]?.data?.name || '운영관리 회원');
        }
        const sent = await db.query(
          'INSERT INTO allhands_messages (sender_kind,sender_id,sender_name,recipient_kind,recipient_id,recipient_name,subject,body,attachments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id,created_at',
          [admin ? 'admin' : 'company', admin ? null : Number(company.id), senderName, 'admin', null, '올핸잡 관리자', `[시스템 문의 · ${category}] ${subject}`, messageBody, '[]']
        );
        const inquiry = { category, subject, body: messageBody, messageId: sent[0].id, submittedAt: sent[0].created_at, status: '접수 완료' };
        const saved = await db.query('INSERT INTO allhands_operation_documents (owner_company_id,document_type,data) VALUES ($1,$2,$3::jsonb) RETURNING id,updated_at', [ownerCompanyId, 'system-inquiry', JSON.stringify(inquiry)]);
        return res.status(201).json({ ok: true, id: saved[0].id, messageId: sent[0].id, updatedAt: saved[0].updated_at });
      }
      if (input.action === 'employment-contract-request') {
        const applicationId = Number(input.applicationId);
        if (!applicationId || !input.contract || typeof input.contract !== 'object') return res.status(400).json({ error: '근로자와 계약 조건을 확인해 주세요.' });
        const people = await db.query(admin ? 'SELECT id,worker_data,job_title FROM allhands_job_applications WHERE id=$1' : "SELECT a.id,a.worker_data,a.job_title FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2", admin ? [applicationId] : [applicationId, ownerCompanyId]);
        if (!people[0]) return res.status(404).json({ error: '계약 요청 대상을 찾지 못했습니다.' });
        const person = people[0], contract = { ...input.contract, applicationId, workerId: String(person.worker_data?.memberId || ''), workerName: String(person.worker_data?.name || ''), jobTitle: person.job_title, status: '서명 요청', requestedAt: new Date().toISOString() };
        const saved = await db.query('INSERT INTO allhands_operation_documents (owner_company_id,document_type,data) VALUES ($1,$2,$3::jsonb) RETURNING id', [ownerCompanyId || '', 'employment-contract', JSON.stringify(contract)]);
        return res.status(201).json({ ok: true, id: saved[0].id, message: '표준근로계약서 서명 요청을 보냈습니다.' });
      }
      if (input.action === 'approval-process') {
        const documentId = Number(input.documentId);
        const status = String(input.status || '');
        if (!documentId || !['승인','반려'].includes(status)) return res.status(400).json({ error: '결재 상태를 확인해 주세요.' });
        const documents = await db.query(admin ? "SELECT id,data FROM allhands_operation_documents WHERE id=$1 AND document_type IN ('worker-certificate-request','worker-attendance-request')" : "SELECT id,data FROM allhands_operation_documents WHERE id=$1 AND owner_company_id=$2 AND document_type IN ('worker-certificate-request','worker-attendance-request')", admin ? [documentId] : [documentId, ownerCompanyId]);
        if (!documents[0]) return res.status(404).json({ error: '결재 대상을 찾지 못했습니다.' });
        const request = documents[0].data || {};
        let attendanceApplied = false;
        if (status === '승인' && request.kind === 'attendance') {
          const applicationId = Number(request.applicationId);
          const requestDate = String(request.requestDate || '');
          if (!applicationId || !/^\d{4}-\d{2}-\d{2}$/.test(requestDate)) return res.status(400).json({ error: '근태 발생일이 없는 신청입니다. 근로자에게 날짜를 선택해 다시 신청하도록 안내해 주세요.' });
          const people = await db.query(
            admin
              ? 'SELECT id,employer_note FROM allhands_job_applications WHERE id=$1'
              : "SELECT a.id,a.employer_note FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE a.id=$1 AND j.data->>'ownerCompanyId'=$2",
            admin ? [applicationId] : [applicationId, ownerCompanyId]
          );
          if (!people[0]) return res.status(404).json({ error: '근태 반영 대상 인력을 찾지 못했습니다.' });
          const previous = people[0].employer_note || {};
          const operation = previous.operation || {};
          const month = requestDate.slice(0, 7);
          const day = String(Number(requestDate.slice(8, 10)));
          const calendar = operation.attendanceCalendar && typeof operation.attendanceCalendar === 'object' ? operation.attendanceCalendar : { months: {}, closedMonths: {} };
          if (calendar.closedMonths?.[month]) return res.status(409).json({ error: '해당 월 근태가 이미 마감되어 승인 내용을 자동 반영할 수 없습니다. 마감 취소 후 다시 승인해 주세요.' });
          const hours = { '연차': 8, '반차': 4, '조퇴': 4, '지각 사유서': 7 };
          const oldDay = calendar.months?.[month]?.days?.[day] || {};
          const days = { ...(calendar.months?.[month]?.days || {}) };
          days[day] = {
            ...oldDay,
            basic: oldDay.basic !== undefined ? oldDay.basic : (hours[request.requestType] ?? 8),
            overtime: oldDay.overtime !== undefined ? oldDay.overtime : 0,
            night: oldDay.night !== undefined ? oldDay.night : 0,
            approvalStatus: request.requestType || '근태 승인',
            approvalDocumentId: documentId,
            approvedAt: new Date().toISOString()
          };
          const attendanceCalendar = { ...calendar, months: { ...(calendar.months || {}), [month]: { ...(calendar.months?.[month] || {}), days } }, closedMonths: { ...(calendar.closedMonths || {}) } };
          await db.query('UPDATE allhands_job_applications SET employer_note=$1::jsonb WHERE id=$2', [JSON.stringify({ ...previous, operation: { ...operation, attendanceCalendar, updatedAt: new Date().toISOString() } }), applicationId]);
          attendanceApplied = true;
        }
        const next = { ...request, status, decidedAt: new Date().toISOString(), attendanceApplied };
        await db.query('UPDATE allhands_operation_documents SET data=$1::jsonb,updated_at=NOW() WHERE id=$2', [JSON.stringify(next), documentId]);
        return res.status(200).json({ ok: true, message: attendanceApplied ? '승인했고 해당 날짜 근태표에 자동 반영했습니다.' : `${status} 처리했습니다.` });
      }
      if (input.action === 'quote-save' || input.action === 'contract-save' || input.action === 'dispatch-contract-save' || input.action === 'assignment-to-save' || input.action === 'invoice-save' || input.action === 'job-client-save' || input.action === 'payroll-calculation-save' || input.action === 'payslip-delivery-save' || input.action === 'worker-notice-save') {
        const documentType = input.action === 'quote-save' ? 'quote' : input.action === 'invoice-save' ? 'invoice' : input.action === 'job-client-save' ? 'job-client' : input.action === 'payroll-calculation-save' ? 'payroll-calculation' : input.action === 'payslip-delivery-save' ? 'payslip-delivery' : input.action === 'worker-notice-save' ? 'worker-notice' : input.action === 'dispatch-contract-save' ? 'dispatch-contract' : input.action === 'assignment-to-save' ? 'assignment-to' : 'contract';
        const document = input.document && typeof input.document === 'object' ? input.document : {};
        if (documentType === 'worker-notice') {
          document.scope = admin ? 'all' : 'company';
          if (ownerCompanyId) document.companyId = ownerCompanyId;
        }
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
        bankCode: String(input.bankCode || previous.operation?.bankCode || ''),
        accountNumber: String(input.accountNumber || previous.operation?.accountNumber || ''),
        accountHolder: String(input.accountHolder || previous.operation?.accountHolder || ''),
        assignedJobId: String(input.assignedJobId || previous.operation?.assignedJobId || ''),
        hourlyRate: String(input.hourlyRate || previous.operation?.hourlyRate || '10320'),
        workType: String(input.workType || previous.operation?.workType || '주간'),
        socialInsurance: input.socialInsurance && typeof input.socialInsurance === 'object' ? input.socialInsurance : (previous.operation?.socialInsurance || {}),
        attendanceCalendar: input.attendanceCalendar && typeof input.attendanceCalendar === 'object' ? input.attendanceCalendar : (previous.operation?.attendanceCalendar || {}),
        payrollConfirmed: typeof input.payrollConfirmed === 'boolean' ? input.payrollConfirmed : Boolean(previous.operation?.payrollConfirmed),
        payrollConfirmedMonth: String(input.payrollConfirmedMonth || previous.operation?.payrollConfirmedMonth || '').slice(0, 7),
        payrollConfirmedAt: String(input.payrollConfirmedAt || previous.operation?.payrollConfirmedAt || '').slice(0, 40),
        payrollSummary: input.payrollSummary && typeof input.payrollSummary === 'object' ? input.payrollSummary : (previous.operation?.payrollSummary || {}),
        updatedAt: new Date().toISOString()
      };
      await db.query('UPDATE allhands_job_applications SET employer_note=$1::jsonb WHERE id=$2', [JSON.stringify({ ...previous, operation }), appId]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const jobs = await db.query(
        admin
          ? "SELECT id,data FROM allhands_job_posts WHERE status='active' AND COALESCE(data->>'listingType','hiring')<>'b2b' ORDER BY updated_at DESC"
          : "SELECT id,data FROM allhands_job_posts WHERE status='active' AND COALESCE(data->>'listingType','hiring')<>'b2b' AND data->>'ownerCompanyId'=$1 ORDER BY updated_at DESC",
        admin ? [] : [ownerCompanyId]
      );
      const people = await db.query(
        admin
          ? "SELECT a.id,a.job_id,a.job_title,a.worker_data,a.status,a.employer_note,a.created_at FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE COALESCE(j.data->>'listingType','hiring')<>'b2b' ORDER BY a.created_at DESC LIMIT 300"
          : "SELECT a.id,a.job_id,a.job_title,a.worker_data,a.status,a.employer_note,a.created_at FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text WHERE COALESCE(j.data->>'listingType','hiring')<>'b2b' AND j.data->>'ownerCompanyId'=$1 ORDER BY a.created_at DESC LIMIT 300",
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
      const externalApprovals = await db.query(
        admin
          ? 'SELECT id,document_id,document_type,recipient_name,recipient_email,status,opened_at,responded_at,expires_at,created_at,events FROM allhands_external_approvals ORDER BY created_at DESC LIMIT 100'
          : 'SELECT id,document_id,document_type,recipient_name,recipient_email,status,opened_at,responded_at,expires_at,created_at,events FROM allhands_external_approvals WHERE owner_company_id=$1 ORDER BY created_at DESC LIMIT 100',
        admin ? [] : [ownerCompanyId]
      );
      let companyName = '';
      if (company) {
        const companyRows = await db.query('SELECT data FROM allhands_signup_applications WHERE id=$1 LIMIT 1', [Number(company.id)]);
        const companyData = companyRows[0]?.data || {};
        companyName = String(companyData.companyName || companyData.company || companyData.name || '').trim();
      }
      return res.status(200).json({ jobs, people, documents, messages, externalApprovals, role: admin ? 'admin' : 'company', companyName });
    }

    return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
  } catch (error) {
    return res.status(500).json({ error: errorKind(error) });
  }
};
