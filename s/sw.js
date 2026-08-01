// Mistto Apps — service worker (offline básico: network-first com cache de reserva)
var CACHE = 'mistto-app-v1';
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
// ===== Push notifications =====
self.addEventListener('push', function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(_){ d = { title:'Novidade', body: (e.data && e.data.text()) || '' }; }
  var titulo = d.title || 'Novidade';
  var opts = { body: d.body || '', icon: d.icon || '/favicon.svg', badge: '/favicon.svg', data: { url: d.url || '/' } };
  e.waitUntil(self.registration.showNotification(titulo, opts));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(list){
    for(var i=0;i<list.length;i++){ if(list[i].url.indexOf(url) !== -1 && 'focus' in list[i]) return list[i].focus(); }
    if(self.clients.openWindow) return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async function(cache){
      try{
        var net = await fetch(e.request);
        try{ cache.put(e.request, net.clone()); }catch(_){}
        return net;
      }catch(err){
        var hit = await cache.match(e.request);
        return hit || new Response('Offline', { status: 503, headers: { 'Content-Type':'text/plain' } });
      }
    })
  );
});
