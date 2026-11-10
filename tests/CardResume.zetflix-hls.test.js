'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const src=fs.readFileSync(path.join(__dirname,'..','CardResume.js'),'utf8');
const marker='    return exports;';
assert.equal(src.split(marker).length,2,'single export insertion point');
const api=vm.runInNewContext(src.replace(marker,
  '    exports.cardResumeZetflixHls=cardResumeZetflixHls; exports.normalizePlaylist=normalizePlaylist; exports.createCapture=createCapture;\n'+marker),
  {setTimeout,clearTimeout,setInterval,clearInterval,console});

const endpoint='https://lampac.art/lite/zetflix/stream?q=1080&s=1&e=3';
const stream=(q)=>endpoint.replace('q=1080','q='+q);
const item=(n)=>({
  card:{id:1399,source:'tmdb',media_type:'tv',name:'Game of Thrones',original_name:'Game of Thrones'},
  season:1,episode:n,url:stream('1080'),url_orig:stream('1080'),
  quality:{'1080p':stream('1080'),'720p':{url:stream('720'),name:'HD'}},
  subtitles:[{url:'https://example.test/subs.vtt',label:'English'}],
  timeline:{hash:'hash-'+n,handler(){}}
});

test('Zetflix HLS response is marked on primary URL, original URL and every quality',()=>{
  const initial=item(3);
  const fixed=api.cardResumeZetflixHls(initial);
  assert.equal(fixed.url.endsWith('&.m3u8'),true);
  assert.equal(fixed.url_orig.endsWith('&.m3u8'),true);
  assert.equal(fixed.quality['1080p'].endsWith('&.m3u8'),true);
  assert.equal(fixed.quality['720p'].url.endsWith('&.m3u8'),true);
  assert.equal(fixed.hls_type,'hlsjs');
  assert.equal(fixed.season,1);
  assert.equal(fixed.episode,3);
  assert.equal(fixed.subtitles[0].label,'English');
  assert.equal(initial.url.includes('.m3u8'),false,'original recipe must remain unchanged');
});
test('HLS marker is idempotent and does not double-append',()=>{
  const once=api.cardResumeZetflixHls(item(3));
  const twice=api.cardResumeZetflixHls(once);
  assert.equal(twice.url,once.url);
  assert.equal(twice.quality['1080p'],once.quality['1080p']);
  assert.equal(twice.quality['720p'].url,once.quality['720p'].url);
});
test('Other sources, ordinary files and video qualities remain unchanged',()=>{
  const mp4={url:'https://example.test/movie.mp4',quality:{HD:'https://example.test/movie.mp4'},card:{id:1399}};
  assert.equal(api.cardResumeZetflixHls(mp4),mp4);
  const other={url:'https://lampac.art/lite/filmix/stream?token=x'};
  assert.equal(api.cardResumeZetflixHls(other),other);
});
test('Native CardResume playlist normalizes HLS on every episode and keeps ID/timecode',()=>{
  const playlist=[item(1),item(2),item(3)];
  const Lampa={Timeline:{
    link:(card,s,e)=>({card:'tv_'+card.id,season:s,episode:e}),
    view:(hash,meta)=>({hash,time:0,percent:0,duration:3000,handler(){},...meta})
  }};
  const r=api.normalizePlaylist(playlist,playlist[2],{time:88,duration:3437,percent:3},Lampa);
  assert.equal(r.playlist.length,3);
  assert.equal(r.item.episode,3);
  assert.equal(r.item.timeline.time,88);
  assert.equal(r.item.timeline.card,'tv_1399');
  assert.equal(r.item.timeline.episode,3);
  assert.equal(r.playlist.every(x=>x.url.includes('.m3u8')),true);
  assert.equal(r.playlist.every(x=>x.quality['1080p'].includes('.m3u8')),true);
  assert.equal(playlist.every(x=>!x.url.includes('.m3u8')),true);
});

test('Native online Player.create fixes Zetflix HLS before core selects stream quality',()=>{
  function emitter(){
    const map={};
    return {follow(k,cb){(map[k]||(map[k]=[])).push(cb)},
      remove(k,cb){map[k]=(map[k]||[]).filter(x=>x!==cb)},
      emit(k,data){(map[k]||[]).forEach(cb=>cb(data))}};
  }
  const p=emitter(),pl=emitter(),timeline=emitter(),listener=emitter();
  const Lampa={Player:{listener:p},PlayerPlaylist:{listener:pl},
    Timeline:{listener:timeline},Listener:listener,Storage:{field:()=>null}};
  const store={upsert(){}};
  const capture=api.createCapture(Lampa,store,{globalObject:{addEventListener(){},removeEventListener(){}}});
  capture.start();
  const launch=item(3);
  launch.isonline=true;
  launch.lampac_resume={mode:'online',online:{component:'lampac',balanser:'zetflix'}};
  p.emit('create',{data:launch});
  assert.equal(launch.url.endsWith('&.m3u8'),true);
  assert.equal(launch.quality['1080p'].endsWith('&.m3u8'),true);
  assert.equal(launch.quality['720p'].url.endsWith('&.m3u8'),true);
  assert.equal(launch.hls_type,'hlsjs');
  capture.stop();
});
