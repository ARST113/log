(function () {
    'use strict';

    if (window.plugin_transcoding_ready) return;
    window.plugin_transcoding_ready = true;

    var SETTINGS_KEY = 'transcoding_settings';
    var DEFAULT_SETTINGS = {
        parallel_files: 2,
        initial_batch: 2
    };

    function startPlugin() {
        console.log('[Transcoding] Plugin initialized');

        function readSettings() {
            var saved = Lampa.Storage.get(SETTINGS_KEY, DEFAULT_SETTINGS);
            return Object.assign({}, DEFAULT_SETTINGS, saved || {});
        }

        function saveSettings(settings) {
            Lampa.Storage.set(SETTINGS_KEY, settings);
        }

        function addSettingsMenu() {
            Lampa.SettingsApi.addParam({
                component: 'player',
                param: {
                    name: SETTINGS_KEY,
                    type: 'select',
                    values: {
                        '2': 'Параллельно 2 файла',
                        '3': 'Параллельно 3 файла'
                    },
                    default: String(DEFAULT_SETTINGS.parallel_files)
                },
                field: {
                    name: 'Транскодинг',
                    description: 'Одновременная обработка аудио и сборка плейлистов'
                },
                onChange: function (value) {
                    var updated = readSettings();
                    updated.parallel_files = Math.max(2, Math.min(3, parseInt(value, 10) || DEFAULT_SETTINGS.parallel_files));
                    updated.initial_batch = updated.parallel_files;
                    saveSettings(updated);
                }
            });
        }

        function collectAudioTracks(files) {
            var tracks = [];
            files.forEach(function (file) {
                var candidates = file.audioTracks || file.audio_tracks || [];
                if (Array.isArray(file.tracks)) {
                    candidates = candidates.concat(file.tracks.filter(function (t) { return t.type === 'audio'; }));
                }
                candidates.forEach(function (track) {
                    var id = track.id || track.lang || track.language || track.title;
                    if (!id) return;
                    if (!tracks.some(function (item) { return item.id === id; })) {
                        tracks.push({
                            id: id,
                            title: track.title || track.lang || track.language || ('Дорожка ' + tracks.length)
                        });
                    }
                });
            });
            return tracks;
        }

        function selectAudioTrack(files) {
            return new Promise(function (resolve) {
                var tracks = collectAudioTracks(files);
                if (!tracks.length) {
                    resolve(null);
                    return;
                }

                var items = tracks.map(function (track) {
                    return {
                        title: track.title,
                        value: track.id
                    };
                });

                Lampa.Select.show({
                    title: 'Выберите аудиодорожку',
                    items: items,
                    onSelect: function (item) {
                        resolve(item.value);
                    },
                    onCancel: function () {
                        resolve(null);
                    }
                });
            });
        }

        function normalizeFile(file, audioTrack) {
            var prepared = Object.assign({ title: 'Файл', url: '', timeline: {} }, file);
            prepared.audio_track = audioTrack;
            return prepared;
        }

        function transcodeFile(file, audioTrack) {
            var prepared = normalizeFile(file, audioTrack);
            return new Promise(function (resolve) {
                var resolved = function (url) {
                    resolve({
                        url: url,
                        title: prepared.title,
                        timeline: prepared.timeline || {},
                        card: prepared.card,
                        season: prepared.season,
                        episode: prepared.episode
                    });
                };

                if (Lampa.Torserver && typeof Lampa.Torserver.transcode === 'function') {
                    Lampa.Torserver.transcode({
                        file: prepared,
                        audio: audioTrack
                    }, function (response) {
                        resolved(response.url || response);
                    }, function () {
                        resolved(prepared.url || '');
                    });
                }
                else {
                    var url = prepared.url;
                    if (audioTrack && url && url.indexOf('audio_track=') === -1) {
                        url += (url.indexOf('?') === -1 ? '?' : '&') + 'audio_track=' + encodeURIComponent(audioTrack);
                    }
                    resolved(url);
                }
            });
        }

        function updatePlayerPlaylist(playlist) {
            if (Lampa.Player && typeof Lampa.Player.playlist === 'function') {
                Lampa.Player.playlist(playlist.map(function (item) {
                    return {
                        url: item.url,
                        title: item.title,
                        timeline: item.timeline,
                        card: item.card,
                        season: item.season,
                        episode: item.episode
                    };
                }));
            }
        }

        function startPlayback(playlist) {
            if (!playlist.length) return;

            var first = playlist[0];
            Lampa.Player.play({
                url: first.url,
                title: first.title,
                timeline: first.timeline || {},
                card: first.card,
                season: first.season,
                episode: first.episode,
                playlist: playlist
            });
            updatePlayerPlaylist(playlist);
        }

        function chunkQueue(queue, size) {
            var chunk = [];
            while (chunk.length < size && queue.length) {
                chunk.push(queue.shift());
            }
            return chunk;
        }

        function processQueue(files, settings, audioTrack) {
            return new Promise(function (resolve) {
                var queue = files.map(function (file, index) {
                    return Object.assign({}, file, { __index: index });
                });
                var playlist = [];
                var playing = false;

                function sortPlaylist() {
                    playlist.sort(function (a, b) { return a.__index - b.__index; });
                }

                function enqueueNextBatch() {
                    var batch = chunkQueue(queue, settings.parallel_files);
                    if (!batch.length) {
                        if (playlist.length) updatePlayerPlaylist(playlist);
                        resolve(playlist);
                        return;
                    }

                    Promise.all(batch.map(function (file) { return transcodeFile(file, audioTrack).then(function (result) {
                        result.__index = file.__index;
                        return result;
                    }); })).then(function (results) {
                        playlist = playlist.concat(results);
                        sortPlaylist();

                        if (!playing && playlist.length >= settings.initial_batch) {
                            playing = true;
                            startPlayback(playlist);
                        }
                        else if (playing) {
                            updatePlayerPlaylist(playlist);
                        }

                        enqueueNextBatch();
                    });
                }

                enqueueNextBatch();
            });
        }

        function run(files) {
            if (!Array.isArray(files) || !files.length) {
                Lampa.Noty.show('Нет файлов для транскодинга');
                return;
            }

            var settings = readSettings();

            selectAudioTrack(files).then(function (audioTrack) {
                processQueue(files, settings, audioTrack).then(function (playlist) {
                    if (!playlist.length) {
                        Lampa.Noty.show('Не удалось подготовить плейлист');
                        return;
                    }
                    Lampa.Noty.show('Плейлист собран: ' + playlist.length + ' файла');
                    if (!Lampa.Player || !Lampa.Player.play) {
                        console.warn('[Transcoding] Player is not available');
                    }
                });
            });
        }

        Lampa.Transcoding = {
            start: run,
            selectAudioTrack: selectAudioTrack,
            settings: readSettings
        };

        addSettingsMenu();
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
