const test=require('node:test');
const assert=require('node:assert/strict');
const calculator=require('../retirement-pay-calculator');

test('법정 퇴직금은 평균임금과 계속근로일수로 계산한다',()=>{
  const result=calculator.calculate({hireDate:'2024-01-01',retirementDate:'2026-01-01',averagePeriodStart:'2025-10-01',weeklyHours:40,wageTotal:9000000,bonusAnnual:4000000,annualLeaveAllowance:400000,ordinaryDailyWage:0});
  assert.equal(result.serviceDays,731);
  assert.equal(result.periodDays,92);
  assert.equal(result.bonusIncluded,1000000);
  assert.equal(result.annualLeaveIncluded,100000);
  assert.equal(result.eligible,true);
  assert.ok(Math.abs(result.retirementPay-(result.averageDailyWage*30*731/365))<1);
});

test('통상임금이 평균임금보다 높으면 통상임금을 적용한다',()=>{
  const result=calculator.calculate({hireDate:'2024-01-01',retirementDate:'2025-01-01',weeklyHours:40,wageTotal:3000000,ordinaryDailyWage:120000});
  assert.equal(result.appliedDailyWage,120000);
  assert.ok(Math.abs(result.retirementPay-(120000*30*366/365))<1);
});

test('1년 미만 또는 주 15시간 미만이면 법정 요건 미충족으로 표시한다',()=>{
  assert.equal(calculator.calculate({hireDate:'2025-06-01',retirementDate:'2026-01-01',weeklyHours:40,wageTotal:9000000}).eligible,false);
  assert.equal(calculator.calculate({hireDate:'2024-01-01',retirementDate:'2026-01-01',weeklyHours:14,wageTotal:9000000}).eligible,false);
});
