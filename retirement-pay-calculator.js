(function retirementPayCalculatorFactory(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RetirementPayCalculator=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const DAY=86400000;
  const number=value=>Math.max(0,Number(value)||0);
  const date=value=>{const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))):null};
  const iso=value=>value?value.toISOString().slice(0,10):'';
  function subtractMonths(value,months){
    const source=date(value);if(!source)return '';
    const day=source.getUTCDate(),target=new Date(Date.UTC(source.getUTCFullYear(),source.getUTCMonth()-months,1));
    const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
    target.setUTCDate(Math.min(day,last));return iso(target);
  }
  function daysBetween(start,end){const a=date(start),b=date(end);return a&&b?Math.max(0,Math.round((b-a)/DAY)):0}
  function calculate(input={}){
    const serviceDays=daysBetween(input.hireDate,input.retirementDate),periodStart=input.averagePeriodStart||subtractMonths(input.retirementDate,3),periodDays=daysBetween(periodStart,input.retirementDate);
    const wageTotal=number(input.wageTotal),bonusAnnual=number(input.bonusAnnual),annualLeaveAllowance=number(input.annualLeaveAllowance),ordinaryDailyWage=number(input.ordinaryDailyWage);
    const bonusIncluded=bonusAnnual*3/12,annualLeaveIncluded=annualLeaveAllowance*3/12,totalForAverage=wageTotal+bonusIncluded+annualLeaveIncluded;
    const averageDailyWage=periodDays?totalForAverage/periodDays:0,appliedDailyWage=Math.max(averageDailyWage,ordinaryDailyWage),weeklyHours=number(input.weeklyHours),eligible=serviceDays>=365&&weeklyHours>=15;
    const retirementPay=eligible?appliedDailyWage*30*serviceDays/365:0;
    return {periodStart,periodDays,serviceDays,wageTotal,bonusAnnual,bonusIncluded,annualLeaveAllowance,annualLeaveIncluded,totalForAverage,averageDailyWage,ordinaryDailyWage,appliedDailyWage,weeklyHours,eligible,retirementPay};
  }
  return {subtractMonths,daysBetween,calculate};
});
