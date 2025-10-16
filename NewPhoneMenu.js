Lampa.Platform.tv();

(function () {
  'use strict';

  const MOVIE_SVG = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M9 22H15C20 22 22 20 22 15V9C22 4 20 2 15 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.1 12V10.52C9.1 8.61 10.45 7.84 12.1 8.79L13.38 9.53L14.66 10.27C16.31 11.22 16.31 12.78 14.66 13.73L13.38 14.47L12.1 15.21C10.45 16.16 9.1 15.38 9.1 13.48V12Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const TV_SVG    = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M7.26 2h9.47c.65 0 1.23.02 1.75.09C21.25 2.4 22 3.7 22 7.26v6.32c0 3.56-.75 4.86-3.52 5.16-.52.07-1.09.08-1.76.08H7.26c-.65 0-1.23-.02-1.75-.08C2.74 18.44 2 17.14 2 13.58V7.26c0-3.56.74-4.86 3.51-5.17.52-.07 1.1-.09 1.75-.09Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.58 8.32h3.68M6.74 14.11h10.53M7 22h10M7.19 8.3h.01M10.49 8.3h.01" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const css = `
  .navigation-bar__body {
      display:flex !important;
      justify-content:center !important;
      align-items:center !important;
      width:100% !important;
      background:none !important;
      box-shadow:none !important;
      overflow:hidden !important;
      padding:0 !important;
  }
  .navigation-bar__item {
      display:flex !important;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      background:#23232a;
      border-radius:12px;
      box-shadow:0 2px 12px 0 #23232f44;
      height:68px !important;
      transition:background .15s ease, box-shadow .15s ease, width .2s ease, margin .2s ease;
      box-sizing:border-box;
  }
  .navigation-bar__item:hover,
  .navigation-bar__item.active {
      background:#505057;
      outline:2px solid #fff;
  }
  .navigation-bar__icon {
      height:28px;
      margin-bottom:4px;
      display:flex;
      align-items:center;
      justify-content:center;
  }
  .navigation-bar__icon svg {
      width:24px !important;
      height:24px !important;
  }
  .navigation-bar__label {
      font-size:0.95em !important;
      text-align:center;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      max-width:100%;
  }

  /* 🎯 Вертикальный режим: центр + лёгкое сжатие */
  @media (orientation: portrait) {
      .navigation-bar__body {
          justify-content:center !important;
          align-items:center !important;
          padding:0 !important;
      }
      .navigation-bar__item {
          margin:0 1.5px !important;
          border-radius:10px !important;
      }
      .navigation-bar__icon {
          margin-bottom:2px !important;
      }
      .navigation-bar__icon svg {
          width:22px !important;
          height:22px !important;
      }
      .navigation-bar__label {
          font-size:0.9em !important;
          line-height:1.1 !important;
      }
  }`;

  const $ = (s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  function injectCSS(){
    if(!$('#menu-portraitscale-style')){
      const st=document.createElement('style');
      st.id='menu-portraitscale-style';
      st.textContent=css;
      document.head.appendChild(st);
    }
  }

  function emulateSidebarClick(label){
    for(const el of $$('.menu__item, .selector')){
      const txt=(el.innerText||el.textContent||'').trim().toLowerCase();
      if(txt===label.toLowerCase()){el.click();return;}
    }
  }

  function addItem(action,label,svg){
    const bar=$('.navigation-bar__body');
    if(!bar||bar.querySelector(`[data-action="${action}"]`))return;
    const div=document.createElement('div');
    div.className='navigation-bar__item';
    div.dataset.action=action;
    div.innerHTML=`<div class="navigation-bar__icon">${svg}</div><div class="navigation-bar__label">${label}</div>`;
    const search=bar.querySelector('.navigation-bar__item[data-action="search"]');
    if(search) bar.insertBefore(div,search); else bar.appendChild(div);
    div.addEventListener('click',()=>emulateSidebarClick(label));
  }

  /** 📏 динамическое распределение ширины с лёгким сжатием в портрете */
  function adjustWidths(){
    const bar=$('.navigation-bar__body');
    if(!bar) return;
    const items=$$('.navigation-bar__item',bar);
    if(!items.length) return;

    const totalWidth=bar.clientWidth;
    const count=items.length;
    const baseWidth=110;
    const gapBase=8;

    // определяем портрет
    const isPortrait=window.matchMedia('(orientation: portrait)').matches;

    // лёгкий коэффициент уменьшения при узком экране
    let scale=1;
    if(isPortrait){
      const vmin=Math.min(window.innerWidth,window.innerHeight);
      // уменьшаем до 0.85 при ширине <400px
      scale=Math.max(0.85, Math.min(1, vmin/480));
    }

    let itemWidth=baseWidth*scale;
    let gap=gapBase*scale;

    // если всё равно не помещается — чуть уменьшить ширину
    const totalNeed=itemWidth*count+gap*(count-1);
    if(totalNeed>totalWidth){
      const delta=totalNeed-totalWidth;
      itemWidth-=delta/count;
    }

    items.forEach((it,i)=>{
      it.style.flex=`0 0 ${itemWidth}px`;
      it.style.marginRight=(i<count-1)?`${gap}px`:'0';
    });
  }

  function init(){
    injectCSS();
    addItem('movie','Фильмы',MOVIE_SVG);
    addItem('tv','Сериалы',TV_SVG);
    adjustWidths();

    const bar=$('.navigation-bar__body');
    if(!bar) return;
    const ro=new ResizeObserver(adjustWidths);
    ro.observe(bar);
    window.addEventListener('resize',adjustWidths);
    window.addEventListener('orientationchange',adjustWidths);
  }

  const mo=new MutationObserver(()=>{
    const bar=$('.navigation-bar__body');
    if(bar){mo.disconnect();init();}
  });
  mo.observe(document.documentElement,{childList:true,subtree:true});
  if($('.navigation-bar__body')){mo.disconnect();init();}
})();
