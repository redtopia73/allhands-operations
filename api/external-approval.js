const crypto = require('crypto');
const { ensureTables, body, errorKind } = require('./_auth.cjs');

const tokenHash = token => crypto.createHash('sha256').update(String(token || '')).digest('hex');
const cleanText = (value, length) => String(value || '').trim().slice(0, length);

module.exports = async (req, res) => {
  try {
    const db = await ensureTables();
    const input = req.method === 'GET' ? req.query || {} : body(req);
    const token = cleanText(input.token, 200);
    if (token.length < 24) return res.status(400).json({ error: '검토 링크가 올바르지 않습니다.' });
    const rows = await db.query('SELECT id,document_type,recipient_name,status,document_snapshot,events,opened_at,responded_at,expires_at,created_at FROM allhands_external_approvals WHERE access_token_hash=$1 LIMIT 1', [tokenHash(token)]);
    const approval = rows[0];
    if (!approval) return res.status(404).json({ error: '검토 요청을 찾지 못했습니다.' });
    if (new Date(approval.expires_at).getTime() < Date.now()) return res.status(410).json({ error: '이 검토 링크는 만료되었습니다.' });

    if (req.method === 'GET') {
      if (!approval.opened_at && approval.status === 'pending') {
        const openedAt = new Date().toISOString();
        const events = [...(approval.events || []), { type: 'opened', label: '수신자 열람', at: openedAt, actor: '수신자' }];
        await db.query("UPDATE allhands_external_approvals SET status='opened', opened_at=$1, events=$2::jsonb WHERE id=$3", [openedAt, JSON.stringify(events), approval.id]);
        approval.status = 'opened'; approval.opened_at = openedAt; approval.events = events;
      }
      return res.status(200).json({ ok: true, approval: { documentType: approval.document_type, recipientName: approval.recipient_name, status: approval.status, document: approval.document_snapshot, events: approval.events || [], openedAt: approval.opened_at, respondedAt: approval.responded_at, expiresAt: approval.expires_at, createdAt: approval.created_at } });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
    const decision = cleanText(input.decision, 30);
    const comment = cleanText(input.comment, 2000);
    const responderName = cleanText(input.responderName, 120) || approval.recipient_name;
    const labels = { approved: '승인', rejected: '반려', 'revision-requested': '수정 요청' };
    if (!labels[decision]) return res.status(400).json({ error: '승인, 반려 또는 수정 요청 중 하나를 선택해 주세요.' });
    if (approval.status === 'approved' || approval.status === 'rejected' || approval.status === 'revision-requested') return res.status(409).json({ error: '이미 회신이 완료된 요청입니다.' });
    if ((decision === 'rejected' || decision === 'revision-requested') && !comment) return res.status(400).json({ error: '반려 또는 수정 요청 사유를 입력해 주세요.' });
    const respondedAt = new Date().toISOString();
    const events = [...(approval.events || []), { type: decision, label: labels[decision], at: respondedAt, actor: responderName, comment }];
    await db.query('UPDATE allhands_external_approvals SET status=$1, responded_at=$2, events=$3::jsonb WHERE id=$4', [decision, respondedAt, JSON.stringify(events), approval.id]);
    return res.status(200).json({ ok: true, message: `${labels[decision]} 처리가 기록되었습니다.` });
  } catch (error) {
    return res.status(500).json({ error: errorKind(error) });
  }
};
