// Основные настройки и URL источников
const Defined = {
    api: 'https://api.skaz.tv/',
    localhost: getRandomServer(), // Выбор случайного сервера из списка
    apn: 'https://apn.skaz.tv/' // Резервный сервер
};

// Список серверов для выбора
function getRandomServer() {
    const servers = [
        'https://ine1.skaz.tv/',
        'https://ine2.skaz.tv/',
        'https://ine3.skaz.tv/',
        // ... другие серверы
    ];
    return servers[Math.floor(Math.random() * servers.length)];
}

// Основной класс плагина
class OnlinePlayer {
    constructor(movieData) {
        this.movie = movieData;
        this.network = new Network();
        this.scroll = new Scroll();
        this.filter = new Filter();
        this.sources = {};
        this.currentSource = 'filmix'; // Источник по умолчанию
    }

    // Инициализация плагина
    initialize() {
        this.loadExternalIds()
            .then(() => this.fetchSources())
            .then(() => this.startSearch());
    }

    // Поиск контента
    async search(query) {
        const url = `${Defined.localhost}search?${this.buildQuery(query)}`;
        const response = await this.network.request(url);
        this.processResults(response.data);
    }

    // Обработка результатов поиска
    processResults(data) {
        const videos = data.filter(item => item.type === 'movie' || item.type === 'series');
        this.displayResults(videos);
    }

    // Отображение результатов
    displayResults(videos) {
        this.scroll.clear();
        videos.forEach(video => {
            const element = this.createVideoElement(video);
            element.on('click', () => this.playVideo(video));
            this.scroll.append(element);
        });
    }

    // Воспроизведение видео
    async playVideo(video) {
        const playInfo = await this.getPlaybackInfo(video.id);
        Lampa.Player.play({
            url: playInfo.url,
            title: video.title,
            subtitles: playInfo.subtitles
        });
    }

    // Дополнительные методы
    buildQuery(params) {
        return new URLSearchParams(params).toString();
    }

    getSettings() {
        return {
            quality: Lampa.Storage.get('video_quality', '1080p'),
            subtitles: Lampa.Storage.get('subtitles', 'ru')
        };
    }
}

// Инициализация плагина при загрузке
if (!window.pluginLoaded) {
    window.pluginLoaded = true;
    Lampa.Plugin.register(new OnlinePlayer());
}
