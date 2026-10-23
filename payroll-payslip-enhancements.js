(() => {
  const apiPath = '/api/operations';
  const money = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const valueOf = (id, key) => Number(String(document.getElementById(`pc-${id}-${key}`)?.textContent || '').replace(/[^0-9-]/g, '')) || 0;

  function payrollSnapshot(id) {
    const row = document.querySelector(`tr[data-payroll-id="${String(id)}"]`);
    const person = typeof data === 'undefined' ? null : data.find(item => String(item.id) === String(id));
    if (!row || !person) return null;
    window.payrollCalculate?.();
    const operationData = operation(person);
    const hours = payrollHours(person);
    return {
      workerName: personName(person),
      birth: parse(person.worker_data).birth || '',
      worksite: personnelWorksite(person),
      workType: operationData.workType || '주간',
      hourlyRate: Number(operationData.hourlyRate) || 10320,
      normalHours: hours.normal,
      overtimeHours: hours.overtime,
      holidayHours: hours.holiday,
      basic: valueOf(id, 'basic'),
      overtime: valueOf(id, 'over'),
      holiday: valueOf(id, 'holiday'),
      add1: Number(document.getElementById(`pc-${id}-add1`)?.value) || 0,
      add2: Number(document.getElementById(`pc-${id}-add2`)?.value) || 0,
      total: valueOf(id, 'total'),
      tax: valueOf(id, 'tax'),
      localTax: valueOf(id, 'local'),
      pension: valueOf(id, 'pension'),
      health: valueOf(id, 'health'),
      employment: valueOf(id, 'employment'),
      deduct1: Number(document.getElementById(`pc-${id}-deduct1`)?.value) || 0,
      deduct2: Number(document.getElementById(`pc-${id}-deduct2`)?.value) || 0,
      deductions: valueOf(id, 'deducttotal'),
      net: valueOf(id, 'net')
    };
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      if (String(input) === apiPath && init?.body) {
        const request = JSON.parse(init.body);
        if (request.action === 'payslip-message-send' && request.document && !request.document.payslip) {
          request.document.payslip = payrollSnapshot(request.document.applicationId);
          init = { ...init, body: JSON.stringify(request) };
        }
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  const baseSetView = window.setView;
  window.openClientPayroll = client => {
    window.payrollClientScope = client;
    baseSetView('payroll-calculation');
  };

  const baseCalculation = window.renderPayrollCalculation;
  window.renderPayrollCalculation = async () => {
    await baseCalculation();
    const client = window.payrollClientScope;
    if (!client) return;
    document.querySelectorAll('.payroll-ledger').forEach(panel => {
      const label = panel.querySelector('.payroll-client-title')?.childNodes[0]?.textContent?.trim();
      if (label !== client) panel.remove();
    });
    const heading = document.querySelector('#app .heading h1');
    if (heading && !heading.textContent.includes(client)) heading.textContent = `급여계산 · ${client}`;
  };

  const baseSummary = window.renderPayrollSummary;
  window.renderPayrollSummary = async () => {
    window.payrollClientScope = null;
    await baseSummary();
    document.querySelectorAll('.assignment-card').forEach(card => {
      const client = card.querySelector('h2')?.textContent?.trim();
      const payrollButton = [...card.querySelectorAll('button')].find(button => button.textContent.trim() === '급여계산');
      if (!client || !payrollButton) return;
      payrollButton.onclick = () => window.openClientPayroll(client);
    });
  };

  const baseShowPayslip = window.showPayslip;
  window.showPayslip = async id => {
    const fromDeliveryMenu = document.querySelector('#app .heading h1')?.textContent?.trim() === '명세서 발송';
    if (!document.querySelector(`tr[data-payroll-id="${String(id)}"]`)) await window.renderPayrollCalculation();
    await baseShowPayslip(id);
    if (!fromDeliveryMenu) return;
    const modal = document.getElementById('documentPreview');
    const close = modal?.querySelector('#payslipClose');
    if (close) close.onclick = () => {
      modal.remove();
      window.renderPayslipDelivery();
    };
  };

  window.recordPayslipDelivery = async (id, month, payDate) => {
    if (!confirm('근로자에게 임금명세서를 실제로 교부했음을 기록할까요?')) return;
    try {
      const response = await nativeFetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'payslip-delivery-save',
          document: {
            applicationId: id,
            month,
            payDate,
            deliveryMethod: '전자문서·출력',
            deliveredAt: new Date().toISOString(),
            payslip: payrollSnapshot(id)
          }
        })
      });
      const out = await response.json();
      if (!response.ok) throw new Error(out.error || '명세서 교부를 기록하지 못했습니다.');
      alert('명세서 교부를 기록했습니다. 근로자 개인 운영관리에서도 조회할 수 있습니다.');
      document.getElementById('documentPreview')?.remove();
      window.renderPayrollCalculation();
    } catch (error) {
      alert(error.message);
    }
  };
})();
