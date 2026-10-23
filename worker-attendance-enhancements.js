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
