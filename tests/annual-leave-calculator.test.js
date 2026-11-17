const test=require('node:test');
const assert=require('node:assert/strict');
const calculator=require('../annual-leave-calculator');

test('근태의 연차와 반차를 합산한다',()=>{
  const calendar={months:{'2026-01':{days:{1:{attendanceStatus:'연차'},2:{approvalStatus:'반차'},3:{attendanceStatus:'출근'}}},'2025-12':{days:{1:{attendanceStatus:'연차'}}}}};
  assert.equal(calculator.countUsed(calendar,2026),1.5);
});

test('수기 잔여일수와 1일 통상임금으로 보상액을 계산한다',()=>{
  const result=calculator.calculate({grantedDays:15,usedDays:6.5,remainingDays:9,dailyOrdinaryWage:100000});
  assert.equal(result.derivedRemaining,8.5);
  assert.equal(result.remainingDays,9);
  assert.equal(result.compensation,900000);
});

test('통상시급과 1일 시간으로 1일 통상임금을 계산한다',()=>{
  const result=calculator.calculate({grantedDays:15,usedDays:10,remainingDays:'',hourlyOrdinaryWage:12000,dailyHours:8});
  assert.equal(result.dailyOrdinaryWage,96000);
  assert.equal(result.compensation,480000);
});

test('유효한 사용촉진 확인 시 지급액을 0원으로 표시한다',()=>{
  const result=calculator.calculate({remainingDays:5,dailyOrdinaryWage:100000,usePromotion:true});
  assert.equal(result.referenceCompensation,500000);
  assert.equal(result.compensation,0);
});
