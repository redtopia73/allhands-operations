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

test('사직서는 대상 근로자와 퇴직일·사유·제출인 서명을 확인한다', () => {
  const resignation = {
    templateId: 'resignation-letter', title: '사직서', managedSite: '화성 현장', site: '화성 현장',
    managedWorker: '12', workerName: '홍길동', provider: '올핸즈', writtenDate: '2026-11-16', workerSignature: '홍길동',
    fieldLabels: ['소속·담당업무', '입사일', '최종 근무일', '퇴직 예정일', '사직 사유'],
    fields: ['포장', '2026-01-01', '2026-11-30', '2026-11-30', '개인 사정']
  };
  const completeResult = validation.validateRequired(resignation, { title: '사직서' });
  assert.equal(completeResult.filter(item => item.level === 'error').length, 0);
  const missingResult = validation.validateRequired({ ...resignation, fields: ['포장', '2026-01-01', '', '', ''] }, { title: '사직서' });
  assert.deepEqual(missingResult.filter(item => item.level === 'error').map(item => item.code), ['resignation-date', 'resignation-reason']);
});

test('근로계약서는 법정 근로조건과 사용자·근로자 서명을 확인한다', () => {
  const employment = {
    templateId: 'employment-contract', title: '근로계약서', managedSite: '화성 현장', site: '화성 현장',
    managedWorker: '12', workerName: '홍길동', provider: '올핸즈', writtenDate: '2026-11-16',
    principalSignature: '회사 담당자', workerSignature: '홍길동',
    fieldLabels: ['근로계약기간', '근무장소', '담당업무', '소정근로시간', '휴게시간', '임금 구성항목', '임금 계산방법', '임금 지급방법·지급일', '주휴일·휴일', '연차유급휴가'],
    fields: ['2026-11-16 ~ 기간의 정함 없음', '화성 현장', '포장', '09:00~18:00', '12:00~13:00', '기본급 280만원', '월급제', '계좌이체·매월 10일', '일요일', '근로기준법에 따름']
  };
  const completeResult = validation.validateRequired(employment, { title: '근로계약서' });
  assert.equal(completeResult.filter(item => item.level === 'error').length, 0);
  const missingResult = validation.validateRequired({ ...employment, fields: ['', '', '', '', '', '', '', '', '', ''] }, { title: '근로계약서' });
  assert.deepEqual(missingResult.filter(item => item.level === 'error').map(item => item.code), ['employment-period', 'workplace', 'duties', 'work-hours', 'wage', 'pay-day', 'holiday', 'annual-leave']);
});
