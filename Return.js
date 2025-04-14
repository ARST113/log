(function () {
    console.log('[Return] Старт выполнения плагина');

    function waitForLampaReady() {
        if (window.appready || window.Lampa?.Storage) {
            console.log('[Return] Lampa готова');

            window.plugin_continue_watch_ready = true;

            setupContinueButton();
        } else {
            console.log('[Return] Ожидаем Lampa...');
            setTimeout(waitForLampaReady, 1000);
        }
    }

    function setupContinueButton() {
        console.log('[Return] Подписка на событие полной загрузки карточки');

        Lampa.Listener.follow('full', function (event) {
            if (event.type !== 'complite') return;

            const movie = event.data.movie;
            const parser = Lampa.Storage.get('parser_torrent_view', []);
            
            console.log('[Return] Все записи parser_torrent_view:', parser);
            console.log('[Return] ID текущего фильма:', movie.id);

            const last = parser.find(e => e.id == movie.id);
            console.log('[[Return]] Последний просмотренный торрент:', last);

            if (!last) {
                console.log('[Return] Торрент в хранилище не найден');
                return;
            }

            console.log('[Return] Совпадение найдено! Добавляем кнопку');

            let button = document.createElement('div');
            button.classList.add('selector', 'button--continue');
            button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M8 5v14l11-7z"/></svg>
                <span>Продолжить просмотр</span>
            `;

            button.addEventListener('click', () => {
                console.log('[Return] Нажата кнопка "Продолжить просмотр"');
                Lampa.Player.play({
                    title: last.title || movie.title,
                    url: last.url
                });
            });

            let buttonsContainer = document.querySelector('.full-start__buttons');
            if (buttonsContainer) {
                buttonsContainer.prepend(button);
                console.log('[Return] Кнопка добавлена на страницу');
            } else {
                console.log('[Return] Не найден контейнер для кнопок');
            }
        });
    }

    waitForLampaReady();
})();
