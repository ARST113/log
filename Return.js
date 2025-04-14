// ==UserScript==
// @name         Return Continue Watch
// @version      1.0.0
// @description  Add continue watch button in Lampa
// ==/UserScript==

console.log('[Return] Плагин загружен и начал выполнение');

function initContinueWatchButton() {
    console.log('[Return] Инициализация кнопки продолжить');

    Lampa.Listener.follow('full', function(event) {
        if (event.type !== 'complite') return;

        const movie = event.data.movie;
        const cardButtons = document.querySelector('.full-start-new__buttons');

        console.log('[Return] Обнаружена карточка фильма:', movie?.title || movie?.name || 'неизвестно');

        if (!movie || !cardButtons) {
            console.warn('[Return] Не найдены данные фильма или кнопки');
            return;
        }

        // Проверка продолжения торрента
        const saved = Lampa.Storage.get('parser_torrents_view', []);
        const progress = saved.find(t => t.id === movie.id);

        if (!progress) {
            console.log('[Return] Нет сохранённого прогресса просмотра');
            return;
        }

        console.log('[Return] Обнаружен сохранённый прогресс — добавляем кнопку');

        const btn = document.createElement('div');
        btn.className = 'full-start__button selector';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg><span>Продолжить</span>`;

        btn.addEventListener('click', () => {
            console.log('[Return] Нажата кнопка «Продолжить»');
            Lampa.Player.play({
                url: progress.file,
                title: movie.title || movie.name,
                timeline: progress.time || 0
            });
        });

        cardButtons.insertBefore(btn, cardButtons.firstChild);
    });
}

if (window.appready) {
    console.log('[Return] Lampa уже готова');
    initContinueWatchButton();
} else {
    console.log('[Return] Ожидаем готовность Lampa...');
    Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') {
            console.log('[Return] Lampa готова — запускаем');
            initContinueWatchButton();
        }
    });
}
