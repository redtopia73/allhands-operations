(function annualLeaveSettlementModule(){
  const calc=window.AnnualLeaveCalculator;if(!calc)return;
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const parse=value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'{}')}catch{return {}}};
  const money=value=>new Intl.NumberFormat('ko-KR').format(Math.round(Number(value)||0))+'원';
  const numeric=value=>Number(String(value??'').replace(/[^0-9.-]/g,''))||0;
  const workerData=person=>parse(person?.worker_data);
  const workerOperation=person=>parse(person?.employer_note).operation||{};
  const workerName=person=>workerData(person).name||person?.name||'성명 미입력';
  const workerSite=person=>typeof personnelWorksite==='function'?personnelWorksite(person):'';
  let context={people:[],documents:[]};

  async function load(){
    const response=await fetch('/api/operations',{credentials:'include',cache:'no-store'}),out=await response.json();
    if(!response.ok)throw new Error(out.error||'잔여연차정산 정보를 불러오지 못했습니다.');
    context={people:out.people||[],documents:out.documents||[]};
    window.operationDocuments=(out.documents||[]).map(doc=>({...doc,data:parse(doc.data)}));
  }
  const form=()=>document.getElementById('annualLeaveForm');
  const value=name=>form()?.elements[name]?.value||'';
  const set=(name,next)=>{const field=form()?.elements[name];if(field)field.value=next??''};
  const setText=(id,next)=>{const node=document.getElementById(id);if(node)node.textContent=next};

  window.applyAnnualLeaveWorker=()=>{
    const person=context.people.find(item=>String(item.id)===String(value('applicationId')));if(!person)return;
    const op=workerOperation(person),settlementDate=op.resignationDate||new Date().toISOString().slice(0,10),year=settlementDate.slice(0,4);
    set('settlementDate',settlementDate);set('settlementYear',year);set('hourlyOrdinaryWage',Number(op.hourlyRate)||0);set('dailyHours',8);
    set('usedDays',calc.countUsed(op.attendanceCalendar||{},year));
    const prior=context.documents.filter(doc=>doc.document_type==='annual-leave-settlement').map(doc=>parse(doc.data)).find(doc=>String(doc.applicationId)===String(person.id)&&String(doc.settlementYear)===year);
    set('grantedDays',prior?.grantedDays??'');set('remainingDays',prior?.remainingDays??'');set('dailyOrdinaryWage',prior?.dailyOrdinaryWage??'');
    window.calculateAnnualLeaveSettlement();
  };
  window.refreshAnnualLeaveUsage=()=>{
    const person=context.people.find(item=>String(item.id)===String(value('applicationId')));if(!person)return;
    set('usedDays',calc.countUsed(workerOperation(person).attendanceCalendar||{},value('settlementYear')));window.calculateAnnualLeaveSettlement();
  };
  window.calculateAnnualLeaveSettlement=()=>{
    if(!form())return null;const result=calc.calculate(Object.fromEntries(new FormData(form()).entries()));
    setText('alDerivedRemaining',result.derivedRemaining+'일');setText('alDailyWage',money(result.dailyOrdinaryWage));setText('alReference',money(result.referenceCompensation));setText('alCompensation',money(result.compensation));
    setText('alFormula',`${result.remainingDays}일 × ${money(result.dailyOrdinaryWage)}${result.usePromotion?' · 사용촉진 적용 확인으로 지급액 0원':''}`);
    return result;
  };
  function snapshot(){const source=document.querySelector('.annual-leave-panel'),copy=source.cloneNode(true);copy.querySelectorAll('button,.invoice-actions').forEach(node=>node.remove());copy.querySelectorAll('input,select').forEach(field=>{const span=document.createElement('span');span.className='preview-value';span.textContent=field.type==='checkbox'?(field.checked?'예':'아니오'):field.tagName==='SELECT'?(field.selectedOptions[0]?.textContent||'-'):(field.value||'-');field.replaceWith(span)});copy.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));return copy.outerHTML}
  window.saveAnnualLeaveSettlement=async()=>{try{
    if(!form()?.reportValidity())return;const person=context.people.find(item=>String(item.id)===String(value('applicationId')));if(!person)throw new Error('대상 직원을 선택해 주세요.');
    const result=window.calculateAnnualLeaveSettlement(),documentData={...Object.fromEntries(new FormData(form()).entries()),...result,applicationId:value('applicationId'),workerName:workerName(person),workplace:workerSite(person),resignationDate:workerOperation(person).resignationDate||'',documentHtml:snapshot(),calculatedAt:new Date().toISOString()};
    const response=await fetch('/api/operations',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'annual-leave-settlement-save',document:documentData})}),out=await response.json();if(!response.ok)throw new Error(out.error||'저장하지 못했습니다.');
    context.documents=[{id:out.id,document_type:'annual-leave-settlement',data:documentData},...context.documents];window.operationDocuments=[{id:out.id,document_type:'annual-leave-settlement',data:documentData},...(window.operationDocuments||[])];
    alert('잔여연차정산서를 저장했습니다. 퇴사월 청구서에 자동 반영됩니다. 문서번호: '+out.id);
  }catch(error){alert(error.message)}};

  function render(){
    const main=document.getElementById('app');if(!main)return;const people=context.people.filter(person=>{const op=workerOperation(person);return op.assignmentDate||op.resignationDate});
    document.querySelectorAll('#sideNav > [data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='payroll'));
    const nav=document.getElementById('payrollSubnav');if(nav){nav.style.display='block';nav.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='annual-leave-settlement'))}
    main.innerHTML=`<div class="heading"><div><div class="eyebrow">UNUSED ANNUAL LEAVE</div><h1>잔여연차정산</h1><p>잔여연차는 수기로 확정하고, 실제 사용 연차는 승인된 근태에서 자동으로 불러와 보상금액을 계산합니다.</p></div></div><section class="panel annual-leave-panel"><form id="annualLeaveForm" onsubmit="event.preventDefault();calculateAnnualLeaveSettlement()"><h2>대상자·정산기준</h2><div class="annual-leave-grid"><label>대상 직원<select name="applicationId" required onchange="applyAnnualLeaveWorker()"><option value="">직원을 선택하세요</option>${people.map(person=>`<option value="${person.id}">${E(workerName(person))} · ${E(workerSite(person))}</option>`).join('')}</select></label><label>정산일<input name="settlementDate" type="date" required onchange="settlementYear.value=this.value.slice(0,4);refreshAnnualLeaveUsage()"></label><label>정산연도<input name="settlementYear" type="number" min="2000" max="2100" required onchange="refreshAnnualLeaveUsage()"></label><label>부여 연차일수<input name="grantedDays" type="number" min="0" step="0.5" placeholder="수기 입력" required oninput="calculateAnnualLeaveSettlement()"></label><label>실제 사용 연차<input name="usedDays" type="number" min="0" step="0.5" readonly><small>승인된 근태의 연차 1일, 반차 0.5일을 자동 합산합니다.</small></label><label>잔여연차<input name="remainingDays" type="number" min="0" step="0.5" placeholder="수기 확정" required oninput="calculateAnnualLeaveSettlement()"><small>최종 정산할 잔여일수를 직접 입력합니다.</small></label></div><h2>보상금액</h2><div class="annual-leave-grid"><label>통상시급<input name="hourlyOrdinaryWage" type="number" min="0" step="10" oninput="calculateAnnualLeaveSettlement()"></label><label>1일 소정근로시간<input name="dailyHours" type="number" min="0" max="24" step="0.5" value="8" oninput="calculateAnnualLeaveSettlement()"></label><label>1일 통상임금 직접입력<input name="dailyOrdinaryWage" type="number" min="0" step="10" placeholder="비우면 시급×시간" oninput="calculateAnnualLeaveSettlement()"></label><label class="annual-leave-check"><input name="usePromotion" type="checkbox" value="true" onchange="calculateAnnualLeaveSettlement()"> 적법한 연차사용촉진 적용 확인<small>적법하게 사용촉진을 완료한 경우 보상 의무가 없을 수 있어 지급액을 0원으로 표시합니다.</small></label></div><div class="annual-leave-breakdown"><div><span>부여-사용 기준 잔여</span><b id="alDerivedRemaining">0일</b></div><div><span>적용 1일 통상임금</span><b id="alDailyWage">0원</b></div><div><span>보상 참고액</span><b id="alReference">0원</b></div></div><div class="annual-leave-result"><small>잔여연차 보상금액</small><b id="alCompensation">0원</b><p id="alFormula">잔여일수 × 1일 통상임금</p></div><div class="annual-leave-notice"><b>계산 전 확인</b><br>미사용 연차수당은 원칙적으로 잔여 연차일수 × 1일 통상임금(또는 취업규칙상 평균임금)으로 산정합니다. 연차 발생·소멸, 사용촉진의 적법성, 평균임금 적용 여부는 회사 규정과 실제 사실관계를 확인해 주세요.</div><div class="invoice-actions"><button type="button" class="secondary" onclick="refreshAnnualLeaveUsage()">근태 다시 불러오기</button><button type="submit" class="secondary">다시 계산</button><button type="button" class="primary" onclick="saveAnnualLeaveSettlement()">정산서 저장</button></div></form></section>`;
    window.calculateAnnualLeaveSettlement();
  }

  function settlementFor(person,month){
    return calc.invoiceCharges(window.operationDocuments||[],{id:person.id,resignationDate:workerOperation(person).resignationDate},month);
  }
  function prepareInvoiceClient(month){
    const select=document.getElementById('invoiceClient'),body=document.getElementById('invoiceRows');if(!select)return '';
    const original=new Set(Array.from(select.options).map(option=>option.value)),retiredSites=[...new Set((typeof data!=='undefined'?data:[]).filter(person=>String(workerOperation(person).resignationDate||'').startsWith(month)).map(workerSite).filter(Boolean))];
    retiredSites.forEach(site=>{if(!Array.from(select.options).some(option=>option.value===site)){const option=document.createElement('option');option.value=site;option.textContent=site+' · 퇴사정산';select.append(option)}});
    let desired=window.__settlementInvoiceClient||window.invoiceClient||select.value;if(!desired&&retiredSites.length)desired=retiredSites[0];
    if(desired&&Array.from(select.options).some(option=>option.value===desired)){select.value=desired;window.invoiceClient=desired;if(!original.has(desired)&&body)body.innerHTML=''}
    select.onchange=()=>{window.__settlementInvoiceClient=select.value;window.invoiceClient=select.value;window.renderInvoiceDraft()};return select.value;
  }
  function addSettlementColumns(){
    const table=document.querySelector('#invoiceDraft .invoice-table'),body=document.getElementById('invoiceRows');if(!table||!body)return;
    const month=document.getElementById('invoiceMonth')?.value||new Date().toISOString().slice(0,7),client=prepareInvoiceClient(month);
    const retiring=(typeof data!=='undefined'?data:[]).filter(person=>workerSite(person)===client&&String(workerOperation(person).resignationDate||'').startsWith(month));
    retiring.forEach(person=>{const amounts=settlementFor(person,month);if(!amounts.retirement&&!amounts.leave)return;const id=person.id;if(body.querySelector(`tr[data-id="${id}"]`))return;const resignation=workerOperation(person).resignationDate||'-';body.insertAdjacentHTML('beforeend',`<tr data-id="${id}" class="resignation-settlement-row"><td>퇴사정산</td><td>${E(workerName(person))}</td><td>${E(workerOperation(person).assignmentDate||'-')}</td><td>${E(resignation)}</td><td><input id="inv-${id}-rate" value="0" readonly></td><td><input id="inv-${id}-contract" value="0" readonly></td><td><input id="inv-${id}-contractdays" value="0" readonly></td><td><input id="inv-${id}-actual" value="0" readonly></td><td><input id="inv-${id}-holiday" value="0" readonly></td><td><input id="inv-${id}-overtime" value="0" readonly></td><td><input id="inv-${id}-night" value="0" readonly></td><td><input id="inv-${id}-shortage" value="0" readonly></td><td id="inv-${id}-short" class="invoice-money">0원</td><td id="inv-${id}-bill" class="invoice-money">0원</td><td id="inv-${id}-otpay" class="invoice-money">0원</td><td id="inv-${id}-holidaypay" class="invoice-money">0원</td><td id="inv-${id}-nightpay" class="invoice-money">0원</td><td id="inv-${id}-indirect" class="invoice-money">0원</td><td id="inv-${id}-management" class="invoice-money">0원</td><td id="inv-${id}-subtotal" class="invoice-money">0원</td></tr>`)});
    const header=table.querySelector('thead tr');if(header&&!header.querySelector('.settlement-retirement-head')){const subtotal=header.lastElementChild,ret=document.createElement('th'),leave=document.createElement('th');ret.className='settlement-retirement-head';ret.textContent='퇴직금';leave.className='settlement-leave-head';leave.textContent='잔여연차 보상';header.insertBefore(ret,subtotal);header.insertBefore(leave,subtotal)}
    body.querySelectorAll('tr[data-id]').forEach(row=>{if(row.querySelector('.settlement-retirement'))return;const id=row.dataset.id,person=(typeof data!=='undefined'?data:[]).find(item=>String(item.id)===String(id)),amounts=person?settlementFor(person,month):{retirement:0,leave:0},subtotal=document.getElementById(`inv-${id}-subtotal`)||row.lastElementChild,ret=document.createElement('td'),leave=document.createElement('td');ret.className='invoice-money settlement-retirement';leave.className='invoice-money settlement-leave';ret.innerHTML=`<input id="inv-${id}-retirement" value="${Math.round(amounts.retirement)}" readonly>`;leave.innerHTML=`<input id="inv-${id}-leave" value="${Math.round(amounts.leave)}" readonly>`;row.insertBefore(ret,subtotal);row.insertBefore(leave,subtotal)});
    table.querySelectorAll('tfoot td[colspan]').forEach(cell=>cell.colSpan=21);const empty=body.querySelector('td[colspan]');if(empty)empty.colSpan=22;
    const note=document.querySelector('#invoiceDraft > .muted');if(note)note.textContent+=' 퇴사월에 저장한 퇴직금·잔여연차정산 금액은 자동 합산됩니다.';
  }
  function updateSettlementTotals(){
    let total=0;document.querySelectorAll('#invoiceRows tr[data-id]').forEach(row=>{const id=row.dataset.id,subtotal=document.getElementById(`inv-${id}-subtotal`);if(!subtotal)return;const value=numeric(subtotal.textContent)+numeric(document.getElementById(`inv-${id}-retirement`)?.value)+numeric(document.getElementById(`inv-${id}-leave`)?.value);subtotal.textContent=money(value);total+=value});
    const vat=Math.round(total*.1);setText('invoiceSubtotal',money(total));setText('invoiceVat',money(vat));setText('invoiceGrandTotal',money(total+vat));
  }

  function decorateAttendance(){
    const person=(typeof data!=='undefined'?data:[]).find(item=>String(item.id)===String(window.attendancePersonId));if(!person)return;const month=window.attendanceMonth||new Date().toISOString().slice(0,7),days=workerOperation(person).attendanceCalendar?.months?.[month]?.days||{};
    document.querySelectorAll('.attendance-hours').forEach(group=>{if(group.querySelector('[data-kind="attendanceStatus"]'))return;const day=group.querySelector('input[data-day]')?.dataset.day;if(!day)return;const status=days[day]?.attendanceStatus||days[day]?.approvalStatus||'',label=document.createElement('label');label.innerHTML=`근태 구분<select data-day="${day}" data-kind="attendanceStatus"><option value="">근무</option><option value="연차">연차</option><option value="반차">반차</option></select>`;const select=label.querySelector('select');select.value=['연차','반차'].includes(status)?status:'';if(group.querySelector('input')?.disabled)select.disabled=true;group.prepend(label)})
  }
  async function saveAttendanceWithLeave(close){try{
    const person=(typeof data!=='undefined'?data:[]).find(item=>String(item.id)===String(window.attendancePersonId));if(!person)throw new Error('인력 정보를 찾지 못했습니다.');const month=window.attendanceMonth||new Date().toISOString().slice(0,7);if(close&&!confirm(`${month} 근태를 마감할까요? 마감 후에는 수정할 수 없습니다.`))return;
    const op=workerOperation(person),calendar=op.attendanceCalendar||{},months={...(calendar.months||{})},days={};document.querySelectorAll('.attendance-hours [data-day]').forEach(input=>{const day=input.dataset.day;days[day]=days[day]||{};days[day][input.dataset.kind]=input.dataset.kind==='attendanceStatus'?input.value:Math.max(0,Number(input.value)||0)});months[month]={days};const closedMonths={...(calendar.closedMonths||{})};if(close)closedMonths[month]=new Date().toISOString();
    const payload={applicationId:person.id,attendance:op.attendance||'',dailyRate:op.dailyRate||'',workDays:op.workDays||'',workHours:op.workHours||'',payDate:op.payDate||'',grossPay:op.grossPay||'',netPay:op.netPay||'',assignmentDate:op.assignmentDate||'',resignationDate:op.resignationDate||'',bankName:op.bankName||'',accountNumber:op.accountNumber||'',accountHolder:op.accountHolder||'',assignedJobId:op.assignedJobId||'',hourlyRate:op.hourlyRate||'10320',workType:op.workType||'주간',attendanceCalendar:{months,closedMonths}};
    const response=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),out=await response.json();if(!response.ok)throw new Error(out.error||'근태를 저장하지 못했습니다.');alert(close?'근태를 마감했습니다.':'근태를 저장했습니다.');if(typeof window.loadData==='function')await window.loadData();else await load();window.openAttendance(person.id);
  }catch(error){alert(error.message)}}

  function install(){
    const nav=document.getElementById('payrollSubnav');if(nav&&!nav.querySelector('[data-view="annual-leave-settlement"]')){const button=document.createElement('button');button.dataset.view='annual-leave-settlement';button.textContent='잔여연차정산';nav.append(button);button.onclick=()=>window.setView('annual-leave-settlement')}
    const priorView=window.setView;window.setView=next=>{if(next!=='annual-leave-settlement')return priorView(next);window.__operationsRequestedView=next;priorView('payroll');load().then(render).catch(error=>alert(error.message))};
    const priorAttendance=window.renderAttendanceDetail;if(priorAttendance)window.renderAttendanceDetail=()=>{priorAttendance();decorateAttendance()};window.saveAttendance=saveAttendanceWithLeave;
    const priorInvoiceRender=window.renderInvoiceDraft,priorInvoiceCalculator=window.invoiceCalculator;
    if(priorInvoiceCalculator)window.invoiceCalculator=()=>{priorInvoiceCalculator();updateSettlementTotals()};
    if(priorInvoiceRender)window.renderInvoiceDraft=()=>{priorInvoiceRender();addSettlementColumns();window.invoiceCalculator()};
  }
  const style=document.createElement('style');style.textContent='.annual-leave-panel{margin-top:20px}.annual-leave-panel h2{margin:24px 0 12px;border-bottom:2px solid #1b2a57;padding-bottom:8px}.annual-leave-grid,.annual-leave-breakdown{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.annual-leave-grid small{display:block;margin-top:5px;color:#748198;font-weight:500;line-height:1.45}.annual-leave-check{justify-content:center}.annual-leave-check>input{width:auto;margin-right:7px}.annual-leave-breakdown div{padding:12px;border:1px solid #dbe3ef;border-radius:9px;background:#f7f9fc}.annual-leave-breakdown span{display:block;color:#64718a;font-size:12px}.annual-leave-breakdown b{display:block;margin-top:6px;font-size:18px}.annual-leave-result{margin-top:18px;padding:22px;border-radius:12px;background:#172852;color:#fff;text-align:center}.annual-leave-result small,.annual-leave-result b{display:block}.annual-leave-result b{margin:8px;font-size:34px}.annual-leave-result p{margin:0;color:#dfe7f8}.annual-leave-notice{margin-top:16px;padding:14px;border-radius:9px;background:#fff8e7;color:#76581c;line-height:1.7}.attendance-hours select{width:100%;padding:5px;border:1px solid #d7dfe9;border-radius:5px}.resignation-settlement-row{background:#fff8e7}.settlement-retirement input,.settlement-leave input{width:95px!important;background:#fff!important;font-weight:850}@media(max-width:800px){.annual-leave-grid,.annual-leave-breakdown{grid-template-columns:1fr 1fr}}@media(max-width:520px){.annual-leave-grid,.annual-leave-breakdown{grid-template-columns:1fr}}';document.head.append(style);
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install):install();
})();
