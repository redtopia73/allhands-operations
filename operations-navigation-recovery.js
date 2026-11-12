(() => {
  const openView = view => {
    if (!view || typeof window.setView !== 'function') return;
    try {
      window.setView(view);
      delete document.documentElement.dataset.navigationError;
    } catch (error) {
      document.documentElement.dataset.navigationError = error?.message || '화면 전환 오류';
      console.error('Operations navigation failed:', error);
    }
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('#sideNav [data-view]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openView(button.dataset.view);
  }, true);

  const initialView = decodeURIComponent(location.hash.slice(1));
  if (initialView && initialView !== 'dashboard') {
    queueMicrotask(() => openView(initialView));
  }
})();
