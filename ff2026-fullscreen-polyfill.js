(() => {
  'use strict';

  const elementPrototype = window.Element?.prototype;
  if (!elementPrototype) return;

  if (!elementPrototype.requestFullscreen && elementPrototype.webkitRequestFullscreen) {
    elementPrototype.requestFullscreen = function requestFullscreen() {
      try {
        return Promise.resolve(elementPrototype.webkitRequestFullscreen.call(this));
      } catch (error) {
        return Promise.reject(error);
      }
    };
  }

  if (!document.exitFullscreen && document.webkitExitFullscreen) {
    document.exitFullscreen = function exitFullscreen() {
      try {
        return Promise.resolve(document.webkitExitFullscreen());
      } catch (error) {
        return Promise.reject(error);
      }
    };
  }
})();
