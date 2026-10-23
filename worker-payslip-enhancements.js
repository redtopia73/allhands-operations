(() => {
  const style = document.createElement('style');
  style.textContent = '.payslip-list{margin-top:16px}.payslip-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid #dce4f0;border-radius:10px;padding:14px;margin-top:10px;background:#fff}.payslip-row b{display:block;color:#172852}.payslip-modal{position:fixed;inset:0;z-index:50;background:rgba(17,30,57,.48);padding:20px;overflow:auto}.payslip-paper{max-width:720px;margin:20px auto;background:#fff;padding:28px;border-radius:14px;color:#172852}.payslip-paper h2{text-align:center}.payslip-paper table{width:100%;border-collapse:collapse;margin:14px 0}.payslip-paper th,.payslip-paper td{border:1px solid #d4dce8;padding:8px;text-align:right}.payslip-paper th:first-child,.payslip-paper td:first-child{text-align:left}.payslip-paper pre{white-space:pre-wrap;font:inherit;line-height:1.7}.payslip-close{float:right}';
  document.head.append(style);

  const escText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const money = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const monthText = value => /^\d{4}-\d{2}$/.test(String(value)) ? `${value.slice(0, 4)}년 ${Number(value.slice(5))}월` : '급여 산정월';

  function matchingPayslip(item) {
    return (data.payslips || []).find(entry => String(entry.applicationId) === String(item.id) && entry.month === month);
  }

  function matchingMessage(payslip) {
    return (data.payslipMessages || []).find(message => String(message.id) === String(payslip?.messageId));
  }

  function openPayslip(item) {
    const delivery = matchingPayslip(item);
    if (!delivery) return;
    const snapshot = delivery.payslip;
    const message = matchingMessage(delivery);
    const content = snapshot ? `<h2>임금명세서</h2><p>${escText(monthText(delivery.month))} · 지급일 ${escText(delivery.payDate || '-')}</p><p>성명: <b>${escText(snapshot.workerName || '')}</b> · 거래처·근무지: ${escText(snapshot.worksite || '')}</p><table><thead><tr><th>지급 항목</th><th>금액</th></tr></thead><tbody><tr><td>기본급</td><td>${money(snapshot.basic)}</td></tr><tr><td>연장근로수당</td><td>${money(snapshot.overtime)}</td></tr><tr><td>휴일근로수당</td><td>${money(snapshot.holiday)}</td></tr><tr><td>추가급여</td><td>${money(Number(snapshot.add1 || 0) + Number(snapshot.add2 || 0))}</td></tr><tr><th>총지급액</th><th>${money(snapshot.total)}</th></tr></tbody></table><table><thead><tr><th>공제 항목</th><th>금액</th></tr></thead><tbody><tr><td>소득세·지방소득세</td><td>${money(Number(snapshot.tax || 0) + Number(snapshot.localTax || 0))}</td></tr><tr><td>국민연금</td><td>${money(snapshot.pension)}</td></tr><tr><td>건강보험</td><td>${money(snapshot.health)}</td></tr><tr><td>고용보험</td><td>${money(snapshot.employment)}</td></tr><tr><td>기타공제</td><td>${money(Number(snapshot.deduct1 || 0) + Number(snapshot.deduct2 || 0))}</td></tr><tr><th>공제 합계</th><th>${money(snapshot.deductions)}</th></tr><tr><th>차인지급액</th><th>${money(snapshot.net)}</th></tr></tbody></table>` : `<h2>임금명세서</h2><p>${escText(monthText(delivery.month))} · 지급일 ${escText(delivery.payDate || '-')}</p><pre>${escText(message?.body || '저장된 상세 명세서를 찾지 못했습니다. 담당자에게 재발송을 요청해 주세요.')}</pre>`;
    const modal = document.createElement('div');
    modal.className = 'payslip-modal';
    modal.innerHTML = `<article class="payslip-paper"><button class="payslip-close secondary">닫기</button>${content}</article>`;
    modal.querySelector('.payslip-close').onclick = () => modal.remove();
    document.body.append(modal);
  }

  function addPayslips() {
    if (typeof tab === 'undefined' || tab !== 'payroll' || typeof data === 'undefined') return;
    document.querySelectorAll('#app .card').forEach((card, index) => {
      if (card.querySelector('[data-payslip-list]')) return;
      const item = data.items?.[index];
      const delivery = item && matchingPayslip(item);
      if (!delivery) return;
      const list = document.createElement('div');
      list.className = 'payslip-list';
      list.dataset.payslipList = 'true';
      list.innerHTML = `<div class="payslip-row"><div><b>${escText(monthText(delivery.month))} 임금명세서</b><span>발송일 ${escText(String(delivery.deliveredAt || delivery.createdAt || '').slice(0, 10))}</span></div><button type="button" class="secondary">명세서 보기</button></div>`;
      list.querySelector('button').onclick = () => openPayslip(item);
      card.append(list);
    });
  }

  new MutationObserver(addPayslips).observe(document.getElementById('app'), { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', addPayslips);
})();
