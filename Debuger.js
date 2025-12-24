(function() {
    var EXTERNAL_PLAYER_REQUEST_CODE = 1001;
    var currentMediaData = null;

    function savePositionFromExternalPlayer(position) {
        if (!currentMediaData || !currentMediaData.id) return;
        
        position = Math.floor(position); // Округляем до секунд
        
        // Сохраняем позицию
        Lampa.Storage.set('last_position_' + currentMediaData.id, position);
        
        // Также сохраняем в истории просмотров
        var history = Lampa.Storage.get('watch_history', {});
        if (!history[currentMediaData.id]) {
            history[currentMediaData.id] = {};
        }
        history[currentMediaData.id].position = position;
        history[currentMediaData.id].time = Date.now();
        Lampa.Storage.set('watch_history', history);
        
        console.log('Position saved:', position, 'for media:', currentMediaData.id);
    }

    function handleExternalPlayerResult(resultCode, data) {
        if (resultCode === Lampa.Activity.RESULT_OK && data) {
            try {
                // Пробуем разные способы получить позицию
                var position = 0;
                
                if (data.hasExtra("position")) {
                    position = data.getIntExtra("position", 0);
                } else if (data.hasExtra("playback_position")) {
                    position = data.getIntExtra("playback_position", 0);
                } else if (data.hasExtra("android.intent.extra.POSITION")) {
                    position = data.getIntExtra("android.intent.extra.POSITION", 0);
                }
                
                if (position > 0) {
                    savePositionFromExternalPlayer(position / 1000); // Конвертируем мс в секунды
                }
            } catch (e) {
                console.error('Error processing external player result:', e);
            }
        }
        
        currentMediaData = null;
    }

    // Перехватываем запуск внешнего плеера
    var originalPlayExternal = Lampa.Player && Lampa.Player.playExternal;
    if (originalPlayExternal) {
        Lampa.Player.playExternal = function(data) {
            currentMediaData = data;
            
            // Получаем сохраненную позицию
            var savedPosition = 0;
            if (data && data.id) {
                savedPosition = Lampa.Storage.get('last_position_' + data.id, 0);
            }
            
            console.log('Starting external player with position:', savedPosition);
            
            // Модифицируем URL для передачи позиции
            var url = data.url;
            if (savedPosition > 0) {
                // Добавляем позицию в URL как параметр
                url += (url.indexOf('?') === -1 ? '?' : '&') + 'start=' + savedPosition;
            }
            
            // Создаем Intent с позицией
            var intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(url), "video/*");
            
            // Передаем позицию разными способами (для совместимости)
            intent.putExtra("position", savedPosition * 1000);
            intent.putExtra("start", savedPosition);
            intent.putExtra("playback_position", savedPosition * 1000);
            intent.putExtra("android.intent.extra.START_PLAYBACK_TIME", savedPosition * 1000);
            
            // Запускаем с ожиданием результата
            Lampa.Activity.startActivityForResult(intent, EXTERNAL_PLAYER_REQUEST_CODE);
        };
    }

    // Устанавливаем обработчик результата
    Lampa.Activity.onActivityResult = function(requestCode, resultCode, data) {
        if (requestCode === EXTERNAL_PLAYER_REQUEST_CODE) {
            handleExternalPlayerResult(resultCode, data);
        }
        
        // Вызываем оригинальный обработчик, если он есть
        if (typeof originalOnActivityResult === 'function') {
            originalOnActivityResult(requestCode, resultCode, data);
        }
    };

    console.log('External player position saver plugin loaded');
})();
