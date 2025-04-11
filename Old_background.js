(function(){
    const css = `
        .card__info::before,
        .card-detail__blur,
        .card-detail__info::before {
            backdrop-filter: blur(0px) !important;
            background: rgba(0,0,0,0.2) !important;
        }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
})();
