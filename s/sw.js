// Mistto Apps — service worker (offline básico: network-first com cache de reserva)
var CACHE = 'mistto-app-v1';
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
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
