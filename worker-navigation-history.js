(() => {
  const source = 'allhands-worker-operations';
  const appTabs = document.querySelector('.tabs');
  if (!appTabs) return;
  const urlFor = currentTab => `${location.pathname}${location.search}#${encodeURIComponent(currentTab)}`;
  let restoring = false;

  history.replaceState({ source, tab: 'attendance' }, '', urlFor('attendance'));
  appTabs.addEventListener('click', event => {
    const button = event.target.closest('[data-tab]');
    if (!button || restoring || history.state?.tab === button.dataset.tab) return;
    setTimeout(() => history.pushState({ source, tab: button.dataset.tab }, '', urlFor(button.dataset.tab)), 0);
  });

  window.addEventListener('popstate', event => {
    const state = event.state;
    if (!state || state.source !== source || !state.tab) return;
    restoring = true;
    try {
      tab = state.tab;
      render();
    } finally {
      restoring = false;
    }
  });
})();
