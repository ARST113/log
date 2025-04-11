(function () {
    const css = `
        .navigation-bar__body,
        .selectbox__content,
        .selectbox__layer,
        .settings__content,
        .settings__layer,
        .layer--height {
            backdrop-filter: none !important;
            filter: none !important;
            background: rgba(0,0,0,0.15) !important; /* лёгкий прозрачный фон, если нужно */
        }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
})();
