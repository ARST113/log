(function() {

    function insertContinueWatching() {
        let items = Lampa.Storage.get('continue_watching', []);
        if (!items.length) return;

        let html = items.map(item => `
            <div class="card selector card--video layer--render" data-id="${item.id}">
                <div class="card__view">
                    <img src="${item.poster || ''}" class="card__img">
                </div>
                <div class="card__title">${item.title}</div>
                <div class="card__quality">${Math.floor(item.time / 60)} мин / ${Math.floor(item.duration / 60)} мин</div>
            </div>
        `).join('');

        let wrapper = `
        <div class="items-line layer--visible layer--render items-line--type-cards">
            <div class="items-line__head">
                <div class="items-line__title">Продолжить просмотр</div>
            </div>
            <div class="items-line__body">
                <div class="scroll scroll--horizontal">
                    <div class="scroll__content">
                        <div class="scroll__body items-cards">${html}</div>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.querySelector('.scroll__body').insertAdjacentHTML('afterbegin', wrapper);

        document.querySelector('.items-line__body').addEventListener('click', function(e){
            let card = e.target.closest('.card');
            if (card) {
                let id = card.getAttribute('data-id');
                let item = items.find(a => a.id === id);
                if(item && item.card) {
                    Lampa.Player.play({
                        url: item.card.url || item.card.link,
                        title: item.title,
                        timeline: { time: item.time, duration: item.duration }
                    });
                }
            }
        });
    }

    Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') insertContinueWatching();
    });

})();
