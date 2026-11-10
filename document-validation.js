(function documentValidationModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AllhandsDocumentValidation = api;
})(typeof window !== 'undefined' ? window : globalThis, function createDocumentValidation() {
  const clean = value => String(value == null ? '' : value).trim();
  const number = value => {
    const parsed = Number(clean(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const compact = value => clean(value).replace(/\s+/g, ' ');
  const labels = document => {
    const result = {};
    (document.fieldLabels || []).forEach((label, index) => { result[clean(label)] = clean(document.fields?.[index]); });
    return result;
  };
  const findLabel = (document, pattern) => {
    const entries = Object.entries(labels(document));
    return entries.find(([label]) => pattern.test(label))?.[1] || '';
  };
  const item = (level, code, message, detail) => ({ level, code, message, detail: clean(detail) });

  function validateRequired(document, template) {
    const results = [];
    const required = (value, code, message) => { if (!clean(value)) results.push(item('error', code, message)); };
    required(document.provider, 'company', '회사 정보가 필요합니다.');
    required(document.managedSite || document.site, 'site', '관리 사업장을 선택해 주세요.');
    required(document.writtenDate, 'written-date', '작성일을 입력해 주세요.');
    if (document.startDate || document.endDate || /계약|파견/.test(template?.title || '')) {
      required(document.startDate, 'start-date', '계약 시작일을 입력해 주세요.');
      required(document.endDate, 'end-date', '계약 종료일을 입력해 주세요.');
      if (document.startDate && document.endDate && document.startDate > document.endDate) results.push(item('error', 'date-order', '계약 종료일은 시작일보다 빠를 수 없습니다.'));
    }
    const workerRequired = ['conditions-notice', 'dispatch-ledger'].includes(document.templateId);
    if (workerRequired) required(document.managedWorker, 'worker', '대상 근로자를 선택해 주세요.');
    const workHours = findLabel(document, /근로시간|근무시간|휴게시간/);
    const wage = findLabel(document, /임금|도급대가|파견대가|계약금액|정산 금액/);
    const payDay = findLabel(document, /지급일|지급조건/);
    if (/contract|conditions-notice|dispatch-ledger/.test(document.templateId || '')) {
      required(workHours, 'work-hours', '근무시간·휴게시간을 입력해 주세요.');
      required(wage, 'wage', '임금 또는 계약금액을 입력해 주세요.');
      required(payDay, 'pay-day', '임금·대가 지급일 또는 지급조건을 입력해 주세요.');
    }
    required(document.principalSignature, 'principal-signature', '갑(발주·사용사업주) 서명·확인이 필요합니다.');
    required(document.providerSignature, 'provider-signature', '을(수급·파견사업주) 서명·확인이 필요합니다.');
    if (workerRequired) required(document.workerSignature, 'worker-signature', '근로자 서명·확인이 필요합니다.');
    if (!results.length) results.push(item('pass', 'required', '필수값과 서명·작성일을 확인했습니다.'));
    return results;
  }

  function compareHeadcounts(context) {
    const values = [
      ['계약 인원', number(context.contractHeadcount)],
      ['배치 인원', number(context.assignedHeadcount)],
      ['근태 인원', number(context.attendanceHeadcount)],
      ['급여 인원', number(context.payrollHeadcount)],
      ['청구 인원', number(context.invoiceHeadcount)]
    ].filter(([, value]) => value > 0);
    if (values.length < 2) return [item('info', 'headcount-pending', '인원 대조 자료가 아직 충분하지 않습니다.')];
    const unique = [...new Set(values.map(([, value]) => value))];
    const detail = values.map(([name, value]) => `${name} ${value}명`).join(' · ');
    return unique.length === 1
      ? [item('pass', 'headcount', '근태·급여·청구 인원이 일치합니다.', detail)]
      : [item('warning', 'headcount-mismatch', '근태·급여·청구 인원이 서로 다릅니다.', detail)];
  }

  function verifyAmounts(context) {
    const results = [];
    const contract = number(context.contractAmount);
    const invoice = number(context.invoiceAmount);
    if (contract && invoice) {
      results.push(contract === invoice
        ? item('pass', 'contract-invoice', '계약금액과 청구금액이 일치합니다.', `${contract.toLocaleString('ko-KR')}원`)
        : item('warning', 'contract-invoice-mismatch', '계약금액과 청구금액이 다릅니다.', `계약 ${contract.toLocaleString('ko-KR')}원 · 청구 ${invoice.toLocaleString('ko-KR')}원`));
    } else results.push(item('info', 'amount-pending', '계약금액과 청구금액을 모두 저장하면 자동 대조합니다.'));
    const rows = Array.isArray(context.invoiceRows) ? context.invoiceRows : [];
    let calculationError = 0;
    rows.forEach(row => {
      const quantity = number(row.quantity ?? row.count ?? row.people ?? row.headcount);
      const unit = number(row.unitPrice ?? row.rate ?? row.price);
      const amount = number(row.amount ?? row.subtotal ?? row.total);
      if (quantity && unit && amount && Math.round(quantity * unit) !== Math.round(amount)) calculationError += 1;
    });
    if (rows.length) results.push(calculationError
      ? item('warning', 'invoice-calculation', `청구 내역 ${calculationError}건의 수량×단가 계산을 확인해 주세요.`)
      : item('pass', 'invoice-calculation', '청구 내역의 수량×단가 계산을 확인했습니다.'));
    return results;
  }

  function snapshot(document) {
    const result = {
      managedSite: clean(document.managedSite), site: clean(document.site), managedWorker: clean(document.managedWorker),
      principal: clean(document.principal), provider: clean(document.provider), startDate: clean(document.startDate),
      endDate: clean(document.endDate), manager: clean(document.manager), writtenDate: clean(document.writtenDate),
      principalSignature: clean(document.principalSignature), providerSignature: clean(document.providerSignature),
      workerSignature: clean(document.workerSignature), status: clean(document.status), notes: clean(document.notes)
    };
    (document.fieldLabels || []).forEach((label, index) => { result[`field:${clean(label)}`] = clean(document.fields?.[index]); });
    return result;
  }

  function diff(previous, current) {
    if (!previous || !previous.templateId) return [];
    const before = snapshot(previous), after = snapshot(current);
    const names = { managedSite: '관리현장', site: '문서 표시명', managedWorker: '대상 근로자', principal: '갑', provider: '을', startDate: '시작일', endDate: '종료일', manager: '현장 책임자', writtenDate: '작성일', principalSignature: '갑 서명', providerSignature: '을 서명', workerSignature: '근로자 서명', status: '상태', notes: '검토·특이사항' };
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => compact(before[key]) !== compact(after[key])).map(key => ({ field: key.startsWith('field:') ? key.slice(6) : (names[key] || key), before: before[key] || '', after: after[key] || '' }));
  }

  function review(document, template, context) {
    const items = [...validateRequired(document, template), ...compareHeadcounts(context || {}), ...verifyAmounts(context || {})];
    return { items, errors: items.filter(x => x.level === 'error').length, warnings: items.filter(x => x.level === 'warning').length };
  }

  return { number, labels, findLabel, validateRequired, compareHeadcounts, verifyAmounts, diff, review };
});
