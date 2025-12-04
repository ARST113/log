(function () {
    'use strict';

    // ========================================================================
    // 1. КОНСТАНТЫ И УТИЛИТЫ
    // ========================================================================

    const CONSTANTS = {
        TIMEOUT: 20000,
        MAX_ATTEMPTS: 60,
        AUDIO_FORMATS: new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'ape', 'wma', 'dsd', 'dsf', 'alac', 'dts', 'ac3']),
        IMAGE_FORMATS: new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']),
        ITEMS_PER_PAGE: 20
    };

    const FileUtils = {
        getExt: (path) => (path.split('.').pop() || '').toLowerCase(),
        getDir: (path) => path.substring(0, path.lastIndexOf('/')),
        getFilename: (path) => (path.split('/').pop() || '').toLowerCase(),
        isPriorityCover: (fname) => ['cover', 'folder', 'front'].some(k => fname.includes(k)),
        bytesToSize: (bytes) => Lampa.Utils.bytesToSize(bytes),
        strToTime: (str) => Lampa.Utils.strToTime(str),
        hash: (str) => Lampa.Utils.hash(str)
    };

    // ========================================================================
    // 2. КЭШ МЕНЕДЖЕР
    // ========================================================================

    const CacheManager = {
        _search: new Map(),
        getSearchKey(params) {
            return JSON.stringify({
                search: params.search,
                type: Lampa.Storage.field('parser_torrent_type')
            });
        },
        getSearch(key) { return this._search.get(key); },
        setSearch(key, data) { this._search.set(key, data); },
        getViewed() { return Lampa.Storage.cache('torrents_view', 5000, []); },
        isViewed(hash) { return this.getViewed().includes(hash); },
        addViewed(hash) {
            const list = this.getViewed();
            if (!list.includes(hash)) {
                list.push(hash);
                Lampa.Storage.set('torrents_view', list);
            }
        },
        removeViewed(hash) {
            const list = this.getViewed().filter(h => h !== hash);
            Lampa.Storage.set('torrents_view', list);
        }
    };

    // ========================================================================
    // 3. API CLIENT
    // ========================================================================

    const ApiClient = {
        network: new Lampa.Reguest(),
        request(url, options = {}) {
            return new Promise((resolve, reject) => {
                const timeout = options.timeout || (1000 * Lampa.Storage.field('parse_timeout')) || CONSTANTS.TIMEOUT;
                this.network.timeout(timeout);
                this.network['native'](url, resolve, (a, c) => {
                    reject(new Error(Lampa.Lang.translate('torrent_parser_no_responce') + ' (' + url + ')'));
                });
            });
        },
        checkUrl(key, name) {
            const url = Lampa.Storage.field(key);
            if (!url) throw new Error(`${Lampa.Lang.translate('torrent_parser_set_link')}: ${name}`);
            return Lampa.Utils.checkEmptyUrl(url);
        },
        async get(params) {
            const type = Lampa.Storage.field('parser_torrent_type');
            if (!params.search || params.search === 'undefined') throw new Error('Empty search query');
            if (type === 'jackett') return await this.jackett(params);
            if (type === 'prowlarr') return await this.prowlarr(params);
            if (type === 'torrserver') return await this.torrserver(params);
            throw new Error('Unknown parser type');
        },
        async jackett(params) {
            const baseUrl = this.checkUrl('jackett_url', 'Jackett');
            const apiKey = Lampa.Storage.field('jackett_key');
            const indexer = Lampa.Storage.field('jackett_interview') === 'healthy' ? 'status:healthy' : 'all';
            let url = `${baseUrl}/api/v2.0/indexers/${indexer}/results?apikey=${apiKey}&Category[]=3020&Category[]=3040&Category[]=100375&Query=${encodeURIComponent(params.search)}`;
            const json = await this.request(url);
            if (!json || !json.Results) throw new Error('Invalid Jackett response');
            return {
                Results: json.Results.filter(item => item.TrackerId !== "toloka").map(item => ({
                    ...item, PublisTime: FileUtils.strToTime(item.PublishDate), hash: FileUtils.hash(item.Title), viewed: CacheManager.isViewed(FileUtils.hash(item.Title)), size: FileUtils.bytesToSize(item.Size)
                }))
            };
        },
        async prowlarr(params) {
            const baseUrl = this.checkUrl('prowlarr_url', 'Prowlarr');
            const q = [{ name: 'apikey', value: Lampa.Storage.field('prowlarr_key') }, { name: 'query', value: params.search }];
            const url = Lampa.Utils.buildUrl(baseUrl, '/api/v1/search', q);
            const json = await this.request(url);
            if (!Array.isArray(json)) throw new Error('Invalid Prowlarr response');
            return {
                Results: json.filter(e => e.protocol === 'torrent').map(e => {
                    const hash = FileUtils.hash(e.title);
                    return { Title: e.title, Tracker: e.indexer, size: FileUtils.bytesToSize(e.size), PublishDate: FileUtils.strToTime(e.publishDate), Seeders: parseInt(e.seeders), Peers: parseInt(e.leechers), MagnetUri: e.downloadUrl, viewed: CacheManager.isViewed(hash), hash: hash };
                })
            };
        },
        async torrserver(params) {
            const useLinkTwo = Lampa.Storage.field('torrserver_use_link') == 'two';
            const baseUrl = this.checkUrl(useLinkTwo ? 'torrserver_url_two' : 'torrserver_url', 'TorrServer');
            const url = Lampa.Utils.buildUrl(baseUrl, '/search/', [{ name: 'query', value: params.search }]);
            const json = await this.request(url);
            if (!Array.isArray(json)) throw new Error('Invalid TorrServer response');
            return {
                Results: json.map(e => {
                    const hash = FileUtils.hash(e.Title);
                    return { Title: e.Title, Tracker: e.Tracker, size: e.Size, PublishDate: FileUtils.strToTime(e.CreateDate), Seeders: parseInt(e.Seed), Peers: parseInt(e.Peer), MagnetUri: e.Magnet, viewed: CacheManager.isViewed(hash), CategoryDesc: e.Categories, bitrate: '-', hash: hash };
                })
            };
        },
        clear() { this.network.clear(); }
    };

    // ========================================================================
    // 4. HTML5 AUDIO PLAYER (NATIVE LAMPA NAVIGATION)
    // ========================================================================

    const HTML5AudioPlayer = {
        media: null,
        playlist: [],
        current: 0,
        visible: false,
        errorCount: 0,
        retryCount: 0,
        ui: null,

        init() {
            this.media = document.createElement('video');
            this.media.style.position = 'absolute';
            this.media.style.width = '1px';
            this.media.style.height = '1px';
            this.media.style.opacity = '0';
            this.media.style.pointerEvents = 'none';
            this.media.preload = "auto"; 
            this.media.playsInline = true;
            this.media.autoplay = true;
            document.body.appendChild(this.media);
            this.bindEvents();
        },

        bindEvents() {
            this.media.addEventListener('ended', () => {
                this.errorCount = 0;
                this.retryCount = 0;
                this.next();
            });

            this.media.addEventListener('timeupdate', () => {
                if (this.visible) this.updateUIState();
            });

            this.media.addEventListener('loadeddata', () => {
                this.errorCount = 0;
                this.retryCount = 0;
                if (this.visible) this.updateUIState();
            });

            this.media.addEventListener('error', (e) => {
                if (!this.media) return;
                const error = this.media.error;
                let msg = error ? error.code : 'Unknown';
                console.error('[MusicSearch] Error:', msg);
                
                // AbortError is common when switching tracks quickly
                if (error && error.code === 20) return; 

                if (this.retryCount < 1) {
                    this.retryCount++;
                    setTimeout(() => { if(this.media) { this.media.load(); this.media.play().catch(()=>{}); } }, 1000);
                    return;
                }
                this.errorCount++;
                this.retryCount = 0;
                
                if (this.errorCount > 3) {
                    Lampa.Noty.show('Too many errors.');
                    this.destroy();
                } else {
                    Lampa.Noty.show(`Error: ${msg}. Skipping...`);
                    setTimeout(() => this.next(), 1000);
                }
            });
        },

        play(element) {
            if (!this.media) this.init();
            
            let url = element.url;
            if (url.indexOf('preload') > -1) url = url.replace('preload', 'play');
            
            if (element.playlist_index !== undefined) {
                this.current = element.playlist_index;
            } else {
                const idx = this.playlist.findIndex(i => i.url === element.url);
                if (idx !== -1) this.current = idx;
            }
            this.retryCount = 0;
            this.media.src = url;
            this.media.load();
            
            var promise = this.media.play();
            if (promise) {
                promise.catch(e => { 
                    // Suppress AbortError logging
                    if (e.name !== 'AbortError') console.error('Play error', e); 
                });
            }
            
            if (!this.visible) {
                this.showUI(element);
                this.bindController();
            } else {
                this.updateUITitle(element);
                this.updateUIState();
            }
        },

        setPlaylist(playlist) {
            this.playlist = playlist;
            this.errorCount = 0;
        },

        showUI(element) {
            const css = `
                .music-player-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; background: #111; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                .music-bg { position: absolute; top:0; left:0; width:100%; height:100%; background-size: cover; background-position: center; opacity: 0.2; filter: blur(30px); z-index: -1; }
                .music-cover { width: 35vh; height: 35vh; background: #333; border-radius: 10px; margin-bottom: 3vh; box-shadow: 0 10px 40px rgba(0,0,0,0.6); background-size: cover; background-position: center; }
                .music-info { text-align: center; margin-bottom: 2vh; width: 80%; }
                .music-title { font-size: 3vh; font-weight: bold; margin-bottom: 1vh; color: #fff; }
                .music-time-text { font-size: 2vh; color: #aaa; font-family: monospace; margin-bottom: 2vh; }
                
                /* Progress Bar */
                .music-progress-wrap { width: 60%; height: 24px; cursor: pointer; margin-bottom: 4vh; position: relative; display: flex; align-items: center; border: 2px solid transparent; border-radius: 4px; padding: 0 5px; transition: all 0.2s; }
                .music-progress-wrap.focus { border-color: #fff; background: rgba(255,255,255,0.1); }
                .music-progress-bg { width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; }
                .music-progress-current { width: 0%; height: 4px; background: #4b8; border-radius: 2px; position: relative; }
                .music-progress-handle { width: 12px; height: 12px; background: #fff; border-radius: 50%; position: absolute; right: -6px; top: -4px; box-shadow: 0 0 5px rgba(0,0,0,0.5); transform: scale(0); transition: transform 0.2s; }
                .music-progress-wrap.focus .music-progress-handle { transform: scale(1.2); }

                .music-controls { display: flex; align-items: center; gap: 20px; }
                .music-btn { width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; transition: all 0.2s; border: 3px solid transparent; cursor: pointer; }
                .music-btn svg { width: 24px; height: 24px; fill: #fff; }
                .music-btn.focus { background: #fff; transform: scale(1.1); box-shadow: 0 0 20px rgba(255,255,255,0.3); }
                .music-btn.focus svg { fill: #000; }
                .music-btn-play { width: 80px; height: 80px; background: #4b8; }
                .music-btn-play svg { width: 32px; height: 32px; }
                .music-btn-mini { width: 50px; height: 50px; }
            `;

            if (!$('#music-player-style').length) $('body').append(`<style id="music-player-style">${css}</style>`);
            $('.music-player-overlay').remove();

            const img = element.img || './img/img_broken.svg';
            const html = $(`
                <div class="music-player-overlay">
                    <div class="music-bg" style="background-image: url('${img}')"></div>
                    <div class="music-cover" style="background-image: url('${img}')"></div>
                    <div class="music-info">
                        <div class="music-title">${element.title}</div>
                        <div class="music-time-text">00:00 / 00:00</div>
                    </div>
                    
                    <div class="music-progress-wrap selector" data-action="seek">
                        <div class="music-progress-bg">
                            <div class="music-progress-current">
                                <div class="music-progress-handle"></div>
                            </div>
                        </div>
                    </div>

                    <div class="music-controls">
                        <div class="music-btn btn-prev selector" data-action="prev"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></div>
                        <div class="music-btn music-btn-mini btn-rewind selector" data-action="rewind"><svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg></div>
                        <div class="music-btn music-btn-play btn-play selector" data-action="play"><svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg></div>
                        <div class="music-btn music-btn-mini btn-forward selector" data-action="forward"><svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg></div>
                        <div class="music-btn btn-next selector" data-action="next"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></div>
                        <div class="music-btn btn-close selector" data-action="close"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></div>
                    </div>
                    <div style="margin-top: 30px; color: #555; font-size: 1.5vh;">VOL: UP/DOWN</div>
                </div>
            `);

            $('body').append(html);
            this.ui = html;
            this.visible = true;

            // Mouse Click handlers
            html.find('.selector').on('click', (e) => {
                const action = $(e.currentTarget).data('action');
                if (action === 'seek') {
                    if (!this.media || !this.media.duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos = (e.clientX - rect.left) / rect.width;
                    this.media.currentTime = pos * this.media.duration;
                } else {
                    this.executeAction(action);
                }
            }).on('mouseenter', (e) => {
                // Native Lampa behavior: mouse hover sets focus
                Lampa.Navigator.focused(e.currentTarget);
            });
        },

        bindController() {
            Lampa.Controller.add('html5_player', {
                toggle: () => {
                    Lampa.Controller.collectionSet(this.ui);
                    // Initial focus on Play button
                    Lampa.Controller.collectionFocus(this.ui.find('.btn-play')[0], this.ui);
                },
                up: () => {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else this.vol(0.1);
                },
                down: () => {
                    if (Navigator.canmove('down')) Navigator.move('down');
                    else this.vol(-0.1);
                },
                left: () => {
                    if (this.isSeekFocused()) {
                        this.seek(-10);
                    } else {
                        Navigator.move('left');
                    }
                },
                right: () => {
                    if (this.isSeekFocused()) {
                        this.seek(10);
                    } else {
                        Navigator.move('right');
                    }
                },
                enter: () => {
                    const el = this.ui.find('.focus');
                    if (el.length) el.trigger('click');
                },
                back: () => this.destroy()
            });
            Lampa.Controller.toggle('html5_player');
        },

        isSeekFocused() {
            const focused = this.ui.find('.focus');
            return focused.hasClass('music-progress-wrap');
        },

        executeAction(action) {
            if (action === 'prev') this.prev();
            if (action === 'next') this.next();
            if (action === 'play') this.togglePlay();
            if (action === 'rewind') this.seek(-10);
            if (action === 'forward') this.seek(10);
            if (action === 'close') this.destroy();
        },

        seek(sec) {
            if (!this.media) return;
            this.media.currentTime += sec;
        },

        updateUITitle(element) {
            if(!this.ui) return;
            this.ui.find('.music-title').text(element.title);
            this.ui.find('.music-bg').css('background-image', `url('${element.img}')`);
            this.ui.find('.music-cover').css('background-image', `url('${element.img}')`);
        },

        updateUIState() {
            if (!this.media || !this.ui) return;
            
            const cur = this.media.currentTime;
            const dur = this.media.duration || 0;
            
            // Update Text
            const format = (s) => {
                const m = Math.floor(s / 60);
                const sec = Math.floor(s % 60);
                return `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`;
            };
            this.ui.find('.music-time-text').text(`${format(cur)} / ${format(dur)}`);
            
            // Update Bar
            const percent = dur > 0 ? (cur / dur) * 100 : 0;
            this.ui.find('.music-progress-current').css('width', percent + '%');

            // Play/Pause Icon
            const path = this.media.paused 
                ? "M8 5v14l11-7z" 
                : "M6 19h4V5H6v14zm8-14v14h4V5h-4z";
            this.ui.find('.btn-play svg path').attr('d', path);
        },

        vol(diff) {
            if(!this.media) return;
            let v = this.media.volume + diff;
            if(v > 1) v = 1;
            if(v < 0) v = 0;
            this.media.volume = v;
            Lampa.Noty.show('Volume: ' + Math.round(v * 100) + '%');
        },

        togglePlay() {
            if (!this.media) return;
            if (this.media.paused) this.media.play().catch(()=>{});
            else this.media.pause();
            this.updateUIState();
        },

        next() {
            if (this.current < this.playlist.length - 1) {
                this.current++;
                this.play(this.playlist[this.current]);
            } else {
                Lampa.Noty.show('Playlist ended');
            }
        },

        prev() {
            if (this.current > 0) {
                this.current--;
                this.play(this.playlist[this.current]);
            }
        },

        destroy() {
            if (this.media) {
                this.media.pause();
                this.media.src = '';
                this.media.load();
                if(this.media.parentNode) this.media.parentNode.removeChild(this.media);
                this.media = null;
            }
            if(this.ui) this.ui.remove();
            this.visible = false;
            
            // ВОЗВРАТ УПРАВЛЕНИЯ
            Lampa.Controller.toggle('content');
            
            // СИНХРОНИЗАЦИЯ ФОКУСА (возврат на текущий трек)
            if (window.Lampa.Torrent && window.Lampa.Torrent.syncFocus) {
                // Если мы играли из плейлиста, current изменился
                // Передаем URL текущего трека, чтобы найти его в списке
                const currentTrackUrl = this.playlist[this.current] ? this.playlist[this.current].url : null;
                window.Lampa.Torrent.syncFocus(currentTrackUrl);
            }
        }
    };

    // ========================================================================
    // 5. КОНТРОЛЛЕР ТОРРЕНТА
    // ========================================================================

    const TorrentController = {
        state: { object: null, movie: null, hash: null, callback: null, callback_back: null, timers: {}, autostart_timer: null, autostart_progress: null },

        start(element, movie) {
            this.state.object = element;
            if (movie) this.state.movie = movie;
            if (Lampa.Platform.is('android') && !Lampa.Storage.field('internal_torrclient')) {
                Lampa.Android.openTorrent(this.state);
                if (movie && movie.id) Lampa.Favorite.add('history', movie, 100);
                if (this.state.callback) this.state.callback();
            } else if (Lampa.Torserver.url()) {
                this.loading();
                this.connect();
            } else {
                this.install();
            }
        },

        connect() { Lampa.Torserver.connected(() => { this.getHash(); }, () => { Lampa.Torserver.error(); }); },

        getHash() {
            const data = { title: this.state.object.title, link: this.state.object.MagnetUri || this.state.object.Link, poster: this.state.object.poster, data: { lampa: true, movie: this.state.movie } };
            Lampa.Torserver.hash(data, (json) => { this.state.hash = json.hash; this.pollFiles(); }, (echo) => {
                const type = Lampa.Storage.field('parser_torrent_type');
                const tpl = Lampa.Template.get('torrent_nohash', { title: Lampa.Lang.translate('title_error'), text: Lampa.Lang.translate('torrent_parser_no_hash'), url: data.link, echo: echo });
                if (type === 'jackett') tpl.find('.is--torlook').remove(); else tpl.find('.is--jackett').remove();
                Lampa.Modal.update(tpl);
            });
        },

        pollFiles() {
            let attempts = 0;
            this.state.timers.files = setInterval(() => {
                attempts++;
                Lampa.Torserver.files(this.state.hash, (json) => { if (json.file_stats) { clearInterval(this.state.timers.files); this.showFiles(json.file_stats); } });
                if (attempts >= CONSTANTS.MAX_ATTEMPTS) { clearInterval(this.state.timers.files); this.showError(Lampa.Lang.translate('torrent_parser_timeout')); this.close(); }
            }, 1000);
        },

        showFiles(files) {
            const audioFiles = [];
            const coversMap = {};
            files.forEach(file => {
                const ext = FileUtils.getExt(file.path);
                const dir = FileUtils.getDir(file.path);
                if (CONSTANTS.AUDIO_FORMATS.has(ext)) audioFiles.push(file);
                else if (CONSTANTS.IMAGE_FORMATS.has(ext)) {
                    const fname = FileUtils.getFilename(file.path);
                    if (!coversMap[dir] || FileUtils.isPriorityCover(fname)) coversMap[dir] = file;
                }
            });
            if (audioFiles.length === 0) { this.showError('Аудио файлы не найдены'); return; }
            audioFiles.forEach(file => { const dir = FileUtils.getDir(file.path); if (coversMap[dir]) file.cover_file = coversMap[dir]; });
            audioFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
            const plays = Lampa.Torserver.clearFileName(audioFiles);
            this.renderList(plays, { movie: this.state.movie || {}, files: audioFiles });
        },

        renderList(items, params) {
            const playlist = [];
            let scrollToElement;
            let firstItem;
            Lampa.Listener.send('torrent_file', { type: 'list_open', items: items });
            const fragment = document.createDocumentFragment();
            let currentFolder = '';

            items.forEach(element => {
                const coverUrl = element.cover_file ? Lampa.Torserver.stream(element.cover_file.path, this.state.hash, element.cover_file.id) : './img/img_broken.svg';
                element.title = element.path_human;
                element.first_title = params.movie.name || params.movie.title;
                element.size = FileUtils.bytesToSize(element.length);
                element.url = Lampa.Torserver.stream(element.path, this.state.hash, element.id);
                element.torrent_hash = this.state.hash;
                element.img = coverUrl;
                element.from_music_search = true;
                if (params.movie.title) element.title = params.movie.title;
                element.title = (element.fname || element.title).replace(/<[^>]*>?/gm, '');

                const item = Lampa.Template.get('torrent_file', element);
                
                // Сохраняем URL в DOM элементе для последующего поиска
                item.data('url', element.url);
                
                item[0].visibility = 'hidden';
                playlist.push(element);
                this.bindItemEvents(item, element, playlist, params);

                if (element.folder_name && element.folder_name !== currentFolder) {
                    const folderDiv = document.createElement('div');
                    folderDiv.className = 'torrnet-folder-name' + (currentFolder ? '' : ' selector');
                    folderDiv.innerText = element.folder_name;
                    fragment.appendChild(folderDiv);
                    currentFolder = element.folder_name;
                }
                fragment.appendChild(item[0]);
                if (!firstItem) firstItem = item;
            });

            const container = $('<div class="torrent-files"></div>');
            Lampa.Modal.title(Lampa.Lang.translate('title_files'));
            container[0].appendChild(fragment);
            if (playlist.length === 1 && firstItem) this.autostart(firstItem);
            Lampa.Modal.update(container);
            if (firstItem) Lampa.Controller.collectionFocus(firstItem, Lampa.Modal.scroll().render());
        },

        bindItemEvents(item, element, playlist, params) {
            item.on('hover:enter', () => {
                this.stopAutostart();
                
                if (params.movie.id) Lampa.Favorite.add('history', params.movie, 100);
                if (playlist.length > 1) element.playlist = playlist.map(elem => ({...elem, from_music_search: true}));
                this.preload(element, () => {
                    Lampa.Player.play(element);
                    if (Lampa.Storage.get('player_music_torrent', 'html5') !== 'html5') {
                        Lampa.Player.playlist(playlist);
                        Lampa.Player.callback(() => Lampa.Controller.toggle('modal'));
                        Lampa.Player.stat(element.url);
                    }
                    if (this.state.callback) { this.state.callback(); this.state.callback = false; }
                });
            }).on('hover:long', () => { this.showMenu(item, element); }).on('visible', () => {
                const img = item.find('img');
                img[0].onload = () => img.addClass('loaded');
                img[0].src = img.attr('data-src');
            });
        },
        
        syncFocus(url) {
            // Находим элемент в списке, соответствующий URL
            if (!url) return;
            
            // Находим элемент с data-url, но нужно учитывать, что URL мог измениться (preload/play)
            // Поэтому ищем по частичному совпадению или очищенному URL
            const cleanUrl = url.replace('&preload', '').replace('&play', '').replace('&stat', '');
            
            const items = $('.torrent-item');
            let target = null;
            
            items.each((i, el) => {
                const elUrl = $(el).data('url');
                if (elUrl && elUrl.indexOf(cleanUrl) > -1) {
                    target = el;
                    return false; // break
                }
            });
            
            if (target) {
                Lampa.Controller.toggle('content'); 
                Lampa.Controller.collectionFocus(target, Lampa.Modal.scroll().render());
            }
        },

        preload(data, run) {
            const needPreload = Lampa.Torserver.ip() && data.url.includes(Lampa.Torserver.ip()) && data.url.includes('&preload');
            if (!needPreload) return run();
            const network = new Lampa.Reguest();
            let checkInterval;
            Lampa.Loading.start(() => { clearInterval(checkInterval); network.clear(); Lampa.Loading.stop(); });
            const check = (first = false) => {
                network.timeout(2000);
                const url = first ? data.url : data.url.replace('preload', 'stat').replace('play', 'stat');
                network.silent(url, (res) => {
                    if (typeof res !== 'object' || res === null) { Lampa.Loading.stop(); clearInterval(checkInterval); run(); return; }
                    const pb = res.preloaded_bytes || 0;
                    const ps = res.preload_size || 1;
                    const progress = Math.min(100, pb * 100 / ps);
                    if (progress >= 95 || isNaN(progress)) { Lampa.Loading.stop(); clearInterval(checkInterval); run(); }
                    else { Lampa.Loading.setText(`${Math.round(progress)}% - ${res.download_speed ? FileUtils.bytesToSize(res.download_speed * 8, true) : '0.0'}`); }
                }, () => { Lampa.Loading.stop(); clearInterval(checkInterval); run(); });
            };
            checkInterval = setInterval(() => check(), 1000);
            check(true);
        },

        autostart(item) {
            const start = Date.now();
            const div = $('<div class="torrent-serial__progress"></div>');
            item.prepend(div);
            this.state.autostart_progress = div;
            this.state.autostart_timer = setInterval(() => {
                const diff = (Date.now() - start) / 1000;
                div.css('height', Math.round(diff / 10 * 100) + '%');
                if (diff > 10) { this.stopAutostart(); item.trigger('hover:enter'); }
            }, 100);
            const stopHandler = () => { this.stopAutostart(); Lampa.Keypad.listener.remove('keydown', stopHandler); };
            Lampa.Keypad.listener.follow('keydown', stopHandler);
        },

        stopAutostart() { clearInterval(this.state.autostart_timer); if (this.state.autostart_progress) { this.state.autostart_progress.remove(); this.state.autostart_progress = null; } },

        showMenu(item, element) {
            this.stopAutostart();
            const enabled = Lampa.Controller.enabled().name;
            Lampa.Select.show({
                title: Lampa.Lang.translate('title_action'),
                items: [
                    { title: Lampa.Lang.translate('time_reset'), timeclear: true },
                    { title: Lampa.Lang.translate('player_lauch') + ' - Lampa', player: 'lampa' },
                    { title: Lampa.Lang.translate('copy_link'), link: true }
                ],
                onBack: () => Lampa.Controller.toggle(enabled),
                onSelect: (a) => {
                    if (a.link) Lampa.Utils.copyTextToClipboard(element.url.replace('&preload', '&play'), () => Lampa.Noty.show(Lampa.Lang.translate('copy_secuses')), () => Lampa.Noty.show(Lampa.Lang.translate('copy_error')));
                    Lampa.Controller.toggle(enabled);
                    if (a.player) { Lampa.Player.runas(a.player); item.trigger('hover:enter'); }
                }
            });
        },

        loading() { Lampa.Modal.open({ title: '', html: Lampa.Template.get('modal_loading'), size: 'large', mask: true, onBack: () => { Lampa.Modal.close(); this.close(); } }); },
        install() { Lampa.Modal.open({ title: '', html: Lampa.Template.get('torrent_install', {}), size: 'large', onBack: () => { Lampa.Modal.close(); Lampa.Controller.toggle('content'); } }); },
        showError(text) { Lampa.Modal.update(Lampa.Template.get('error', { title: Lampa.Lang.translate('title_error'), text: text })); },
        close() {
            if (this.state.hash) { Lampa.Torserver.drop(this.state.hash); Lampa.Torserver.clear(); }
            clearInterval(this.state.timers.files);
            this.stopAutostart();
            if (this.state.callback_back) this.state.callback_back();
            else Lampa.Controller.toggle('content');
            this.state.callback_back = false;
            this.state.object = null;
            this.state.hash = null;
            Lampa.Listener.send('torrent_file', { type: 'list_close' });
        }
    };

    // ========================================================================
    // 6. ОСНОВНОЙ КОМПОНЕНТ
    // ========================================================================

    function component(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var results = [];
        var filtered = [];
        var total_pages = 1;
        var last;
        var initialized = false;
        var filterTimeout;
        var filter_items = { quality: [Lampa.Lang.translate('torrent_parser_any_one'), '4k', '1080p', '720p'], tracker: [Lampa.Lang.translate('torrent_parser_any_two')], year: [], format: [Lampa.Lang.translate('torrent_parser_any_two')] };
        
        filter_items.year.push(Lampa.Lang.translate('torrent_parser_any_two'));
        var y = new Date().getFullYear();
        for (var i = 0; i < 50; i++) filter_items.year.push((y - i).toString());
        
        scroll.minus(files.render().find('.explorer__files-head'));
        scroll.body().addClass('torrent-list');

        this.create = function () { return this.render(); };
        this.initialize = function () { this.activity.loader(true); this.parse(); scroll.onEnd = this.next.bind(this); return this.render(); };
        this.parse = async function () {
            var _this = this;
            try {
                var searchQuery = object.query || object.search || (object.movie ? (object.movie.original_title || object.movie.title) : '');
                if (!searchQuery) throw new Error('Empty Search Query');
                var cacheKey = CacheManager.getSearchKey({ search: searchQuery, type: Lampa.Storage.field('parser_torrent_type') });
                var data = CacheManager.getSearch(cacheKey);
                if (!data) {
                    data = await ApiClient.get({ search: searchQuery, movie: object.movie, other: true, from_search: true });
                    CacheManager.setSearch(cacheKey, data);
                }
                results = data;
                this.build();
                Lampa.Layer.update(scroll.render(true));
                this.activity.loader(false);
                this.activity.toggle();
            } catch (e) {
                console.error('[MusicSearch] Error:', e);
                this.empty(Lampa.Lang.translate('torrent_error_connect') + ': ' + (e.message || e));
            }
            filter.onSearch = function (value) { Lampa.Activity.replace({ search: value, clarification: true }); };
            filter.onBack = function () { _this.start(); };
            filter.addButtonBack();
            files.appendHead(filter.render());
        };

        this.build = function() {
            var trackers = new Set();
            var formats = new Set(['MP3', 'FLAC', 'WAV', 'AAC', 'ALAC', 'DSD', 'SACD', 'APE', 'DTS', 'AC3']);
            var foundFormats = new Set();
            results.Results.forEach(function(el) {
                el.Tracker.split(',').forEach(function(t){ trackers.add(t.trim()); });
                var title = el.Title.toUpperCase();
                formats.forEach(function(f){ if(title.includes(f)) foundFormats.add(f); });
                if(title.includes('320')) foundFormats.add('MP3');
            });
            filter_items.tracker = [filter_items.tracker[0]].concat(Array.from(trackers));
            filter_items.format = [filter_items.format[0]].concat(Array.from(foundFormats));
            this.buildSorted();
            this.buildFiltered();
            this.applyFilter();
        };
        
        this.buildSorted = function() {
             var current = Lampa.Storage.get('torrents_sort', 'Seeders');
             var map = { Seeders: 'torrent_parser_sort_by_seeders', Size: 'torrent_parser_sort_by_size', Title: 'torrent_parser_sort_by_name', Tracker: 'torrent_parser_sort_by_tracker', PublisTime: 'torrent_parser_sort_by_date', viewed: 'torrent_parser_sort_by_viewed' };
             var sortItems = Object.keys(map).map(function(k) { return { title: Lampa.Lang.translate(map[k]), sort: k, selected: k === current }; });
             filter.set('sort', sortItems);
             filter.chosen('sort', [Lampa.Lang.translate(map[current])]);
        };

        this.buildFiltered = function() {
            var _this = this;
            var data = this.getFilterData();
            var select = [];
            var add = function(type, title) {
                var value = data[type];
                var isMulti = ['quality', 'tracker', 'format'].indexOf(type) > -1;
                if(isMulti && !Array.isArray(value)) value = [];
                var items = filter_items[type].map(function(name, i) { return { title: name, checked: isMulti && value.indexOf(name) > -1, checkbox: isMulti && i > 0, noselect: true, index: i }; });
                select.push({ title: title, subtitle: isMulti ? (value.length ? value.join(', ') : items[0].title) : (items[value] ? items[value].title : items[0].title), items: items, noselect: true, stype: type });
            };
            select.push({ title: Lampa.Lang.translate('torrent_parser_reset'), reset: true });
            add('format', 'Format');
            add('tracker', Lampa.Lang.translate('torrent_parser_tracker'));
            add('year', Lampa.Lang.translate('torrent_parser_year'));
            filter.set('filter', select);
            filter.onSelect = function(type, a, b) {
                if (type === 'sort') { Lampa.Storage.set('torrents_sort', a.sort); _this.applyFilter(); } else {
                    if (a.reset) { _this.setFilterData({}); _this.buildFiltered(); } else { a.items.forEach(function(n){ n.checked = false; }); var d = _this.getFilterData(); d[a.stype] = ['quality', 'tracker', 'format'].indexOf(a.stype) > -1 ? [] : b.index; _this.setFilterData(d); _this.buildFiltered(); }
                    _this.applyFilter();
                    _this.start();
                }
            };
            filter.onCheck = function(type, a, b) {
                var d = _this.getFilterData(); var c = d[a.stype] || []; if (!Array.isArray(c)) c = [];
                if (b.checked) { if(c.indexOf(b.title) < 0) c.push(b.title); } else { c = c.filter(function(t){ return t !== b.title; }); }
                d[a.stype] = c; _this.setFilterData(d); _this.buildFiltered(); _this.applyFilter();
            };
        };
        
        this.getFilterData = function() { var all = Lampa.Storage.cache('torrents_filter_data', 500, {}); var key = object.movie.id + ':' + (object.movie.number_of_seasons ? 'tv' : 'movie'); return all[key] || {}; };
        this.setFilterData = function(data) { var all = Lampa.Storage.cache('torrents_filter_data', 500, {}); var key = object.movie.id + ':' + (object.movie.number_of_seasons ? 'tv' : 'movie'); all[key] = data; Lampa.Storage.set('torrents_filter_data', all); };
        this.applyFilter = function () { var _this = this; clearTimeout(filterTimeout); filterTimeout = setTimeout(function() { _this.doFilter(); _this.showResults(); }, 100); };
        this.doFilter = function() {
             var data = this.getFilterData();
             var hasFilter = Object.keys(data).some(function(k){ return Array.isArray(data[k]) ? data[k].length : data[k]; });
             filtered = results.Results.filter(function(el) {
                 if (!hasFilter) return true;
                 var title = el.Title.toLowerCase();
                 if (data.tracker && data.tracker.length) { var match = false; var et = el.Tracker.toLowerCase().split(','); data.tracker.forEach(function(t){ if(et.some(function(x){ return x.trim() == t.toLowerCase(); })) match = true; }); if (!match) return false; }
                 if (data.format && data.format.length) { var match = false; data.format.forEach(function(f){ if(title.includes(f.toLowerCase()) || (f == 'MP3' && title.includes('320'))) match = true; }); if(!match) return false; }
                 
                 // Логика фильтра по годам
                 if (data.year && data.year > 0) { if (title.indexOf(filter_items.year[data.year]) < 0) return false; }
                 
                 return true;
             });
             var field = Lampa.Storage.get('torrents_sort', 'Seeders');
             filtered.sort(function(a, b) { if (field == 'Title') return a.Title.localeCompare(b.Title); return (parseFloat(b[field]) || 0) - (parseFloat(a[field]) || 0); });
        };
        this.showResults = function() { scroll.clear(); object.page = 1; total_pages = Math.ceil(filtered.length / 20); if (filtered.length) { this.append(filtered.slice(0, 20)); } else { this.listEmpty(); } files.appendFiles(scroll.render()); };
        this.listEmpty = function() { var em = Lampa.Template.get('empty_filter'); var bn = $('<div class="simple-button selector"><span>' + Lampa.Lang.translate('filter_clarify') + '</span></div>'); bn.on('hover:enter', function() { filter.render().find('.filter--filter').trigger('hover:enter'); }); em.find('.empty-filter__buttons').removeClass('hide').append(bn); scroll.append(em); };
        this.append = function (items, append) {
            var _this = this;
            items.forEach(function (element) {
                var date = Lampa.Utils.parseTime(element.PublishDate);
                var bitrate = 0;
                if (object.movie && object.movie.runtime) bitrate = Lampa.Utils.calcBitrate(element.Size, object.movie.runtime);
                var item = Lampa.Template.get('torrent', { title: element.Title, date: date.full, tracker: element.Tracker, size: !isNaN(parseInt(element.Size)) ? Lampa.Utils.bytesToSize(element.Size) : element.size, seeds: element.Seeders, grabs: element.Peers, bitrate: bitrate });
                if (!bitrate) item.find('.bitrate').remove();
                if (element.viewed) item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_viewed', {}, true) + '</div>');
                if (!element.size || parseInt(element.size) === 0) item.find('.torrent-item__size').remove();
                item.on('hover:focus', function (e) { last = e.target; scroll.update($(e.target), true); Lampa.Helper.show('torrents', Lampa.Lang.translate('helper_torrents'), item); })
                    .on('hover:enter', function () {
                        CacheManager.addViewed(element.hash);
                        if (!item.find('.torrent-item__viewed').length) item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_viewed', {}, true) + '</div>');
                        if (element.reguest && !element.MagnetUri) { _this.loadMagnet(element); } else { element.poster = object.movie.img; _this.start(); TorrentController.start(element, object.movie); }
                    });
                scroll.append(item);
                if (append) Lampa.Controller.collectionAppend(item);
            });
        };
        this.next = function () { if (object.page < 15 && object.page < total_pages) { object.page++; var offset = (object.page - 1) * 20; this.append(filtered.slice(offset, offset + 20), true); } };
        this.loadMagnet = function(element) { Lampa.Modal.open({ title: '', html: Lampa.Template.get('modal_pending', { text: Lampa.Lang.translate('torrent_get_magnet') }), onBack: function() { Lampa.Modal.close(); ApiClient.clear(); } }); };
        this.empty = function (descr) { var empty = new Lampa.Empty({ descr: descr }); files.render().find('.explorer__files-head').addClass('hide'); files.appendFiles(empty.render(filter.empty())); this.start = empty.start; this.activity.loader(false); this.activity.toggle(); };
        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            if (!initialized) { initialized = true; this.initialize(); }
            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
            Lampa.Controller.add('content', {
                toggle: function () { Lampa.Controller.collectionSet(scroll.render(), files.render(true)); Lampa.Controller.collectionFocus(last || false, scroll.render(true)); },
                up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
                down: function () { Navigator.move('down'); },
                right: function () { if (Navigator.canmove('right')) Navigator.move('right'); else filter.render().find('.filter--filter').trigger('hover:enter'); },
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };
        this.pause = function () {}; this.stop = function () {}; this.render = function () { return files.render(); };
        this.destroy = function () { network.clear(); files.destroy(); scroll.destroy(); results = null; };
    }

    function startPlugin() {
        var MANIFEST = { type: 'other', version: '2.4', name: 'Music Search Native', description: 'Audio & Covers + Native Lampa Navigation', component: 'lmeMusicSearch' };
        var PLAYER_STATE = { spoofed: false, original_platform: null };
        Lampa.Component.add(MANIFEST.component, component);
        window.Lampa.Torrent = { 
            start: (el, m) => TorrentController.start(el, m), 
            open: (h, m) => TorrentController.open(h, m), 
            opened: (c) => TorrentController.state.callback = c, 
            back: (c) => TorrentController.state.callback_back = c,
            syncFocus: (url) => TorrentController.syncFocus(url)
        };
        
        function hookPlayer() {
            var original_play = Lampa.Player.play;
            var original_platform_is = Lampa.Platform.is;
            Lampa.Player.listener.follow('destroy', function() { if (PLAYER_STATE.spoofed) { Lampa.Platform.is = PLAYER_STATE.original_platform; PLAYER_STATE.spoofed = false; PLAYER_STATE.original_platform = null; } });
            Lampa.Player.play = function (object) {
                var playerMode = Lampa.Storage.get('player_music_torrent', 'html5');
                if (object && object.from_music_search) {
                     if (playerMode === 'html5') { HTML5AudioPlayer.play(object); if (object.playlist) HTML5AudioPlayer.setPlaylist(object.playlist); return; }
                     if (playerMode === 'inner' && (Lampa.Platform.is('android') || PLAYER_STATE.spoofed)) {
                        if (!PLAYER_STATE.spoofed) { PLAYER_STATE.original_platform = original_platform_is; PLAYER_STATE.spoofed = true; Lampa.Platform.is = function(what) { return what === 'android' ? false : PLAYER_STATE.original_platform(what); }; }
                        if (object.url) object.url = object.url.replace('intent:', 'http:');
                    }
                }
                original_play(object);
            };
        }

        function addSettings() { Lampa.SettingsApi.addParam({ component: 'player', param: { name: 'player_music_torrent', type: 'select', values: { 'android': 'Android (Ext)', 'inner': 'Lampa (Int)', 'html5': 'HTML5 Audio' }, default: 'html5' }, field: { name: 'Плеер для музыки', description: 'Выберите плеер для воспроизведения торрентов из Music Search' }, onChange: function(value) { Lampa.Storage.set('player_music_torrent', value); } }); }
        
        function addMenuButton() {
            var btn = $('<li class="menu__item selector"><div class="menu__ico"><svg width="60" height="60" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div><div class="menu__text">' + MANIFEST.name + '</div></li>');
            btn.on('hover:enter', function() { Lampa.Activity.push({ url: '', title: MANIFEST.name, component: MANIFEST.component, search: 'Metallica', from_search: true, noinfo: true, movie: { title: '', original_title: '', img: './img/img_broken.svg', genres: [] }, page: 1 }); });
            $('.menu .menu__list').eq(0).append(btn);
        }

        function init() { addMenuButton(); addSettings(); hookPlayer(); Lampa.Search.addSource({ title: Lampa.Lang.translate('title_parser'), search: async function(params, oncomplete) { try { var res = await ApiClient.get({ search: params.query, other: true, from_search: true }); res.title = Lampa.Lang.translate('title_parser'); res.results = res.Results.slice(0, 20); delete res.Results; res.results.forEach(function(el){ el.Title = Lampa.Utils.shortText(el.Title, 110); }); oncomplete(res.results.length ? [res] : []); } catch (e) { oncomplete([]); } }, onCancel: function() { ApiClient.clear(); }, params: { lazy: true, align_left: true, isparser: true, card_events: { onMenu: function(){} } }, onMore: function(params, close) { close(); Lampa.Activity.push({ url: '', title: Lampa.Lang.translate('title_torrents'), component: 'torrents', search: params.query, from_search: true, noinfo: true, movie: { title: params.query, original_title: '', img: './img/img_broken.svg', genres: [] }, page: 1 }); }, onSelect: function(params, close) { TorrentController.start(params.element, { title: params.element.Title }); TorrentController.state.callback_back = params.line.toggle.bind(params.line); } }); }
        if (window.appready) init(); else Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') init(); });
    }
    if (!window.lmeMusicSearch_ready) { window.lmeMusicSearch_ready = true; startPlugin(); }
})();
