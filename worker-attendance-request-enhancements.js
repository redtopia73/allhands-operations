(() => {
  const app = document.getElementById('app');
  if (!app) return;

  function addRequestDate() {
    app.querySelectorAll('form[data-request="attendance"]').forEach(form => {
      if (form.querySelector('[name="requestDate"]')) return;
      const label = document.createElement('label');
      label.innerHTML = '근태 발생일<input type="date" name="requestDate" required>';
      const type = form.querySelector('[name="requestType"]');
      type?.after(label);
    });
  }

  new MutationObserver(addRequestDate).observe(app, { childList: true, subtree: true });
  addRequestDate();

  app.addEventListener('submit', async event => {
    const form = event.target.closest('form[data-request="attendance"]');
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const fields = new FormData(form);
    const requestDate = String(fields.get('requestDate') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestDate)) return alert('근태 발생일을 선택해 주세요.');
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/worker-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request',
          kind: 'attendance',
          applicationId: Number(fields.get('applicationId')),
          requestType: String(fields.get('requestType') || ''),
          requestDate,
          content: String(fields.get('content') || '')
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '근태 신청을 등록하지 못했습니다.');
      alert('근태 신청을 등록했습니다. 승인되면 선택한 날짜의 근태표에 자동 반영됩니다.');
      form.reset();
      await load();
    } catch (error) {
      alert(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  }, true);
})();
