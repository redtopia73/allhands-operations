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

test('저장된 급여 샘플에서 급여와 상여를 구분해 실제 합산한다',()=>{
  const row=(month,basicPay,add1,add1Type,savedAt)=>({document_type:'payroll-calculation',data:{month,savedAt,rows:[{applicationId:'101',basicPay,overtimePay:200000,holidayPay:100000,add1,add1Type,add2:0,add2Type:'급여'}]}});
  const documents=[
    row('2026-08',2600000,100000,'급여','2026-09-01T00:00:00Z'),
    row('2026-09',2600000,600000,'상여','2026-10-01T00:00:00Z'),
    row('2026-09',1000000,999999,'상여','2026-09-15T00:00:00Z'),
    row('2026-10',2600000,100000,'급여','2026-11-01T00:00:00Z'),
    row('2026-11',2600000,100000,'급여','2026-11-16T00:00:00Z')
  ];
  const summary=calculator.summarizePayroll(documents,'101','2026-11-17');
  const expectedAugust=3000000*(15/31),expectedNovember=3000000*(16/30);
  assert.equal(Math.round(summary.wages),Math.round(expectedAugust+2900000+3000000+expectedNovember));
  assert.equal(summary.bonus,600000);
  assert.equal(summary.months.filter(item=>item.month==='2026-09').length,1);
  const result=calculator.calculate({hireDate:'2024-01-01',retirementDate:'2026-11-17',weeklyHours:40,wageTotal:summary.wages,bonusAnnual:summary.bonus});
  assert.equal(result.eligible,true);
  assert.ok(result.retirementPay>0);
});
