(() => {
  const monthKey = () => window.attendanceMonth || new Date().toISOString().slice(0, 7);

  function showWorkerReport() {
    try {
      const applicationId = String(window.attendancePersonId || '');
      const person = data.find(item => String(item.id) === applicationId);
      const section = document.querySelector('.attendance-calendar-panel');
      if (!person || !section) return;

      section.querySelector('.worker-attendance-report')?.remove();
      const records = (person.employer_note?.workerAttendance || [])
        .filter(record => String(record.workDate || '').startsWith(monthKey() + '-'))
        .sort((left, right) => String(left.workDate).localeCompare(String(right.workDate)));
      if (!records.length) return;

      const report = document.createElement('section');
      report.className = 'worker-attendance-report';
      report.style.cssText = 'margin-top:14px;padding:14px 16px;border:1px solid #ffd3cc;border-radius:10px;background:#fff8f6;color:#4d4050';
      const heading = document.createElement('strong');
      heading.textContent = '개인 입력 근태 · 담당자 확인 전';
      const intro = document.createElement('p');
      intro.textContent = '개인이 저장한 값입니다. 확인 후 아래 근태표에 반영하거나 수정해 주세요.';
      intro.style.cssText = 'margin:6px 0 8px;color:#7a6772;font-size:13px';
      const list = document.createElement('ul');
      list.style.cssText = 'display:grid;gap:5px;margin:0;padding-left:18px;font-size:13px;line-height:1.45';
      records.forEach(record => {
        const item = document.createElement('li');
        item.textContent = `${String(record.workDate).slice(8)}일 · ${record.attendance || '미입력'} · 정상 ${Number(record.normalHours || 0)}시간 · 연장 ${Number(record.overtimeHours || 0)}시간`;
        list.append(item);
      });
      report.append(heading, intro, list);
      section.querySelector('.attendance-total-note')?.after(report);
    } catch {
      // The normal company attendance screen remains available even if no worker report is present.
    }
  }

  function install() {
    const original = window.renderAttendanceDetail;
    if (typeof original !== 'function' || original.__workerReportWrapped) return false;
    const wrapped = (...args) => {
      const result = original(...args);
      requestAnimationFrame(showWorkerReport);
      return result;
    };
    wrapped.__workerReportWrapped = true;
    window.renderAttendanceDetail = wrapped;
    return true;
  }

  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 3000);
})();
