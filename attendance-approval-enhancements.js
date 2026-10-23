(() => {
  const style = document.createElement('style');
  style.textContent = '.attendance-approved{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:999px;background:#e8f7ef;color:#17734d;font-size:11px;font-weight:800;vertical-align:middle}.attendance-approved-note{margin:8px 0 0;color:#17734d;font-size:12px;font-weight:700}';
  document.head.append(style);

  const baseRenderAttendanceDetail = window.renderAttendanceDetail;
  window.renderAttendanceDetail = () => {
    baseRenderAttendanceDetail();
    const person = typeof data === 'undefined' ? null : data.find(item => String(item.id) === String(window.attendancePersonId));
    if (!person) return;
    const month = window.attendanceMonth || new Date().toISOString().slice(0, 7);
    const days = operation(person).attendanceCalendar?.months?.[month]?.days || {};
    document.querySelectorAll('.attendance-day').forEach(cell => {
      const date = cell.querySelector('.attendance-date');
      if (!date) return;
      const day = String(Number(date.firstChild?.textContent || ''));
      const approval = days[day]?.approvalStatus;
      if (!approval || date.querySelector('.attendance-approved')) return;
      const badge = document.createElement('span');
      badge.className = 'attendance-approved';
      badge.textContent = approval;
      date.append(badge);
      const note = document.createElement('p');
      note.className = 'attendance-approved-note';
      note.textContent = '결재 승인 반영';
      cell.append(note);
    });
  };
})();
