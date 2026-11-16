(function recruitmentContractsModule(){
  const TYPES={
    'recruitment-contract':{
      title:'채용대행계약서',action:'recruitment-contract-save',eyebrow:'RECRUITMENT SERVICE AGREEMENT',
      intro:'고객사의 채용 의뢰 범위와 비용, 후보자 정보 처리, 계약 해지와 책임 범위를 정합니다.',
      fields:[
        ['serviceNature','계약 업무 성격','select',['채용업무 대행','직업소개 포함']],
        ['position','채용 의뢰 직무','text','예: 생산·포장 인력'],['headcount','채용 예정 인원','number','인원'],
        ['workConditions','근무지·근로조건','textarea','근무지, 근무시간, 임금 등'],
        ['serviceScope','대행 업무 범위','textarea','공고 작성·게시, 지원자 접수·선별, 면접 조율, 결과 안내 등'],
        ['fee','대행 수수료·부가세','text','정액·인원당·성공보수 기준과 부가세'],['payment','비용 지급시기·방법','text','예: 입사 후 10일 이내 계좌이체'],
        ['candidateOwnership','후보자 중복·소유권 기준','textarea','중복 지원자와 기존 보유 후보 처리 기준'],
        ['privacy','개인정보 보호·자료 반환','textarea','이용 목적, 보관기간, 반환·파기 방법'],
        ['cancellation','채용 취소·계약 해지','textarea','취소 통보, 진행비용, 해지 절차'],
        ['liability','책임 범위·채용 보장 여부','textarea','최종 채용결정 주체와 결과 보장 범위'],
        ['license','직업소개사업 등록번호·요금기준(해당 시)','textarea','실제 취업 알선에 해당하는 경우 등록번호와 적용 요금기준']
      ],
      clauses:[
        ['purpose','제1조 목적','을은 갑이 요청한 직무의 채용후보자를 물색·검토하여 추천하고, 갑의 면접과 최종 채용결정을 지원한다.'],
        ['scope','제2조 업무범위','을은 채용요건 확인, 후보자 모집·검토, 이력서 전달, 면접 일정 조율, 결과 안내 및 입사 확인 업무를 수행한다. 최종 채용 여부와 근로조건의 결정은 갑이 한다.'],
        ['information','제3조 정보제공과 협조','갑은 직무, 인원, 근무지, 임금 및 근로조건 등 채용에 필요한 정보를 정확히 제공하고 변경사항을 지체 없이 알린다.'],
        ['completion','제4조 업무완료와 채용통보','갑이 을이 추천한 후보자의 채용을 확정하면 후보자 성명과 최초 출근일을 을에게 서면 또는 전자적 방법으로 통보한다.'],
        ['feeArticle','제5조 수수료와 지급','수수료의 산정기준, 부가가치세, 계산서 발행일 및 지급기한은 본 계약의 비용조건에 따른다. 조기퇴사 시 지급 또는 환불기준은 별도 합의한 조건에 따른다.'],
        ['confidentiality','제6조 비밀유지·개인정보','당사자는 업무 중 알게 된 영업상 비밀과 후보자 개인정보를 계약 목적 외로 사용하거나 제3자에게 제공하지 않으며, 목적 달성 후 관계 법령과 합의한 보관기간에 따라 반환 또는 파기한다.'],
        ['nonSolicit','제7조 직접접촉·우회채용','추천후보자의 보호기간, 기존 접촉 후보, 계열사 또는 관계사를 통한 채용, 직접접촉에 관한 기준은 본 계약의 후보자 중복·소유권 조건에 따른다.'],
        ['terminationArticle','제8조 계약변경·해지','계약의 변경은 당사자의 서면 합의로 하며, 중대한 계약위반이 시정요구 후에도 계속되는 경우 상대방은 계약을 해지할 수 있다.'],
        ['liabilityArticle','제9조 책임','을은 후보자 탐색과 추천에 합리적인 주의를 다하되 채용성과, 후보자의 장기근속 또는 업무성과를 보증하지 않는다. 각 당사자는 자신의 귀책으로 발생한 손해에 책임을 진다.'],
        ['dispute','제10조 분쟁처리','계약에 정하지 않은 사항은 관계 법령과 상관례에 따르며, 분쟁은 상호 협의하여 해결하고 협의가 되지 않을 때에는 합의한 관할법원에 따른다.']
      ]
    },
    'headhunting-contract':{
      title:'헤드헌팅계약서',action:'headhunting-contract-save',eyebrow:'EXECUTIVE SEARCH AGREEMENT',
      intro:'전문인력 탐색·추천의 범위와 성공보수, 후보자 보호기간, 입사 후 보증조건을 정합니다.',
      fields:[
        ['position','채용 포지션·직급','text','예: 생산관리 팀장'],['requirements','후보자 자격요건','textarea','경력, 자격, 학력, 필수·우대조건'],
        ['headcount','채용 예정 인원','number','인원'],['exclusivity','전속·비전속 여부','select',['비전속','전속']],
        ['protection','후보자 추천·보호기간','text','예: 최초 추천일로부터 6개월'],
        ['fee','성공보수 기준·요율','text','연봉 기준, 정액 또는 요율'],['payment','지급시기·부가세','text','입사 확정·출근일 기준과 부가세'],
        ['guarantee','입사 취소·조기퇴사 시 보증·대체·환불','textarea','보증기간, 대체추천, 환불 비율과 제외사유'],
        ['duplicate','중복후보·계열사 채용 기준','textarea','기존 접촉 후보와 계열사 채용 처리'],
        ['privacy','비밀유지·개인정보 보호','textarea','후보자 정보 이용·보관·파기 및 비밀유지'],
        ['expenses','실비·추가비용','textarea','광고, 검사, 출장 등 사전승인 비용'],
        ['termination','계약 해지·분쟁 해결','textarea','해지 통보, 관할법원, 협의 절차'],
        ['license','고급·전문인력 해당 여부 및 직업소개사업 등록·요금기준','textarea','등록번호, 고급·전문인력 해당 여부, 적용 요금기준']
      ],
      clauses:[
        ['purpose','제1조 목적','을은 갑이 요청한 전문인력의 탐색·평가·추천 및 채용절차 지원 서비스를 제공한다. 최종 채용결정과 근로조건의 확정은 갑이 한다.'],
        ['process','제2조 추천절차와 협조','갑은 포지션, 자격요건, 근로조건과 채용일정을 제공하고, 을은 후보자를 물색·검토하여 이력서를 전달한다. 갑은 가능한 범위에서 신속히 면접과 결과를 진행하고 결과를 을에게 알린다.'],
        ['candidateProtection','제3조 후보자 보호와 중복후보','을이 최초 추천한 후보자가 보호기간 내 갑 또는 갑의 관계사에 채용되는 경우 본 계약에 따른 채용으로 본다. 갑이 추천 전에 이미 접촉한 후보자임을 객관적으로 확인한 경우에는 당사자가 별도로 협의한다.'],
        ['completion','제4조 서비스 완료와 채용통보','갑이 추천후보자를 정식 채용한 때 을의 해당 포지션 서비스가 완료된 것으로 보며, 갑은 후보자의 성명·확정연봉·최초 출근일을 을에게 통보한다.'],
        ['successFee','제5조 성공보수와 지급','성공보수 산정기준, 연봉의 범위, 부가가치세, 계산서 발행 및 지급기한은 본 계약의 비용조건에 따른다. 성과급·주식보상 등 변동보상의 포함 여부는 별도로 명시한다.'],
        ['guaranteeArticle','제6조 입사취소·조기퇴사','입사취소 또는 조기퇴사 시 대체추천, 일부환불 또는 보증 제외사유는 본 계약의 보증조건에 따른다. 귀책사유와 재직기간에 따른 처리기준을 개별 포지션별로 확인한다.'],
        ['confidentiality','제7조 비밀유지·개인정보','당사자는 채용 과정에서 취득한 영업비밀과 후보자 개인정보를 채용 목적 외로 이용하지 않으며, 관계 법령과 합의한 보관기간에 따라 안전하게 보관·반환·파기한다.'],
        ['nonSolicit','제8조 직접접촉·우회채용','갑은 추천후보자와 직접 계약하거나 관계사를 통해 채용하여 본 계약상 의무를 회피하지 않는다. 적용 범위와 예외는 후보자 보호조건에 따른다.'],
        ['term','제9조 계약기간·해지','계약기간과 갱신 여부는 기본 계약정보에 따르며, 해지 전 발생한 추천후보자와 성공보수에 관한 권리·의무는 후보자 보호기간 동안 유효하다.'],
        ['liabilityArticle','제10조 책임','을은 합리적인 주의로 후보자를 탐색·추천하되 후보자의 장기근속, 경력기재의 완전성 또는 업무성과를 보증하지 않는다. 각 당사자는 자신의 귀책으로 발생한 손해에 책임을 진다.'],
        ['dispute','제11조 분쟁처리','계약에 정하지 않은 사항은 관계 법령과 상관례에 따르며, 분쟁은 상호 협의하여 해결하고 협의가 되지 않을 때에는 합의한 관할법원에 따른다.']
      ]
    }
  };
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parse=v=>{if(v&&typeof v==='object')return v;try{return JSON.parse(v||'{}')}catch{return {}}};
  let context={jobs:[],clients:[],companyName:''},currentType='recruitment-contract';
  async function loadContext(){
    const response=await fetch('/api/operations',{credentials:'include',cache:'no-store'}),output=await response.json();
    if(!response.ok)throw new Error(output.error||'계약 기본정보를 불러오지 못했습니다.');
    const seen=new Set();
    context={jobs:output.jobs||[],companyName:String(output.companyName||''),clients:(output.documents||[]).filter(x=>x.document_type==='client').map(x=>parse(x.data)).filter(x=>{const k=String(x.clientId||x.name||'');if(!k||seen.has(k))return false;seen.add(k);return true})};
  }
  const fieldHtml=([name,label,type,detail])=>{
    if(type==='select')return `<label>${E(label)}<select name="${name}" required>${detail.map(x=>`<option>${E(x)}</option>`).join('')}</select></label>`;
    if(type==='textarea')return `<label class="wide">${E(label)}<textarea name="${name}" required placeholder="${E(detail)}"></textarea></label>`;
    return `<label>${E(label)}<input name="${name}" type="${type}" ${type==='number'?'min="1"':''} required placeholder="${E(detail)}"></label>`;
  };
  const clauseHtml=([name,title,content])=>`<label class="wide contract-clause"><b>${E(title)}</b><textarea name="clause_${name}" required>${E(content)}</textarea></label>`;
  function jobOptions(){return '<option value="">공고·현장을 선택하세요</option>'+context.jobs.map(job=>{const d=parse(job.data),title=d.title||d.jobTitle||`공고 ${job.id}`,place=d.workplace||d.location||d.region||'';return `<option value="${E(job.id)}">${E(title)}${place?' · '+E(place):''}</option>`}).join('')}
  function clientOptions(){return '<option value="">고객사를 선택하세요</option>'+context.clients.map(client=>`<option value="${E(client.clientId||client.name)}">${E(client.name||'고객사')} · ${E(client.contact||'담당자 미입력')}</option>`).join('')}
  function render(type){
    currentType=type;const spec=TYPES[type],main=document.getElementById('app');if(!main)return;
    document.querySelectorAll('#sideNav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='contracts'));
    const sub=document.getElementById('contractSubnav');if(sub){sub.style.display='block';sub.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===type))}
    main.innerHTML=`<div class="heading"><div><div class="eyebrow">${spec.eyebrow}</div><h1>${spec.title}</h1><p>${spec.intro}</p></div></div><section class="panel contract-draft" id="recruitmentContractDraft"><div class="contract-title">${spec.title}</div><p class="contract-intro">계약 당사자는 아래 조건에 따라 채용 관련 업무를 수행하고 후보자 정보를 안전하게 처리합니다.</p><form id="recruitmentContractForm"><h3>기본 계약 정보</h3><div class="contract-grid"><label>연결 공고·현장<select name="jobId" onchange="applyRecruitmentJob(this.value)">${jobOptions()}</select></label><label>저장 고객사<select name="clientId" onchange="applyRecruitmentClient(this.value)">${clientOptions()}</select></label><label>계약명<input name="title" value="${spec.title}" required></label><label>계약 체결일<input name="contractDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>계약 시작일<input name="startDate" type="date" required></label><label>계약 종료일<input name="endDate" type="date" required></label></div><h3>계약 당사자</h3><div class="contract-grid"><label>고객사(갑) 상호<input name="clientName" required></label><label>고객사 담당자<input name="clientContact"></label><label>고객사 이메일<input name="clientEmail" type="email"></label><label>고객사 대표자<input name="clientRepresentative"></label><label class="wide">고객사 주소<input name="clientAddress"></label><label>채용대행사(을) 상호<input name="providerName" value="${E(context.companyName)}" required></label><label>채용대행사 대표자<input name="providerRepresentative"></label><label class="wide">채용대행사 주소<input name="providerAddress"></label></div><h3>${type==='headhunting-contract'?'인재추천·성공보수 조건':'채용대행 업무·비용 조건'}</h3><div class="contract-grid">${spec.fields.map(fieldHtml).join('')}</div><h3>계약 조항</h3><p class="muted">참고 양식의 구조를 반영한 초안입니다. 실제 거래조건에 맞게 각 조항을 수정하세요.</p><div class="contract-grid contract-clauses">${spec.clauses.map(clauseHtml).join('')}</div><h3>서명·확인</h3><div class="contract-grid"><label>고객사 확인자<input name="clientSignature" required placeholder="성명 또는 전자서명 확인값"></label><label>채용대행사 확인자<input name="providerSignature" required placeholder="성명 또는 전자서명 확인값"></label></div><div class="quote-note"><b>작성 전 확인</b><br>실제 후보자 알선으로 고용계약 체결을 매개하는 경우 유료직업소개사업 등록과 적용 소개요금 기준을 확인해야 합니다. 고급·전문인력은 관계 법령상 요건 충족 여부를 별도로 검토하세요.</div><div class="invoice-actions" style="margin-top:16px"><button type="button" class="secondary" onclick="previewRecruitmentContract()">미리보기</button><button type="submit" class="primary">${spec.title} 저장</button></div></form></section>`;
    document.getElementById('recruitmentContractForm').onsubmit=saveRecruitmentContract;
  }
  window.applyRecruitmentClient=id=>{const client=context.clients.find(x=>String(x.clientId||x.name)===String(id));if(!client)return;const f=document.getElementById('recruitmentContractForm');f.elements.clientName.value=client.name||'';f.elements.clientContact.value=client.contact||'';f.elements.clientEmail.value=client.email||''};
  window.applyRecruitmentJob=id=>{const job=context.jobs.find(x=>String(x.id)===String(id));if(!job)return;const d=parse(job.data),f=document.getElementById('recruitmentContractForm'),position=d.title||d.jobTitle||'',location=d.workplace||d.location||d.region||'',hours=d.workHours||d.workingHours||'',pay=d.pay||d.salary||d.wage||'';if(f.elements.position)f.elements.position.value=position;if(f.elements.headcount)f.elements.headcount.value=d.headcount||d.recruitCount||d.recruitmentCount||'';if(f.elements.workConditions)f.elements.workConditions.value=[location,hours,pay].filter(Boolean).join(' / ');if(f.elements.requirements)f.elements.requirements.value=d.qualifications||d.requirements||d.preferred||''};
  function snapshot(){const source=document.getElementById('recruitmentContractDraft'),copy=source.cloneNode(true);copy.querySelectorAll('button,.invoice-actions').forEach(x=>x.remove());copy.querySelectorAll('input,textarea,select').forEach(field=>{const span=document.createElement('span');span.className='preview-value';span.textContent=field.value||'-';field.replaceWith(span)});copy.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));return copy.outerHTML}
  async function saveRecruitmentContract(event){event?.preventDefault();const form=document.getElementById('recruitmentContractForm'),spec=TYPES[currentType];if(!form.reportValidity())return;const values=Object.fromEntries(new FormData(form).entries());values.documentHtml=snapshot();values.contractType=currentType;try{const response=await fetch('/api/operations',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:spec.action,document:values})}),output=await response.json();if(!response.ok)throw new Error(output.error||'계약서를 저장하지 못했습니다.');alert(`${spec.title}를 양식 그대로 저장했습니다. 문서보관함에서 다시 확인할 수 있습니다. 문서번호: ${output.id}`)}catch(error){alert(error.message)}}
  window.previewRecruitmentContract=()=>{const html=snapshot(),spec=TYPES[currentType];document.getElementById('documentPreview')?.remove();const modal=document.createElement('div');modal.id='documentPreview';modal.className='document-preview';modal.innerHTML=`<div class="preview-toolbar"><b>${spec.title} 미리보기</b><div><button class="secondary" id="recruitmentPreviewSave">보관함에 저장</button><button class="secondary" id="recruitmentPreviewPrint">PC에 PDF 저장·출력</button><button class="secondary" id="recruitmentPreviewClose">닫기</button></div></div><div class="preview-paper">${html}</div>`;document.body.append(modal);modal.querySelector('#recruitmentPreviewClose').onclick=()=>modal.remove();modal.querySelector('#recruitmentPreviewPrint').onclick=()=>window.printPreview?window.printPreview():window.print();modal.querySelector('#recruitmentPreviewSave').onclick=()=>saveRecruitmentContract()};
  function install(){const sub=document.getElementById('contractSubnav');if(!sub)return;Object.entries(TYPES).forEach(([type,spec])=>{let button=sub.querySelector(`[data-view="${type}"]`);if(!button){button=document.createElement('button');button.dataset.view=type;button.textContent=spec.title+' 작성';sub.append(button)}button.onclick=()=>window.setView(type)});const prior=window.setView;window.setView=next=>{if(!TYPES[next])return prior(next);window.__operationsRequestedView=next;prior('dashboard');loadContext().then(()=>render(next)).catch(error=>alert(error.message))}}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install):install();
})();
