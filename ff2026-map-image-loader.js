(() => {
  'use strict';

  const PARTS = [
    'ff2026-map-data-0.txt?v=1',
    'ff2026-map-data-1.txt?v=1',
    'ff2026-map-data-2.txt?v=1',
    'ff2026-map-data-3.txt?v=1'
  ];

  let imagePromise = null;

  function getImageUrl() {
    if (!imagePromise) {
      imagePromise = Promise.all(PARTS.map(path =>
        fetch(path, { cache: 'force-cache' }).then(response => {
          if (!response.ok) throw new Error(`Map part ${response.status}`);
          return response.text();
        })
      )).then(parts => `data:image/png;base64,${parts.join('').replace(/\s+/g, '')}`)
        .catch(error => {
          console.error('Не удалось собрать карту Фэнтези Феста', error);
          return '';
        });
    }
    return imagePromise;
  }

  function hydrate(root = document) {
    const images = root.matches?.('img.route-map-image')
      ? [root]
      : root.querySelectorAll?.('img.route-map-image') || [];

    images.forEach(image => {
      if (image.dataset.mapHydrated) return;
      image.dataset.mapHydrated = 'loading';
      getImageUrl().then(url => {
        if (!url || !image.isConnected) return;
        image.src = url;
        image.classList.add('is-loaded');
        image.dataset.mapHydrated = 'done';
      });
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    .route-map-image{background:#ead7b5;transition:filter .18s ease}
    .route-map-image.is-loaded{filter:sepia(.34) saturate(.72) brightness(.98) contrast(1.06)}
  `;
  document.head.append(style);

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) hydrate(node);
    }));
  });

  observer.observe(document.body, { childList: true, subtree: true });
  hydrate();
})();
