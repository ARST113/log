(function () {
    'use strict';

    // Убедимся, что Lampa и jQuery ($) доступны
    if (!window.Lampa || !window.$) {
        console.log("BeautifulPosterLoader: Lampa или jQuery не найдены. Плагин не будет запущен.");
        return;
    }

    const PLUGIN_NAME = 'BeautifulPosterLoader'; // Название плагина (для логов и стилей)
    const APPLIED_FLAG_DATA_ATTR = `data-${PLUGIN_NAME}-applied`; // data-атрибут для отметки обработанных элементов

    function applyBeautifulLoadingLogic(activity) {
        if (!activity || !activity.render) {
            // console.warn(`${PLUGIN_NAME}: Передан некорректный объект activity.`);
            return;
        }

        const activityView = activity.render();
        if (!activityView || !activityView.length) {
            // console.warn(`${PLUGIN_NAME}: Не найден элемент отображения activity.`);
            return;
        }

        // Проверяем, был ли плагин уже применен к этому отображению
        if (activityView.attr(APPLIED_FLAG_DATA_ATTR)) {
            // console.log(`${PLUGIN_NAME}: Уже применен к этому activity view.`);
            return;
        }

        let posterContainer = activityView.find('div.full-start-new_poster');
        let posterImage = posterContainer.find('img.full-start-new_img_full-poster');
        let imageUrl = null;

        // Пытаемся получить URL изображения высокого качества из данных карточки Lampa
        if (activity.card && activity.card.img) {
            imageUrl = activity.card.img;
        }

        // Сценарий 1: Желаемая HTML-структура (из скриншота 1) в основном существует.
        if (posterContainer.length && posterImage.length) {
            if (!imageUrl) { // Если URL нет в данных карточки, берем текущий src
                imageUrl = posterImage.attr('src');
            }
            // console.log(`${PLUGIN_NAME}: Найдена целевая структура. URL изображения: ${imageUrl}`);
        }
        // Сценарий 2: Адаптация из текущей/стандартной структуры (как на скриншоте 2).
        else {
            const defaultPosterImg = activityView.find('img.full-start-new_img.full-poster');
            if (defaultPosterImg.length) {
                // console.log(`${PLUGIN_NAME}: Адаптация стандартной структуры постера.`);

                if (!imageUrl) { // Если URL нет в данных карточки, берем текущий src
                    imageUrl = defaultPosterImg.attr('src');
                }
                // Если activity.card.img предоставляет лучший URL, чем base64-плейсхолдер, используем его.
                if (activity.card && activity.card.img && defaultPosterImg.attr('src') && defaultPosterImg.attr('src').startsWith('data:image')) {
                    imageUrl = activity.card.img;
                }

                posterImage = defaultPosterImg;
                let currentParent = posterImage.parent();

                // Проверяем, является ли непосредственный родитель уже нужным контейнером.
                if (currentParent.hasClass('full-start-new_poster')) {
                    posterContainer = currentParent;
                } else {
                    // Оборачиваем изображение для создания нужного контейнера .full-start-new_poster.
                    posterImage.wrap('<div class="full-start-new_poster"></div>');
                    posterContainer = posterImage.parent(); // Получаем новую обертку.
                }

                // Убеждаемся, что у изображения правильный класс для стилизации и консистентности.
                posterImage.removeClass('full-start-new_img full-poster').addClass('full-start-new_img_full-poster');
                // console.log(`${PLUGIN_NAME}: Структура адаптирована. URL изображения: ${imageUrl}`);
            } else {
                // console.warn(`${PLUGIN_NAME}: Не найдены подходящие элементы постера для применения эффекта загрузки.`);
                return; // Выходим, если не найдены релевантные элементы.
            }
        }

        // Финальные проверки перед продолжением
        if (!posterContainer.length || !posterImage.length || !imageUrl) {
            // console.warn(`${PLUGIN_NAME}: Не удалось определить контейнер постера, изображение или URL.`);
            return;
        }

        // Отмечаем, что плагин обработал содержимое этого отображения.
        activityView.attr(APPLIED_FLAG_DATA_ATTR, 'true');

        // Сбрасываем состояние: удаляем класс 'loaded', чтобы анимация воспроизвелась.
        posterContainer.removeClass('loaded loaded-error');


        // Чтобы сделать переход заметным, особенно если изображение было кэшировано
        // или src уже установлен, можно временно очистить src для удаленных URL.
        // Lampa.Utils.imgLoad затем установит его.
        let originalSrcForLoader = imageUrl;
        if (imageUrl.startsWith('http') && posterImage.attr('src') === imageUrl) {
           // posterImage.attr('src', ''); // Опционально: принудительно "пустое" состояние перед загрузкой для визуального эффекта
        }

        Lampa.Utils.imgLoad(posterImage, originalSrcForLoader, function () {
            posterContainer.addClass('loaded');
            // console.log(`${PLUGIN_NAME}: Изображение '${originalSrcForLoader}' успешно загружено.`);
        }, function () {
            posterContainer.addClass('loaded-error'); // Добавляем класс для стилизации состояния ошибки
            console.error(`${PLUGIN_NAME}: Не удалось загрузить изображение '${originalSrcForLoader}'.`);
            // Если src был очищен, можно восстановить оригинальный URL или плейсхолдер
            // posterImage.attr('src', originalSrcForLoader); // Восстановить при необходимости при ошибке
        });
        
        // Если атрибут src изображения не тот, который мы собираемся загрузить, устанавливаем его.
        // Lampa.Utils.imgLoad обычно это делает, но так надежнее.
        if (posterImage.attr('src') !== originalSrcForLoader && !originalSrcForLoader.startsWith('data:image')) {
             posterImage.attr('src', originalSrcForLoader);
        }
    }

    // Слушаем события компонента 'full_start' в Lampa.
    // 'complite' (часто опечатка Lampa для complete), 'ready' или 'show' - хорошие кандидаты.
    Lampa.Listener.follow('full_start', function (event) {
        if (event.type === 'complite' || event.type === 'ready' || event.type === 'show') {
            if (event.activity && event.activity.component === 'full_start') {
                // Небольшая задержка, чтобы Lampa успела завершить собственные манипуляции с DOM.
                setTimeout(function() {
                    applyBeautifulLoadingLogic(event.activity);
                }, 50); // При необходимости измените задержку (0 может сработать для следующего "тика").
            }
        }
    });

    // Внедряем CSS для анимации загрузки
    const styles = `
        .full-start-new_poster {
            /* Убедимся, что это блочный или строчно-блочный элемент, чтобы transform работал надежно */
            display: block; /* Или inline-block, в зависимости от разметки Lampa */
            transition: opacity 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            opacity: 0;
            transform: scale(0.96) translateY(8px); /* Начальное состояние: немного меньше и смещено вниз */
        }

        .full-start-new_poster.loaded {
            opacity: 1;
            transform: scale(1) translateY(0); /* Финальное состояние: полный размер и исходное положение */
        }

        .full-start-new_poster.loaded-error {
             opacity: 1; /* Показать что-то даже при ошибке */
             transform: scale(1) translateY(0);
             /* Опционально: добавьте визуальный признак ошибки, например, рамку */
             /* border: 2px dashed rgba(255,0,0,0.5); */
        }
    `;
    Lampa.Utils.putStyle(styles, `${PLUGIN_NAME}-styles`); // Добавляем стили в документ

    console.log(`${PLUGIN_NAME} плагин инициализирован и активен.`);

})();
