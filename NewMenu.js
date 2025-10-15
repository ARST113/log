(function(){
  "use strict";
  var iconSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="2"/><rect x="6" y="10" width="12" height="4" rx="2" fill="#fff"/></svg>`;
  var $ = window.$ || window.jQuery;
  // Добавим "карточку" в блок head__actions или отдельный container
  function addMainCard(){
    var container = $('.head__actions'); // можно подменить на любой
    if(!container.length || container.find('.plugin-film-card').length) return;
    var card = $('<div class="head__action selector plugin-film-card" tabindex="0" style="display:flex;align-items:center;border-radius:12px;padding:0 .8em;height:2.25em;color:#fff;font-size:1.14em;min-width:9em;user-select:none;margin-left:.16em;cursor:pointer;transition:background .16s,color .14s;">'
      + '<span class="movie-ico">'+iconSVG+'</span><span class="movie-label" style="margin-left:.45em;white-space:nowrap;">Фильмы</span></div>');
    card.on('mouseenter focus', function(){ card.addClass('focus'); });
    card.on('mouseleave blur', function(){ card.removeClass('focus'); });

    // Критично: Lampa ловит hover:enter даже на DIV/LI, если класс selector!
    card.on('hover:enter', function(e){
      if(window.Lampa && Lampa.Activity && typeof Lampa.Activity.push==="function"){
        Lampa.Activity.push({
          source: "tmdb",
          title: "Фильмы",
          component: "main",
          page: 1
        });
      }
    });

    container.append(card);

    // Автоматический "перевод" keydown Enter в hover:enter
    card.on('keydown', function(e){
      if(e.key === 'Enter' || e.which === 13){
        e.preventDefault();
        // Только для гарантии, можно с задержкой
        card.trigger('hover:enter');
      }
    });
  }

  setTimeout(addMainCard, 800);
})();
