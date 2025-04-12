(function(){
    'use strict';

    if (typeof window.Lampa === 'undefined') return;

    var continueWatch = {
        watchList: Lampa.Storage.get('continue_watch_list') || [],

        init: function(){
            if(Lampa.Player && typeof Lampa.Player.callback === 'function'){
                Lampa.Player.callback(this.onPlayerClose.bind(this));
            }

            Lampa.Listener.follow('full_start', this.onCardOpen.bind(this));
        },

        onPlayerClose: function(data){
            if (!data || !data.id) return;

            this.watchList = this.watchList.filter(function(item){
                return item.id !== data.id;
            });

            this.watchList.push(data);
            Lampa.Storage.set('continue_watch_list', this.watchList);
        },

        onCardOpen: function(viewData){
            if (!viewData || viewData.component !== 'full') return;

            var cardData = viewData.data || {};
            var movieId = cardData.id || cardData.tmdb_id || cardData.imdb_id;
            if (!movieId) return;

            var record = this.watchList.find(function(item){
                return item.id === movieId;
            });
            if (!record) return;

            var btn = document.createElement('button');
            btn.innerText = 'Продолжить';
            btn.className = 'continue-watch-button selector';

            btn.addEventListener('click', function(){
                Lampa.Player.play(record);
            });

            var container = document.querySelector('.movie__details .info__buttons');
            if (container) {
                container.appendChild(btn);
            }
        }
    };

    continueWatch.init();

    if (!window.Lampa.plugins) window.Lampa.plugins = {};
    window.Lampa.plugins.continue_watch = continueWatch;

})();
