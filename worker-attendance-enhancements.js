(() => {
  const normalStatus = '정상근무';

  function addNormalStatus(select) {
    if (select.dataset.normalStatusReady || !select.closest('[data-attendance]')) return;
    select.dataset.normalStatusReady = 'true';
    if (![...select.options].some(option => option.value === normalStatus)) {
      const option = document.createElement('option');
      option.value = normalStatus;
      option.textContent = normalStatus;
      select.insertBefore(option, select.options[0] || null);
    }
  }

  function prepare() {
    document.querySelectorAll('[data-attendance] .day select').forEach(addNormalStatus);
    const back = document.querySelector('.top .back');
    if (back && !document.querySelector('.top [data-attendance-app-link]')) {
      const link = document.createElement('a');
      link.className = 'back';
      link.href = '/attendance.html';
      link.dataset.attendanceAppLink = 'true';
      link.textContent = '출퇴근 앱';
      link.style.marginLeft = 'auto';
      back.style.marginLeft = '0';
      back.before(link);
    }
  }

  document.addEventListener('change', event => {
    const select = event.target.closest('[data-attendance] .day select');
    if (!select || select.value !== normalStatus) return;
    const normalHours = select.closest('.day')?.querySelector('[data-normal]');
    if (normalHours && Number(normalHours.value || 0) === 0) normalHours.value = '8';
  });

  new MutationObserver(prepare).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', prepare);
})();

