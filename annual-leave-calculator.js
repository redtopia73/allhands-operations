(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AnnualLeaveCalculator=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const number=value=>Math.max(0,Number(value)||0);
  const leaveUnits=status=>{
    const value=String(status||'').trim();
    if(value==='연차'||value==='연차휴가')return 1;
    if(value==='반차'||value==='오전반차'||value==='오후반차'||value==='오전 반차'||value==='오후 반차')return .5;
    return 0;
  };
  function countUsed(calendar,year){
    const prefix=String(year||'').slice(0,4)+'-';
    return Object.entries(calendar?.months||{}).reduce((total,[month,value])=>{
      if(!month.startsWith(prefix))return total;
      return total+Object.values(value?.days||{}).reduce((sum,day)=>sum+leaveUnits(day?.attendanceStatus||day?.approvalStatus),0);
    },0);
  }
  function calculate(input={}){
    const granted=number(input.grantedDays),used=number(input.usedDays),derivedRemaining=Math.max(0,granted-used);
    const manual=String(input.remainingDays??'').trim();
    const remainingDays=manual===''?derivedRemaining:number(manual);
    const hourlyOrdinaryWage=number(input.hourlyOrdinaryWage),dailyHours=number(input.dailyHours)||8;
    const dailyOrdinaryWage=number(input.dailyOrdinaryWage)||(hourlyOrdinaryWage*dailyHours);
    const referenceCompensation=Math.round(remainingDays*dailyOrdinaryWage);
    const usePromotion=String(input.usePromotion||'')==='true'||input.usePromotion===true||input.usePromotion==='on';
    return {grantedDays:granted,usedDays:used,derivedRemaining,remainingDays,hourlyOrdinaryWage,dailyHours,dailyOrdinaryWage,referenceCompensation,usePromotion,compensation:usePromotion?0:referenceCompensation};
  }
  const dataOf=doc=>{if(doc?.data&&typeof doc.data==='object')return doc.data;try{return JSON.parse(doc?.data||'{}')}catch{return {}}};
  function invoiceCharges(documents,person,month){
    if(!String(person?.resignationDate||'').startsWith(String(month||'')))return {retirement:0,leave:0};
    const latest=type=>(documents||[]).filter(doc=>doc?.document_type===type&&String(dataOf(doc).applicationId)===String(person?.id)).sort((a,b)=>Number(b.id||0)-Number(a.id||0))[0];
    return {retirement:number(dataOf(latest('retirement-pay')).retirementPay),leave:number(dataOf(latest('annual-leave-settlement')).compensation)};
  }
  return {leaveUnits,countUsed,calculate,invoiceCharges};
});
