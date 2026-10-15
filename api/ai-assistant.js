const { valid, body } = require('./_auth.cjs');

const clean = (value, max = 2000) => String(value || '').trim().slice(0, max);

function fallbackMessage(stage, context) {
  const opening = context ? `${context}\n\n` : '';
  const messages = {
    resume: '간편 이력서 작성 및 제출을 요청드립니다. 내 정보 메뉴에서 이력서를 작성해 주세요.',
    interview: '면접 일정과 장소를 안내드립니다. 참석 가능 여부를 회신해 주세요.',
    pass: '전형 결과 안내드립니다. 합격을 축하드리며, 입사 관련 사항을 순차적으로 안내드리겠습니다.',
    fail: '전형 결과를 안내드립니다. 이번 채용에서는 함께하지 못하게 되었지만, 지원해 주셔서 감사합니다.'
  };
  return `[all hands JOB 안내]\n\n${opening}${messages[stage] || messages.resume}\n\n문의사항은 담당자에게 연락해 주세요.`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 사용할 수 있습니다.' });
  const admin = valid(req, 'allhands_admin');
  const company = valid(req, 'allhands_company', 'company');
  if (!admin && !company) return res.status(401).json({ error: '운영관리 로그인 후 이용해 주세요.' });

  try {
    const input = body(req);
    if (input.action !== 'candidate-message') return res.status(400).json({ error: 'AI 요청 유형을 확인해 주세요.' });
    const stage = ['resume', 'interview', 'pass', 'fail'].includes(input.stage) ? input.stage : 'resume';
    const context = clean(input.context, 2000);
    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(200).json({ item: { message: fallbackMessage(stage, context), source: 'template' }, aiConnected: false });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: [
          { role: 'system', content: '당신은 한국 현장 채용 담당자 보조입니다. 제공된 사실만 사용해 정중하고 간결한 지원자 안내문을 작성하세요. 제목 없이 안내문 본문만 반환하세요.' },
          { role: 'user', content: `안내 유형: ${stage}\n상황: ${context || '일반 안내문'}` }
        ]
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || 'AI 응답 생성 실패');
    const message = clean(result.output_text, 4000);
    return res.status(200).json({ item: { message: message || fallbackMessage(stage, context), source: 'openai' }, aiConnected: true });
  } catch {
    return res.status(502).json({ error: 'AI 안내문을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};
