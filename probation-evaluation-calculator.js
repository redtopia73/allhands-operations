(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ProbationEvaluationCalculator=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const criteria=[
    {key:'workAttitude',label:'근무태도',standard:'성실성, 책임감, 출퇴근 및 업무 태도'},
    {key:'jobPerformance',label:'업무수행',standard:'업무 이해도, 정확성, 수행속도와 개선 노력'},
    {key:'collaboration',label:'협업',standard:'동료·관리자와의 소통, 협조와 조직 적응'},
    {key:'ruleCompliance',label:'규정준수',standard:'안전수칙, 사내 규정과 업무 절차 준수'}
  ];
  const score=value=>Math.max(1,Math.min(5,Number(value)||1));
  const average=scores=>Math.round(criteria.reduce((sum,item)=>sum+score(scores?.[item.key]),0)/criteria.length*100)/100;
  const grade=value=>value>=4.5?'S':value>=4?'A':value>=3.5?'B':value>=3?'C':'D';
  const decision=value=>value>=4?'수습완료':value>=3?'수습연장':'계약불가';
  return {criteria,average,grade,decision};
});

