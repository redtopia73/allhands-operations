(() => {
  const openView = view => {
    if (!view || typeof window.setView !== 'function') return;
    window.setView(view);
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
