;(function(){
  // Регистрация плагина в Lampa
  const plugin = {
    name: 'MyTorrentPlugin',         // уникальное имя плагина
    version: '1.0',
    icon: 'magnet',                  // иконка в списке источников
    searchOnStart: false,            // отключаем автопоиск при загрузке

    // Поиск по ключевому слову
    search(page, query, callback) {
      Lampa.Utils.log('MyTorrentPlugin', 'search', query);
      const url = `https://your.api/search?q=${encodeURIComponent(query)}&page=${page}`;
      $.get({
        url,
        dataType: 'json',
        timeout: 15000
      }).done(data => {
        if(!data || !data.results || !data.results.length){
          Lampa.Noty.show('Ничего не найдено');
          return;
        }
        // Преобразуем ответ API в единый формат
        const items = data.results.map(item => ({
          title: item.title,
          year:  item.year,
          torrent: item.magnet,      // magnet-ссылка или URL .torrent
          infoHash: item.hash,
          poster: item.poster
        }));
        callback(items, data.pages);
      }).fail(err => {
        Lampa.Utils.log('MyTorrentPlugin', 'search fail', err);
        Lampa.Noty.show(`Ошибка поиска: ${err.statusText || err}`);
      });
    },

    // Получение деталей (необязательно, можно сразу играть)
    find(item, callback) {
      Lampa.Utils.log('MyTorrentPlugin', 'find', item);
      callback(item);
    },

    // Основной метод запуска плеера
    play(item) {
      Lampa.Utils.log('MyTorrentPlugin', 'play item', item);

      // Базовые проверки
      if(!item || (!item.torrent && !item.infoHash)){
        Lampa.Noty.show('Нет ссылки на торрент или magnet');
        return;
      }

      // Сохраним хэш в Storage для возможности повторных попыток
      if(item.infoHash){
        Lampa.Storage.set('my_plugin_last_hash', item.infoHash);
      }

      // Выбор URL
      const torrentUrl = item.torrent || `magnet:?xt=urn:btih:${item.infoHash}`;

      // Запросим сам torrent-файл (если это прямой URL), или сразу генерируем playlist из magnet
      if(torrentUrl.startsWith('http')) {
        $.get({
          url: torrentUrl,
          timeout: 15000,
          xhrFields: { responseType: 'arraybuffer' }
        }).done(data => {
          Lampa.Utils.log('MyTorrentPlugin', 'torrent downloaded', data);

          if(!data || data.byteLength === 0){
            Lampa.Noty.show('Файл .torrent пуст или недоступен');
            return;
          }

          // Здесь вам понадобится парсер .torrent, например parse-torrent.js
          // const parsed = parseTorrent(data);
          // if(!parsed.files || !parsed.files.length){
          //   Lampa.Noty.show('Не удалось распарсить торрент');
          //   return;
          // }
          //
          // const playlist = parsed.files.map(file => ({
          //   title: file.name,
          //   url: URL.createObjectURL(new Blob([data])),
          //   size: file.length
          // }));

          // Для упрощения сделаем одну запись (все данные в одном потоке)
          const playlist = [{
            title: item.title + (item.year ? ` (${item.year})` : ''),
            url: URL.createObjectURL(new Blob([data])),
            torrent_hash: item.infoHash
          }];

          // Запускаем плеер
          Lampa.Player.play({
            title:       item.title,
            poster:      item.poster,
            torrent_hash:item.infoHash,
            playlist:    playlist
          });
        }).fail(err => {
          Lampa.Utils.log('MyTorrentPlugin', 'torrent download fail', err);
          Lampa.Noty.show(`Не удалось загрузить торрент: ${err.statusText || err}`);
        });
      }
      else {
        // magnet-ссылка: сразу пускаем
        Lampa.Player.play({
          title:        item.title,
          poster:       item.poster,
          url:          torrentUrl,
          torrent_hash: item.infoHash
        });
      }
    }
  };

  // Регистрируем плагин как источник в Lampa
  Lampa.Source.add(plugin);
})();
