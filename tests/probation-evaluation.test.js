const test=require('node:test');
const assert=require('node:assert/strict');
const calc=require('../probation-evaluation-calculator.js');

test('수습완료 기준은 전체 평점 4.00 이상이다',()=>{
  const scores={workAttitude:4,jobPerformance:4,collaboration:4,ruleCompliance:4};
  assert.equal(calc.average(scores),4);
  assert.equal(calc.grade(4),'A');
  assert.equal(calc.decision(4),'수습완료');
});

test('수습연장 기준은 3.00 이상 4.00 미만이다',()=>{
  assert.equal(calc.decision(3),'수습연장');
  assert.equal(calc.decision(3.99),'수습연장');
});

test('계약불가 기준은 3.00 미만이다',()=>{
  assert.equal(calc.decision(2.99),'계약불가');
});

