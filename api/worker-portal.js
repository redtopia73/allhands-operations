const { ensureTables, valid, body } = require('./_auth.cjs');

const clean = value => String(value || '').trim();
const attendanceStatuses = ['정상근무', '출근', '지각', '결근', '휴무'];
const companyScoreKeys = ['payAccuracy', 'payTimeliness', 'conditionMatch', 'communication', 'safety'];

function seoulDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const pick = type => parts.find(part => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const rad = value => value * Math.PI / 180;
  const earth = 6371000;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function scoreValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

async function applications(db, workerId) {
  return db.query(
    "SELECT a.id,a.job_id,a.job_title,a.status,a.worker_data,a.employer_note,j.data AS job_data,c.data AS company_data FROM allhands_job_applications a JOIN allhands_job_posts j ON a.job_id='db-'||j.id::text LEFT JOIN allhands_signup_applications c ON c.id=NULLIF(j.data->>'ownerCompanyId','')::BIGINT AND c.kind='company' AND c.status='active' WHERE a.worker_data->>'memberId'=$1 AND COALESCE(a.employer_note->'operation'->>'assignmentDate','')<>'' AND COALESCE(a.employer_note->'operation'->>'resignationDate','')='' ORDER BY a.created_at DESC",
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

    if (input.action === 'attendance-clock') {
      const event = clean(input.event);
      if (!['check-in', 'check-out'].includes(event)) return res.status(400).json({ error: '출근 또는 퇴근을 선택해 주세요.' });
      const latitude = finiteNumber(input.latitude);
      const longitude = finiteNumber(input.longitude);
      const accuracy = finiteNumber(input.accuracy);
      if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: '현재 위치를 확인한 뒤 다시 시도해 주세요.' });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const today = seoulDate(now);
      const operation = { ...(previous.operation || {}) };
      let siteLatitude = finiteNumber(operation.worksiteLatitude ?? operation.worksiteGeo?.latitude ?? target.job_data?.worksiteLatitude);
      let siteLongitude = finiteNumber(operation.worksiteLongitude ?? operation.worksiteGeo?.longitude ?? target.job_data?.worksiteLongitude);
      const radius = Math.max(50, Math.min(2000, finiteNumber(operation.worksiteRadius ?? operation.worksiteGeo?.radius) || 200));
      let hasWorksite = siteLatitude !== null && siteLongitude !== null;
      let firstLocation = false;
      if (!hasWorksite && event === 'check-in') {
        siteLatitude = latitude;
        siteLongitude = longitude;
        hasWorksite = true;
        firstLocation = true;
        operation.worksiteLatitude = latitude;
        operation.worksiteLongitude = longitude;
        operation.worksiteRadius = radius;
        operation.worksiteGeo = { latitude, longitude, radius, source: 'worker-first-check-in', needsConfirmation: true, updatedAt: nowIso };
      }
      const distance = hasWorksite ? distanceMeters(latitude, longitude, siteLatitude, siteLongitude) : null;
      const locationStatus = firstLocation ? '최초 현장 위치 등록' : !hasWorksite ? '현장 위치 미등록' : accuracy !== null && accuracy > 250 ? 'GPS 정확도 확인 필요' : distance <= radius ? '현장 확인' : '현장 밖 확인 필요';
      const location = { latitude, longitude, accuracy: accuracy === null ? null : Math.round(accuracy), distanceMeters: distance, status: locationStatus, recordedAt: nowIso };

      const old = Array.isArray(previous.workerAttendance) ? previous.workerAttendance : [];
      const openIndex = [...old].reverse().findIndex(row => row?.checkInAt && !row?.checkOutAt);
      const actualOpenIndex = openIndex < 0 ? -1 : old.length - 1 - openIndex;
      const todayRecord = old.find(row => clean(row?.workDate) === today);
      let workDate = today;
      let record;
      if (event === 'check-in') {
        if (actualOpenIndex >= 0) return res.status(409).json({ error: '이미 출근 처리되어 있습니다. 먼저 퇴근을 기록해 주세요.' });
        if (todayRecord?.checkOutAt) return res.status(409).json({ error: '오늘 출퇴근 기록이 완료되었습니다. 다음 날 다시 출근할 수 있습니다.' });
        record = { workDate, attendance: '출근', normalHours: 0, overtimeHours: 0, checkInAt: nowIso, checkInLocation: location, reportedAt: nowIso, source: 'attendance-app' };
      } else {
        if (actualOpenIndex < 0) return res.status(409).json({ error: '출근 기록이 없습니다. 출근부터 기록해 주세요.' });
        const open = old[actualOpenIndex];
        workDate = clean(open.workDate) || today;
        const hours = Math.max(0, Math.min(24, (now.getTime() - new Date(open.checkInAt).getTime()) / 3600000));
        record = { ...open, attendance: '출근', normalHours: Math.round(Math.min(8, hours) * 10) / 10, overtimeHours: Math.round(Math.max(0, hours - 8) * 10) / 10, checkOutAt: nowIso, checkOutLocation: location, reportedAt: nowIso, source: 'attendance-app' };
      }

      const workerAttendance = event === 'check-in'
        ? [...old.filter(row => clean(row?.workDate) !== workDate), record]
        : old.map((row, index) => index === actualOpenIndex ? record : row);
      const month = workDate.slice(0, 7);
      const day = String(Number(workDate.slice(8, 10)));
      const calendar = operation.attendanceCalendar || { months: {}, closedMonths: {} };
      const months = { ...(calendar.months || {}) };
      const monthData = { ...(months[month] || {}) };
      const days = { ...(monthData.days || {}) };
      const verified = locationStatus === '현장 확인' && (!record.checkInLocation || record.checkInLocation.status === '현장 확인');
      days[day] = {
        ...(days[day] || {}),
        basic: record.normalHours,
        overtime: record.overtimeHours,
        night: Number(days[day]?.night) || 0,
        checkInAt: record.checkInAt || '',
        checkOutAt: record.checkOutAt || '',
        locationVerified: verified,
        attendanceStatus: verified ? 'GPS 확인' : locationStatus,
        source: 'attendance-app'
      };
      months[month] = { ...monthData, days };
      operation.attendanceCalendar = { ...calendar, months };
      await db.query(
        'UPDATE allhands_job_applications SET employer_note=$1::jsonb WHERE id=$2',
        [JSON.stringify({ ...previous, operation, workerAttendance }), target.id]
      );
      return res.status(200).json({
        ok: true,
        message: `${event === 'check-in' ? '출근' : '퇴근'} 기록을 저장했습니다.`,
        record,
        locationStatus,
        distanceMeters: distance,
        serverTime: nowIso
      });
    }

    if (input.action === 'attendance-location-correct') {
      const latitude = finiteNumber(input.latitude);
      const longitude = finiteNumber(input.longitude);
      const accuracy = finiteNumber(input.accuracy);
      if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: '현재 위치를 확인한 뒤 다시 시도해 주세요.' });
      }
      if (accuracy !== null && accuracy > 250) return res.status(400).json({ error: 'GPS 오차가 큽니다. 실외 또는 창가에서 다시 시도해 주세요.' });
      const workerAttendance = Array.isArray(previous.workerAttendance) ? [...previous.workerAttendance] : [];
      const recentStatuses = workerAttendance
        .slice()
        .sort((a, b) => String(b?.workDate || '').localeCompare(String(a?.workDate || '')))
        .map(row => row?.checkOutLocation?.status || row?.checkInLocation?.status || '');
      const needsCorrection = recentStatuses.length >= 2 && recentStatuses.slice(0, 2).every(status =>
        status.includes('담당자 확인') || status.includes('확인 필요') || status.includes('미등록') || status.includes('최초')
      );
      if (!needsCorrection) return res.status(409).json({ error: '담당자 확인 필요 기록이 2회 연속 발생한 경우에만 위치를 보정할 수 있습니다.' });
      const nowIso = new Date().toISOString();
      const operation = { ...(previous.operation || {}) };
      const radius = Math.max(50, Math.min(2000, finiteNumber(operation.worksiteRadius ?? operation.worksiteGeo?.radius) || 200));
      operation.worksiteLatitude = latitude;
      operation.worksiteLongitude = longitude;
      operation.worksiteRadius = radius;
      operation.worksiteGeo = {
        latitude,
        longitude,
        radius,
        source: 'worker-correction',
        needsConfirmation: false,
        correctedByWorker: String(worker.id),
        correctedAt: nowIso,
        updatedAt: nowIso
      };
      const pendingIndex = [...workerAttendance].reverse().findIndex(row => {
        const status = row?.checkOutLocation?.status || row?.checkInLocation?.status || '';
        return status.includes('확인 필요') || status.includes('미등록') || status.includes('최초');
      });
      if (pendingIndex >= 0) {
        const index = workerAttendance.length - 1 - pendingIndex;
        const row = { ...workerAttendance[index], locationCorrectedAt: nowIso };
        if (row.checkOutLocation) row.checkOutLocation = { ...row.checkOutLocation, status: '근무지 GPS 보정 완료' };
        else if (row.checkInLocation) row.checkInLocation = { ...row.checkInLocation, status: '근무지 GPS 보정 완료' };
        workerAttendance[index] = row;
      }
      await db.query(
        'UPDATE allhands_job_applications SET employer_note=$1::jsonb WHERE id=$2',
        [JSON.stringify({ ...previous, operation, workerAttendance }), target.id]
      );
      return res.status(200).json({ ok: true, message: '선택한 근무지의 GPS 기준을 현재 위치로 보정했습니다. 다음 출퇴근부터 새 기준을 적용합니다.' });
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


