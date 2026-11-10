const test = require('node:test');
const assert = require('node:assert/strict');
const validation = require('../document-validation.js');

const complete = {
  templateId: 'service-contract', title: '도급계약서', managedSite: '화성 현장', site: '화성 현장',
  provider: '올핸즈', principal: '거래처', startDate: '2026-11-01', endDate: '2026-12-31', writtenDate: '2026-11-01',
  principalSignature: '발주 담당자', providerSignature: '올핸즈 담당자',
  fieldLabels: ['근로시간·휴게시간', '도급대가·지급조건'], fields: ['08:00~17:00 / 휴게 1시간', '월 10,000,000원 / 매월 10일']
};

test('완료 문서의 필수값과 서명을 통과시킨다', () => {
  const result = validation.validateRequired(complete, { title: '도급계약서' });
  assert.equal(result.filter(item => item.level === 'error').length, 0);
});

test('누락된 날짜와 서명을 검출한다', () => {
  const result = validation.validateRequired({ ...complete, writtenDate: '', providerSignature: '', startDate: '' }, { title: '도급계약서' });
  assert.deepEqual(result.filter(item => item.level === 'error').map(item => item.code), ['written-date', 'start-date', 'provider-signature']);
});

test('근태 급여 청구 인원 차이를 경고한다', () => {
  const result = validation.compareHeadcounts({ assignedHeadcount: 30, attendanceHeadcount: 29, payrollHeadcount: 30, invoiceHeadcount: 30 });
  assert.equal(result[0].code, 'headcount-mismatch');
});

test('계약금액과 청구 계산을 검증한다', () => {
  const result = validation.verifyAmounts({ contractAmount: '1,000,000원', invoiceAmount: '1,000,000원', invoiceRows: [{ quantity: 10, unitPrice: 100000, amount: 1000000 }] });
  assert.equal(result.every(item => item.level === 'pass'), true);
});

test('수정 전후 값을 비교한다', () => {
  const changes = validation.diff(complete, { ...complete, endDate: '2027-01-31', fields: ['09:00~18:00 / 휴게 1시간', '월 10,000,000원 / 매월 10일'] });
  assert.deepEqual(changes.map(change => change.field), ['종료일', '근로시간·휴게시간']);
});
