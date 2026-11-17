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

test('퇴사월 청구서에는 최신 퇴직금과 잔여연차정산만 반영한다',()=>{
  const documents=[
    {id:1,document_type:'retirement-pay',data:{applicationId:7,retirementPay:1000000}},
    {id:3,document_type:'retirement-pay',data:{applicationId:7,retirementPay:1200000}},
    {id:4,document_type:'annual-leave-settlement',data:{applicationId:7,compensation:450000}}
  ];
  assert.deepEqual(calculator.invoiceCharges(documents,{id:7,resignationDate:'2026-11-17'},'2026-11'),{retirement:1200000,leave:450000});
  assert.deepEqual(calculator.invoiceCharges(documents,{id:7,resignationDate:'2026-11-17'},'2026-10'),{retirement:0,leave:0});
});
