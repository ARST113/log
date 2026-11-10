'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'CardResume.js'), 'utf8');
const injected = source.replace('    return exports;', '    exports.cardResumeLinkNativeOnlineTimeline = cardResumeLinkNativeOnlineTimeline; exports.cardResumeSeekPercent = cardResumeSeekPercent; exports.cardResumeLink = cardResumeLink; exports.createCapture = createCapture; exports.createOnlineAdapter = createOnlineAdapter; exports.createRecipeStore = createRecipeStore; return exports;');
function api(){return vm.runInNewContext(injected, {console, setTimeout, clearTimeout, setInterval, clearInterval});}
function bus(){
  const listeners = new Map();
  return {follow(k, fn){const x=listeners.get(k)||[];x.push(fn);listeners.set(k,x);},
    remove(k, fn){listeners.set(k,(listeners.get(k)||[]).filter(x=>x!==fn));},
    emit(k, v){(listeners.get(k)||[]).slice().forEach(fn=>fn(v));},
    count(k){return (listeners.get(k)||[]).length;}};
}
const series = {source:'tmdb', id:141, media_type:'tv', name:'Series', original_name:'Series'};
test('ID-backed Timeline.link uses card/season/episode even when the title changes', () => {
  const Lampa = {Timeline:{link:(card,season,episode)=>({card:(card.original_name?'tv_':'movie_')+card.id, season, episode})}};
  const link = api().cardResumeLink;
  const a=link(Lampa,series,{season:1,episode:2});
  const b=link(Lampa,{...series,name:'Changed',original_name:'Changed'},{season:1,episode:2});
  assert.deepEqual({...a},{...b});
  assert.equal(link(Lampa,series,{season:1,episode:2,torrent_hash:'x',by_title:false}),null);
  assert.equal(link(Lampa,series,{season:1,episode:2,torrent_hash:'x',by_title:true}).card,'tv_141');
});
test('Playlist normalization requests identity-based timecode and preserves the selected item', () => {
  const calls=[];
  const Lampa={Timeline:{link:(card,season,episode)=>({card:'tv_'+card.id,season,episode}),
    view:(hash,meta)=>{calls.push({hash,meta});return {hash,handler:()=>{},time:42}}}};
  const item={url:'https://test.local/movie.mp4',card:series,season:1,episode:2,timeline:{hash:'hash_new',handler:()=>{}}};
  const r=api().normalizePlaylist([item],item,{time:83,duration:140,percent:59},Lampa);
  assert.equal(r.item.timeline.time,83);
  assert.equal(r.item.timeline.card,'tv_141');
  assert.equal(r.item.timeline.season,1);
  assert.equal(calls[0].meta.card,'tv_141');
});
test('PidTor async resume is confirmed only by the matching actual Player.start event', async () => {
  const player=bus();
  const Lampa={Player:{listener:player}};
  let launches=0;
  const a=api().createOnlineAdapter(Lampa,{PidTorNextGen:{resume:()=>{launches++;return true;}}});
  const record={online:{component:'pidtor_nextgen',balanser:'pidtor'},episode:{season:1,episode:2},progress:{time:100,duration:1000,percent:10}};
  let settled=false;
  const request=a.resolve(series,record,{}).then(x=>{settled=true;return x;});
  await Promise.resolve();
  assert.equal(launches,1);
  assert.equal(settled,false);
  assert.equal(player.count('start'),1);
  player.emit('start',{pidtor_nextgen:true,card:{...series,id:142}});
  await Promise.resolve();
  assert.equal(settled,false);
  player.emit('start',{pidtor_nextgen:true,card:series,season:1,episode:2});
  assert.equal((await request).launched,true);
  assert.equal(player.count('start'),0);
});
test('PidTor false scheduling result is rejected and listeners removed',async()=>{
  const player=bus();
  const a=api().createOnlineAdapter({Player:{listener:player}},{PidTorNextGen:{resume:()=>false}});
  await assert.rejects(a.resolve(series,{online:{component:'pidtor_nextgen'},episode:{season:1,episode:2},progress:{}},{}),/resume-pidtor-launch/);
  assert.equal(player.count('start'),0);
});
test('PidTor track changes with a new stream hash update the saved semantic choices', () => {
  const p=bus(),pl=bus(),t=bus(),common=bus(),external=bus();
  const saved=[];
  const Lampa={Player:{listener:p},PlayerPlaylist:{listener:pl},Timeline:{listener:t},
    Listener:common,Storage:{field:()=>null},Api:{}};
  const capture=api().createCapture(Lampa,{upsert:(card,record)=>saved.push(record)},
    {globalObject:{addEventListener:(n,f)=>external.follow(n,f),removeEventListener:(n,f)=>external.remove(n,f)}});
  capture.start();
  const data={card:series,pidtor_nextgen:true,component:'pidtor_nextgen',season:1,episode:2,
    pidtor_quality_key:'q1',pidtor_audio_key:'a1',timeline:{hash:'old_hash',time:3,duration:99,percent:4}};
  p.emit('create',{data});
  const state=(quality,audio)=>({detail:{card:series,pidtor_nextgen:true,season:1,episode:2,
    timeline_hash:'changed_stream_hash',pidtor_quality_key:quality,pidtor_audio_key:audio,pidtor_subtitle_key:'s3'}});
  external.emit('pidtor-nextgen-state',state('q2','a2'));
  assert.equal(saved.length,0);
  p.emit('start',data);
  external.emit('pidtor-nextgen-state',state('q3','a3'));
  const last=saved[saved.length-1];
  assert.equal(last.online.pidtor_quality_key,'q3');
  assert.equal(last.online.pidtor_audio_key,'a3');
  assert.equal(last.online.pidtor_subtitle_key,'s3');
  assert.equal(data.episode_title,'Серия 2');
  capture.stop();
});
test('CardResume movie at 90% keeps exact seek position by lowering only startup percent',()=>{
  const {cardResumeSeekPercent}=api();
  const film={id:88,source:'tmdb',media_type:'movie',title:'Synthetic Movie'};
  const progress={time:5896,duration:6491,percent:90};
  assert.equal(cardResumeSeekPercent(progress,film),89);
  assert.equal(progress.percent,90,'history must not be mutated');
  assert.equal(progress.time,5896,'exact time must be kept');
  assert.equal(cardResumeSeekPercent({time:100,duration:1000,percent:10},film),10);
  assert.equal(cardResumeSeekPercent({time:6488,duration:6491,percent:99.95},film),99.95,
    'do not seek into the last 15 seconds when there is no meaningful playback time');
  assert.equal(cardResumeSeekPercent(progress,series),90,
    'series completion >=90% must still advance to the next episode');
});

test('PidTor NextGen transport torrent_hash still links TV identity to per-episode TimeCode',()=>{
  const A=api();
  const updates=[];
  const Lampa={Timeline:{
    link:(card,season,episode)=>({card:'tv_'+card.id,season,episode}),
    view:(hash,meta)=>({hash, handler:(percent,time,duration)=>{
      updates.push({hash,percent,time,duration,...meta});
    }})
  }};
  const e={pidtor_nextgen:true,isonline:true,torrent_hash:'transport-stream-hash',
    card:series,season:1,episode:2,timeline:{hash:'title-hash',time:1866,duration:3697,percent:50,continued:false}};
  assert.equal(A.cardResumeLinkNativeOnlineTimeline(Lampa,e),true);
  assert.equal(e.timeline.card,'tv_141');
  assert.equal(e.timeline.season,1);
  assert.equal(e.timeline.episode,2);
  assert.equal(e.timeline.time,1866);
  e.timeline.handler(50,1866,3697);
  assert.equal(updates.length,1);
  assert.deepEqual({...updates[0]},{hash:'title-hash',percent:50,time:1866,duration:3697,card:'tv_141',season:1,episode:2});
  const torrent={...e,pidtor_nextgen:false};
  assert.equal(A.cardResumeLink(Lampa,series,torrent),null);
});
test('CardResume preserves PidTor timeline on Player.create and does not alter torrent path handlers',()=>{
  const {createCapture}=api();
  const p=bus(),pl=bus(),t=bus(),common=bus();
  const writes=[];
  const Lampa={Player:{listener:p},PlayerPlaylist:{listener:pl},Timeline:{listener:t,
    link:(card,s,e)=>({card:'tv_'+card.id,season:s,episode:e}),
    view:(hash,meta)=>({hash,handler:(percent,time,duration)=>writes.push({hash,...meta,percent,time,duration})})},
    Listener:common,Storage:{field:()=>null},Api:{}};
  const capture=createCapture(Lampa,{upsert(){}},{globalObject:{addEventListener(){},removeEventListener(){}}});
  capture.start();
  const data={pidtor_nextgen:true,isonline:true,torrent_hash:'transport-hash',
    card:series,season:1,episode:1,timeline:{hash:'title-hash-1',percent:49,time:1801,duration:3697,handler:()=>{throw Error('obsolete handler called')}}};
  p.emit('create',{data});
  assert.equal(data.timeline.card,'tv_141');
  data.timeline.handler(50,1866,3697);
  assert.equal(writes[0].episode,1);
  assert.equal(writes[0].time,1866);
  const plain={...data,pidtor_nextgen:false,timeline:{hash:'raw-file',handler:()=>{}}};
  p.emit('create',{data:plain});
  assert.equal(plain.timeline.card,undefined);
  capture.stop();
});
