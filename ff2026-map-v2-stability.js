(() => {
  'use strict';

  document.addEventListener('click', event => {
    if (!event.target.closest('[data-map-action="fullscreen"]')) return;
    setTimeout(() => {
      const reset = document.querySelector('#routeMapShell [data-map-action="reset"]');
      reset?.click();
    }, 180);
  });
})();
