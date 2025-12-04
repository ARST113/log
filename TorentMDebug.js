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
        getExt: (path) => path.toLowerCase().split('.').pop() || '',
        getDir: (path) => path.substring(0, path.lastIndexOf('/')),
        getFilename: (path) => path.split('/').pop().toLowerCase() || '',
        isPriorityCover: (fname) => ['cover', 'folder', 'front'].some(k => fname.includes(k)),
        bytesToSize: Lampa.Utils.bytesToSize,
        strToTime: Lampa.Utils.strToTime,
        hash: Lampa.Utils.hash
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
        
        getSearch(key) { 
            return this._search.get(key); 
        },
        
        setSearch(key, data) { 
            this._search.set(key, data); 
        },
        
        getViewed() { 
            return Lampa.Storage.cache('torrents_view', 5000, []); 
        },
        
        isViewed(hash) { 
            return this.getViewed().includes(hash); 
        },
        
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
                this.network.native(url, resolve, (a, c) => {
                    reject(new Error(`${Lampa.Lang.translate('torrent_parser_no_responce')} (${url})`));
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
            if (!params.search || params.search === 'undefined') {
                throw new Error('Empty search query');
            }
            
            const parsers = {
                jackett: () => this.jackett(params),
                prowlarr: () => this.prowlarr(params),
                torrserver: () => this.torrserver(params)
            };
            
            const parser = parsers[type];
            if (!parser) throw new Error('Unknown parser type');
            
            return await parser();
        },
        
        async jackett(params) {
            const baseUrl = this.checkUrl('jackett_url', 'Jackett');
            const apiKey = Lampa.Storage.field('jackett_key');
            const indexer = Lampa.Storage.field('jackett_interview') === 'healthy' ? 'status:healthy' : 'all';
            const url = `${baseUrl}/api/v2.0/indexers/${indexer}/results?apikey=${apiKey}&Category[]=3020&Category[]=3040&Category[]=100375&Query=${encodeURIComponent(params.search)}`;
            
            const json = await this.request(url);
            if (!json?.Results) throw new Error('Invalid Jackett response');
            
            return {
                Results: json.Results
                    .filter(item => item.TrackerId !== "toloka")
                    .map(item => ({
                        ...item,
                        PublisTime: FileUtils.strToTime(item.PublishDate),
                        hash: FileUtils.hash(item.Title),
                        viewed: CacheManager.isViewed(FileUtils.hash(item.Title)),
                        size: FileUtils.bytesToSize(item.Size)
                    }))
            };
        },
        
        async prowlarr(params) {
            const baseUrl = this.checkUrl('prowlarr_url', 'Prowlarr');
            const q = [
                { name: 'apikey', value: Lampa.Storage.field('prowlarr_key') },
                { name: 'query', value: params.search }
            ];
            const url = Lampa.Utils.buildUrl(baseUrl, '/api/v1/search', q);
            
            const json = await this.request(url);
            if (!Array.isArray(json)) throw new Error('Invalid Prowlarr response');
            
            return {
                Results: json
                    .filter(e => e.protocol === 'torrent')
                    .map(e => {
                        const hash = FileUtils.hash(e.title);
                        return {
                            Title: e.title,
                            Tracker: e.indexer,
                            size: FileUtils.bytesToSize(e.size),
                            PublishDate: FileUtils.strToTime(e.publishDate),
                            Seeders: parseInt(e.seeders) || 0,
                            Peers: parseInt(e.leechers) || 0,
                            MagnetUri: e.downloadUrl,
                            viewed: CacheManager.isViewed(hash),
                            hash: hash
                        };
                    })
            };
        },
        
        async torrserver(params) {
            const useLinkTwo = Lampa.Storage.field('torrserver_use_link') === 'two';
            const baseUrl = this.checkUrl(useLinkTwo ? 'torrserver_url_two' : 'torrserver_url', 'TorrServer');
            const url = Lampa.Utils.buildUrl(baseUrl, '/search/', [{ name: 'query', value: params.search }]);
            
            const json = await this.request(url);
            if (!Array.isArray(json)) throw new Error('Invalid TorrServer response');
            
            return {
                Results: json.map(e => {
                    const hash = FileUtils.hash(e.Title);
                    return {
                        Title: e.Title,
                        Tracker: e.Tracker,
                        size: e.Size,
                        PublishDate: FileUtils.strToTime(e.CreateDate),
                        Seeders: parseInt(e.Seed) || 0,
                        Peers: parseInt(e.Peer) || 0,
                        MagnetUri: e.Magnet,
                        viewed: CacheManager.isViewed(hash),
                        CategoryDesc: e.Categories,
                        bitrate: '-',
                        hash: hash
                    };
                })
            };
        },
        
        clear() { 
            this.network.clear(); 
        }
    };

    // ========================================================================
    // 4. HTML5 AUDIO PLAYER
    // ========================================================================

    class HTML5AudioPlayer {
        constructor() {
            this.media = null;
            this.playlist = [];
            this.current = 0;
            this.visible = false;
            this.errorCount = 0;
            this.retryCount = 0;
            this.isLooping = false;
            this.ui = null;
            this.previousController = null;
            this.destroying = false;
            
            this.media = this.createAudioElement();
            this.bindEvents();
        }
        
        createAudioElement() {
            const audio = document.createElement('audio');
            Object.assign(audio.style, {
                position: 'absolute',
                width: '1px',
                height: '1px',
                opacity: '0',
                pointerEvents: 'none'
            });
            audio.preload = 'auto';
            audio.autoplay = true;
            document.body.appendChild(audio);
            return audio;
        }
        
        bindEvents() {
            this.media.addEventListener('ended', this.handleEnded.bind(this));
            this.media.addEventListener('timeupdate', this.handleTimeUpdate.bind(this));
            this.media.addEventListener('loadeddata', this.handleLoadedData.bind(this));
            this.media.addEventListener('error', this.handleError.bind(this));
        }
        
        handleEnded() {
            this.errorCount = 0;
            this.retryCount = 0;
            
            if (this.isLooping) {
                this.media.currentTime = 0;
                this.media.play().catch(() => {});
            } else {
                this.next();
            }
        }
        
        handleTimeUpdate() {
            if (this.visible) this.updateUIState();
        }
        
        handleLoadedData() {
            this.errorCount = 0;
            this.retryCount = 0;
            if (this.visible) this.updateUIState();
        }
        
        handleError(e) {
            if (!this.media || this.destroying) return;
            
            const error = this.media.error;
            const msg = error ? `Error code: ${error.code}` : 'Unknown error';
            console.error('[MusicSearch] Audio error:', msg);
            
            if (this.retryCount < 1) {
                this.retryCount++;
                setTimeout(() => {
                    if (this.media && !this.destroying) {
                        this.media.load();
                        this.media.play().catch(() => {});
                    }
                }, 1000);
                return;
            }
            
            this.errorCount++;
            this.retryCount = 0;
            
            if (this.errorCount > 3) {
                Lampa.Noty.show('Too many playback errors');
                this.destroy();
            } else {
                Lampa.Noty.show(`Error: ${msg}. Skipping...`);
                setTimeout(() => this.next(), 1000);
            }
        }
        
        play(element) {
            if (this.destroying) return;
            
            let url = element.url.replace('preload', 'play');
            
            if (element.playlist_index !== undefined) {
                this.current = element.playlist_index;
            } else {
                const idx = this.playlist.findIndex(i => i.url === element.url);
                if (idx !== -1) this.current = idx;
            }
            
            this.retryCount = 0;
            this.media.src = url;
            this.media.load();
            
            const playPromise = this.media.play();
            if (playPromise) {
                playPromise.catch(e => {
                    if (e.name !== 'AbortError' && !this.destroying) {
                        console.error('Audio play error', e);
                    }
                });
            }
            
            if (!this.visible) {
                this.previousController = Lampa.Controller.enabled().name;
                this.showUI(element);
                this.bindController();
            } else {
                this.updateUITitle(element);
                this.updateUIState();
            }
        }
        
        setPlaylist(playlist) {
            this.playlist = playlist;
            this.errorCount = 0;
        }
        
        formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        
        updateUITitle(element) {
            if (!this.ui) return;
            
            this.ui.find('.music-title').text(element.title);
            this.ui.find('.music-bg, .music-cover').css('background-image', `url('${element.img}')`);
        }
        
        updateUIState() {
            if (!this.media || !this.ui || this.destroying) return;
            
            const cur = this.media.currentTime;
            const dur = this.media.duration || 0;
            
            this.ui.find('.music-time-text').text(`${this.formatTime(cur)} / ${this.formatTime(dur)}`);
            
            const percent = dur > 0 ? (cur / dur) * 100 : 0;
            this.ui.find('.music-progress-current').css('width', `${percent}%`);
            
            const path = this.media.paused 
                ? "M8 5v14l11-7z" 
                : "M6 19h4V5H6v14zm8-14v14h4V5h-4z";
            this.ui.find('.btn-play svg path').attr('d', path);
        }
        
        showUI(element) {
            const img = element.img || './img/img_broken.svg';
            
            const css = `
                .music-player-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                    z-index: 10000; background: #111; 
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                }
                .music-bg, .music-cover {
                    background-size: cover; background-position: center;
                }
                .music-bg {
                    position: absolute; width: 100%; height: 100%;
                    opacity: 0.2; filter: blur(30px); z-index: -1;
                }
                .music-cover {
                    width: 35vh; height: 35vh; background: #333; 
                    border-radius: 10px; margin-bottom: 3vh;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
                }
                .music-info {
                    text-align: center; margin-bottom: 2vh; width: 80%;
                }
                .music-title {
                    font-size: 3vh; font-weight: bold; margin-bottom: 1vh; color: #fff;
                }
                .music-time-text {
                    font-size: 2vh; color: #aaa; font-family: monospace; margin-bottom: 2vh;
                }
                .music-progress-wrap {
                    width: 60%; height: 24px; cursor: pointer; margin-bottom: 4vh;
                    position: relative; display: flex; align-items: center;
                    border: 2px solid transparent; border-radius: 4px; padding: 0 5px;
                    transition: all 0.2s;
                }
                .music-progress-wrap.focus {
                    border-color: #fff; background: rgba(255,255,255,0.1);
                }
                .music-progress-bg {
                    width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px;
                }
                .music-progress-current {
                    width: 0%; height: 4px; background: #4b8; border-radius: 2px; position: relative;
                }
                .music-progress-handle {
                    width: 12px; height: 12px; background: #fff; border-radius: 50%;
                    position: absolute; right: -6px; top: -4px;
                    box-shadow: 0 0 5px rgba(0,0,0,0.5); transform: scale(0); transition: transform 0.2s;
                }
                .music-progress-wrap.focus .music-progress-handle {
                    transform: scale(1.2);
                }
                .music-controls {
                    display: flex; align-items: center; gap: 20px;
                }
                .music-btn {
                    width: 60px; height: 60px; border-radius: 50%;
                    background: rgba(255,255,255,0.1); display: flex;
                    align-items: center; justify-content: center;
                    transition: all 0.2s; border: 3px solid transparent;
                    cursor: pointer;
                }
                .music-btn svg {
                    width: 24px; height: 24px; fill: #fff;
                }
                .music-btn.focus, .music-btn:hover {
                    background: #fff; transform: scale(1.1);
                    box-shadow: 0 0 20px rgba(255,255,255,0.3);
                }
                .music-btn.focus svg, .music-btn:hover svg {
                    fill: #000;
                }
                .music-btn.btn-loop.active svg {
                    fill: #4b8;
                }
                .music-btn.btn-loop.active.focus svg {
                    fill: #4b8;
                }
                .music-btn-play {
                    width: 80px; height: 80px; background: #4b8;
                }
                .music-btn-play svg {
                    width: 32px; height: 32px;
                }
            `;
            
            if (!$('#music-player-style').length) {
                $('body').append(`<style id="music-player-style">${css}</style>`);
            }
            
            $('.music-player-overlay').remove();
            
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
                        <div class="music-btn btn-loop selector ${this.isLooping ? 'active' : ''}" data-action="loop">
                            <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                        </div>
                        <div class="music-btn btn-prev selector" data-action="prev"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></div>
                        <div class="music-btn music-btn-play btn-play selector" data-action="play"><svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg></div>
                        <div class="music-btn btn-next selector" data-action="next"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></div>
                        <div class="music-btn btn-close selector" data-action="close"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></div>
                    </div>
                    <div style="margin-top: 30px; color: #555; font-size: 1.5vh;">VOL: UP/DOWN</div>
                </div>
            `);
            
            $('body').append(html);
            this.ui = html;
            this.visible = true;
            
            html.find('.selector').on('click', this.handleClick.bind(this))
                .on('mouseenter', this.handleMouseEnter.bind(this));
        }
        
        handleClick(e) {
            const action = $(e.currentTarget).data('action');
            
            if (action === 'seek') {
                if (!this.media || !this.media.duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                this.media.currentTime = pos * this.media.duration;
            } else {
                this.executeAction(action);
            }
        }
        
        handleMouseEnter(e) {
            if (this.visible && window.Lampa?.Navigator?.focused) {
                window.Lampa.Navigator.focused(e.currentTarget);
            }
        }
        
        executeAction(action) {
            const actions = {
                prev: () => this.prev(),
                next: () => this.next(),
                play: () => this.togglePlay(),
                loop: () => this.toggleLoop(),
                close: () => this.destroy()
            };
            
            const handler = actions[action];
            if (handler) handler();
        }
        
        bindController() {
            Lampa.Controller.add('html5_player', {
                toggle: () => {
                    Lampa.Controller.collectionSet(this.ui);
                    Lampa.Controller.collectionFocus(this.ui.find('.btn-play')[0], this.ui);
                },
                up: () => Navigator.canmove('up') ? Navigator.move('up') : this.vol(0.1),
                down: () => Navigator.canmove('down') ? Navigator.move('down') : this.vol(-0.1),
                left: () => this.isSeekFocused() ? this.seek(-10) : Navigator.move('left'),
                right: () => this.isSeekFocused() ? this.seek(10) : Navigator.move('right'),
                enter: () => {
                    const el = this.ui.find('.focus');
                    if (el.length) el.trigger('click');
                },
                back: () => this.destroy()
            });
            
            Lampa.Controller.toggle('html5_player');
        }
        
        isSeekFocused() {
            return this.ui?.find('.focus').hasClass('music-progress-wrap') || false;
        }
        
        toggleLoop() {
            this.isLooping = !this.isLooping;
            if (this.ui) this.ui.find('.btn-loop').toggleClass('active', this.isLooping);
            Lampa.Noty.show(`Repeat: ${this.isLooping ? 'On' : 'Off'}`);
        }
        
        seek(sec) {
            if (!this.media) return;
            this.media.currentTime += sec;
        }
        
        vol(diff) {
            if (!this.media || this.destroying) return;
            const newVolume = Math.max(0, Math.min(1, this.media.volume + diff));
            this.media.volume = newVolume;
            Lampa.Noty.show(`Volume: ${Math.round(newVolume * 100)}%`);
        }
        
        togglePlay() {
            if (!this.media || this.destroying) return;
            
            if (this.media.paused) {
                this.media.play().catch(() => {});
            } else {
                this.media.pause();
            }
            
            this.updateUIState();
        }
        
        next() {
            if (this.destroying) return;
            
            if (this.current < this.playlist.length - 1) {
                this.current++;
                this.play(this.playlist[this.current]);
            } else {
                Lampa.Noty.show('Playlist ended');
                this.destroy();
            }
        }
        
        prev() {
            if (this.destroying) return;
            
            if (this.current > 0) {
                this.current--;
                this.play(this.playlist[this.current]);
            }
        }
        
        destroy() {
            if (this.destroying) return;
            this.destroying = true;
            this.visible = false;
            
            if (this.media) {
                this.media.pause();
                this.media.src = '';
                this.media.load();
                this.media.remove();
                this.media = null;
            }
            
            if (this.ui) {
                this.ui.find('.selector').off('click mouseenter');
                this.ui.remove();
                this.ui = null;
            }
            
            if (this.previousController && Lampa.Controller.enabled().name === 'html5_player') {
                Lampa.Controller.toggle(this.previousController);
            } else {
                Lampa.Controller.toggle('content');
            }
            
            this.destroying = false;
        }
    }

    const audioPlayer = new HTML5AudioPlayer();

    // ========================================================================
    // 5. КОНТРОЛЛЕР ТОРРЕНТА
    // ========================================================================

    const TorrentController = {
        state: {
            object: null,
            movie: null,
            hash: null,
            last_item: null,
            callback: null,
            callback_back: null,
            timers: {},
            autostart_timer: null,
            autostart_progress: null
        },
        
        start(element, movie) {
            this.state.object = element;
            this.state.movie = movie || { title: element.Title || 'Unknown' };
            
            if (Lampa.Platform.is('android') && !Lampa.Storage.field('internal_torrclient')) {
                Lampa.Android.openTorrent(this.state);
                if (movie?.id) Lampa.Favorite.add('history', movie, 100);
                if (this.state.callback) this.state.callback();
            } else if (Lampa.Torserver.url()) {
                this.loading();
                this.connect();
            } else {
                this.install();
            }
        },
        
        connect() {
            Lampa.Torserver.connected(() => this.getHash(), () => Lampa.Torserver.error());
        },
        
        getHash() {
            const data = {
                title: this.state.object.title,
                link: this.state.object.MagnetUri || this.state.object.Link,
                poster: this.state.object.poster,
                data: { lampa: true, movie: this.state.movie }
            };
            
            Lampa.Torserver.hash(data, 
                (json) => {
                    this.state.hash = json.hash;
                    this.pollFiles();
                },
                (echo) => {
                    const type = Lampa.Storage.field('parser_torrent_type');
                    const tpl = Lampa.Template.get('torrent_nohash', {
                        title: Lampa.Lang.translate('title_error'),
                        text: Lampa.Lang.translate('torrent_parser_no_hash'),
                        url: data.link,
                        echo: echo
                    });
                    
                    if (type === 'jackett') {
                        tpl.find('.is--torlook').remove();
                    } else {
                        tpl.find('.is--jackett').remove();
                    }
                    
                    Lampa.Modal.update(tpl);
                }
            );
        },
        
        pollFiles() {
            let attempts = 0;
            
            this.state.timers.files = setInterval(() => {
                attempts++;
                Lampa.Torserver.files(this.state.hash, (json) => {
                    if (json.file_stats) {
                        clearInterval(this.state.timers.files);
                        this.showFiles(json.file_stats);
                    }
                });
                
                if (attempts >= CONSTANTS.MAX_ATTEMPTS) {
                    clearInterval(this.state.timers.files);
                    this.showError(Lampa.Lang.translate('torrent_parser_timeout'));
                    this.close();
                }
            }, 1000);
        },
        
        showFiles(files) {
            const audioFiles = [];
            const coversMap = new Map();
            
            files.forEach(file => {
                const ext = FileUtils.getExt(file.path);
                const dir = FileUtils.getDir(file.path);
                
                if (CONSTANTS.AUDIO_FORMATS.has(ext)) {
                    audioFiles.push(file);
                } else if (CONSTANTS.IMAGE_FORMATS.has(ext)) {
                    const fname = FileUtils.getFilename(file.path);
                    const currentCover = coversMap.get(dir);
                    
                    if (!currentCover || FileUtils.isPriorityCover(fname)) {
                        coversMap.set(dir, file);
                    }
                }
            });
            
            if (audioFiles.length === 0) {
                this.showError('Аудио файлы не найдены');
                return;
            }
            
            audioFiles.forEach(file => {
                const dir = FileUtils.getDir(file.path);
                if (coversMap.has(dir)) {
                    file.cover_file = coversMap.get(dir);
                }
            });
            
            audioFiles.sort((a, b) => 
                a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' })
            );
            
            const plays = Lampa.Torserver.clearFileName(audioFiles);
            this.renderList(plays, { movie: this.state.movie || {}, files: audioFiles });
        },
        
        renderList(items, params) {
            const playlist = [];
            let firstItem = null;
            
            Lampa.Listener.send('torrent_file', { type: 'list_open', items });
            
            const fragment = document.createDocumentFragment();
            let currentFolder = '';
            
            items.forEach(element => {
                const coverUrl = element.cover_file 
                    ? Lampa.Torserver.stream(element.cover_file.path, this.state.hash, element.cover_file.id)
                    : './img/img_broken.svg';
                
                Object.assign(element, {
                    title: element.path_human,
                    first_title: params.movie.name || params.movie.title,
                    size: FileUtils.bytesToSize(element.length),
                    url: Lampa.Torserver.stream(element.path, this.state.hash, element.id),
                    torrent_hash: this.state.hash,
                    img: coverUrl,
                    from_music_search: true
                });
                
                if (params.movie.title) {
                    element.title = params.movie.title;
                }
                
                element.title = (element.fname || element.title).replace(/<[^>]*>/g, '');
                
                const item = Lampa.Template.get('torrent_file', element);
                item.data('url', element.url);
                item[0].visibility = 'hidden';
                
                playlist.push(element);
                this.bindItemEvents(item, element, playlist, params);
                
                if (element.folder_name && element.folder_name !== currentFolder) {
                    const folderDiv = document.createElement('div');
                    folderDiv.className = `torrnet-folder-name${currentFolder ? '' : ' selector'}`;
                    folderDiv.textContent = element.folder_name;
                    fragment.appendChild(folderDiv);
                    currentFolder = element.folder_name;
                }
                
                fragment.appendChild(item[0]);
                if (!firstItem) firstItem = item;
            });
            
            const container = $('<div class="torrent-files"></div>');
            Lampa.Modal.title(Lampa.Lang.translate('title_files'));
            container[0].appendChild(fragment);
            
            if (playlist.length === 1 && firstItem) {
                this.autostart(firstItem);
            }
            
            Lampa.Modal.update(container);
            
            if (firstItem) {
                Lampa.Controller.collectionFocus(firstItem, Lampa.Modal.scroll().render());
            }
        },
        
        bindItemEvents(item, element, playlist, params) {
            item.on('hover:enter', () => {
                this.stopAutostart();
                this.state.last_item = item[0];
                
                if (params.movie?.id) {
                    Lampa.Favorite.add('history', params.movie, 100);
                }
                
                if (playlist.length > 1) {
                    element.playlist = playlist.map(elem => ({...elem, from_music_search: true}));
                }
                
                this.preload(element, () => {
                    Lampa.Player.play(element);
                    
                    if (Lampa.Storage.get('player_music_torrent', 'html5') !== 'html5') {
                        Lampa.Player.playlist(playlist);
                        Lampa.Player.callback(() => Lampa.Controller.toggle('modal'));
                        Lampa.Player.stat(element.url);
                    }
                    
                    if (this.state.callback) {
                        this.state.callback();
                        this.state.callback = false;
                    }
                });
            })
            .on('hover:long', () => this.showMenu(item, element))
            .on('visible', () => {
                const img = item.find('img');
                img[0].onload = () => img.addClass('loaded');
                img[0].src = img.attr('data-src');
            });
        },
        
        preload(data, run) {
            const needPreload = Lampa.Torserver.ip() && 
                data.url.includes(Lampa.Torserver.ip()) && 
                data.url.includes('&preload');
            
            if (!needPreload) return run();
            
            const network = new Lampa.Reguest();
            let checkInterval;
            
            Lampa.Loading.start(() => {
                clearInterval(checkInterval);
                network.clear();
                Lampa.Loading.stop();
            });
            
            const check = (first = false) => {
                network.timeout(2000);
                const url = first ? data.url : data.url.replace('preload', 'stat').replace('play', 'stat');
                
                network.silent(url, (res) => {
                    if (typeof res !== 'object' || res === null) {
                        Lampa.Loading.stop();
                        clearInterval(checkInterval);
                        run();
                        return;
                    }
                    
                    const pb = res.preloaded_bytes || 0;
                    const ps = res.preload_size || 1;
                    const progress = Math.min(100, (pb * 100) / ps);
                    
                    if (progress >= 95 || isNaN(progress)) {
                        Lampa.Loading.stop();
                        clearInterval(checkInterval);
                        run();
                    } else {
                        const speed = res.download_speed ? FileUtils.bytesToSize(res.download_speed * 8, true) : '0.0';
                        Lampa.Loading.setText(`${Math.round(progress)}% - ${speed}`);
                    }
                }, () => {
                    Lampa.Loading.stop();
                    clearInterval(checkInterval);
                    run();
                });
            };
            
            checkInterval = setInterval(check, 1000);
            check(true);
        },
        
        autostart(item) {
            const start = Date.now();
            const div = $('<div class="torrent-serial__progress"></div>');
            item.prepend(div);
            this.state.autostart_progress = div;
            
            this.state.autostart_timer = setInterval(() => {
                const diff = (Date.now() - start) / 1000;
                div.css('height', `${Math.round((diff / 10) * 100)}%`);
                
                if (diff > 10) {
                    this.stopAutostart();
                    item.trigger('hover:enter');
                }
            }, 100);
            
            const stopHandler = () => {
                this.stopAutostart();
                Lampa.Keypad.listener.remove('keydown', stopHandler);
            };
            
            Lampa.Keypad.listener.follow('keydown', stopHandler);
        },
        
        stopAutostart() {
            clearInterval(this.state.autostart_timer);
            
            if (this.state.autostart_progress) {
                this.state.autostart_progress.remove();
                this.state.autostart_progress = null;
            }
        },
        
        showMenu(item, element) {
            this.stopAutostart();
            const enabled = Lampa.Controller.enabled().name;
            
            Lampa.Select.show({
                title: Lampa.Lang.translate('title_action'),
                items: [
                    { title: Lampa.Lang.translate('time_reset'), timeclear: true },
                    { title: `${Lampa.Lang.translate('player_lauch')} - Lampa`, player: 'lampa' },
                    { title: Lampa.Lang.translate('copy_link'), link: true }
                ],
                onBack: () => Lampa.Controller.toggle(enabled),
                onSelect: (a) => {
                    if (a.link) {
                        const url = element.url.replace('&preload', '&play');
                        Lampa.Utils.copyTextToClipboard(
                            url,
                            () => Lampa.Noty.show(Lampa.Lang.translate('copy_secuses')),
                            () => Lampa.Noty.show(Lampa.Lang.translate('copy_error'))
                        );
                    }
                    
                    Lampa.Controller.toggle(enabled);
                    
                    if (a.player) {
                        Lampa.Player.runas(a.player);
                        item.trigger('hover:enter');
                    }
                }
            });
        },
        
        loading() {
            Lampa.Modal.open({
                title: '',
                html: Lampa.Template.get('modal_loading'),
                size: 'large',
                mask: true,
                onBack: () => {
                    Lampa.Modal.close();
                    this.close();
                }
            });
        },
        
        install() {
            Lampa.Modal.open({
                title: '',
                html: Lampa.Template.get('torrent_install', {}),
                size: 'large',
                onBack: () => {
                    Lampa.Modal.close();
                    Lampa.Controller.toggle('content');
                }
            });
        },
        
        showError(text) {
            Lampa.Modal.update(
                Lampa.Template.get('error', {
                    title: Lampa.Lang.translate('title_error'),
                    text: text
                })
            );
        },
        
        close() {
            if (this.state.hash) {
                Lampa.Torserver.drop(this.state.hash);
                Lampa.Torserver.clear();
            }
            
            clearInterval(this.state.timers.files);
            this.stopAutostart();
            
            if (this.state.callback_back) {
                this.state.callback_back();
            } else {
                Lampa.Controller.toggle('content');
            }
            
            this.state.callback_back = false;
            this.state.object = null;
            this.state.hash = null;
            
            Lampa.Listener.send('torrent_file', { type: 'list_close' });
        }
    };

    // ========================================================================
    // 6. ОСНОВНОЙ КОМПОНЕНТ
    // ========================================================================

    class MusicSearchComponent {
        constructor(object) {
            this.object = object;
            this.network = new Lampa.Reguest();
            this.scroll = new Lampa.Scroll({ mask: true, over: true });
            this.files = new Lampa.Explorer(object);
            this.filter = new Lampa.Filter(object);
            this.results = [];
            this.filtered = [];
            this.total_pages = 1;
            this.last = null;
            this.initialized = false;
            this.filterTimeout = null;
            
            this.filter_items = {
                quality: [Lampa.Lang.translate('torrent_parser_any_one'), '4k', '1080p', '720p'],
                tracker: [Lampa.Lang.translate('torrent_parser_any_two')],
                year: [],
                format: [Lampa.Lang.translate('torrent_parser_any_two')]
            };
            
            this.initFilterYears();
            this.setupScroll();
        }
        
        initFilterYears() {
            this.filter_items.year.push(Lampa.Lang.translate('torrent_parser_any_two'));
            const currentYear = new Date().getFullYear();
            
            for (let i = 0; i < 50; i++) {
                this.filter_items.year.push((currentYear - i).toString());
            }
        }
        
        setupScroll() {
            this.scroll.minus(this.files.render().find('.explorer__files-head'));
            this.scroll.body().addClass('torrent-list');
        }
        
        create() {
            return this.render();
        }
        
        initialize() {
            this.activity.loader(true);
            this.parse();
            this.scroll.onEnd = () => this.next();
            return this.render();
        }
        
        start() {
            if (Lampa.Activity.active().activity !== this.activity) return;
            
            if (!this.initialized) {
                this.initialized = true;
                this.initialize();
            }
            
            this.setBackground();
            this.setupController();
            Lampa.Controller.toggle('content');
        }
        
        setBackground() {
            if (this.object.movie?.img) {
                if (this.object.movie.id) {
                    try {
                        Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(this.object.movie));
                    } catch (e) {
                        Lampa.Background.change(this.object.movie.img);
                    }
                } else {
                    Lampa.Background.change(this.object.movie.img);
                }
            } else {
                Lampa.Background.change('./img/img_broken.svg');
            }
        }
        
        setupController() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(this.scroll.render(), this.files.render(true));
                    Lampa.Controller.collectionFocus(this.last || false, this.scroll.render(true));
                },
                up: () => Navigator.canmove('up') ? Navigator.move('up') : Lampa.Controller.toggle('head'),
                down: () => Navigator.move('down'),
                right: () => Navigator.canmove('right') ? Navigator.move('right') : this.filter.render().find('.filter--filter').trigger('hover:enter'),
                left: () => Navigator.canmove('left') ? Navigator.move('left') : Lampa.Controller.toggle('menu'),
                back: () => Lampa.Activity.backward()
            });
        }
        
        async parse() {
            try {
                const searchQuery = this.getSearchQuery();
                const cacheKey = CacheManager.getSearchKey({
                    search: searchQuery,
                    type: Lampa.Storage.field('parser_torrent_type')
                });
                
                let data = CacheManager.getSearch(cacheKey);
                if (!data) {
                    data = await ApiClient.get({
                        search: searchQuery,
                        movie: this.object.movie,
                        other: true,
                        from_search: true
                    });
                    CacheManager.setSearch(cacheKey, data);
                }
                
                this.results = data;
                this.build();
                Lampa.Layer.update(this.scroll.render(true));
                this.activity.loader(false);
                this.activity.toggle();
            } catch (e) {
                console.error('[MusicSearch] Error:', e);
                this.empty(`${Lampa.Lang.translate('torrent_error_connect')}: ${e.message || e}`);
            }
            
            this.setupFilter();
        }
        
        getSearchQuery() {
            return this.object.query || 
                   this.object.search || 
                   (this.object.movie ? (this.object.movie.original_title || this.object.movie.title) : '') || 
                   '';
        }
        
        setupFilter() {
            this.filter.onSearch = (value) => {
                Lampa.Activity.replace({ search: value, clarification: true });
            };
            
            this.filter.onBack = () => {
                this.start();
            };
            
            this.filter.addButtonBack();
            this.files.appendHead(this.filter.render());
        }
        
        build() {
            this.collectTrackersAndFormats();
            this.buildSorted();
            this.buildFiltered();
            this.applyFilter();
        }
        
        collectTrackersAndFormats() {
            const trackers = new Set();
            const formats = new Set(['MP3', 'FLAC', 'WAV', 'AAC', 'ALAC', 'DSD', 'SACD', 'APE', 'DTS', 'AC3']);
            const foundFormats = new Set();
            
            this.results.Results.forEach(item => {
                item.Tracker.split(',').forEach(tracker => trackers.add(tracker.trim()));
                const title = item.Title.toUpperCase();
                
                formats.forEach(format => {
                    if (title.includes(format)) foundFormats.add(format);
                });
                
                if (title.includes('320')) foundFormats.add('MP3');
            });
            
            this.filter_items.tracker = [this.filter_items.tracker[0], ...Array.from(trackers)];
            this.filter_items.format = [this.filter_items.format[0], ...Array.from(foundFormats)];
        }
        
        buildSorted() {
            const currentSort = Lampa.Storage.get('torrents_sort', 'Seeders');
            const sortMap = {
                Seeders: 'torrent_parser_sort_by_seeders',
                Size: 'torrent_parser_sort_by_size',
                Title: 'torrent_parser_sort_by_name',
                Tracker: 'torrent_parser_sort_by_tracker',
                PublisTime: 'torrent_parser_sort_by_date',
                viewed: 'torrent_parser_sort_by_viewed'
            };
            
            const sortItems = Object.keys(sortMap).map(key => ({
                title: Lampa.Lang.translate(sortMap[key]),
                sort: key,
                selected: key === currentSort
            }));
            
            this.filter.set('sort', sortItems);
            this.filter.chosen('sort', [Lampa.Lang.translate(sortMap[currentSort])]);
        }
        
        buildFiltered() {
            const data = this.getFilterData();
            const select = [];
            
            const addFilter = (type, title) => {
                const isMulti = ['quality', 'tracker', 'format'].includes(type);
                const value = isMulti && !Array.isArray(data[type]) ? [] : data[type];
                
                const items = this.filter_items[type].map((name, i) => ({
                    title: name,
                    checked: isMulti && value.includes(name),
                    checkbox: isMulti && i > 0,
                    noselect: true,
                    index: i
                }));
                
                select.push({
                    title: title,
                    subtitle: isMulti 
                        ? (value.length ? value.join(', ') : items[0].title)
                        : (items[value]?.title || items[0].title),
                    items: items,
                    noselect: true,
                    stype: type
                });
            };
            
            select.push({ title: Lampa.Lang.translate('torrent_parser_reset'), reset: true });
            addFilter('format', 'Format');
            addFilter('tracker', Lampa.Lang.translate('torrent_parser_tracker'));
            addFilter('year', Lampa.Lang.translate('torrent_parser_year'));
            
            this.filter.set('filter', select);
            
            this.filter.onSelect = (type, a, b) => {
                if (type === 'sort') {
                    Lampa.Storage.set('torrents_sort', a.sort);
                    this.applyFilter();
                } else if (a.reset) {
                    this.setFilterData({});
                    this.buildFiltered();
                } else {
                    a.items.forEach(n => n.checked = false);
                    const d = this.getFilterData();
                    d[a.stype] = ['quality', 'tracker', 'format'].includes(a.stype) ? [] : b.index;
                    this.setFilterData(d);
                    this.buildFiltered();
                    this.applyFilter();
                    this.start();
                }
            };
            
            this.filter.onCheck = (type, a, b) => {
                const d = this.getFilterData();
                let c = d[a.stype] || [];
                if (!Array.isArray(c)) c = [];
                
                if (b.checked) {
                    if (!c.includes(b.title)) c.push(b.title);
                } else {
                    c = c.filter(t => t !== b.title);
                }
                
                d[a.stype] = c;
                this.setFilterData(d);
                this.buildFiltered();
                this.applyFilter();
            };
        }
        
        getFilterData() {
            const key = this.object.movie?.id 
                ? `${this.object.movie.id}:${this.object.movie.number_of_seasons ? 'tv' : 'movie'}`
                : 'music_search';
            
            const all = Lampa.Storage.cache('torrents_filter_data', 500, {});
            return all[key] || {};
        }
        
        setFilterData(data) {
            const key = this.object.movie?.id 
                ? `${this.object.movie.id}:${this.object.movie.number_of_seasons ? 'tv' : 'movie'}`
                : 'music_search';
            
            const all = Lampa.Storage.cache('torrents_filter_data', 500, {});
            all[key] = data;
            Lampa.Storage.set('torrents_filter_data', all);
        }
        
        applyFilter() {
            clearTimeout(this.filterTimeout);
            this.filterTimeout = setTimeout(() => {
                this.doFilter();
                this.showResults();
            }, 100);
        }
        
        doFilter() {
            const data = this.getFilterData();
            const hasFilter = Object.keys(data).some(key => 
                Array.isArray(data[key]) ? data[key].length : data[key]
            );
            
            if (!hasFilter) {
                this.filtered = [...this.results.Results];
            } else {
                this.filtered = this.results.Results.filter(item => {
                    const title = item.Title.toLowerCase();
                    
                    // Фильтр по трекеру
                    if (data.tracker?.length) {
                        const itemTrackers = item.Tracker.toLowerCase().split(',');
                        const hasTracker = data.tracker.some(tracker => 
                            itemTrackers.some(t => t.trim() === tracker.toLowerCase())
                        );
                        if (!hasTracker) return false;
                    }
                    
                    // Фильтр по формату
                    if (data.format?.length) {
                        const hasFormat = data.format.some(format => 
                            title.includes(format.toLowerCase()) || 
                            (format === 'MP3' && title.includes('320'))
                        );
                        if (!hasFormat) return false;
                    }
                    
                    // Фильтр по году
                    if (data.year > 0) {
                        const year = this.filter_items.year[data.year];
                        if (!title.includes(year)) return false;
                    }
                    
                    return true;
                });
            }
            
            this.sortResults();
        }
        
        sortResults() {
            const field = Lampa.Storage.get('torrents_sort', 'Seeders');
            
            this.filtered.sort((a, b) => {
                if (field === 'Title') {
                    return a.Title.localeCompare(b.Title);
                }
                return (parseFloat(b[field]) || 0) - (parseFloat(a[field]) || 0);
            });
        }
        
        showResults() {
            this.scroll.clear();
            this.object.page = 1;
            this.total_pages = Math.ceil(this.filtered.length / CONSTANTS.ITEMS_PER_PAGE);
            
            if (this.filtered.length) {
                this.append(this.filtered.slice(0, CONSTANTS.ITEMS_PER_PAGE));
            } else {
                this.listEmpty();
            }
            
            this.files.appendFiles(this.scroll.render());
        }
        
        listEmpty() {
            const em = Lampa.Template.get('empty_filter');
            const bn = $(`<div class="simple-button selector"><span>${Lampa.Lang.translate('filter_clarify')}</span></div>`);
            
            bn.on('hover:enter', () => {
                this.filter.render().find('.filter--filter').trigger('hover:enter');
            });
            
            em.find('.empty-filter__buttons').removeClass('hide').append(bn);
            this.scroll.append(em);
        }
        
        append(items, append = false) {
            items.forEach(element => {
                const date = Lampa.Utils.parseTime(element.PublishDate);
                const bitrate = this.object.movie?.runtime 
                    ? Lampa.Utils.calcBitrate(element.Size, this.object.movie.runtime) 
                    : 0;
                
                const item = Lampa.Template.get('torrent', {
                    title: element.Title,
                    date: date.full,
                    tracker: element.Tracker,
                    size: !isNaN(parseInt(element.Size)) ? Lampa.Utils.bytesToSize(element.Size) : element.size,
                    seeds: element.Seeders,
                    grabs: element.Peers,
                    bitrate: bitrate
                });
                
                if (!bitrate) item.find('.bitrate').remove();
                
                if (element.viewed) {
                    item.append(`<div class="torrent-item__viewed">${Lampa.Template.get('icon_viewed', {}, true)}</div>`);
                }
                
                if (!element.size || parseInt(element.size) === 0) {
                    item.find('.torrent-item__size').remove();
                }
                
                item.on('hover:focus', (e) => {
                    this.last = e.target;
                    this.scroll.update($(e.target), true);
                    Lampa.Helper.show('torrents', Lampa.Lang.translate('helper_torrents'), item);
                })
                .on('hover:enter', () => {
                    CacheManager.addViewed(element.hash);
                    
                    if (!item.find('.torrent-item__viewed').length) {
                        item.append(`<div class="torrent-item__viewed">${Lampa.Template.get('icon_viewed', {}, true)}</div>`);
                    }
                    
                    if (element.reguest && !element.MagnetUri) {
                        this.loadMagnet(element);
                    } else {
                        element.poster = this.object.movie?.img;
                        this.start();
                        TorrentController.start(element, this.object.movie);
                    }
                });
                
                this.scroll.append(item);
                
                if (append) {
                    Lampa.Controller.collectionAppend(item);
                }
            });
        }
        
        next() {
            if (this.object.page < 15 && this.object.page < this.total_pages) {
                this.object.page++;
                const offset = (this.object.page - 1) * CONSTANTS.ITEMS_PER_PAGE;
                this.append(this.filtered.slice(offset, offset + CONSTANTS.ITEMS_PER_PAGE), true);
            }
        }
        
        loadMagnet(element) {
            Lampa.Modal.open({
                title: '',
                html: Lampa.Template.get('modal_pending', { 
                    text: Lampa.Lang.translate('torrent_get_magnet') 
                }),
                onBack: () => {
                    Lampa.Modal.close();
                    ApiClient.clear();
                }
            });
        }
        
        empty(descr) {
            const empty = new Lampa.Empty({ descr: descr });
            this.files.render().find('.explorer__files-head').addClass('hide');
            this.files.appendFiles(empty.render(this.filter.empty()));
            
            this.start = empty.start;
            this.activity.loader(false);
            this.activity.toggle();
        }
        
        pause() {}
        stop() {}
        
        render() {
            return this.files.render();
        }
        
        destroy() {
            this.network.clear();
            this.files.destroy();
            this.scroll.destroy();
            this.results = null;
        }
    }

    // ========================================================================
    // 7. ИНИЦИАЛИЗАЦИЯ ПЛАГИНА
    // ========================================================================

    function startPlugin() {
        const MANIFEST = {
            type: 'other',
            version: '2.8',
            name: 'Music Search Optimized',
            description: 'Audio Player with Optimized Code',
            component: 'lmeMusicSearch'
        };
        
        const PLAYER_STATE = {
            spoofed: false,
            original_platform: null
        };
        
        Lampa.Component.add(MANIFEST.component, MusicSearchComponent);
        
        window.Lampa.Torrent = {
            start: (el, m) => TorrentController.start(el, m),
            open: (h, m) => TorrentController.open(h, m),
            opened: (c) => TorrentController.state.callback = c,
            back: (c) => TorrentController.state.callback_back = c,
            restoreFocus: () => TorrentController.restoreFocus()
        };
        
        function hookPlayer() {
            const original_play = Lampa.Player.play;
            const original_platform_is = Lampa.Platform.is;
            
            Lampa.Player.listener.follow('destroy', () => {
                if (PLAYER_STATE.spoofed) {
                    Lampa.Platform.is = PLAYER_STATE.original_platform;
                    PLAYER_STATE.spoofed = false;
                    PLAYER_STATE.original_platform = null;
                }
            });
            
            Lampa.Player.play = function (object) {
                const playerMode = Lampa.Storage.get('player_music_torrent', 'html5');
                
                if (object?.from_music_search) {
                    if (playerMode === 'html5') {
                        audioPlayer.play(object);
                        if (object.playlist) audioPlayer.setPlaylist(object.playlist);
                        return;
                    }
                    
                    if (playerMode === 'inner' && (Lampa.Platform.is('android') || PLAYER_STATE.spoofed)) {
                        if (!PLAYER_STATE.spoofed) {
                            PLAYER_STATE.original_platform = original_platform_is;
                            PLAYER_STATE.spoofed = true;
                            Lampa.Platform.is = (what) => what === 'android' ? false : PLAYER_STATE.original_platform(what);
                        }
                        
                        if (object.url) {
                            object.url = object.url.replace('intent:', 'http:');
                        }
                    }
                }
                
                original_play(object);
            };
        }
        
        function addSettings() {
            Lampa.SettingsApi.addParam({
                component: 'player',
                param: {
                    name: 'player_music_torrent',
                    type: 'select',
                    values: {
                        'android': 'Android (Ext)',
                        'inner': 'Lampa (Int)',
                        'html5': 'HTML5 Audio'
                    },
                    default: 'html5'
                },
                field: {
                    name: 'Плеер для музыки',
                    description: 'Выберите плеер для воспроизведения торрентов из Music Search'
                },
                onChange: (value) => {
                    Lampa.Storage.set('player_music_torrent', value);
                }
            });
        }
        
        function addMenuButton() {
            const btn = $(`
                <li class="menu__item selector">
                    <div class="menu__ico">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="white">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                        </svg>
                    </div>
                    <div class="menu__text">${MANIFEST.name}</div>
                </li>
            `);
            
            btn.on('hover:enter', () => {
                Lampa.Activity.push({
                    url: '',
                    title: MANIFEST.name,
                    component: MANIFEST.component,
                    search: 'Metallica',
                    from_search: true,
                    noinfo: true,
                    movie: {
                        title: '',
                        original_title: '',
                        img: './img/img_broken.svg',
                        genres: [],
                        id: 'music_search'
                    },
                    page: 1
                });
            });
            
            $('.menu .menu__list').eq(0).append(btn);
        }
        
        function init() {
            addMenuButton();
            addSettings();
            hookPlayer();
            
            Lampa.Search.addSource({
                title: Lampa.Lang.translate('title_parser'),
                search: async (params, oncomplete) => {
                    try {
                        const res = await ApiClient.get({
                            query: params.query,
                            other: true,
                            from_search: true
                        });
                        
                        res.title = Lampa.Lang.translate('title_parser');
                        res.results = res.Results.slice(0, 20);
                        delete res.Results;
                        
                        res.results.forEach(item => {
                            item.Title = Lampa.Utils.shortText(item.Title, 110);
                        });
                        
                        oncomplete(res.results.length ? [res] : []);
                    } catch (e) {
                        oncomplete([]);
                    }
                },
                onCancel: () => ApiClient.clear(),
                params: {
                    lazy: true,
                    align_left: true,
                    isparser: true,
                    card_events: { onMenu: () => {} }
                },
                onMore: (params, close) => {
                    close();
                    Lampa.Activity.push({
                        url: '',
                        title: Lampa.Lang.translate('title_torrents'),
                        component: 'torrents',
                        search: params.query,
                        from_search: true,
                        noinfo: true,
                        movie: {
                            title: params.query,
                            original_title: '',
                            img: './img/img_broken.svg',
                            genres: [],
                            id: 'music_search'
                        },
                        page: 1
                    });
                },
                onSelect: (params, close) => {
                    TorrentController.start(params.element, { title: params.element.Title });
                    TorrentController.state.callback_back = params.line.toggle.bind(params.line);
                }
            });
        }
        
        if (window.appready) {
            init();
        } else {
            Lampa.Listener.follow('app', (e) => {
                if (e.type === 'ready') init();
            });
        }
    }
    
    if (!window.lmeMusicSearch_ready) {
        window.lmeMusicSearch_ready = true;
        startPlugin();
    }
})();
