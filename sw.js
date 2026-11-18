/* Offline support: the app shell is cached on first visit and served from the phone afterwards.
   Calls to GitHub and Tredict always go to the network. Bump VERSION on every release. */
const VERSION = 'wl-1.0.0';
const SHELL = ['./', './index.html', './style.css', './app.js', './defaults.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION && k !== 'wl-fonts'; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var req = e.request; if (req.method !== 'GET') return;
  var u = new URL(req.url);
  if (u.origin === self.location.origin){
    e.respondWith(caches.open(VERSION).then(function(c){
      return c.match(req, {ignoreSearch:true}).then(function(hit){
        var net = fetch(req).then(function(r){ if (r && r.ok) c.put(req, r.clone()); return r; }).catch(function(){ return hit || c.match('./index.html'); });
        return hit || net;
      });
    }));
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com'){
    e.respondWith(caches.open('wl-fonts').then(function(c){
      return c.match(req).then(function(hit){ return hit || fetch(req).then(function(r){ c.put(req, r.clone()); return r; }); });
    }));
  }
});
