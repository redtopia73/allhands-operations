(() => {
  const currency = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const monthLabel = value => /^\d{4}-\d{2}$/.test(String(value)) ? `${value.slice(0, 4)}년 ${Number(value.slice(5))}월` : '급여 산정월';

  function deliveryFor(item) {
    return (data.payslips || []).find(entry => String(entry.applicationId) === String(item.id) && entry.month === month);
  }

  function detailedStatement(delivery) {
    const pay = delivery.payslip;
    const rate = Number(pay.hourlyRate || 0);
    const insuranceBase = rate * 209;
    const payoutRows = [
      ['기본급', `시급 ${currency(rate)} × 정상 ${pay.normalHours || 0}시간`, pay.basic],
      ['연장근로수당', `시급 ${currency(rate)} × 연장 ${pay.overtimeHours || 0}시간 × 1.5`, pay.overtime],
      ['휴일근로수당', `시급 ${currency(rate)} × 휴일 ${pay.holidayHours || 0}시간 × 1.5`, pay.holiday],
      ['추가급여 1', '입력 금액', pay.add1],
      ['추가급여 2', '입력 금액', pay.add2]
    ];
    const deductionRows = [
      ['소득세', '2026 근로소득 간이세액표 · 본인 1명 · 총지급액 기준', pay.tax],
      ['지방소득세', '소득세 × 10%', pay.localTax],
      ['국민연금', `기준급여 ${currency(insuranceBase)} × 4.75%`, pay.pension],
      ['건강보험', `기준급여 ${currency(insuranceBase)} × 4.0674%`, pay.health],
      ['고용보험', `기준급여 ${currency(insuranceBase)} × 0.9%`, pay.employment],
      ['기타공제 1', '입력 금액', pay.deduct1],
      ['기타공제 2', '입력 금액', pay.deduct2]
    ];
    const rows = items => items.map(([name, formula, amount]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(formula)}</td><td>${currency(amount)}</td></tr>`).join('');
    return `<h2>임금명세서</h2><p>${escapeHtml(monthLabel(delivery.month))} · 임금지급일 ${escapeHtml(delivery.payDate || '-')}</p><div class="payslip-detail-info"><b>${escapeHtml(pay.workerName || '')}</b> · ${escapeHtml(pay.worksite || '')} · ${escapeHtml(pay.workType || '주간')}</div><table><thead><tr><th colspan="3">근로시간</th></tr></thead><tbody><tr><td>정상근로</td><td colspan="2">${pay.normalHours || 0}시간</td></tr><tr><td>연장근로</td><td colspan="2">${pay.overtimeHours || 0}시간</td></tr><tr><td>휴일근로</td><td colspan="2">${pay.holidayHours || 0}시간</td></tr></tbody></table><table><thead><tr><th>지급 항목</th><th>계산식</th><th>금액</th></tr></thead><tbody>${rows(payoutRows)}<tr><th colspan="2">총지급액</th><th>${currency(pay.total)}</th></tr></tbody></table><table><thead><tr><th>공제 항목</th><th>계산식</th><th>금액</th></tr></thead><tbody>${rows(deductionRows)}<tr><th colspan="2">공제금액 합계</th><th>${currency(pay.deductions)}</th></tr><tr class="payslip-net"><th colspan="2">차인지급액</th><th>${currency(pay.net)}</th></tr></tbody></table><p class="payslip-detail-note">본 명세서는 임금 구성항목, 계산방법 및 공제내역을 모두 표시한 정산 명세서입니다.</p>`;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-payslip-list] button');
    if (!button || typeof data === 'undefined') return;
    const card = button.closest('#app .card');
    const index = [...document.querySelectorAll('#app .card')].indexOf(card);
    const item = data.items?.[index];
    const delivery = item && deliveryFor(item);
    if (!delivery?.payslip) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const modal = document.createElement('div');
    modal.className = 'payslip-modal';
    modal.innerHTML = `<article class="payslip-paper payslip-detail-paper"><button class="payslip-close secondary">닫기</button>${detailedStatement(delivery)}</article>`;
    modal.querySelector('.payslip-close').onclick = () => modal.remove();
    document.body.append(modal);
  }, true);
})();
