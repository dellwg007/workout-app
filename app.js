/* ---------- Data: every editable thing lives in JSON files (config, exercises, weeks, logs) ----------
   Files are kept on this phone (localStorage) and mirrored to a private GitHub repo when online.
   Paths: config/config.json, config/exercises.json, weeks/<id>.json, logs/<sessionId>.json */
const APP_VERSION = '1.1.0';
const DEFAULTS = window.WL_DEFAULTS || {};
const STORE_KEY = 'wl.store.v1';
const PLAN = {weeks:[]};
const ALL = [];
let CFG = {}, EXL = {};
const store = {files:{}, dirty:{}, settings:{gh:{owner:'', repo:'', branch:'main', token:''}, tredict:{token:'', base:'', mode:'github'}}, lastPull:null, lastPush:null, rec:null, setupDone:false};

function deepMerge(a, b){
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b === undefined ? a : b;
  var out = (a && typeof a === 'object' && !Array.isArray(a)) ? Object.assign({}, a) : {};
  Object.keys(b).forEach(function(k){ out[k] = deepMerge(out[k], b[k]); });
  return out;
}
function loadStore(){
  try { var raw = localStorage.getItem(STORE_KEY); if (raw){ var o = JSON.parse(raw); Object.keys(o).forEach(function(k){ store[k] = o[k]; }); } } catch (e) {}
  store.settings = deepMerge({gh:{owner:'', repo:'', branch:'main', token:''}, tredict:{token:'', base:'', mode:'github'}}, store.settings || {});
  Object.keys(DEFAULTS).forEach(function(p){ if (!store.files[p]) store.files[p] = {data:clone(DEFAULTS[p]), sha:null}; });
}
let persistT = null;
function persistNow(){ clearTimeout(persistT); persistT = null; try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { syncState = {state:'error', msg:'This phone is out of storage for the app. Export a backup in Settings.'}; setSync(); } }
function persist(){ if (!persistT) persistT = setTimeout(persistNow, 250); }
function fileData(p){ return store.files[p] ? store.files[p].data : null; }
function writeFile(p, data){
  var f = store.files[p] || (store.files[p] = {sha:null});
  f.data = data; store.dirty[p] = Date.now();
  persist(); schedulePush();
}
function pendingCount(){ return Object.keys(store.dirty).length; }
function rebuild(){ ALL.length = 0; PLAN.weeks.forEach(function(w, wi){ w.sessions.forEach(function(s){ s.week = wi; ALL.push(s); }); }); }
function loadAll(){
  CFG = deepMerge(clone(DEFAULTS['config/config.json'] || {}), fileData('config/config.json') || {});
  EXL = deepMerge(clone(DEFAULTS['config/exercises.json'] || {}), fileData('config/exercises.json') || {});
  var weeks = [];
  Object.keys(store.files).forEach(function(p){
    var m = /^weeks\/([^/]+)\.json$/.exec(p); if (!m) return;
    var w = cleanWeek(m[1], fileData(p)); if (w) weeks.push(w);
  });
  weeks.sort(function(a, b){ return a.sessions[0].date.localeCompare(b.sessions[0].date); });
  PLAN.weeks = weeks; rebuild();
  Object.keys(logs).forEach(function(k){ delete logs[k]; });
  Object.keys(store.files).forEach(function(p){
    if (!/^logs\/[^/]+\.json$/.test(p)) return;
    var d = fileData(p); if (d && d.id) logs[d.id] = d;
  });
}
function exInfo(name){
  var k = norm(name), hit = null;
  Object.keys(EXL).forEach(function(n){ if (!hit && norm(n) === k) hit = EXL[n]; });
  return hit || {};
}
/* Weeks written to the database by the weekly check-in are untrusted input: coerce every field. */
function cleanId(v){ return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40); }
function nnum(v, d){ var n = Number(v); return (v !== null && v !== '' && isFinite(n)) ? n : d; }
function cleanWeek(id, v){
  if (!v || !Array.isArray(v.sessions)) return null;
  var ss = v.sessions.map(function(sx){
    if (!sx || !sx.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(sx.date))) return null;
    var o = {id:cleanId(sx.id), date:String(sx.date), title:String(sx.title || 'Workout'), sub:String(sx.sub || ''), kind:sx.kind === 'cardio' ? 'cardio' : 'strength', est:nnum(sx.est, 55)};
    if (sx.note) o.note = String(sx.note);
    if (o.kind === 'cardio'){
      var c = sx.cardio || {}; o.cardio = {minutes:nnum(c.minutes, 60), target:String(c.target || ''), detail:String(c.detail || '')};
    } else {
      if (sx.warmup){ var w = sx.warmup; o.warmup = {label:String(w.label || 'Warm-up'), target:String(w.target || ''), dist:!!w.dist, distUnit:String(w.distUnit || 'Miles'), distPh:String(nnum(w.distPh, 2)), timePh:String(nnum(w.timePh, 10))}; }
      o.exercises = (Array.isArray(sx.exercises) ? sx.exercises : []).map(function(e){
        if (!e || !e.id || !e.name) return null;
        var x = {id:cleanId(e.id), name:String(e.name), sets:Math.max(1, Math.min(10, Math.round(nnum(e.sets, 3)))), reps:Math.max(1, Math.round(nnum(e.reps, 8))), w:nnum(e.w, null), rest:Math.max(0, Math.round(nnum(e.rest, 90)))};
        ['perHand', 'perLeg', 'bw'].forEach(function(k){ if (e[k]) x[k] = true; });
        if (e.mode === 'time') x.mode = 'time';
        if (e.ss) x.ss = String(e.ss).slice(0, 2);
        if (e.note) x.note = String(e.note);
        if (e.inc) x.inc = nnum(e.inc, 5);
        if (Array.isArray(e.alts)) x.alts = e.alts.filter(function(a){ return a && a.name; }).map(function(a){ return {name:String(a.name), w:nnum(a.w, null), note:a.note ? String(a.note) : null}; });
        return x;
      }).filter(Boolean);
      if (sx.cond){ var c2 = sx.cond; o.cond = {label:String(c2.label || 'Intervals'), rounds:Math.max(1, Math.min(12, Math.round(nnum(c2.rounds, 5)))), work:String(c2.work || ''), easy:String(c2.easy || ''), cooldown:String(c2.cooldown || '')}; }
    }
    return o;
  }).filter(Boolean);
  if (!ss.length) return null;
  ss.sort(function(a, b){ return a.date.localeCompare(b.date); });
  return {id:cleanId(id), label:String(v.label || 'Week'), range:String(v.range || ''), sessions:ss};
}
function planOf(id){ return ALL.find(function(s){ return s.id === id; }); }

/* ---------- Helpers ---------- */
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function $(id){ return document.getElementById(id); }
function todayStr(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function dt(s){ return new Date(s + 'T12:00:00'); }
function fmtDay(s){ var d = dt(s); return DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate(); }
function rel(s){
  var t = todayStr(); if (s === t) return 'Today';
  var diff = Math.round((dt(s) - dt(t)) / 864e5);
  if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday';
  return fmtDay(s);
}
function clock(sec){
  sec = Math.max(0, Math.round(sec));
  var h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return (h ? h + ':' + String(m).padStart(2,'0') : m) + ':' + String(s).padStart(2,'0');
}
function mins(ms){ var m = Math.round(ms/60000); return m >= 60 ? Math.floor(m/60) + ' h ' + (m%60) + ' min' : m + ' min'; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function num(v){ var n = parseFloat(v); return isFinite(n) ? n : null; }
function norm(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function fmtNum(n){ return Math.round(n).toLocaleString('en-US'); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function blankSets(n){ var a = []; for (var i = 0; i < n; i++) a.push({w:'', r:'', done:false}); return a; }
function target(e){
  var r = e.mode === 'time' ? e.reps + ' s' : e.reps + (e.perLeg ? '/leg' : '');
  return e.sets + ' × ' + r + (e.w != null ? ' · ' + e.w + ' lb' + (e.perHand ? '/hand' : '') : '');
}

/* ---------- State ---------- */
const S = {view:'plan', week:null, sid:null};
const logs = {};

function blankLog(p){
  var ex = {};
  (p.exercises || []).forEach(function(e){ ex[e.id] = {name:e.name, sets:blankSets(e.sets)}; });
  return {id:p.id, title:p.title, date:p.date, week:p.week + 1, kind:p.kind, status:'new', startedAt:null, finishedAt:null,
    warmup:{done:false, dist:'', time:''}, ex:ex, cond:{rounds:[], cooldown:false}, cardio:{minutes:'', dist:'', hr:''}, notes:''};
}
function ensureLog(sid){
  var p = planOf(sid);
  if (!logs[sid]) logs[sid] = blankLog(p);
  var l = logs[sid];
  if (!l.ex) l.ex = {};
  (p.exercises || []).forEach(function(e){ if (!l.ex[e.id]) l.ex[e.id] = {name:e.name, sets:blankSets(e.sets)}; });
  if (!l.warmup) l.warmup = {done:false, dist:'', time:''};
  if (!l.cond) l.cond = {rounds:[], cooldown:false};
  if (!l.cond.rounds) l.cond.rounds = [];
  if (!l.cardio) l.cardio = {minutes:'', dist:'', hr:''};
  return l;
}
function exLog(sid, e){
  var l = logs[sid];
  return (l && l.ex && l.ex[e.id]) ? l.ex[e.id] : {name:e.name, sets:blankSets(e.sets)};
}
function eff(sid, e){
  var name = exLog(sid, e).name;
  if (norm(name) === norm(e.name)) return e;
  var a = altsFor(e).find(function(x){ return norm(x.name) === norm(name); });
  return Object.assign({}, e, a ? a : {w:null, note:null}, {name:name});
}
function P(){ return CFG.progression || {}; }
function incFor(e){
  var info = exInfo(e.name);
  if (info.increment) return info.increment;
  if (e.inc) return e.inc;
  var pr = P(), n = norm(e.name);
  if (e.perHand || /^db|dumbbell/.test(n)) return pr.dumbbellIncrementLb || 5;
  return /squat|deadlift|legpress|rdl|calf|legcurl|hipthrust/.test(n) ? (pr.lowerIncrementLb || 10) : (pr.upperIncrementLb || 5);
}
function roundW(x){ var r = P().roundToLb || 5; return Math.round(x / r) * r; }
function planExOf(sessionId, exId){ var p = planOf(sessionId); return p && p.exercises ? p.exercises.find(function(x){ return x.id === exId; }) : null; }
/* Completed sessions before p that include this exercise name, newest first. Skipped exercises don't count. */
function historyFor(name, p){
  var key = norm(name), out = [];
  Object.keys(logs).forEach(function(id){
    var l = logs[id];
    if (id === p.id || !l || l.status !== 'done' || (l.date || '') > p.date) return;
    Object.keys(l.ex || {}).forEach(function(k){
      var e = l.ex[k];
      if (norm(e.name) !== key || !(e.sets || []).some(function(s){ return s.done; })) return;
      out.push({stamp:(l.date || '') + (l.finishedAt || ''), sets:e.sets, plan:planExOf(l.id, k)});
    });
  });
  out.sort(function(a, b){ return b.stamp.localeCompare(a.stamp); });
  return out;
}
function judge(h){
  var done = h.sets.filter(function(s){ return s.done; });
  var ws = done.map(function(s){ return num(s.w); }).filter(function(x){ return x != null; });
  function tgt(s){ var t = num(s.t); return t != null ? t : (h.plan ? h.plan.reps : null); }
  var allDone = done.length === h.sets.length;
  var ok = allDone && done.every(function(s){ var t = tgt(s); return t == null || (num(s.r) || 0) >= t; });
  var lastT = done.length ? tgt(done[0]) : null;
  return {w:ws.length ? Math.max.apply(null, ws) : null, ok:ok, allDone:allDone, t:lastT};
}
/* Next target for an exercise in session p. Rules come from config.json → progression. */
function autoTarget(p, plan){
  var x = eff(p.id, plan), res = {w:x.w, reps:x.reps, kind:'plan', why:''}, pr = P();
  var hist = historyFor(x.name, p);
  if (!hist.length) return res;
  var a = judge(hist[0]), inc = incFor(x);
  if (x.bw && x.mode !== 'time'){
    var lt = a.t || x.reps, step = pr.bodyweightRepStep || 1;
    if (a.ok){ res.reps = Math.min(lt + step, pr.bodyweightRepCap || 12); res.kind = 'up'; res.why = '+' + step + ' rep: every rep hit last time'; }
    else { res.reps = lt; res.kind = 'hold'; res.why = 'Same reps: finish all sets first'; }
    return res;
  }
  if (x.mode === 'time' && (x.bw || a.w == null)){
    var ls = a.t || x.reps, ts = pr.timedHoldStepSec || 5;
    if (a.ok){ res.reps = Math.min(ls + ts, pr.timedHoldCapSec || 90); res.kind = 'up'; res.why = '+' + ts + ' s: full hold last time'; }
    else { res.reps = ls; res.kind = 'hold'; res.why = 'Same time: finish all holds first'; }
    return res;
  }
  if (a.w == null) return res;
  if (a.ok){
    var bump = a.w + inc, floor = pr.planWeightIsFloor === false ? 0 : (x.w || 0);
    res.w = Math.max(floor, bump); res.kind = 'up';
    res.why = res.w === bump ? '+' + inc + ' lb: every rep hit at ' + a.w : 'Planned jump: every rep hit at ' + a.w;
    return res;
  }
  var need = Math.max(1, pr.missesBeforeDeload || 2), misses = 0;
  for (var i = 0; i < hist.length && i < need; i++){ var j = judge(hist[i]); if (!j.ok && j.w === a.w) misses++; else break; }
  if (misses >= need){
    var pct = pr.deloadPercent || 10;
    res.w = roundW(a.w * (1 - pct / 100)); res.kind = 'down'; res.why = '−' + pct + '%: missed reps at ' + a.w + ' ' + need + ' times in a row';
  } else {
    res.w = a.w; res.kind = 'hold'; res.why = 'Hold at ' + a.w + ': ' + (a.allDone ? 'missed some reps' : 'not all sets done') + ' last time';
  }
  return res;
}
function altsFor(e){
  if (e.alts && e.alts.length) return e.alts;
  return (exInfo(e.name).alternates || []).map(function(n){ return {name:n, w:null, note:null}; });
}
function statusOf(id){ var l = logs[id]; return l ? l.status : 'new'; }

/* Most recent earlier log of the same exercise name, for the PREVIOUS column */
function prevSets(name, p){
  var best = null, key = norm(name);
  Object.keys(logs).forEach(function(id){
    var l = logs[id];
    if (id === p.id || !l || (l.status !== 'done' && l.status !== 'active')) return;
    if ((l.date || '') > p.date) return;
    Object.keys(l.ex || {}).forEach(function(k){
      var e = l.ex[k];
      if (norm(e.name) !== key) return;
      var done = (e.sets || []).filter(function(s){ return s.done; });
      if (!done.length) return;
      var stamp = (l.date || '') + (l.finishedAt || '');
      if (!best || stamp > best.stamp) best = {stamp:stamp, sets:done};
    });
  });
  return best;
}
function fmtSet(s, mode){
  var w = s.w !== '' && s.w != null ? s.w : '';
  if (mode === 'time') return (w ? w + ' × ' : '') + (s.r || '?') + ' s';
  return (w ? w + ' × ' : 'BW × ') + (s.r || '?');
}
function fmtSets(sets, mode){
  var done = sets.filter(function(s){ return s.done; });
  if (!done.length) return 'skipped';
  var same = done.every(function(s){ return String(s.w) === String(done[0].w) && String(s.r) === String(done[0].r); });
  if (same) return fmtSet(done[0], mode) + ' × ' + done.length;
  return done.map(function(s){ return fmtSet(s, mode); }).join(', ');
}
function stats(p, l){
  var sets = 0, vol = 0, total = 0;
  (p.exercises || []).forEach(function(e){
    var el = l.ex && l.ex[e.id]; if (!el) return;
    el.sets.forEach(function(s){
      total++;
      if (!s.done) return;
      sets++;
      if (e.mode !== 'time'){ var w = num(s.w), r = num(s.r); if (w && r) vol += w * r; }
    });
  });
  var dur = (l.startedAt && l.finishedAt) ? (Date.parse(l.finishedAt) - Date.parse(l.startedAt)) : null;
  return {sets:sets, total:total, vol:vol, dur:dur};
}

/* ---------- Sync: local-first, mirrored to a private GitHub repo ---------- */
let syncState = {state:'idle', msg:''}, syncing = false, pushT = null, repoEmpty = false;
function setSync(){
  var el = $('sync'); if (!el) return;
  var n = pendingCount(), txt;
  if (!ghReady()) txt = 'Saved on this phone';
  else if (syncState.state === 'busy') txt = 'Syncing…';
  else if (syncState.state === 'error') txt = syncState.msg;
  else if (!navigator.onLine) txt = 'Offline · ' + (n ? n + ' change' + (n === 1 ? '' : 's') + ' waiting' : 'plan saved on this phone');
  else if (n) txt = n + ' change' + (n === 1 ? '' : 's') + ' waiting';
  else txt = store.lastPull ? 'Synced ' + ago(store.lastPull) : 'Ready';
  el.textContent = txt;
  el.className = 'sync' + (syncState.state === 'error' ? ' warn' : '');
}
function ago(iso){
  var s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago';
}
function save(id){
  var l = logs[id]; if (!l) return;
  if (l.status === 'done' && planOf(id)){ try { l.summary = summaryText(id); } catch (e) {} }
  writeFile('logs/' + id + '.json', l); setSync();
}
function ghReady(){ var g = store.settings.gh; return !!(g.owner && g.repo && g.token); }
function encPath(p){ return p.split('/').map(encodeURIComponent).join('/'); }
async function gh(method, path, body){
  var g = store.settings.gh, r;
  try {
    r = await fetch('https://api.github.com/repos/' + encodeURIComponent(g.owner) + '/' + encodeURIComponent(g.repo) + path, {
      method:method, cache:'no-store',
      headers:Object.assign({'Authorization':'Bearer ' + g.token, 'Accept':'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'}, body ? {'Content-Type':'application/json'} : {}),
      body:body ? JSON.stringify(body) : undefined});
  } catch (e) { var ne = new Error('network'); ne.status = 0; throw ne; }
  if (!r.ok){ var err = new Error('GitHub ' + r.status); err.status = r.status; try { err.detail = await r.json(); } catch (x) {} throw err; }
  return r.status === 204 ? null : r.json();
}
function b64enc(str){ return btoa(unescape(encodeURIComponent(str))); }
function b64dec(b){ return decodeURIComponent(escape(atob(String(b).replace(/\s/g, '')))); }
const SYNCED = /^(config|weeks|logs)\/[^/]+\.json$/;
/* Written only by the Tredict sync job in the data repo. Pulled, never pushed. */
const PULLED = /^tredict\/[^/]+\.json$/;
async function pull(){
  var g = store.settings.gh, remote = {};
  repoEmpty = false;
  try {
    var tree = await gh('GET', '/git/trees/' + encodeURIComponent(g.branch || 'main') + '?recursive=1');
    (tree.tree || []).forEach(function(t){ if (t.type === 'blob' && (SYNCED.test(t.path) || PULLED.test(t.path))) remote[t.path] = t.sha; });
  } catch (e) {
    if (e.status === 409 || (e.status === 404 && e.detail && /empty/i.test(e.detail.message || ''))) repoEmpty = true;
    else if (e.status === 404){
      var info = await gh('GET', ''); // repo exists? then the branch is missing → treat as empty
      if (info && info.size === 0) repoEmpty = true; else throw e;
    } else throw e;
  }
  for (var p in remote){
    var f = store.files[p];
    if (f && f.sha === remote[p]) continue;
    if (store.dirty[p] && f && f.sha == null && !/^logs\//.test(p)) delete store.dirty[p]; // built-in default edited before the first pull: the repo's copy wins
    if (store.dirty[p]){ if (f) f.remoteSha = remote[p]; continue; }
    var blob = await gh('GET', '/git/blobs/' + remote[p]);
    try { store.files[p] = {data:JSON.parse(b64dec(blob.content)), sha:remote[p]}; }
    catch (e) { /* a file that isn't valid JSON is skipped; the local copy stays */ }
  }
  Object.keys(store.files).forEach(function(p){ if (SYNCED.test(p) && !remote[p] && !store.dirty[p] && store.files[p].sha == null) store.dirty[p] = Date.now(); });
  store.lastPull = new Date().toISOString(); persist();
}
async function push(){
  var g = store.settings.gh, paths = Object.keys(store.dirty);
  for (var i = 0; i < paths.length; i++){
    var p = paths[i], f = store.files[p], stamp = store.dirty[p];
    if (!f || !SYNCED.test(p) || PULLED.test(p)){ delete store.dirty[p]; continue; }
    var body = {message:'Update ' + p + ' from workout app', content:b64enc(JSON.stringify(f.data, null, 2) + '\n')};
    if (!repoEmpty) body.branch = g.branch || 'main';
    var sha = f.remoteSha || f.sha; if (sha) body.sha = sha;
    var res;
    try { res = await gh('PUT', '/contents/' + encPath(p), body); }
    catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
      var cur = null;
      try { cur = await gh('GET', '/contents/' + encPath(p) + (repoEmpty ? '' : '?ref=' + encodeURIComponent(g.branch || 'main'))); } catch (x) { if (x.status !== 404) throw x; }
      if (cur && cur.sha) body.sha = cur.sha; else delete body.sha;
      res = await gh('PUT', '/contents/' + encPath(p), body);
    }
    repoEmpty = false;
    f.sha = res && res.content ? res.content.sha : f.sha; delete f.remoteSha;
    if (store.dirty[p] === stamp) delete store.dirty[p];
    store.lastPush = new Date().toISOString(); persist();
  }
}
async function sync(manual){
  if (syncing) return;
  if (!ghReady()){ setSync(); return; }
  if (!navigator.onLine){ setSync(); return; }
  syncing = true; syncState = {state:'busy', msg:''}; setSync();
  try {
    await pull(); await push();
    syncState = {state:'ok', msg:''};
    loadAll();
    if (tdGh()){ applyTredictState(); loadRecovery(false); }
    if (S.view !== 'session') render();
    retryPendingTredict();
  } catch (e) {
    syncState = {state:'error', msg:e.status === 401 ? 'GitHub token rejected. Update it in Settings.' : e.status === 403 ? 'GitHub token can’t write to the repo. Check its permissions.' : e.status === 404 ? 'GitHub repo not found. Check Settings.' : e.status === 0 ? 'Couldn’t reach GitHub. Will retry.' : 'Sync failed (' + e.status + '). Will retry.'};
  }
  syncing = false; persistNow(); setSync();
  if (manual && $('set-sync-status')) $('set-sync-status').textContent = syncState.state === 'error' ? syncState.msg : 'Synced just now';
}
function schedulePush(){ clearTimeout(pushT); pushT = setTimeout(function(){ sync(false); }, 4000); }
window.addEventListener('online', function(){ setSync(); sync(false); loadRecovery(false); });
window.addEventListener('offline', setSync);
window.addEventListener('pagehide', persistNow);
document.addEventListener('visibilitychange', function(){ if (document.hidden) persistNow(); else { sync(false); if (R.end) drawRest(); } });

/* ---------- Views ---------- */
function nextUp(){
  var t = todayStr();
  var act = ALL.find(function(s){ return statusOf(s.id) === 'active'; });
  if (act) return act;
  return ALL.find(function(s){ return s.date >= t && statusOf(s.id) !== 'done'; }) || null;
}
function dayPill(s){
  var st = statusOf(s.id), t = todayStr();
  if (st === 'done') return '<span class="pill done">Done</span>';
  if (st === 'active') return '<span class="pill active">In progress</span>';
  if (s.date === t) return '<span class="pill today">Today</span>';
  if (s.date < t) return '<span class="pill">Missed</span>';
  if (rel(s.date) === 'Tomorrow') return '<span class="pill">Tomorrow</span>';
  return '<span class="pill">Upcoming</span>';
}
function daySub(s){
  var l = logs[s.id];
  if (l && l.status === 'done'){
    if (s.kind === 'cardio') return (l.cardio && l.cardio.minutes ? l.cardio.minutes + ' min' : 'Logged') + (l.cardio && l.cardio.hr ? ' · avg HR ' + l.cardio.hr : '');
    var st = stats(s, l);
    return (st.dur ? mins(st.dur) + ' · ' : '') + fmtNum(st.vol) + ' lb moved';
  }
  if (s.kind === 'cardio') return s.cardio.minutes + ' min · ' + s.cardio.target;
  return s.exercises.length + ' exercises · about ' + s.est + ' min';
}

function viewPlan(){
  var t = todayStr();
  if (!PLAN.weeks.length){
    return '<header class="top"><div><div class="eyebrow">Training plan</div><h1>Workouts</h1></div><div class="sync" id="sync"></div></header>' +
      '<section class="rec" id="rec">' + recInner() + '</section>' +
      '<section class="hero"><div class="when">No plan yet</div><h2>Load your plan</h2><div class="meta">Connect GitHub or import a backup in Settings. After that, every week is saved on this phone.</div><ul></ul><button type="button" class="btn" data-act="nav" data-v="settings">Open Settings</button></section>';
  }
  if (S.week == null || S.week >= PLAN.weeks.length){
    S.week = PLAN.weeks.findIndex(function(w){ return w.sessions.some(function(s){ return s.date >= t; }); });
    if (S.week < 0) S.week = PLAN.weeks.length - 1;
  }
  var wk = PLAN.weeks[S.week];
  var doneN = wk.sessions.filter(function(s){ return statusOf(s.id) === 'done'; }).length;
  var nx = nextUp();
  var h = '<header class="top"><div><div class="eyebrow">Training plan</div><h1>Workouts</h1></div><div class="sync" id="sync"></div></header>';
  h += '<section class="rec" id="rec">' + recInner() + '</section>';
  if (nx){
    var nl = logs[nx.id], active = nl && nl.status === 'active';
    h += '<section class="hero"><div class="when">' + (active ? 'In progress' : 'Next up · ' + esc(rel(nx.date))) + '</div>' +
      '<h2>' + esc(nx.title) + '</h2><div class="meta">' + esc(fmtDay(nx.date)) + ' · ' + esc(nx.sub) + ' · about ' + nx.est + ' min</div><ul>';
    if (nx.kind === 'cardio'){
      h += '<li><span>' + esc(nx.cardio.target) + '</span><span>' + nx.cardio.minutes + ' min</span></li>';
    } else {
      if (nx.warmup) h += '<li><span>Warm-up: ' + esc(nx.warmup.label) + '</span><span>' + esc(nx.warmup.target.split(' · ')[0]) + '</span></li>';
      nx.exercises.forEach(function(e){ var x = eff(nx.id, e), at = autoTarget(nx, e); h += '<li><span>' + esc(x.name) + '</span><span>' + esc(target(Object.assign({}, x, {w:at.w, reps:at.reps}))) + '</span></li>'; });
      if (nx.cond) h += '<li><span>' + esc(nx.cond.label) + '</span><span>' + nx.cond.rounds + ' rounds</span></li>';
    }
    h += '</ul><button type="button" class="btn" data-act="open" data-sid="' + nx.id + '">' + (active ? 'Resume workout' : 'Open workout') + '</button></section>';
  } else {
    h += '<section class="hero"><div class="when">All caught up</div><h2>Plan complete</h2><div class="meta">Every session in this block is logged. Ask Claude for the next block.</div></section>';
  }
  h += '<div class="tabs" role="tablist">';
  PLAN.weeks.forEach(function(w, i){
    h += '<button type="button" class="tab" role="tab" id="tab-' + i + '" data-act="tab" data-i="' + i + '" aria-selected="' + (i === S.week) + '"><b>' + esc(w.label) + '</b><span>' + esc(w.range) + '</span></button>';
  });
  h += '</div><div class="prog" aria-hidden="true">' + wk.sessions.map(function(s){ return '<i class="' + (statusOf(s.id) === 'done' ? 'on' : '') + '"></i>'; }).join('') + '</div>';
  h += '<div class="prog-label">' + doneN + ' of ' + wk.sessions.length + ' sessions done</div><div class="days">';
  wk.sessions.forEach(function(s){
    var d = dt(s.date);
    h += '<button type="button" class="day" data-act="open" data-sid="' + s.id + '"><div class="date"><small>' + DOW[d.getDay()] + '</small><b>' + d.getDate() + '</b></div>' +
      '<div><h3>' + esc(s.title) + '</h3><p>' + esc(daySub(s)) + '</p></div>' + dayPill(s) + '</button>';
  });
  h += '</div><p class="offline-note">' + PLAN.weeks.length + ' week' + (PLAN.weeks.length === 1 ? '' : 's') + ' of workouts saved on this phone, ready without signal.</p>';
  return h;
}

function setRow(p, e, el, prev, i){
  var s = el.sets[i];
  var pw = e.w != null ? e.w : (prev ? (prev.sets[i] || prev.sets[prev.sets.length - 1]).w : '');
  var phW = (pw === '' || pw == null) ? (e.bw ? 'BW' : '–') : pw;
  var pv = prev && prev.sets[i] ? fmtSet(prev.sets[i], e.mode) : '—';
  return '<div class="set-row' + (s.done ? ' done' : '') + '">' +
    '<span class="set-n">' + (i + 1) + '</span><span class="prev">' + esc(pv) + '</span>' +
    '<input class="in" id="w-' + e.id + '-' + i + '" data-f="w" data-ex="' + e.id + '" data-i="' + i + '" inputmode="decimal" autocomplete="off" placeholder="' + esc(phW) + '" value="' + esc(s.w) + '" aria-label="Set ' + (i + 1) + ' weight in pounds">' +
    '<input class="in" id="r-' + e.id + '-' + i + '" data-f="r" data-ex="' + e.id + '" data-i="' + i + '" inputmode="numeric" autocomplete="off" placeholder="' + e.reps + '" value="' + esc(s.r) + '" aria-label="Set ' + (i + 1) + (e.mode === 'time' ? ' seconds' : ' reps') + '">' +
    '<button type="button" class="chk" id="c-' + e.id + '-' + i + '" data-act="set" data-ex="' + e.id + '" data-i="' + i + '" aria-pressed="' + s.done + '" aria-label="Complete set ' + (i + 1) + '">✓</button></div>';
}

function exCard(p, plan, idx){
  var el = exLog(p.id, plan), at = autoTarget(p, plan), e = Object.assign({}, eff(p.id, plan), {w:at.w, reps:at.reps}), prev = prevSets(el.name, p);
  var doneN = el.sets.filter(function(s){ return s.done; }).length;
  var notes = [];
  if (norm(el.name) !== norm(plan.name)) notes.push('Swapped from ' + plan.name + '.');
  if (e.note) notes.push(e.note);
  var restTxt = e.rest ? 'Rest ' + clock(e.rest) : 'Go straight to the next exercise';
  var h = '<section class="card' + (e.ss ? ' ss' : '') + '" id="ex-' + e.id + '"><div class="card-h"><div>' +
    (e.ss ? '<span class="tag">Superset ' + e.ss + '</span>' : '') +
    '<h3>' + esc(el.name) + '</h3><div class="card-meta">' + esc(target(e)) + ' · ' + restTxt + '</div>' +
    (at.why ? '<div class="auto ' + at.kind + '">' + (at.kind === 'up' ? '↑ ' : at.kind === 'down' ? '↓ ' : '= ') + esc(at.why) + '</div>' : '') +
    (notes.length ? '<div class="card-note">' + esc(notes.join(' ')) + '</div>' : '') +
    '</div><span class="count' + (doneN === el.sets.length ? ' full' : '') + '">' + doneN + '/' + el.sets.length + '</span></div>' +
    '<div class="sets"><div class="set-head"><span>Set</span><span>Previous</span><span>' + (e.perHand ? 'Lb/hand' : 'Lb') + '</span><span>' + (e.mode === 'time' ? 'Sec' : 'Reps') + '</span><span></span></div>';
  for (var i = 0; i < el.sets.length; i++) h += setRow(p, e, el, prev, i);
  h += '</div><div class="card-actions"><button type="button" class="link" id="form-' + e.id + '" data-act="form" data-ex="' + e.id + '">▶ Form</button>' +
    '<button type="button" class="link" data-act="add-set" data-ex="' + e.id + '">+ Add set</button>' +
    (el.sets.length > 1 ? '<button type="button" class="link muted" data-act="del-set" data-ex="' + e.id + '">Remove set</button>' : '') +
    '<button type="button" class="link muted" data-act="swap" data-ex="' + e.id + '">Swap</button></div></section>';
  return h;
}

function viewSession(){
  var p = planOf(S.sid), l = logs[p.id], st = l ? l.status : 'new';
  var btn;
  if (st === 'done') btn = '<button type="button" class="bar-btn done" data-act="summary">Done</button>';
  else if (p.kind === 'cardio') btn = '<button type="button" class="bar-btn" data-act="cardio-done">Log it</button>';
  else if (st === 'active') btn = '<button type="button" class="bar-btn" data-act="finish">Finish</button>';
  else btn = '<button type="button" class="bar-btn" data-act="start">Start</button>';
  var sub = esc(fmtDay(p.date)) + ' · <span id="elapsed">' + elapsedText(p, l) + '</span>';
  var h = '<header class="bar"><button type="button" class="back" data-act="back" aria-label="Back to plan">‹</button>' +
    '<div><div class="bar-title">' + esc(p.title) + '</div><div class="bar-sub">' + sub + '</div></div>' + btn + '</header>';
  if (p.note) h += '<p class="lead">' + esc(p.note) + '</p>';

  if (p.kind === 'cardio'){
    var c = (l && l.cardio) || {};
    h += '<section class="card"><span class="tag">Cardio</span><h3>' + esc(p.title) + '</h3><div class="card-meta">' + p.cardio.minutes + ' min · ' + esc(p.cardio.target) + '</div>' +
      '<div class="card-note">' + esc(p.cardio.detail) + '</div>' +
      '<div class="fields">' +
      '<label for="cd-minutes">Minutes<input class="in" id="cd-minutes" data-f="cd-minutes" inputmode="numeric" placeholder="' + p.cardio.minutes + '" value="' + esc(c.minutes) + '"></label>' +
      '<label for="cd-dist">Distance<input class="in" id="cd-dist" data-f="cd-dist" inputmode="decimal" placeholder="mi" value="' + esc(c.dist) + '"></label>' +
      '<label for="cd-hr">Avg HR<input class="in" id="cd-hr" data-f="cd-hr" inputmode="numeric" placeholder="bpm" value="' + esc(c.hr) + '"></label>' +
      '</div><p class="card-note" style="color:var(--muted)">Record it on your watch in its normal ride or rowing mode, then tap Log it. Time, distance and heart rate come in from Tredict.</p></section>';
  } else {
    if (p.warmup){
      var wu = (l && l.warmup) || {done:false, dist:'', time:''};
      h += '<section class="card"><div class="card-h"><div><span class="tag">Warm-up</span><h3>' + esc(p.warmup.label) + '</h3><div class="card-meta">' + esc(p.warmup.target) + '</div></div>' +
        '<span class="count' + (wu.done ? ' full' : '') + '">' + (wu.done ? '1/1' : '0/1') + '</span></div>' +
        '<div class="sets"><div class="set-head wu"><span></span><span>' + (p.warmup.dist ? esc(p.warmup.distUnit) : '') + '</span><span>Min</span><span></span></div>' +
        '<div class="set-row wu' + (wu.done ? ' done' : '') + '"><span class="prev">' + (wu.done ? 'Done' : 'Easy pace') + '</span>' +
        (p.warmup.dist ? '<input class="in" id="wu-dist" data-f="wu-dist" inputmode="decimal" placeholder="' + p.warmup.distPh + '" value="' + esc(wu.dist) + '" aria-label="Warm-up distance in miles">' : '<span></span>') +
        '<input class="in" id="wu-time" data-f="wu-time" inputmode="decimal" placeholder="' + p.warmup.timePh + '" value="' + esc(wu.time) + '" aria-label="Warm-up minutes">' +
        '<button type="button" class="chk" id="wu-chk" data-act="wu" aria-pressed="' + !!wu.done + '" aria-label="Warm-up done">✓</button></div></div></section>';
    }
    p.exercises.forEach(function(e, i){ h += exCard(p, e, i); });
    if (p.cond){
      var cd = (l && l.cond) || {rounds:[], cooldown:false};
      h += '<section class="card"><span class="tag">Conditioning</span><h3>' + esc(p.cond.label) + '</h3><div class="card-meta">' + p.cond.rounds + ' rounds · ' + esc(p.cond.work) + ' / ' + esc(p.cond.easy) + '</div>' +
        '<div class="card-note">Your watch runs the intervals. Tap each round as you finish it.</div><div class="rounds">';
      for (var r = 0; r < p.cond.rounds; r++){
        var on = !!(cd.rounds && cd.rounds[r]);
        h += '<button type="button" class="round' + (on ? ' on' : '') + '" id="round-' + r + '" data-act="round" data-i="' + r + '" aria-pressed="' + on + '">' + (r + 1) + '</button>';
      }
      h += '<button type="button" class="round' + (cd.cooldown ? ' on' : '') + '" id="round-cd" data-act="cooldown" aria-pressed="' + !!cd.cooldown + '">Cooldown</button></div></section>';
    }
  }
  h += '<label class="notes-l" for="notes">Notes</label><textarea class="textin" id="notes" data-f="notes" placeholder="How it felt, swaps, anything to change next time">' + esc(l ? l.notes : '') + '</textarea>';
  h += '<div class="end">';
  if (st === 'done') h += '<button type="button" class="btn good" data-act="summary">View summary</button>';
  else if (p.kind === 'cardio') h += '<button type="button" class="btn" data-act="cardio-done">Log it as done</button>';
  else if (st === 'active') h += '<button type="button" class="btn" data-act="finish">Finish workout</button>';
  else h += '<button type="button" class="btn" data-act="start">Start workout</button>';
  h += '</div>';
  return h;
}
function elapsedText(p, l){
  if (!l || !l.startedAt) return p.kind === 'cardio' ? (l && l.status === 'done' ? 'Logged' : 'Not logged yet') : 'Not started';
  if (l.status === 'done'){
    var st = stats(p, l);
    return p.kind === 'cardio' ? 'Logged' : (st.dur ? mins(st.dur) + ' · ' : '') + fmtNum(st.vol) + ' lb';
  }
  return clock((Date.now() - Date.parse(l.startedAt)) / 1000);
}

function viewHistory(){
  var done = Object.keys(logs).map(function(k){ return logs[k]; }).filter(function(l){ return l && l.status === 'done' && planOf(l.id); });
  done.sort(function(a, b){ return ((b.date || '') + (b.finishedAt || '')).localeCompare((a.date || '') + (a.finishedAt || '')); });
  var h = '<header class="top"><div><div class="eyebrow">Logged sessions</div><h1>History</h1></div><div class="sync" id="sync"></div></header>';
  if (!done.length) return h + '<p class="empty">' + 'Finished workouts show up here.' + '</p>';
  done.forEach(function(l){
    var p = planOf(l.id), st = stats(p, l);
    h += '<section class="h-card"><h3>' + esc(p.title) + '</h3><div class="meta">' + esc(fmtDay(p.date)) +
      (p.kind === 'cardio' ? (l.cardio && l.cardio.minutes ? ' · ' + esc(l.cardio.minutes) + ' min' : '') : (st.dur ? ' · ' + mins(st.dur) : '') + ' · ' + fmtNum(st.vol) + ' lb') + '</div><ul class="h-lines">';
    lines(p, l).forEach(function(x){ h += '<li><span>' + esc(x[0]) + '</span><span>' + esc(x[1]) + '</span></li>'; });
    h += '</ul>' + watchLine(l) + tsHtml(p.id) + '<button type="button" class="link" data-act="open" data-sid="' + p.id + '">Open session</button></section>';
  });
  return h;
}
function lines(p, l){
  var out = [];
  if (p.kind === 'cardio'){
    var c = l.cardio || {};
    out.push([p.title, [c.minutes ? c.minutes + ' min' : '', c.dist ? c.dist + ' mi' : '', c.hr ? 'avg HR ' + c.hr : ''].filter(Boolean).join(' · ') || 'done']);
    return out;
  }
  if (p.warmup && l.warmup && l.warmup.done){
    out.push(['Warm-up', [l.warmup.dist ? l.warmup.dist + ' mi' : '', l.warmup.time ? l.warmup.time + ' min' : ''].filter(Boolean).join(' in ') || 'done']);
  }
  p.exercises.forEach(function(e){
    var el = l.ex && l.ex[e.id]; if (!el) return;
    out.push([el.name, fmtSets(el.sets, e.mode)]);
  });
  if (p.cond){
    var n = (l.cond && l.cond.rounds || []).filter(Boolean).length;
    out.push([p.cond.label, n + ' of ' + p.cond.rounds + ' rounds']);
  }
  return out;
}
function summaryText(id){
  var p = planOf(id), l = logs[id];
  var t = p.title + ' (' + fmtDay(p.date) + ')\n';
  lines(p, l).forEach(function(x){ t += x[0] + ': ' + x[1] + '\n'; });
  if (l.notes) t += 'Notes: ' + l.notes + '\n';
  return t.trim();
}

/* ---------- Form animations: original side-view figures, solved with two-bone IK ---------- */
const L = {thigh:44, shin:44, torso:51, ua:34, fa:34, neck:6, head:11, foot:16};
const GY = 206, OFFY = 58, CW = 320, CH = 272;
const COL = {near:'#ECEAE6', far:'#5D626C', plate:'#FF6A2B', plateFill:'rgba(255,106,43,.2)', mach:'#363B44', machHi:'#4A505B', ground:'#363A42', guide:'rgba(255,255,255,.16)', trace:'rgba(255,106,43,.5)'};
const HANG = {hang:true, dx:1};
const FORM = {
  backsquat:{guide:true, path:true, props:[{t:'plate'}],
    A:{hip:[154,113], torso:2, a1:[150,200], h1:{rel:[-5,3]}, eb:-1},
    B:{hip:[128,160], torso:42, a1:[150,200], h1:{rel:[-5,3]}, eb:-1},
    tempo:[0.6,1.6,0.3,1.2],
    cues:['Bar sits on your upper traps, hands just outside your shoulders. Brace before you unrack.','Sit down between your heels with knees tracking over your toes.','Reach parallel (hip crease level with the knee), then drive up with chest and hips rising together.'],
    avoid:'Hips shooting up first, which turns the squat into a good morning.'},
  frontsquat:{guide:true, path:true, props:[{t:'plate'}],
    A:{hip:[153,113], torso:2, a1:[150,200], h1:{rel:[4,6]}, eb:1},
    B:{hip:[134,163], torso:20, a1:[150,200], h1:{rel:[4,6]}, eb:1},
    tempo:[0.6,1.6,0.3,1.2],
    cues:['Bar rests on the front of your shoulders. Elbows high, fingertips just keeping it in place.','Stay tall: your torso is far more upright than in a back squat.','Sit straight down and let your knees travel forward over your toes.'],
    avoid:'Elbows dropping, which rolls the bar forward off your shoulders.'},
  legpress:{props:[{t:'legpress'}],
    A:{hip:[92,172], torso:-58, a1:[168,120], f1:-137, h1:[104,182], eb:-1},
    B:{hip:[92,172], torso:-58, a1:[140,150], f1:-137, h1:[104,182], eb:-1},
    tempo:[0.5,1.5,0.3,1.1],
    cues:['Feet shoulder-width in the middle of the platform. Hips and lower back stay flat on the pad.','Lower until your knees reach about 90°, or as deep as your hips stay down.','Press through your whole foot and stop just short of locking the knees.'],
    avoid:'Going so deep that your tailbone curls up off the seat.'},
  rdl:{path:true, guide:true, props:[{t:'plate'}],
    A:{hip:[152,113], torso:3, a1:[150,200], h1:[156,129]},
    B:{hip:[120,120], torso:70, a1:[150,200], h1:[157,166]},
    tempo:[0.5,1.7,0.3,1.2],
    cues:['Start standing with soft knees, and keep that same knee bend the whole rep.','Push your hips straight back and let the bar slide down your thighs.','Stop when your hamstrings are stretched (usually just below the knee), then drive your hips forward.'],
    avoid:'Rounding your lower back to reach lower.'},
  deadlift:{path:true, guide:true, props:[{t:'plate'}],
    A:{hip:[114,147], torso:55, a1:[150,200], h1:[155,186]},
    B:{hip:[152,113], torso:0, a1:[150,200], h1:[153,128]},
    tempo:[0.6,1.3,0.5,1.4],
    cues:['Bar over mid-foot with your shins touching it. Grip just outside your legs.','Pull the slack out first: chest up, lats tight, hips set above the knees.','Push the floor away. Keep the bar against your legs and finish tall with your glutes squeezed.'],
    avoid:'Jerking the bar off the floor, or leaning back at the top.'},
  trapbar:{path:true, guide:true, props:[{t:'trap'}],
    A:{hip:[128.6,160.1], torso:38, a1:[150,200], h1:HANG},
    B:{hip:[152,113], torso:0, a1:[150,200], h1:HANG},
    tempo:[0.6,1.3,0.5,1.4],
    cues:['Stand centered in the bar with the handles in line with the middle of your feet.','Hips sit lower and chest stays taller than in a straight-bar deadlift.','Drive through the floor so your hips and shoulders rise together.'],
    avoid:'Gripping off-center, which tips the bar forward or back.'},
  bss:{props:[{t:'bench', x:46, y:170, w:66}, {t:'db'}],
    A:{hip:[140,120], torso:5, a1:[172,200], a2:[92,165], f2:160, h1:HANG},
    B:{hip:[132,158], torso:12, a1:[172,200], a2:[92,165], f2:160, h1:HANG},
    tempo:[0.5,1.5,0.3,1.1],
    cues:['Rear laces on the bench. Set your front foot far enough out that the front shin stays fairly vertical.','Drop straight down until your back knee nearly touches the floor.','Push through your front heel. Finish all reps on one leg, then switch.'],
    avoid:'Pushing off the back foot. It is only there for balance.'},
  lunge:{props:[{t:'db'}],
    A:{hip:[150,113], torso:2, a1:[150,200], a2:[150,200], h1:HANG},
    B:{hip:[124,160], torso:6, a1:[150,200], a2:[88,191], f2:55, h1:HANG},
    tempo:[0.5,1.3,0.3,1.1],
    cues:['Stand tall with the dumbbells at your sides.','Step back far enough that both knees bend to about 90°.','Lightly touch the back knee down, then drive through the front foot to stand.'],
    avoid:'Letting the front knee cave inward.'},
  legcurl:{props:[{t:'bench', x:30, y:157, w:128}, {t:'roller'}],
    A:{hip:[110,150], torso:-90, a1:[197,150], f1:10, h1:[50,166], kb:1},
    B:{hip:[110,150], torso:-90, a1:[145,107], f1:-100, h1:[50,166], kb:1},
    tempo:[0.4,1.0,0.4,1.8],
    cues:['Knees just off the end of the pad, with the roller sitting just above your heels.','Curl toward your glutes while keeping your hips pressed into the bench.','Lower slowly, taking 2 to 3 seconds.'],
    avoid:'Lifting your hips off the bench to swing the weight up.'},
  calf:{props:[{t:'step', x:118, y:184, w:58}],
    A:{hip:[149.5,104], torso:0, a1:[147.5,190.8], f1:-25, h1:HANG},
    B:{hip:[152.7,86], torso:0, a1:[150.7,172.7], f1:45, h1:HANG},
    tempo:[0.6,1.0,0.6,1.4],
    cues:['Balls of your feet on the edge of the step, heels hanging off.','Lower until you feel a full stretch and pause for a beat.','Rise as high as you can and squeeze at the top.'],
    avoid:'Bouncing out of the bottom.'},
  plank:{props:[],
    A:{hip:[142.7,176.4], torso:80.5, a1:[56,191], f1:75, h1:[227,202], eb:1},
    B:{hip:[142.7,178], torso:80.5, a1:[56,191], f1:75, h1:[227,202], eb:1},
    tempo:[0,2,0,2],
    cues:['Elbows under your shoulders, forearms flat on the floor.','Keep one straight line from head to heels. Squeeze your glutes and brace your core.','Breathe slowly. Hold the position, not your breath.'],
    avoid:'Hips sagging toward the floor or piking up.'},
  bench:{path:true, props:[{t:'bench', x:40, y:159, w:110}, {t:'plate'}],
    A:{hip:[128,152], torso:-90, a1:[172,200], h1:[80,86]},
    B:{hip:[128,152], torso:-90, a1:[172,200], h1:[88,140]},
    tempo:[0.5,1.6,0.3,1.1],
    cues:['Eyes under the bar, shoulder blades pinched down and back, feet planted.','Lower under control to your lower chest with elbows about 45° from your body.','Press up and slightly back so the bar finishes over your shoulders.'],
    avoid:'Bouncing the bar off your chest or flaring your elbows straight out.'},
  dbbench:{props:[{t:'bench', x:40, y:159, w:110}, {t:'db'}],
    A:{hip:[128,152], torso:-90, a1:[172,200], h1:[79,88]},
    B:{hip:[128,152], torso:-90, a1:[172,200], h1:[85,146]},
    tempo:[0.5,1.6,0.3,1.1],
    cues:['Kick the dumbbells up off your knees as you lie back.','Lower to chest level with elbows about 45° from your body.','Press up and slightly in without clanking the dumbbells together.'],
    avoid:'Dropping the dumbbells far below chest level.'},
  row:{path:true, props:[{t:'plate'}],
    A:{hip:[122,122], torso:65, a1:[150,200], h1:[160,164]},
    B:{hip:[122,122], torso:65, a1:[150,200], h1:[157,121]},
    tempo:[0.4,0.9,0.4,1.4],
    cues:['Hinge to roughly 45° with soft knees and a flat back. The bar hangs under your shoulders.','Pull the bar to your lower ribs by driving your elbows back.','Lower under control without standing up between reps.'],
    avoid:'Heaving the weight with your hips and lower back.'},
  ohp:{props:[{t:'db'}],
    A:{hip:[152,113], torso:0, a1:[150,200], h1:[169,57]},
    B:{hip:[152,113], torso:0, a1:[150,200], h1:[154,-4]},
    tempo:[0.4,1.1,0.3,1.4],
    cues:['Dumbbells at shoulder height, ribs down, glutes tight.','Press straight overhead until your arms lock out, biceps by your ears.','Lower back to shoulder height under control.'],
    avoid:'Leaning back and arching your lower back to finish the rep.'},
  pulldown:{props:[{t:'seat', x:112, y:152, w:52}, {t:'cable', from:[140,-42]}, {t:'thighpad'}, {t:'handle'}],
    A:{hip:[140,146], torso:-8, a1:[184,200], h1:[140,32]},
    B:{hip:[140,146], torso:-8, a1:[184,200], h1:[142,98]},
    tempo:[0.4,1.0,0.4,1.5],
    cues:['Lock your thighs under the pad and grip a bit wider than your shoulders.','Lean back slightly and pull the bar to your upper chest, elbows down and back.','Let it rise slowly until your arms are straight.'],
    avoid:'Yanking with your whole body, or pulling the bar behind your neck.'},
  curl:{props:[{t:'db'}],
    A:{hip:[152,113], torso:0, a1:[150,200], h1:[153,128]},
    B:{hip:[152,113], torso:0, a1:[150,200], h1:[166,68]},
    tempo:[0.3,1.0,0.3,1.5],
    cues:['Stand tall with your elbows pinned at your sides.','Curl up while turning your palms to face the ceiling.','Lower all the way down, slowly.'],
    avoid:'Swinging your torso to get the weight up.'},
  pressdown:{props:[{t:'cable', from:[180,-34]}, {t:'rope'}],
    A:{hip:[148,113], torso:10, a1:[150,200], h1:[174,74]},
    B:{hip:[148,113], torso:10, a1:[150,200], h1:[162,128]},
    tempo:[0.3,0.9,0.4,1.3],
    cues:['Elbows pinned at your sides with a slight forward lean.','Push down and pull the rope ends apart at the bottom.','Come back up until your forearms are about parallel to the floor.'],
    avoid:'Letting your elbows drift forward and up.'},
  pullup:{props:[{t:'pullbar', at:[156,-36]}],
    A:{hip:[150,81], torso:3, a1:[150,166], f1:70, h1:[156,-36]},
    B:{hip:[144.4,24.9], torso:4, a1:[146,110], f1:70, h1:[156,-36]},
    tempo:[0.5,1.1,0.4,1.6],
    cues:['Start from a dead hang with your shoulders pulled down away from your ears.','Pull your chest toward the bar until your chin clears it.','Lower all the way to a full hang every rep.'],
    avoid:'Kipping or cutting reps short.'},
  farmer:{gait:true, props:[{t:'db'}],
    A:{hip:[150,116], torso:2, a1:[170,200], a2:[130,197], f2:40, h1:HANG},
    B:{hip:[150,116], torso:2, a1:[130,197], f1:40, a2:[170,200], f2:20, h1:HANG},
    tempo:[0,0.55,0,0.55],
    cues:['Pick the dumbbells up with a flat back, like a deadlift.','Stand tall with shoulders down and back, and brace your core.','Walk with short, quick, controlled steps for the full time.'],
    avoid:'Letting the weights pull your shoulders forward.'}
};
const FORM_ALIAS = {barbellbacksquat:'backsquat', backsquat:'backsquat', squat:'backsquat', frontsquat:'frontsquat', barbellfrontsquat:'frontsquat', legpress:'legpress',
  romaniandeadlift:'rdl', rdl:'rdl', barbellrdl:'rdl', deadlift:'deadlift', conventionaldeadlift:'deadlift', barbelldeadlift:'deadlift', trapbardeadlift:'trapbar', hexbardeadlift:'trapbar',
  dbbulgariansplitsquat:'bss', bulgariansplitsquat:'bss', dbstepbacklunge:'lunge', stepbacklunge:'lunge', reverselunge:'lunge', dbreverselunge:'lunge', legcurl:'legcurl', lyinglegcurl:'legcurl',
  standingcalfraise:'calf', calfraise:'calf', plank:'plank', barbellbenchpress:'bench', benchpress:'bench', dbbenchpress:'dbbench', dumbbellbenchpress:'dbbench', barbellrow:'row', bentoverrow:'row',
  dbshoulderpress:'ohp', shoulderpress:'ohp', dumbbellshoulderpress:'ohp', latpulldown:'pulldown', dbbicepscurl:'curl', bicepscurl:'curl', dumbbellcurl:'curl', ropepressdown:'pressdown',
  tricepspressdown:'pressdown', pullup:'pullup', chinup:'pullup', farmerswalk:'farmer', farmerscarry:'farmer'};
function formKey(name){ var n = norm(name); return FORM_ALIAS[n] || null; }

function dirv(a){ var r = a*Math.PI/180; return [Math.sin(r), -Math.cos(r)]; }
function lerp(a, b, k){ return a + (b - a) * k; }
function lp(p, q, k){ return [lerp(p[0], q[0], k), lerp(p[1], q[1], k)]; }
function dist(a, b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
function ease(t){ return 0.5 - 0.5 * Math.cos(Math.PI * t); }
function ik(root, tgt, l1, l2, sgn){
  var dx = tgt[0]-root[0], dy = tgt[1]-root[1], d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
  var dc = Math.max(Math.abs(l1-l2) + 0.5, Math.min(l1 + l2 - 0.01, d));
  var a = Math.acos(Math.max(-1, Math.min(1, (l1*l1 + dc*dc - l2*l2) / (2*l1*dc))));
  var ang = th + sgn * a, j = [root[0] + l1*Math.cos(ang), root[1] + l1*Math.sin(ang)];
  var ex = tgt[0]-j[0], ey = tgt[1]-j[1], el = Math.hypot(ex, ey) || 1;
  return [j, [j[0] + l2*ex/el, j[1] + l2*ey/el]];
}
function nz(v, d){ return v == null ? d : v; }
function mixH(a, b, k){
  if (a.rel) return {rel:lp(a.rel, b.rel, k)};
  if (a.hang) return {hang:true, dx:lerp(a.dx || 1, b.dx || 1, k)};
  return lp(a, b, k);
}
function mix(A, B, k){
  return {hip:lp(A.hip, B.hip, k), torso:lerp(A.torso, B.torso, k),
    a1:lp(A.a1, B.a1, k), a2:lp(A.a2 || A.a1, B.a2 || B.a1, k),
    f1:lerp(nz(A.f1, 20), nz(B.f1, 20), k), f2:lerp(nz(A.f2, nz(A.f1, 20)), nz(B.f2, nz(B.f1, 20)), k),
    kb:nz(A.kb, -1), kb2:nz(A.kb2, nz(A.kb, -1)), eb:nz(A.eb, 1), eb2:nz(A.eb2, nz(A.eb, 1)),
    h1:mixH(A.h1, B.h1, k), h2:mixH(A.h2 || A.h1, B.h2 || B.h1, k)};
}
function solve(o){
  var u = dirv(o.torso), t = o.torso*Math.PI/180, f = [Math.cos(t), Math.sin(t)];
  var sh = [o.hip[0] + L.torso*u[0], o.hip[1] + L.torso*u[1]];
  var hd = L.neck + L.head, head = [sh[0] + hd*u[0], sh[1] + hd*u[1]], neck = [sh[0] + L.neck*u[0], sh[1] + L.neck*u[1]];
  function rh(h){ return h.rel ? [sh[0] + f[0]*h.rel[0] + u[0]*h.rel[1], sh[1] + f[1]*h.rel[0] + u[1]*h.rel[1]] : h.hang ? [sh[0] + h.dx, sh[1] + 66] : h; }
  var leg1 = ik(o.hip, o.a1, L.thigh, L.shin, o.kb), leg2 = ik(o.hip, o.a2, L.thigh, L.shin, o.kb2);
  var arm1 = ik(sh, rh(o.h1), L.ua, L.fa, o.eb), arm2 = ik(sh, rh(o.h2), L.ua, L.fa, o.eb2);
  return {hip:o.hip, sh:sh, neck:neck, head:head, u:u, f:f, torso:o.torso, k1:leg1[0], a1:leg1[1], k2:leg2[0], a2:leg2[1], e1:arm1[0], h1:arm1[1], e2:arm2[0], h2:arm2[1], f1:o.f1, f2:o.f2};
}
let LW = 1;
function seg(c, a, b, w, col){ c.strokeStyle = col; c.lineWidth = w * LW; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
function disc(c, p, r, fill, stroke, sw){ c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI*2); if (fill){ c.fillStyle = fill; c.fill(); } if (stroke){ c.strokeStyle = stroke; c.lineWidth = (sw || 2) * LW; c.stroke(); } }
function footSeg(c, a, phi, col){ var r = phi*Math.PI/180, cs = Math.cos(r), sn = Math.sin(r); seg(c, [a[0] - 4*cs, a[1] - 4*sn], [a[0] + L.foot*cs, a[1] + L.foot*sn], 8, col); }
function drawBack(c, F, P){
  (F.props || []).forEach(function(pr){
    if (pr.t === 'plate' || pr.t === 'trap'){ disc(c, P.h1, pr.r || 20, COL.plateFill, COL.plate, 3); }
    else if (pr.t === 'bench'){ c.fillStyle = COL.machHi; c.fillRect(pr.x, pr.y, pr.w, 8); seg(c, [pr.x + 12, pr.y + 8], [pr.x + 12, GY], 5, COL.mach); seg(c, [pr.x + pr.w - 12, pr.y + 8], [pr.x + pr.w - 12, GY], 5, COL.mach); }
    else if (pr.t === 'step'){ c.fillStyle = COL.mach; c.fillRect(pr.x, pr.y, pr.w, GY - pr.y); }
    else if (pr.t === 'seat'){ c.fillStyle = COL.machHi; c.fillRect(pr.x, pr.y, pr.w, 8); seg(c, [pr.x + pr.w/2, pr.y + 8], [pr.x + pr.w/2, GY], 6, COL.mach); }
    else if (pr.t === 'cable'){ seg(c, [pr.from[0], pr.from[1] - 6], [pr.from[0], -300], 6, COL.mach); disc(c, pr.from, 6, COL.machHi); seg(c, pr.from, P.h1, 2, COL.machHi); }
    else if (pr.t === 'pullbar'){ seg(c, [pr.at[0] - 70, pr.at[1]], [pr.at[0] + 14, pr.at[1]], 5, COL.machHi); seg(c, [pr.at[0] - 70, pr.at[1]], [pr.at[0] - 70, GY], 6, COL.mach); }
    else if (pr.t === 'thighpad'){ disc(c, [P.k1[0] - 4, P.k1[1] - 12], 7, COL.machHi); seg(c, [P.k1[0] + 6, P.k1[1] - 12], [P.k1[0] + 22, GY], 5, COL.mach); }
    else if (pr.t === 'legpress'){
      var A1 = F.A.a1, B1 = F.B.a1, rd = [A1[0] - B1[0], A1[1] - B1[1]], rl = Math.hypot(rd[0], rd[1]); rd = [rd[0]/rl, rd[1]/rl];
      var pv = [-rd[1], rd[0]];
      seg(c, [B1[0] - rd[0]*40 + pv[0]*16, B1[1] - rd[1]*40 + pv[1]*16], [A1[0] + rd[0]*120 + pv[0]*16, A1[1] + rd[1]*120 + pv[1]*16], 5, COL.mach);
      var r = P.f1*Math.PI/180, fm = [P.a1[0] + 6*Math.cos(r), P.a1[1] + 6*Math.sin(r)], pc = [fm[0] + rd[0]*7, fm[1] + rd[1]*7];
      seg(c, [pc[0] - pv[0]*26, pc[1] - pv[1]*26], [pc[0] + pv[0]*26, pc[1] + pv[1]*26], 7, COL.machHi);
      var bk = [-P.f[0], -P.f[1]];
      seg(c, [P.hip[0] - P.u[0]*4 + bk[0]*10, P.hip[1] - P.u[1]*4 + bk[1]*10], [P.hip[0] + P.u[0]*60 + bk[0]*10, P.hip[1] + P.u[1]*60 + bk[1]*10], 9, COL.machHi);
      seg(c, [P.hip[0] - 16, P.hip[1] + 11], [P.hip[0] + 18, P.hip[1] + 9], 8, COL.machHi);
      seg(c, [P.hip[0], P.hip[1] + 14], [P.hip[0], GY], 6, COL.mach);
    }
  });
}
function drawFront(c, F, P, armsDiffer){
  (F.props || []).forEach(function(pr){
    if (pr.t === 'plate'){ disc(c, P.h1, 4, COL.plate); }
    else if (pr.t === 'trap'){ seg(c, [P.h1[0] - 30, P.h1[1]], [P.h1[0] + 30, P.h1[1]], 3, COL.plate); disc(c, P.h1, 4, COL.plate); }
    else if (pr.t === 'db'){ disc(c, P.h1, 7.5, COL.plateFill, COL.plate, 2.5); }
    else if (pr.t === 'handle'){ disc(c, P.h1, 4, COL.machHi); }
    else if (pr.t === 'rope'){ seg(c, [P.h1[0] - 3, P.h1[1] - 7], [P.h1[0] + 3, P.h1[1] + 7], 4, COL.machHi); }
    else if (pr.t === 'roller'){
      var sd = [(P.a1[0] - P.k1[0]) / L.shin, (P.a1[1] - P.k1[1]) / L.shin], pp = [sd[1], -sd[0]];
      var rc = [P.a1[0] + pp[0]*9 - sd[0]*6, P.a1[1] + pp[1]*9 - sd[1]*6], pivot = [P.k1[0] + 6, P.k1[1] - 12];
      seg(c, pivot, rc, 4, COL.machHi); disc(c, pivot, 4, COL.machHi); disc(c, rc, 7, COL.plateFill, COL.plate, 2.5);
    }
  });
}
function drawFig(c, F, k, fwd, trace){
  var o = mix(F.A, F.B, k);
  if (F.gait){
    var lift = 8 * Math.sin(Math.PI * k);
    if ((fwd ? F.B.a1[0] - F.A.a1[0] : F.A.a1[0] - F.B.a1[0]) > 0) o.a1 = [o.a1[0], o.a1[1] - lift];
    var A2 = F.A.a2 || F.A.a1, B2 = F.B.a2 || F.B.a1;
    if ((fwd ? B2[0] - A2[0] : A2[0] - B2[0]) > 0) o.a2 = [o.a2[0], o.a2[1] - lift];
  }
  var P = solve(o);
  seg(c, [-600, GY], [900, GY], 2, COL.ground);
  if (F.guide){ c.setLineDash([4, 6]); seg(c, [F.A.a1[0] + 5, GY], [F.A.a1[0] + 5, -200], 1.5, COL.guide); c.setLineDash([]); }
  if (F.path && trace){ c.setLineDash([2, 5]); c.beginPath(); trace.forEach(function(p, i){ if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.strokeStyle = COL.trace; c.lineWidth = 2; c.stroke(); c.setLineDash([]); }
  drawBack(c, F, P);
  var legsDiffer = dist(P.a1, P.a2) > 2 || dist(P.k1, P.k2) > 2, armsDiffer = dist(P.h1, P.h2) > 2;
  if (legsDiffer){ seg(c, P.hip, P.k2, 12, COL.far); seg(c, P.k2, P.a2, 10, COL.far); footSeg(c, P.a2, P.f2, COL.far); }
  if (armsDiffer){ seg(c, P.sh, P.e2, 9, COL.far); seg(c, P.e2, P.h2, 8, COL.far); }
  seg(c, P.hip, P.sh, 16, COL.near);
  seg(c, P.sh, P.neck, 8, COL.near);
  disc(c, P.head, L.head, COL.near);
  seg(c, P.hip, P.k1, 13, COL.near); seg(c, P.k1, P.a1, 11, COL.near); footSeg(c, P.a1, P.f1, COL.near);
  if (!legsDiffer) { /* far leg hidden behind the near one */ }
  seg(c, P.sh, P.e1, 10, COL.near); seg(c, P.e1, P.h1, 9, COL.near); disc(c, P.h1, 5, COL.near);
  drawFront(c, F, P, armsDiffer);
}
function fitBox(F){
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  function add(p, r){ r = r || 0; x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r); }
  var big = (F.props || []).some(function(pr){ return pr.t === 'plate' || pr.t === 'trap'; });
  for (var i = 0; i <= 10; i++){
    var P = solve(mix(F.A, F.B, i / 10));
    [P.hip, P.sh, P.k1, P.a1, P.k2, P.a2, P.e1, P.e2].forEach(function(q){ add(q, 7); });
    add(P.head, L.head + 2); add(P.h1, big ? 22 : 9); add(P.h2, big ? 22 : 9);
    [[P.a1, P.f1], [P.a2, P.f2]].forEach(function(af){ var r = af[1]*Math.PI/180; add([af[0][0] + L.foot*Math.cos(r), af[0][1] + L.foot*Math.sin(r)], 5); });
  }
  (F.props || []).forEach(function(pr){
    if (pr.t === 'bench' || pr.t === 'step' || pr.t === 'seat'){ add([pr.x, pr.y]); add([pr.x + pr.w, pr.y]); }
    if (pr.t === 'pullbar'){ add([pr.at[0] - 70, pr.at[1]]); add([pr.at[0] + 14, pr.at[1]], 4); }
    if (pr.t === 'cable'){ add(pr.from, 8); }
  });
  add([x0, GY + 2]);
  var pad = 16, bw = x1 - x0, bh = y1 - y0;
  var fs = Math.min((CW - 2*pad) / bw, (CH - 2*pad) / bh, 1.7);
  var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return {fs:fs, tx:CW/2 - cx*fs, ty:CH/2 - cy*fs};
}
let anim = null;
const REDUCED = (function(){ try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
function openForm(sid, exId){
  var p = planOf(sid), e = p.exercises.find(function(x){ return x.id === exId; }), name = exLog(sid, e).name;
  var info = exInfo(name), key = (info.form && FORM[info.form]) ? info.form : formKey(name), F = key ? FORM[key] : null;
  var cues = info.cues || (F && F.cues) || [], avoid = info.avoid || (F && F.avoid) || '';
  var h = '<h2>' + esc(name) + '</h2>';
  if (F){
    h += '<div class="form-stage"><canvas id="form-cv" role="img" aria-label="Side-view animation of ' + esc(name) + '"></canvas></div>';
    if (REDUCED) h += '<button type="button" class="link play" id="form-play" data-act="form-play">▶ Play animation</button>';
  } else {
    h += '<p>There’s no animation for this exercise yet. The video demo shows it.</p>';
  }
  if (cues.length) h += '<ol class="cues">' + cues.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
  if (avoid) h += '<p class="avoid"><b>Avoid:</b> ' + esc(avoid) + '</p>';
  h += '<div class="row"><a class="btn ghost" id="form-video" href="https://www.youtube.com/results?search_query=' + encodeURIComponent(info.video || (name + ' proper form')) + '" target="_blank" rel="noopener">Video demo</a>' +
    '<button type="button" class="btn" id="form-close" data-act="sheet-close">Close</button></div>';
  openSheet(h);
  if (F) startAnim(F, !REDUCED);
}
function startAnim(F, play){
  stopAnim();
  var cv = $('form-cv'); if (!cv) return;
  var w = cv.clientWidth || 320, dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * CH / CW * dpr);
  var c = cv.getContext('2d'), s = cv.width / CW, trace = [];
  for (var i = 0; i <= 24; i++) trace.push(solve(mix(F.A, F.B, i / 24)).h1);
  var fit = fitBox(F), fs = fit.fs, tx = fit.tx, ty = fit.ty;
  var tp = F.tempo || [0.6, 1.4, 0.3, 1.1], T = tp[0] + tp[1] + tp[2] + tp[3];
  function paint(k, fwd){ c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.setTransform(s * fs, 0, 0, s * fs, s * tx, s * ty); c.lineCap = 'round'; c.lineJoin = 'round'; LW = 0.82 / Math.sqrt(fs); drawFig(c, F, k, fwd, trace); }
  var me = {raf:0, t0:0};
  function frame(now){
    if (anim !== me) return;
    var t = ((now - me.t0) / 1000) % T, k, fwd = true;
    if (t < tp[0]) k = 0;
    else if ((t -= tp[0]) < tp[1]) k = ease(t / tp[1]);
    else if ((t -= tp[1]) < tp[2]) { k = 1; fwd = false; }
    else { t -= tp[2]; k = 1 - ease(t / tp[3]); fwd = false; }
    paint(k, fwd);
    me.raf = requestAnimationFrame(frame);
  }
  me.play = function(){ me.t0 = performance.now(); cancelAnimationFrame(me.raf); me.raf = requestAnimationFrame(frame); };
  anim = me;
  paint(F.gait ? 0.5 : 1, true);
  if (play) me.play();
}
function stopAnim(){ if (anim){ cancelAnimationFrame(anim.raf); anim = null; } }

/* ---------- Render ---------- */
function render(){
  var app = $('app'), y = window.scrollY;
  var sameView = app.dataset.view === S.view + (S.sid || '');
  if (S.view === 'session'){ app.className = 'app in-session'; app.innerHTML = viewSession(); }
  else if (S.view === 'history'){ app.className = 'app'; app.innerHTML = viewHistory(); }
  else if (S.view === 'settings'){ app.className = 'app'; app.innerHTML = viewSettings(); }
  else if (S.view === 'setup'){ app.className = 'app'; app.innerHTML = viewSetup(); }
  else { app.className = 'app'; app.innerHTML = viewPlan(); }
  app.dataset.view = S.view + (S.sid || '');
  var inSession = S.view === 'session' || S.view === 'setup';
  $('nav').hidden = inSession;
  document.body.classList.toggle('has-nav', !inSession);
  $('nav-plan').setAttribute('aria-current', S.view === 'plan' ? 'page' : 'false');
  $('nav-history').setAttribute('aria-current', S.view === 'history' ? 'page' : 'false');
  $('nav-settings').setAttribute('aria-current', S.view === 'settings' ? 'page' : 'false');
  setSync();
  window.scrollTo(0, sameView ? y : 0);
}

/* ---------- Rest timer ---------- */
const R = {end:0, total:0, over:false, iv:null, hideT:null, label:''};
let AC = null;
function unlockAudio(){
  try {
    if (!AC){ var C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); }
    if (AC && AC.state === 'suspended') AC.resume();
  } catch (e) {}
}
function beep(){
  if (!AC) return;
  try {
    var t = AC.currentTime;
    [0, 0.22, 0.44].forEach(function(o, k){
      var os = AC.createOscillator(), g = AC.createGain();
      os.frequency.value = k === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t + o);
      g.gain.exponentialRampToValueAtTime(0.3, t + o + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.18);
      os.connect(g); g.connect(AC.destination); os.start(t + o); os.stop(t + o + 0.2);
    });
  } catch (e) {}
}
function startRest(sec, label){
  R.total = sec; R.end = Date.now() + sec * 1000; R.over = false; R.label = label;
  clearTimeout(R.hideT); clearInterval(R.iv);
  R.iv = setInterval(drawRest, 250); drawRest();
}
function drawRest(){
  var el = $('rest'), left = (R.end - Date.now()) / 1000;
  if (left <= 0 && !R.over){
    R.over = true; if (!CFG.timer || CFG.timer.beep !== false) beep();
    try { if ((!CFG.timer || CFG.timer.vibrate !== false) && navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
    R.hideT = setTimeout(stopRest, 6000);
  }
  el.hidden = false;
  el.classList.toggle('over', R.over);
  $('rest-time').textContent = R.over ? 'Go' : clock(left);
  $('rest-label').textContent = R.over ? 'Rest over · ' + R.label : 'Up next: ' + R.label;
  $('rest-fill').style.transform = 'scaleX(' + (R.over ? 1 : Math.max(0, Math.min(1, left / R.total))) + ')';
}
function stopRest(){ clearInterval(R.iv); clearTimeout(R.hideT); R.end = 0; $('rest').hidden = true; }
function nextLabel(p, exId, i){
  var l = logs[p.id], idx = p.exercises.findIndex(function(e){ return e.id === exId; });
  var el = l.ex[exId];
  var k = el.sets.findIndex(function(s){ return !s.done; });
  if (k >= 0) return el.name + ', set ' + (k + 1);
  for (var j = idx + 1; j < p.exercises.length; j++){
    var n = l.ex[p.exercises[j].id];
    if (n && n.sets.some(function(s){ return !s.done; })) return n.name;
  }
  return p.cond ? p.cond.label : 'finish up';
}

/* ---------- Tredict (Personal API token, stored only on this phone) ---------- */
const TS = {};
function tdOn(){ return CFG.tredict && CFG.tredict.enabled !== false; }
/* "Through GitHub" (default): the app never calls Tredict. A job in the data repo does, and leaves its results in tredict/*.json. */
function tdGh(){ return (store.settings.tredict.mode || 'github') !== 'direct'; }
function tdState(){ return fileData('tredict/state.json') || {}; }
function tdGhLine(){
  var st = tdState(), rec = fileData('tredict/recovery.json'), act = fileData('tredict/activities.json');
  if (!ghReady()) return 'Connect GitHub above first. The Tredict sync runs there.';
  if (st.status && !st.status.ok) return 'The GitHub job says: ' + st.status.msg;
  var at = [rec && rec.updatedAt, act && act.updatedAt].filter(Boolean).sort().pop();
  if (!st.status && !at) return 'No word from the GitHub job yet. Add the TREDICT_TOKEN secret, then run Tredict sync once from the repo’s Actions tab.';
  return 'Working. Tredict data last changed ' + (at ? ago(at) : 'a while ago') + '.';
}
function applyTredictState(){
  if (!tdOn() || !tdGh()) return;
  var sent = tdState().sent || {};
  Object.keys(sent).forEach(function(id){
    var e = sent[id], l = logs[id], p = planOf(id);
    if (!l || !p || !e || !e.activityId || (l.tredict && l.tredict.id === e.activityId)) return;
    l.tredict = {id:e.activityId, at:e.at || null, via:'github'}; delete l.tredictPending;
    if (e.watch && CFG.tredict.importWatchStats !== false) mergeWatch(l, p, e.watch, e.warmup);
    save(id);
  });
}
function tdBase(){ return (store.settings.tredict.base || (CFG.tredict && CFG.tredict.apiBase) || 'https://www.tredict.com/api/oauth/v2/').replace(/\/?$/, '/'); }
async function td(method, path, body){
  var tok = store.settings.tredict.token;
  if (!tok){ var e0 = new Error('no token'); e0.code = 'no_token'; throw e0; }
  if (!navigator.onLine){ var e1 = new Error('offline'); e1.code = 'offline'; throw e1; }
  var r;
  try {
    r = await fetch(tdBase() + path, {method:method, cache:'no-store',
      headers:Object.assign({'Authorization':'Bearer ' + tok, 'Accept':'application/json'}, body ? {'Content-Type':'application/json'} : {}),
      body:body ? JSON.stringify(body) : undefined});
  } catch (err) { var e2 = new Error('network'); e2.code = navigator.onLine ? 'blocked' : 'offline'; throw e2; }
  if (!r.ok){ var e3 = new Error('Tredict ' + r.status); e3.code = 'http'; e3.status = r.status; throw e3; }
  var txt = await r.text(); try { return JSON.parse(txt); } catch (x) { return txt; }
}
function tdErr(e){
  if (e.code === 'no_token') return 'Add your Tredict token in Settings.';
  if (e.code === 'offline') return 'Offline. It’ll send when you’re back online.';
  if (e.code === 'blocked') return 'Your browser couldn’t reach Tredict directly. Turn on the proxy in Settings → Tredict.';
  if (e.status === 401) return 'Tredict token is inactive. Open Tredict once (tokens pause after 10 days unused) or make a new token.';
  if (e.status === 403) return 'Tredict token is missing a permission. It needs activity read and write, plus body values read.';
  if (e.status === 402) return 'Your Tredict account is read-only, so notes can’t be written.';
  if (e.status === 429) return 'Tredict is busy. Try again in a minute.';
  return 'Tredict didn’t answer (' + (e.status || 'error') + ').';
}
function pick(o, keys){
  for (var i = 0; i < keys.length; i++){
    var v = keys[i].split('.').reduce(function(a, b){ return a == null ? a : a[b]; }, o);
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v !== '' && isFinite(Number(v))) return Number(v);
  }
  return null;
}
function actList(res){ return (res && res._embedded && res._embedded.activityList) || (res && res.activityList) || (Array.isArray(res) ? res : []); }
async function tdActivitiesOn(dateStr){
  var res = await td('GET', 'activityList?pageSize=50&extendedSummary=1');
  var d0 = new Date(dateStr + 'T00:00:00').getTime(), d1 = d0 + 864e5;
  return actList(res).filter(function(a){ var t = Date.parse(a.date); return t >= d0 && t < d1; });
}
function distMi(o){ var m = pick(o, ['summary.distance', 'distance']); return m ? Math.round(m / 1609.34 * 100) / 100 : null; }
function importWatch(l, p, act, rows){
  var dur = pick(act, ['summary.duration', 'duration']);
  var w = {min:dur ? Math.round(dur / 60) : null, hr:pick(act, ['summary.heartrate.avg', 'summary.heartrate', 'summary.heartrateAvg']),
    hrMax:pick(act, ['summary.heartrateMax', 'summary.heartrate.max']), kcal:pick(act, ['summary.calories', 'calories']), mi:distMi(act), sport:act.subSportType || act.sportType || ''};
  var wu = null;
  if (p.kind !== 'cardio' && p.warmup && p.warmup.dist){
    var st = Date.parse(act.date);
    var r0 = rows.filter(function(r){ var t = Date.parse(r.date); return r.id !== act.id && r.sportType === 'running' && t < st && st - t < 2 * 3600e3; })[0];
    if (r0){ var wsec = pick(r0, ['summary.duration', 'duration']); wu = {mi:distMi(r0), min:wsec ? Math.round(wsec / 60) : null}; }
  }
  mergeWatch(l, p, w, wu);
}
function mergeWatch(l, p, w, wu){
  l.watch = {min:nnum(w.min, null), hr:nnum(w.hr, null), hrMax:nnum(w.hrMax, null), kcal:nnum(w.kcal, null), mi:nnum(w.mi, null), sport:String(w.sport || '')};
  if (p.kind === 'cardio'){
    if (!l.cardio) l.cardio = {minutes:'', dist:'', hr:''};
    if (!l.cardio.minutes && l.watch.min) l.cardio.minutes = String(l.watch.min);
    if (!l.cardio.hr && l.watch.hr) l.cardio.hr = String(Math.round(l.watch.hr));
    if (!l.cardio.dist && l.watch.mi) l.cardio.dist = String(l.watch.mi);
    return;
  }
  if (!p.warmup || !p.warmup.dist || !wu) return;
  var mi = nnum(wu.mi, null), wmin = nnum(wu.min, null);
  if (!l.warmup) l.warmup = {done:false, dist:'', time:''};
  if (mi && (!l.warmup.dist || l.warmup.dist === p.warmup.distPh)) l.warmup.dist = String(mi);
  if (wmin && !l.warmup.time) l.warmup.time = String(wmin);
  l.warmup.done = true;
}
function watchLine(l){
  var w = l && l.watch; if (!w) return '';
  var bits = [w.min ? w.min + ' min' : '', w.mi ? w.mi + ' mi' : '', w.hr ? 'avg HR ' + Math.round(w.hr) : '', w.hrMax ? 'max ' + Math.round(w.hrMax) : '', w.kcal ? Math.round(w.kcal) + ' kcal' : ''].filter(Boolean);
  return bits.length ? '<p class="watchline"><b>Watch</b> ' + esc(bits.join(' · ')) + '</p>' : '';
}
function tsHtml(id){
  if (!tdOn()) return '';
  var st = TS[id], l = logs[id];
  if (tdGh()){
    if (l && l.tredict) return '<div class="ts done" id="ts-' + id + '"><span>✓ Synced with your Tredict workout</span></div>';
    var s0 = tdState(), wt = (s0.waiting || {})[id];
    var msg = !ghReady() ? 'Connect GitHub in Settings to send this to Tredict.'
      : store.dirty['logs/' + id + '.json'] ? 'Sends to Tredict once this log syncs to GitHub.'
      : s0.status && !s0.status.ok ? 'Not in Tredict yet. ' + s0.status.msg
      : wt ? wt.msg + ' It checks again every hour.'
      : 'Sending to Tredict through GitHub. This takes a minute or two.';
    return '<div class="ts nomatch" id="ts-' + id + '"><span>' + esc(msg) + '</span>' + (ghReady() ? '<button type="button" class="link" data-act="tcheck" data-sid="' + id + '">Check now</button>' : '') + '</div>';
  }
  if (!st && l && l.tredict) st = {state:'done', msg:'Synced with your Tredict workout'};
  if (!st && l && l.tredictPending) st = {state:'nomatch', msg:'Waiting to send to Tredict'};
  if (!st) return '<div class="ts" id="ts-' + id + '"><span>Not in Tredict yet</span><button type="button" class="link" data-act="tsync" data-sid="' + id + '">Send to Tredict</button></div>';
  var btn = (st.state === 'error' || st.state === 'nomatch') ? '<button type="button" class="link" data-act="tsync" data-sid="' + id + '">Retry</button>' : '';
  return '<div class="ts ' + st.state + '" id="ts-' + id + '"><span>' + (st.state === 'done' ? '✓ ' : '') + esc(st.msg) + '</span>' + btn + '</div>';
}
function setTs(id, state, msg){ TS[id] = {state:state, msg:msg}; var el = $('ts-' + id); if (el) el.outerHTML = tsHtml(id); }
async function syncTredict(id, auto){
  var l = logs[id], p = planOf(id); if (!l || !p || !tdOn()) return;
  if (tdGh()){ var el0 = $('ts-' + id); if (el0) el0.outerHTML = tsHtml(id); return; }
  if (TS[id] && TS[id].state === 'working') return;
  if (!store.settings.tredict.token){ setTs(id, 'error', tdErr({code:'no_token'})); return; }
  if (!navigator.onLine){ l.tredictPending = true; save(id); setTs(id, 'nomatch', tdErr({code:'offline'})); return; }
  setTs(id, 'working', 'Sending to Tredict…');
  try {
    var rows = await tdActivitiesOn(p.date);
    var details = [];
    for (var i = 0; i < rows.length && i < 4; i++){
      var d = await td('GET', 'activity/' + encodeURIComponent(rows[i].id));
      if (d && typeof d === 'object'){ d.id = d._id || d.id || rows[i].id; if (!d.date) d.date = rows[i].date; if (!d.summary && rows[i].summary) d.summary = rows[i].summary; details.push(d); }
    }
    var want = details.filter(function(d){ return p.kind === 'cardio' ? (d.subSportType !== 'strength_training' && d.sportType !== 'running') : d.subSportType === 'strength_training'; });
    if (!want.length) want = details.filter(function(d){ return p.kind === 'cardio' ? d.subSportType !== 'strength_training' : d.sportType === 'misc'; });
    if (!want.length){
      l.tredictPending = true; save(id);
      setTs(id, 'nomatch', 'Your watch workout for this day isn’t in Tredict yet. Sync your watch, then retry.');
      if (auto && !TS[id].retried){ TS[id].retried = true; setTimeout(function(){ if (TS[id] && TS[id].state === 'nomatch') syncTredict(id, false); }, 120000); }
      return;
    }
    var ref = Date.parse(l.startedAt || l.finishedAt || (p.date + 'T12:00:00'));
    want.sort(function(a, b){ return Math.abs(Date.parse(a.date) - ref) - Math.abs(Date.parse(b.date) - ref); });
    var act = want[0];
    if (CFG.tredict.importWatchStats !== false) importWatch(l, p, act, rows);
    if (CFG.tredict.writeSetsToNotes !== false){
      var old = act.notes || '', cut = old.indexOf('PLANNED:');
      var planned = cut >= 0 ? old.slice(cut) : (old && old.indexOf('ACTUAL') !== 0 ? 'PLANNED: ' + old : '');
      var notes = 'ACTUAL (from workout app):\n' + summaryText(id) + (planned ? '\n\n' + planned : '');
      await td('POST', 'activity/update/' + encodeURIComponent(act.id), {training:{notes:notes.slice(0, 2040)}});
    }
    l.tredict = {id:act.id, at:new Date().toISOString()}; delete l.tredictPending; save(id);
    setTs(id, 'done', 'Synced with your Tredict workout');
    var sb = $('sheet-body'); if (sb && !$('sheet').hidden && !sb.querySelector('.watchline') && l.watch){ var tsEl = $('ts-' + id); if (tsEl) tsEl.insertAdjacentHTML('beforebegin', watchLine(l)); }
  } catch (e) {
    if (e.code === 'offline' || e.code === 'blocked'){ l.tredictPending = true; save(id); }
    setTs(id, 'error', tdErr(e));
  }
}
function retryPendingTredict(){
  if (!tdOn() || tdGh() || !store.settings.tredict.token || !navigator.onLine) return;
  Object.keys(logs).forEach(function(id){ var l = logs[id]; if (l && l.status === 'done' && l.tredictPending && !(TS[id] && TS[id].state === 'working')) syncTredict(id, false); });
}

/* ---------- Recovery card: sleep, HRV, resting HR and weight from Tredict ---------- */
const REC = {sleep:null, hrv:null, body:null, err:null, at:null, loading:false};
function parseDailyObj(res, key){
  var o = (res && res[key]) || res || {};
  return Object.keys(o).filter(function(k){ return /^\d{8}$/.test(k) && Array.isArray(o[k]); })
    .map(function(k){ return {date:k, val:Number(o[k][0]), base:Number(o[k][1]) || 0}; })
    .sort(function(a, b){ return b.date.localeCompare(a.date); }).slice(0, 30);
}
function parseBodyObj(res){
  var arr = (res && res.bodyvalues) || (Array.isArray(res) ? res : []), wt = [], rhr = [];
  arr.forEach(function(r){
    var t = Date.parse(r.timestamp); if (!isFinite(t)) return;
    var kg = num(r.weightInKilograms), h = num(r.hrRestDynamic) || num(r.restingHeartrate);
    if (kg) wt.push({t:t, lb:kg * 2.20462});
    if (h) rhr.push({t:t, v:h});
  });
  wt.sort(function(a, b){ return a.t - b.t; }); rhr.sort(function(a, b){ return a.t - b.t; });
  var cut = Date.now() - 60 * 864e5;
  return {wt:wt.filter(function(x){ return x.t > cut; }), rhr:rhr.filter(function(x){ return x.t > cut; })};
}
function applyRec(c){ REC.sleep = c.sleep; REC.hrv = c.hrv; REC.body = c.body; REC.at = c.at; }
async function loadRecovery(force){
  if (!tdOn()){ REC.err = 'off'; drawRec(); return; }
  if (tdGh()){
    var r = fileData('tredict/recovery.json'), st = tdState();
    if (r && (r.sleep || r.hrv || r.body)){ applyRec({at:Date.parse(r.updatedAt) || null, sleep:r.sleep || [], hrv:r.hrv || [], body:r.body || {wt:[], rhr:[]}}); REC.err = null; }
    else { applyRec({at:null, sleep:null, hrv:null, body:null}); REC.err = !ghReady() ? 'gh_off' : (st.status && !st.status.ok) ? {gh:st.status.msg} : 'gh_wait'; }
    drawRec(); return;
  }
  var c = store.rec;
  if (c) applyRec(c);
  if (!store.settings.tredict.token){ REC.err = 'no_token'; drawRec(); return; }
  if (!force && c && Date.now() - c.at < 30 * 60e3){ REC.err = null; drawRec(); return; }
  if (!navigator.onLine){ REC.err = c ? null : 'offline'; drawRec(); return; }
  if (REC.loading) return;
  REC.loading = true; drawRec();
  try {
    var res = await Promise.all([td('GET', 'sleep'), td('GET', 'hrv'), td('GET', 'bodyvalues')]);
    store.rec = {at:Date.now(), sleep:parseDailyObj(res[0], 'sleep'), hrv:parseDailyObj(res[1], 'hrv'), body:parseBodyObj(res[2])};
    persist(); applyRec(store.rec); REC.err = null;
  } catch (e) { REC.err = e; }
  REC.loading = false; drawRec();
}
function hm(sec){ var m = Math.round(sec / 60); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; }
function tagLabel(tag){ var d = tag.slice(0, 4) + '-' + tag.slice(4, 6) + '-' + tag.slice(6, 8); return d === todayStr() ? 'last night' : fmtDay(d); }
function recInner(){
  if (REC.err === 'off') return '';
  var rc = CFG.recovery || {}, lowS = (rc.lowSleepPercentOfBaseline || 85) / 100, lowH = (rc.lowHrvPercentOfBaseline || 85) / 100, hiR = rc.highRestingHrAboveAvgBpm || 5;
  var head = '<div class="rec-h"><span class="eyebrow">Recovery</span><span class="rec-src">' + (REC.loading ? 'Updating…' : REC.at ? 'from Tredict · ' + ago(new Date(REC.at).toISOString()) : 'from your watch via Tredict') + '</span></div>';
  var hasData = (REC.sleep && REC.sleep.length) || (REC.hrv && REC.hrv.length) || (REC.body && (REC.body.wt.length || REC.body.rhr.length));
  if (!hasData){
    var msg = REC.err === 'no_token' ? 'Add your Tredict token to see sleep, HRV and weight here.' : REC.err === 'offline' ? 'Offline. Recovery shows up next time you have signal.'
      : REC.err === 'gh_off' ? 'Connect GitHub in Settings to see sleep, HRV and weight here.' : REC.err === 'gh_wait' ? 'Sleep, HRV and weight show up after the Tredict sync job first runs on GitHub.'
      : REC.err && REC.err.gh ? REC.err.gh : REC.err ? tdErr(REC.err) : 'Loading…';
    var btn = (REC.err === 'no_token' || REC.err === 'gh_off') ? '<button type="button" class="link" data-act="nav" data-v="settings">Settings</button>' : (REC.err && REC.err !== 'offline') ? '<button type="button" class="link" data-act="rec-retry">Retry</button>' : '';
    return head + '<div class="rec-msg"><span>' + esc(msg) + '</span>' + btn + '</div>';
  }
  var tiles = [], lows = 0;
  var sl = REC.sleep && REC.sleep[0];
  if (sl){ var low = sl.base > 0 && sl.val < sl.base * lowS; if (low) lows++; tiles.push(['Sleep', hm(sl.val), sl.base > 0 ? 'avg ' + hm(sl.base) : tagLabel(sl.date), low ? 'low' : '']); }
  var hv = REC.hrv && REC.hrv[0];
  if (hv){ var lowh = hv.base > 0 && hv.val < hv.base * lowH; if (lowh) lows++; tiles.push(['HRV', Math.round(hv.val) + ' ms', hv.base > 0 ? 'avg ' + Math.round(hv.base) : tagLabel(hv.date), lowh ? 'low' : '']); }
  var b = REC.body;
  if (b && b.rhr.length){
    var last = b.rhr[b.rhr.length - 1], wk = b.rhr.filter(function(x){ return x.t > last.t - 7 * 864e5; });
    var avg = wk.reduce(function(a, x){ return a + x.v; }, 0) / wk.length, hi = last.v > avg + hiR; if (hi) lows++;
    tiles.push(['Resting HR', Math.round(last.v) + '', '7-day avg ' + Math.round(avg), hi ? 'low' : '']);
  }
  if (b && b.wt.length){
    var goal = CFG.athlete && CFG.athlete.goalWeightLb, lw = b.wt[b.wt.length - 1];
    var sub = goal ? Math.max(0, lw.lb - goal).toFixed(1) + ' lb to ' + goal : 'latest';
    var days = rc.weightTrendDays || 28, pts = b.wt.filter(function(x){ return x.t > lw.t - days * 864e5; });
    if (pts.length >= 3 && pts[pts.length - 1].t - pts[0].t >= 7 * 864e5){
      var n = pts.length, mx = pts.reduce(function(a, x){ return a + x.t; }, 0) / n, my = pts.reduce(function(a, x){ return a + x.lb; }, 0) / n;
      var sxy = pts.reduce(function(a, x){ return a + (x.t - mx) * (x.lb - my); }, 0), sxx = pts.reduce(function(a, x){ return a + (x.t - mx) * (x.t - mx); }, 0);
      var perWk = sxx ? sxy / sxx * 7 * 864e5 : 0;
      sub = (perWk <= 0 ? '−' : '+') + Math.abs(perWk).toFixed(1) + ' lb/wk · ' + sub;
    }
    tiles.push(['Weight', lw.lb.toFixed(1), sub, '']);
  }
  var note = lows >= 2 ? 'Recovery is low. Keep today’s weights and stop a rep short of failure.' : lows === 1 ? 'One recovery signal is off. Train as planned, but don’t chase extra reps.' : 'Recovery looks normal. Train as planned.';
  return head + '<div class="rec-tiles">' + tiles.map(function(x){ return '<div class="rec-tile ' + x[3] + '"><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></div>'; }).join('') + '</div>' +
    '<p class="rec-note">' + esc(note) + (sl ? ' <span>Sleep and HRV from ' + esc(tagLabel(sl.date)) + '.</span>' : '') + '</p>';
}
function drawRec(){ var el = $('rec'); if (el) el.innerHTML = recInner(); }

/* ---------- Settings: connections, quick config, and a raw editor for every data file ---------- */
function fld(id, label, value, type, attrs){
  return '<label class="fld" for="' + id + '"><span>' + esc(label) + '</span><input class="textin" id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '></label>';
}
function tgl(id, label, on){ return '<label class="tg" for="' + id + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>'; }
function syncLine(){
  if (!ghReady()) return 'Not connected. Your plan and logs are only on this phone.';
  if (syncState.state === 'error') return syncState.msg;
  return 'Connected to ' + store.settings.gh.owner + '/' + store.settings.gh.repo + (store.lastPull ? ' · last synced ' + ago(store.lastPull) : '') + (pendingCount() ? ' · ' + pendingCount() + ' waiting' : '');
}
function ghSection(){
  var g = store.settings.gh;
  return '<section class="set"><h2>Sync with GitHub</h2><p class="hint">Keeps your plan and logs in a private repo, so they survive a lost phone and Claude can read them for your weekly check-in.</p>' +
    fld('gh-owner', 'GitHub username', g.owner, 'text', 'autocapitalize="off" autocomplete="off" spellcheck="false"') +
    fld('gh-repo', 'Data repo name', g.repo, 'text', 'autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="workout-data"') +
    fld('gh-branch', 'Branch', g.branch || 'main', 'text', 'autocapitalize="off" spellcheck="false"') +
    fld('gh-token', 'Access token (fine-grained, this repo only)', g.token, 'password', 'autocomplete="off"') +
    '<div class="row"><button type="button" class="btn" id="gh-save" data-act="gh-save">Save and sync</button></div><p class="hint" id="set-sync-status">' + esc(syncLine()) + '</p></section>';
}
function fileList(){
  var paths = Object.keys(store.files).filter(function(p){ return /^(config|weeks)\//.test(p); }).sort(function(a, b){
    var ra = a.indexOf('config/') === 0 ? 0 : 1, rb = b.indexOf('config/') === 0 ? 0 : 1; return ra - rb || a.localeCompare(b, undefined, {numeric:true});
  });
  var nLogs = Object.keys(store.files).filter(function(p){ return p.indexOf('logs/') === 0; }).length;
  return paths.map(function(p){ return '<button type="button" class="filebtn" data-act="edit-file" data-path="' + esc(p) + '"><span>' + esc(p) + '</span>' + (store.dirty[p] ? '<small>not synced</small>' : '') + '</button>'; }).join('') +
    '<p class="hint">' + nLogs + ' session log' + (nLogs === 1 ? '' : 's') + ' saved in logs/.</p>';
}
function viewSettings(){
  var t = store.settings.tredict, td0 = CFG.tredict || {}, pr = CFG.progression || {}, rc = CFG.recovery || {}, at = CFG.athlete || {}, tm = CFG.timer || {};
  var h = '<header class="top"><div><div class="eyebrow">App setup</div><h1>Settings</h1></div><div class="sync" id="sync"></div></header>';
  h += ghSection();
  var gm = (t.mode || 'github') !== 'direct';
  h += '<section class="set"><h2>Tredict</h2><p class="hint">Brings in heart rate, sleep, HRV and weight from your watch, and writes your sets into each Tredict workout. Tokens pause if you don’t open Tredict for 10 days.</p>' +
    tgl('td-enabled', 'Use Tredict', td0.enabled !== false) +
    '<label class="fld" for="td-mode"><span>How the app reaches Tredict</span><select class="textin" id="td-mode"><option value="github"' + (gm ? ' selected' : '') + '>Through GitHub (recommended)</option><option value="direct"' + (gm ? '' : ' selected') + '>Directly from this phone</option></select></label>' +
    '<div id="td-gh"' + (gm ? '' : ' hidden') + '><p class="hint">Your Tredict token goes in your workout-data repo on GitHub, not on this phone: Settings → Secrets and variables → Actions → New repository secret, named TREDICT_TOKEN. A job there syncs about every hour and a minute or two after each logged workout. This phone only reads what it brings back.</p></div>' +
    '<div id="td-direct"' + (gm ? ' hidden' : '') + '>' +
    fld('td-token', 'Personal API token', t.token, 'password', 'autocomplete="off"') +
    fld('td-base', 'API address (change only if you set up the proxy)', t.base || '', 'url', 'autocapitalize="off" spellcheck="false" placeholder="' + esc(td0.apiBase || '') + '"') + '</div>' +
    tgl('td-notes', 'Write my sets into Tredict notes', td0.writeSetsToNotes !== false) +
    tgl('td-import', 'Import watch stats into my log', td0.importWatchStats !== false) +
    '<div class="row"><button type="button" class="btn ghost" id="td-test" data-act="td-test">Test</button><button type="button" class="btn" id="td-save" data-act="td-save">Save</button></div><p class="hint" id="td-status">' + (gm ? esc(tdGhLine()) : '') + '</p></section>';
  h += '<section class="set"><h2>Goal and progression</h2><div class="fgrid">' +
    fld('cf-goal', 'Goal weight (lb)', at.goalWeightLb, 'number', 'inputmode="decimal"') +
    fld('cf-up', 'Upper body step (lb)', pr.upperIncrementLb, 'number', 'inputmode="decimal"') +
    fld('cf-low', 'Lower body step (lb)', pr.lowerIncrementLb, 'number', 'inputmode="decimal"') +
    fld('cf-db', 'Dumbbell step (lb)', pr.dumbbellIncrementLb, 'number', 'inputmode="decimal"') +
    fld('cf-deload', 'Deload (%)', pr.deloadPercent, 'number', 'inputmode="decimal"') +
    fld('cf-misses', 'Misses before deload', pr.missesBeforeDeload, 'number', 'inputmode="numeric"') +
    fld('cf-repcap', 'Bodyweight rep cap', pr.bodyweightRepCap, 'number', 'inputmode="numeric"') +
    fld('cf-holdcap', 'Longest hold (sec)', pr.timedHoldCapSec, 'number', 'inputmode="numeric"') +
    fld('cf-sleep', 'Flag sleep below (% of avg)', rc.lowSleepPercentOfBaseline, 'number', 'inputmode="numeric"') +
    fld('cf-hrv', 'Flag HRV below (% of avg)', rc.lowHrvPercentOfBaseline, 'number', 'inputmode="numeric"') +
    '</div>' +
    tgl('cf-floor', 'Planned weights act as a minimum after a good session', pr.planWeightIsFloor !== false) +
    tgl('cf-beep', 'Beep when rest ends', tm.beep !== false) +
    tgl('cf-vib', 'Vibrate when rest ends', tm.vibrate !== false) +
    '<div class="row"><button type="button" class="btn" id="cf-save" data-act="cf-save">Save</button></div><p class="hint" id="cf-status"></p></section>';
  h += '<section class="set"><h2>Plan and data files</h2><p class="hint">Everything the app runs on: your plan by week, the exercise library (cues, step sizes, swaps) and the rules above. Edit any file here; changes sync to GitHub.</p><div class="files">' + fileList() + '</div>' +
    '<div class="row"><button type="button" class="btn ghost" id="export-btn" data-act="export">Export backup</button><label class="btn ghost" for="import-file">Import backup</label></div><input type="file" id="import-file" accept="application/json,.json" hidden><p class="hint" id="io-status"></p></section>';
  h += '<section class="set"><h2>About</h2><p class="hint">Version ' + APP_VERSION + '. The app and your whole plan are saved on this phone and open without signal. Tokens stay on this phone and are only sent to GitHub and Tredict.</p>' +
    '<button type="button" class="link muted" id="reset-btn" data-act="reset">Erase this phone’s copy</button></section>';
  return h;
}
function viewSetup(){
  return '<header class="top"><div><div class="eyebrow">Welcome</div><h1>Set up</h1></div></header>' +
    '<p class="lead">Connect the private GitHub repo that holds your plan and logs. The app downloads everything once, then works without signal.</p>' +
    ghSection() +
    '<section class="set"><h2>Or start from a backup</h2><p class="hint">Import a backup file to use the app on this phone only. You can connect GitHub later in Settings.</p><div class="row"><label class="btn ghost" for="import-file">Import backup</label><button type="button" class="btn ghost" data-act="skip-setup">Skip for now</button></div><input type="file" id="import-file" accept="application/json,.json" hidden><p class="hint" id="io-status"></p></section>';
}
function cfgFile(){ return clone(fileData('config/config.json') || DEFAULTS['config/config.json'] || {}); }
function numIn(id){ var el = $(id); if (!el) return undefined; var v = el.value.trim(); return v === '' ? undefined : Number(v); }
function setHint(id, txt){ var el = $(id); if (el) el.textContent = txt; }
function exportBackup(){
  var files = {};
  Object.keys(store.files).forEach(function(p){ if (SYNCED.test(p)) files[p] = store.files[p].data; });
  var blob = new Blob([JSON.stringify({app:'workout-log', version:APP_VERSION, exportedAt:new Date().toISOString(), files:files}, null, 2)], {type:'application/json'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'workout-log-backup-' + todayStr() + '.json';
  document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  setHint('io-status', 'Backup saved to your downloads.');
}
function importBackup(file){
  var rd = new FileReader();
  rd.onload = function(){
    try {
      var o = JSON.parse(rd.result), files = o.files || o, n = 0;
      Object.keys(files).forEach(function(p){
        if (!SYNCED.test(p)) return;
        var cur = store.files[p];
        store.files[p] = {data:files[p], sha:cur ? cur.sha : null}; store.dirty[p] = Date.now(); n++;
      });
      if (!n) throw new Error('none');
      store.setupDone = true; persistNow(); loadAll();
      if (S.view === 'setup') S.view = 'plan';
      render(); setHint('io-status', 'Imported ' + n + ' files.'); sync(false);
    } catch (e) { setHint('io-status', 'That file isn’t a workout log backup.'); }
  };
  rd.readAsText(file);
}
function openFileEditor(path){
  var d = fileData(path);
  openSheet('<h2 class="path">' + esc(path) + '</h2><textarea class="textin code" id="file-json" spellcheck="false" autocapitalize="off" autocomplete="off">' + esc(JSON.stringify(d, null, 2)) + '</textarea>' +
    '<p class="hint" id="file-err"></p><div class="row"><button type="button" class="btn ghost" data-act="sheet-close">Cancel</button><button type="button" class="btn" id="file-save" data-act="file-save" data-path="' + esc(path) + '">Save</button></div>');
}
function saveFileEditor(path){
  var txt = $('file-json').value, data;
  try { data = JSON.parse(txt); } catch (e) { setHint('file-err', 'That isn’t valid JSON: ' + e.message); return; }
  if (!data || typeof data !== 'object' || Array.isArray(data)){ setHint('file-err', 'The file must be a JSON object.'); return; }
  var m = /^weeks\/([^/]+)\.json$/.exec(path);
  if (m && !cleanWeek(m[1], data)){ setHint('file-err', 'A week needs a sessions list, and each session needs an id and a date (YYYY-MM-DD).'); return; }
  writeFile(path, data); loadAll(); closeSheet(); render();
}

/* ---------- Sheets ---------- */
function openSheet(html){ $('sheet-body').innerHTML = html; $('sheet').hidden = false; var f = $('sheet-body').querySelector('input,button'); if (f) f.focus(); }
function closeSheet(){ stopAnim(); $('sheet').hidden = true; $('sheet-body').innerHTML = ''; }
function showSummary(id){
  var p = planOf(id), l = logs[id], st = stats(p, l);
  var h = '<h2>' + esc(p.title) + ' logged</h2><p>' + esc(fmtDay(p.date)) + '</p>';
  if (p.kind !== 'cardio'){
    h += '<div class="stats"><div class="stat"><b>' + (st.dur ? Math.round(st.dur / 60000) : '–') + '</b><span>Minutes</span></div>' +
      '<div class="stat"><b>' + st.sets + '/' + st.total + '</b><span>Sets</span></div>' +
      '<div class="stat"><b>' + fmtNum(st.vol) + '</b><span>Lb moved</span></div></div>';
  }
  h += '<ul class="h-lines">';
  lines(p, l).forEach(function(x){ h += '<li><span>' + esc(x[0]) + '</span><span>' + esc(x[1]) + '</span></li>'; });
  h += '</ul>' + watchLine(l) + tsHtml(id) + '<div class="row"><button type="button" class="btn ghost" id="copy-btn" data-act="copy" data-sid="' + id + '">Copy text</button>' +
    '<button type="button" class="btn" id="to-plan" data-act="to-plan">Back to plan</button></div><p class="copied" id="copied" hidden>Copied</p>';
  openSheet(h);
}

/* ---------- Actions ---------- */
function startSession(l){ if (l.status === 'new'){ l.status = 'active'; l.startedAt = new Date().toISOString(); } }
function doFinish(id){
  var l = ensureLog(id);
  l.status = 'done'; l.finishedAt = new Date().toISOString();
  if (!l.startedAt) l.startedAt = l.finishedAt;
  stopRest(); closeSheet(); save(id); render(); showSummary(id);
  syncTredict(id, true);
}
document.addEventListener('click', function(ev){
  var b = ev.target.closest('[data-act]'); if (!b) return;
  var act = b.dataset.act, p = S.sid ? planOf(S.sid) : null;
  switch (act){
    case 'nav': S.view = b.dataset.v; S.sid = null; render(); break;
    case 'tab': S.week = +b.dataset.i; render(); break;
    case 'open': S.view = 'session'; S.sid = b.dataset.sid; closeSheet(); render(); break;
    case 'back': S.view = 'plan'; S.sid = null; render(); break;
    case 'start': unlockAudio(); startSession(ensureLog(p.id)); save(p.id); render(); break;
    case 'set': {
      unlockAudio();
      var l = ensureLog(p.id), e = p.exercises.find(function(x){ return x.id === b.dataset.ex; });
      var i = +b.dataset.i, s = l.ex[e.id].sets[i];
      var wi = $('w-' + e.id + '-' + i), ri = $('r-' + e.id + '-' + i);
      s.done = !s.done;
      if (s.done){
        if (wi){ s.w = wi.value.trim(); if (s.w === '' && num(wi.placeholder) != null) s.w = wi.placeholder; }
        if (ri){ s.r = ri.value.trim(); if (s.r === '') s.r = ri.placeholder; s.t = num(ri.placeholder); }
        if (wi) s.tw = num(wi.placeholder);
        startSession(l);
        if (e.rest > 0) startRest(e.rest, nextLabel(p, e.id, i));
      }
      save(p.id); render(); break;
    }
    case 'wu': {
      var l2 = ensureLog(p.id), wd = $('wu-dist'), wt = $('wu-time');
      l2.warmup.done = !l2.warmup.done;
      if (l2.warmup.done){
        if (wd && !wd.value.trim()) l2.warmup.dist = wd.placeholder; else if (wd) l2.warmup.dist = wd.value.trim();
        if (wt && wt.value.trim()) l2.warmup.time = wt.value.trim();
        startSession(l2);
      }
      save(p.id); render(); break;
    }
    case 'round': { var l3 = ensureLog(p.id), ri2 = +b.dataset.i; l3.cond.rounds[ri2] = !l3.cond.rounds[ri2]; for (var q = 0; q < l3.cond.rounds.length; q++) if (l3.cond.rounds[q] == null) l3.cond.rounds[q] = false; startSession(l3); save(p.id); render(); break; }
    case 'cooldown': { var l4 = ensureLog(p.id); l4.cond.cooldown = !l4.cond.cooldown; save(p.id); render(); break; }
    case 'add-set': { var l5 = ensureLog(p.id); l5.ex[b.dataset.ex].sets.push({w:'', r:'', done:false}); save(p.id); render(); break; }
    case 'del-set': { var l6 = ensureLog(p.id), arr = l6.ex[b.dataset.ex].sets; if (arr.length > 1) arr.pop(); save(p.id); render(); break; }
    case 'swap': {
      var e2 = p.exercises.find(function(x){ return x.id === b.dataset.ex; }), cur = exLog(p.id, e2).name;
      var picks = '';
      var alts2 = altsFor(e2);
      if (alts2.length){
        picks = '<div class="chips">' + [e2.name].concat(alts2.map(function(a){ return a.name; })).map(function(n, ix){
          return '<button type="button" class="chip" id="pick-' + ix + '" data-act="swap-pick" data-ex="' + e2.id + '" data-name="' + esc(n) + '" aria-pressed="' + (norm(n) === norm(cur)) + '">' + esc(n) + '</button>';
        }).join('') + '</div>';
      }
      openSheet('<h2>Swap exercise</h2><p>Planned: ' + esc(e2.name) + '. Pick one or type what you’re doing instead.</p>' + picks +
        '<input class="textin" id="swap-in" value="' + esc(cur) + '" autocomplete="off" aria-label="Exercise name">' +
        '<div class="row">' + (norm(cur) !== norm(e2.name) ? '<button type="button" class="btn ghost" id="swap-reset" data-act="swap-reset" data-ex="' + e2.id + '">Use planned</button>' : '<button type="button" class="btn ghost" id="swap-cancel" data-act="sheet-close">Cancel</button>') +
        '<button type="button" class="btn" id="swap-save" data-act="swap-save" data-ex="' + e2.id + '">Save</button></div>');
      var si = $('swap-in'); if (si){ si.focus(); si.select(); }
      break;
    }
    case 'rec-retry': if (tdGh()) sync(false); else loadRecovery(true); break;
    case 'tcheck': { var sid0 = b.dataset.sid; sync(false).then(function(){ var el = $('ts-' + sid0); if (el) el.outerHTML = tsHtml(sid0); }); break; }
    case 'gh-save': {
      var ghv = {owner:$('gh-owner').value.trim(), repo:$('gh-repo').value.trim(), branch:$('gh-branch').value.trim() || 'main', token:$('gh-token').value.trim()};
      store.settings.gh = ghv; persistNow();
      var miss = [!ghv.owner && 'GitHub username', !ghv.repo && 'Data repo name', !ghv.token && 'Access token'].filter(Boolean);
      if (miss.length){ setHint('set-sync-status', 'Fill in: ' + miss.join(', ') + '.'); break; }
      if (!navigator.onLine){ setHint('set-sync-status', 'No signal. Saved, and it will sync when you\u2019re back online.'); break; }
      store.setupDone = true; persistNow(); setHint('set-sync-status', 'Checking GitHub…');
      syncing = false;
      sync(true).then(function(){
        if (syncState.state !== 'error' && S.view === 'setup' && PLAN.weeks.length){ S.view = 'plan'; render(); }
        else setHint('set-sync-status', syncState.state === 'error' ? syncState.msg : syncLine());
      }, function(e){ setHint('set-sync-status', 'Sync error: ' + (e && e.message || e)); });
      break;
    }
    case 'skip-setup': store.setupDone = true; persistNow(); S.view = 'settings'; render(); break;
    case 'td-save': case 'td-test': {
      store.settings.tredict = {token:$('td-token').value.trim(), base:$('td-base').value.trim(), mode:$('td-mode').value === 'direct' ? 'direct' : 'github'};
      var c1 = cfgFile(); c1.tredict = Object.assign({}, c1.tredict || {}, {enabled:$('td-enabled').checked, writeSetsToNotes:$('td-notes').checked, importWatchStats:$('td-import').checked});
      writeFile('config/config.json', c1); loadAll(); persistNow();
      if (act === 'td-save'){ setHint('td-status', 'Saved.'); store.rec = null; loadRecovery(true); break; }
      if (tdGh()){
        if (!ghReady()){ setHint('td-status', tdGhLine()); break; }
        setHint('td-status', 'Checking GitHub…'); syncing = false;
        sync(false).then(function(){ setHint('td-status', syncState.state === 'error' ? syncState.msg : tdGhLine()); });
        break;
      }
      setHint('td-status', 'Testing…');
      td('GET', 'activityList?pageSize=50').then(function(r){ setHint('td-status', 'Connected. Tredict returned ' + actList(r).length + ' recent workouts.'); store.rec = null; loadRecovery(true); }, function(e){ setHint('td-status', tdErr(e)); });
      break;
    }
    case 'cf-save': {
      var c2 = cfgFile();
      c2.athlete = Object.assign({}, c2.athlete || {}, {goalWeightLb:numIn('cf-goal')});
      c2.progression = Object.assign({}, c2.progression || {}, {upperIncrementLb:numIn('cf-up'), lowerIncrementLb:numIn('cf-low'), dumbbellIncrementLb:numIn('cf-db'), deloadPercent:numIn('cf-deload'), missesBeforeDeload:numIn('cf-misses'), bodyweightRepCap:numIn('cf-repcap'), timedHoldCapSec:numIn('cf-holdcap'), planWeightIsFloor:$('cf-floor').checked});
      c2.recovery = Object.assign({}, c2.recovery || {}, {lowSleepPercentOfBaseline:numIn('cf-sleep'), lowHrvPercentOfBaseline:numIn('cf-hrv')});
      c2.timer = Object.assign({}, c2.timer || {}, {beep:$('cf-beep').checked, vibrate:$('cf-vib').checked});
      writeFile('config/config.json', c2); loadAll(); setHint('cf-status', 'Saved. New targets apply from your next workout.');
      break;
    }
    case 'edit-file': openFileEditor(b.dataset.path); break;
    case 'file-save': saveFileEditor(b.dataset.path); break;
    case 'export': exportBackup(); break;
    case 'reset':
      openSheet('<h2>Erase this phone’s copy?</h2><p>Your plan, logs and tokens on this phone are deleted. ' + (pendingCount() ? '<b>' + pendingCount() + ' change(s) haven’t synced to GitHub yet and will be lost.</b> ' : '') + 'Anything already in GitHub stays there.</p><div class="row"><button type="button" class="btn ghost" data-act="sheet-close">Cancel</button><button type="button" class="btn" id="reset-confirm" data-act="reset-confirm">Erase</button></div>');
      break;
    case 'reset-confirm': try { localStorage.removeItem(STORE_KEY); } catch (e) {} location.reload(); break;
    case 'tsync': syncTredict(b.dataset.sid, false); break;
    case 'swap-pick': { ensureLog(p.id).ex[b.dataset.ex].name = b.dataset.name; save(p.id); closeSheet(); render(); break; }
    case 'form': openForm(p.id, b.dataset.ex); break;
    case 'form-play': { var pb = $('form-play'); if (pb) pb.remove(); if (anim) anim.play(); break; }
    case 'swap-save': { var v = $('swap-in').value.trim(); if (v){ ensureLog(p.id).ex[b.dataset.ex].name = v; save(p.id); } closeSheet(); render(); break; }
    case 'swap-reset': { var e3 = p.exercises.find(function(x){ return x.id === b.dataset.ex; }); ensureLog(p.id).ex[e3.id].name = e3.name; save(p.id); closeSheet(); render(); break; }
    case 'sheet-close': closeSheet(); break;
    case 'finish': {
      var l7 = ensureLog(p.id), open = 0;
      p.exercises.forEach(function(e){ l7.ex[e.id].sets.forEach(function(s){ if (!s.done) open++; }); });
      if (open){
        openSheet('<h2>Finish workout?</h2><p>' + open + ' set' + (open === 1 ? ' isn’t' : 's aren’t') + ' checked off. They’ll be saved as skipped.</p>' +
          '<div class="row"><button type="button" class="btn ghost" id="keep-going" data-act="sheet-close">Keep going</button><button type="button" class="btn" id="finish-now" data-act="finish-now">Finish</button></div>');
      } else doFinish(p.id);
      break;
    }
    case 'finish-now': doFinish(p.id); break;
    case 'cardio-done': { var l8 = ensureLog(p.id); startSession(l8); doFinish(p.id); break; }
    case 'summary': showSummary(p.id); break;
    case 'copy': {
      var txt = summaryText(b.dataset.sid);
      try {
        navigator.clipboard.writeText(txt).then(function(){ var c = $('copied'); if (c){ c.hidden = false; c.textContent = 'Copied'; } },
          function(){ var c = $('copied'); if (c){ c.hidden = false; c.textContent = 'Copy didn’t work here. Claude can read this log directly.'; } });
      } catch (e) { var c2 = $('copied'); if (c2){ c2.hidden = false; c2.textContent = 'Copy didn’t work here. Claude can read this log directly.'; } }
      break;
    }
    case 'to-plan': closeSheet(); S.view = 'plan'; S.sid = null; render(); break;
    case 'rest-minus': R.end -= 15000; if (R.over){ R.over = false; } drawRest(); break;
    case 'rest-plus': if (R.over){ R.over = false; clearTimeout(R.hideT); R.end = Date.now() + 15000; R.total = Math.max(R.total, 15); } else R.end += 15000; drawRest(); break;
    case 'rest-skip': stopRest(); break;
  }
});
$('sheet').addEventListener('click', function(ev){ if (ev.target === $('sheet')) closeSheet(); });
document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && !$('sheet').hidden) closeSheet(); if (ev.key === 'Enter' && ev.target.id === 'swap-in') $('swap-save').click(); });
document.addEventListener('input', function(ev){
  var t = ev.target, f = t.dataset && t.dataset.f; if (!f || !S.sid) return;
  var l = ensureLog(S.sid);
  if (f === 'w' || f === 'r') l.ex[t.dataset.ex].sets[+t.dataset.i][f] = t.value.trim();
  else if (f === 'wu-dist') l.warmup.dist = t.value.trim();
  else if (f === 'wu-time') l.warmup.time = t.value.trim();
  else if (f === 'notes') l.notes = t.value;
  else if (f.indexOf('cd-') === 0) l.cardio[f.slice(3)] = t.value.trim();
  save(S.sid);
});
setInterval(function(){
  var el = $('elapsed'); if (!el || S.view !== 'session') return;
  var l = logs[S.sid]; if (l && l.status === 'active' && l.startedAt) el.textContent = clock((Date.now() - Date.parse(l.startedAt)) / 1000);
}, 1000);
document.addEventListener('visibilitychange', function(){ if (!document.hidden && R.end) drawRest(); });

document.addEventListener('change', function(ev){
  if (ev.target && ev.target.id === 'import-file' && ev.target.files && ev.target.files[0]) importBackup(ev.target.files[0]);
  if (ev.target && ev.target.id === 'td-mode'){ var g = ev.target.value !== 'direct'; $('td-gh').hidden = !g; $('td-direct').hidden = g; setHint('td-status', ''); }
});

document.addEventListener('input', function(ev){
  var t = ev.target, k = t && t.id && {'gh-owner':'owner', 'gh-repo':'repo', 'gh-branch':'branch', 'gh-token':'token'}[t.id];
  if (k){ store.settings.gh[k] = t.value.trim(); persistNow(); }
});
window.addEventListener('error', function(e){ setHint('set-sync-status', 'App error: ' + (e && e.message || 'unknown')); });
window.addEventListener('unhandledrejection', function(e){ setHint('set-sync-status', 'App error: ' + (e && e.reason && e.reason.message || e && e.reason || 'unknown')); });
loadStore();
loadAll();
if (!PLAN.weeks.length && !ghReady() && !store.setupDone) S.view = 'setup';
render();
loadRecovery(false);
sync(false);
setInterval(setSync, 60000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function(){});
