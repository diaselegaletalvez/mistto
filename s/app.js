/* Mistto Apps — inscrição em notificações (roda dentro do app publicado) */
(function(){
  var SB_URL = "https://unsvccbzrrgnvzvdwwrz.supabase.co";
  var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuc3ZjY2J6cnJnbnZ6dmR3d3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MzE0OTUsImV4cCI6MjEwMDAwNzQ5NX0.LI121gkIHkiplDTcolv6e6is6LxN0I1Ebmil5tJKRxY";
  var sc = document.currentScript;
  var SITE = sc ? sc.getAttribute('data-site') : '';
  if(!SITE) return;
  if(!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  if(Notification.permission === 'denied') return;

  function u8(base64){
    var pad = '='.repeat((4 - base64.length % 4) % 4);
    var b64 = (base64 + pad).replace(/-/g,'+').replace(/_/g,'/');
    var raw = atob(b64), out = new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function jaInscrito(){
    try{ var reg = await navigator.serviceWorker.ready; var s = await reg.pushManager.getSubscription(); return !!s; }catch(e){ return false; }
  }
  async function inscrever(btn){
    try{
      if(btn){ btn.textContent = 'Ativando…'; btn.style.pointerEvents='none'; }
      var perm = await Notification.requestPermission();
      if(perm !== 'granted'){ if(btn){ btn.remove(); } return; }
      var reg = await navigator.serviceWorker.ready;
      var kr = await fetch(SB_URL + '/functions/v1/push', { method:'POST', headers:{ 'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY }, body: JSON.stringify({ action:'pubkey' }) });
      var kd = await kr.json().catch(function(){ return {}; });
      if(!kd.pubkey){ if(btn){ btn.remove(); } return; }
      var sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: u8(kd.pubkey) });
      var j = sub.toJSON();
      await fetch(SB_URL + '/rest/v1/push_subscriptions', { method:'POST', headers:{ 'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Prefer':'return=minimal' }, body: JSON.stringify({ site_id: SITE, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }) });
      if(btn){ btn.remove(); }
    }catch(e){ if(btn){ btn.textContent='Ativar avisos'; btn.style.pointerEvents=''; } }
  }
  function botao(){
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Ativar avisos';
    b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#D4A017;color:#251a02;border:none;border-radius:999px;padding:12px 20px;font-family:system-ui,sans-serif;font-weight:700;font-size:14px;box-shadow:0 8px 22px rgba(0,0,0,.28);cursor:pointer';
    b.onclick = function(){ inscrever(b); };
    document.body.appendChild(b);
  }
  window.addEventListener('load', function(){
    setTimeout(async function(){
      if(await jaInscrito()) return;    // já tem inscrição, não mostra nada
      botao();
    }, 1500);
  });
})();
