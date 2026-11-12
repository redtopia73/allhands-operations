(() => {
  const source = 'allhands-operations';
  const urlFor = view => `${location.pathname}${location.search}#${encodeURIComponent(view)}`;
  let restoring = false;

  const initialView = decodeURIComponent(location.hash.slice(1)) || 'dashboard';
  history.replaceState({ source, view: initialView }, '', urlFor(initialView));
  const applyView = window.setView;
  window.setView = view => {
    const result = applyView(view);
    if (!restoring && (history.state?.source !== source || history.state?.view !== view)) {
      history.pushState({ source, view }, '', urlFor(view));
    }
    return result;
  };

  window.addEventListener('popstate', event => {
    const state = event.state;
    if (!state || state.source !== source || !state.view) return;
    restoring = true;
    try {
      window.setView(state.view);
    } finally {
      restoring = false;
    }
  });

  if (initialView !== 'dashboard') {
    restoring = true;
    try {
      window.setView(initialView);
    } finally {
      restoring = false;
    }
  }
})();
