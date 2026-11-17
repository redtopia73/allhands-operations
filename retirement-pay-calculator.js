(function retirementPayCalculatorFactory(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RetirementPayCalculator=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const DAY=86400000;
  const number=value=>Math.max(0,Number(value)||0);
  const date=value=>{const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))):null};
  const iso=value=>value?value.toISOString().slice(0,10):'';
  const parse=value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'{}')}catch{return {}}};
  function subtractMonths(value,months){
    const source=date(value);if(!source)return '';
    const day=source.getUTCDate(),target=new Date(Date.UTC(source.getUTCFullYear(),source.getUTCMonth()-months,1));
    const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
    target.setUTCDate(Math.min(day,last));return iso(target);
  }
  function daysBetween(start,end){const a=date(start),b=date(end);return a&&b?Math.max(0,Math.round((b-a)/DAY)):0}
  function summarizePayroll(documents=[],applicationId,retirementDate){
    const end=date(retirementDate);if(!end)return {wages:0,bonus:0,months:[]};
    const periodStart=date(subtractMonths(retirementDate,3)),yearStart=date(subtractMonths(retirementDate,12)),latest=new Map();
    documents.filter(doc=>!doc.document_type||doc.document_type==='payroll-calculation').map(doc=>{const payload=parse(doc.data??doc);return {payload,key:String(payload.savedAt||doc.created_at||doc.id||'')}}).filter(item=>/^\d{4}-\d{2}$/.test(String(item.payload.month||''))).sort((a,b)=>b.key.localeCompare(a.key)).forEach(item=>{if(!latest.has(item.payload.month))latest.set(item.payload.month,item.payload)});
    let wages=0,bonus=0;const months=[];
    latest.forEach(payload=>{const row=(payload.rows||[]).find(item=>String(item.applicationId)===String(applicationId));if(!row)return;const [year,month]=payload.month.split('-').map(Number),monthStart=new Date(Date.UTC(year,month-1,1)),monthEnd=new Date(Date.UTC(year,month,1)),regular=number(row.basicPay)+number(row.overtimePay)+number(row.holidayPay)+(row.add1Type==='상여'?0:number(row.add1))+(row.add2Type==='상여'?0:number(row.add2)),monthBonus=(row.add1Type==='상여'?number(row.add1):0)+(row.add2Type==='상여'?number(row.add2):0),overlapStart=new Date(Math.max(monthStart,periodStart)),overlapEnd=new Date(Math.min(monthEnd,end)),overlapDays=Math.max(0,Math.round((overlapEnd-overlapStart)/DAY)),monthDays=Math.round((monthEnd-monthStart)/DAY),ratio=monthDays?overlapDays/monthDays:0;if(ratio>0)wages+=regular*ratio;if(monthEnd>yearStart&&monthStart<end)bonus+=monthBonus;months.push({month:payload.month,regular,bonus:monthBonus,overlapDays,monthDays,ratio})});
    return {wages,bonus,months:months.sort((a,b)=>a.month.localeCompare(b.month))};
  }
  function calculate(input={}){
    const serviceDays=daysBetween(input.hireDate,input.retirementDate),periodStart=input.averagePeriodStart||subtractMonths(input.retirementDate,3),periodDays=daysBetween(periodStart,input.retirementDate);
    const wageTotal=number(input.wageTotal),bonusAnnual=number(input.bonusAnnual),annualLeaveAllowance=number(input.annualLeaveAllowance),ordinaryDailyWage=number(input.ordinaryDailyWage);
    const bonusIncluded=bonusAnnual*3/12,annualLeaveIncluded=annualLeaveAllowance*3/12,totalForAverage=wageTotal+bonusIncluded+annualLeaveIncluded;
    const averageDailyWage=periodDays?totalForAverage/periodDays:0,appliedDailyWage=Math.max(averageDailyWage,ordinaryDailyWage),weeklyHours=number(input.weeklyHours),eligible=serviceDays>=365&&weeklyHours>=15;
    const retirementPay=eligible?appliedDailyWage*30*serviceDays/365:0;
    return {periodStart,periodDays,serviceDays,wageTotal,bonusAnnual,bonusIncluded,annualLeaveAllowance,annualLeaveIncluded,totalForAverage,averageDailyWage,ordinaryDailyWage,appliedDailyWage,weeklyHours,eligible,retirementPay};
  }
  return {subtractMonths,daysBetween,summarizePayroll,calculate};
});
