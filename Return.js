(function () {
    console.log('[Return] Старт выполнения плагина');

    // Проверка готовности Lampa
    function waitForLampaReady() {
        if (window.appready || window.Lampa?.Storage) {
            console.log('[Return] Lampa готова');

            // Устанавливаем флаг
            window.plugin_continue_watch_ready = true;

            // Запуск логики плагина
            setupContinueButton();
        } else {
            console.log('[Return] Ожидаем Lampa...');
            setTimeout(waitForLampaReady, 1000);
        }
    }

    // Логика добавления кнопки "Продолжить просмотр"
    function setupContinueButton() {
        console.log('[Return] Запускаем логику кнопки "Продолжить просмотр"');

        const lastTorrent = Lampa.Storage.get('parser_torrent_view');
        console.log('[Return] Последний просмотренный торрент:', lastTorrent);

        if (lastTorrent) {
            Lampa.Listener.follow('full', function (event) {
                if (event.type === 'complite' && event.data?.movie?.id === lastTorrent.id) {
                    console.log('[Return] Совпадение ID! Добавляем кнопку "Продолжить просмотр"...');

                    let button = document.createElement('div');
                    button.classList.add('selector', 'button--continue');
                    button.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M8 5v14l11-7z"/></svg>
                        <span>Продолжить просмотр</span>
                    `;

                    button.addEventListener('click', () => {
                        console.log('[Return] Нажата кнопка "Продолжить просмотр"');
                        Lampa.Player.play({
                            title: lastTorrent.title,
                            url: lastTorrent.url
                        });
                    });

                    let buttonsContainer = document.querySelector('.full-start__buttons');
                    if (buttonsContainer) {
                        buttonsContainer.prepend(button);
                        console.log('[Return] Кнопка добавлена на страницу');
                    } else {
                        console.log('[Return] Не найден контейнер для кнопок');
                    }
                }
            });
        } else {
            console.log('[Return] Торрент в хранилище не найден');
        }
    }

    waitForLampaReady();
})();
