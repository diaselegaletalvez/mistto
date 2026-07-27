/* ===== Mistto — script compartilhado ===== */

/* ---- CONFIG SUPABASE ---- */
const SUPABASE_URL = "https://unsvccbzrrgnvzvdwwrz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuc3ZjY2J6cnJnbnZ6dmR3d3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MzE0OTUsImV4cCI6MjEwMDAwNzQ5NX0.LI121gkIHkiplDTcolv6e6is6LxN0I1Ebmil5tJKRxY";

let db = null;

/* ---- Menu mobile ---- */
function toggleNav(){
  var l = document.querySelector('.nav-links');
  if(l) l.classList.toggle('open');
}

/* ---- Carrega o supabase-js sob demanda (pra checar login no nav) ---- */
function loadSupabase(cb){
  if(window.supabase){ cb(); return; }
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.onload = cb;
  s.onerror = function(){ /* sem rede: segue sem nav de login */ };
  document.head.appendChild(s);
}

/* ---- Ajusta o nav conforme o login ---- */
async function updateNav(){
  try{
    if(!db) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    var { data: { session } } = await db.auth.getSession();
    var links = document.querySelector('.nav-links');
    if(!links) return;
    var cta = document.getElementById('nav-cta');
    var entrar = links.querySelector('a[href="/login/"]');
    if(session){
      // logado: some "Entrar", e o botão vira "Painel"
      if(entrar) entrar.remove();
      if(cta){ cta.textContent = 'Painel'; cta.href = '/painel/'; }
    }
    // deslogado: o botão fica "Criar conta" (padrão do HTML)
  }catch(e){ /* silencioso */ }
}

/* ---- Assinar um plano (InfinitePay) ---- */
function checkout(payload){
  loadSupabase(async function(){
    try{
      if(!db) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      var { data: { session } } = await db.auth.getSession();
      if(!session){ location.href = '/cadastro/'; return; } // precisa ter conta
      payload.access_token = session.access_token;
      var res = await fetch(SUPABASE_URL + '/functions/v1/create-order', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if(data.url){ location.href = data.url; }
      else { alert(data.msg || 'Não consegui iniciar o pagamento agora. Tente de novo em instantes.'); }
    }catch(e){ alert('Ops, algo deu errado. Tente de novo.'); }
  });
}
/* Assinar: prefere o link recorrente da InfinitePay (débito automático);
   se o plano não tiver link cadastrado, cai no pagamento avulso. */
function assinar(plano){
  loadSupabase(async function(){
    try{
      if(!db) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      var { data } = await db.from('plano_links').select('link').eq('plano', plano).maybeSingle();
      if(data && data.link){ location.href = data.link; return; }
    }catch(e){}
    checkout({ plano: plano });
  });
}

/* ---- Estados dos planos (atual / upgrade / downgrade) ---- */
var ORDEM_PLANOS = ['zefiro','minuano','siroco','boreas'];
async function updatePlanos(){
  var cards = document.querySelectorAll('.plan[data-plano]');
  if(!cards.length) return;
  try{
    if(!db) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    var { data: { session } } = await db.auth.getSession();
    if(!session) return; // deslogado: botões padrão do HTML
    var atual = 'zefiro';
    var { data: sub } = await db.from('subscriptions').select('plano,status,valid_until').eq('user_id', session.user.id).maybeSingle();
    if(sub && sub.status === 'active' && sub.valid_until && new Date(sub.valid_until) > new Date()) atual = sub.plano;
    var iAtual = ORDEM_PLANOS.indexOf(atual);
    cards.forEach(function(card){
      var plano = card.getAttribute('data-plano');
      var i = ORDEM_PLANOS.indexOf(plano);
      var btn = card.querySelector('.btn');
      if(!btn) return;
      var nome = card.querySelector('.pname') ? card.querySelector('.pname').textContent : plano;
      if(i === iAtual){
        btn.textContent = 'Plano atual';
        btn.className = 'btn btn-ghost';
        btn.style.opacity = '.55';
        btn.style.pointerEvents = 'none';
        btn.onclick = function(){ return false; };
        btn.removeAttribute('href');
      } else if(i < iAtual){
        btn.textContent = 'Fazer downgrade';
        btn.className = 'btn btn-ghost';
        btn.style.opacity = '.8';
        btn.href = '#';
        btn.onclick = function(){ alert('Pra baixar de plano, deixe o atual expirar ou fale com a gente: contato@weblar.app.br'); return false; };
      } else {
        btn.textContent = 'Assinar ' + nome;
        btn.className = 'btn ' + (card.classList.contains('pop') ? 'btn-gold' : 'btn-ghost');
        btn.href = '#';
        btn.onclick = (function(p){ return function(){ assinar(p); return false; }; })(plano);
      }
    });
  }catch(e){}
}

/* ---- Calculadora de tokens avulsos ---- */
function calcTokens(){
  var inp = document.getElementById('tok-qty');
  var out = document.getElementById('tok-total');
  if(!inp || !out) return;
  var q = parseInt(inp.value, 10) || 0;
  out.textContent = 'R$' + (q/100).toFixed(2).replace('.', ',');
}
function comprarTokens(){
  var inp = document.getElementById('tok-qty');
  var q = inp ? parseInt(inp.value, 10) || 0 : 0;
  if(q < 1000){ alert('O mínimo é 1.000 tokens (R$10,00).'); return; }
  checkout({ tokens: q });
}

/* ---- Criar site (home): /create se logado, senão cadastro ---- */
function criarSite(){
  var ta = document.querySelector('.prompt-box textarea');
  var p = ta ? ta.value.trim() : '';
  loadSupabase(async function(){
    try{
      if(!db) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      var { data: { session } } = await db.auth.getSession();
      var dest = session ? '/create/' : '/cadastro/';
      if(p) dest += '?p=' + encodeURIComponent(p);
      location.href = dest;
    }catch(e){ location.href = '/cadastro/'; }
  });
}

/* ---- Chips do prompt (home) ---- */
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.chip').forEach(function(c){
    c.addEventListener('click', function(){
      var t = document.querySelector('.prompt-box textarea');
      if(!t) return;
      var map = {
        'Cafeteria':'Quero um site pra minha cafeteria, com cardápio, fotos e botão de WhatsApp.',
        'Portfólio':'Quero um portfólio pra mostrar meus trabalhos de design, elegante e minimalista.',
        'Personal':'Quero um site de personal trainer, com planos, depoimentos e agendamento.'
      };
      t.value = map[c.textContent.trim()] || '';
      t.focus();
    });
  });
  // checa login pra ajustar nav e planos
  loadSupabase(function(){ updateNav(); updatePlanos(); });
  calcTokens();
  astMontar();
  demoAnim();
});

/* ===== Animação do mockup da home (criando em tempo real, em loop) ===== */
function demoAnim(){
  var chat = document.getElementById('demo-chat');
  var H = document.getElementById('demo-h'), S = document.getElementById('demo-sub'), C = document.getElementById('demo-cta');
  if(!chat || !H || !S || !C) return;

  var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function bolha(kind, text){
    var d = document.createElement('div'); d.className = 'msg ' + kind;
    if(kind === 'ai'){ d.innerHTML = '<span class="who">Mistto</span>' + text; } else { d.textContent = text; }
    chat.appendChild(d); return d;
  }
  function digitando(kind){
    var d = document.createElement('div'); d.className = 'msg ' + kind + ' demo-t';
    d.innerHTML = (kind === 'ai' ? '<span class="who">Mistto</span>' : '') + '<span class="ast-typing"><span></span><span></span><span></span></span>';
    chat.appendChild(d); return d;
  }
  function limpar(){
    chat.innerHTML = '';
    H.classList.remove('on'); S.classList.remove('on');
    C.classList.remove('on'); C.classList.add('plain');
  }
  function esperar(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  // versão estática pra quem prefere menos movimento
  if(reduz){
    bolha('ai', 'Oi! Me conta que site você quer criar.');
    bolha('user', 'Uma landing pra minha cafeteria, tom aconchegante');
    bolha('ai', 'Prontinho! Criei um hero com foto e um botão. Quer mudar a cor do botão?');
    bolha('user', 'Deixa dourado, igual meu logo');
    bolha('ai', 'Feito! Cliquei na parte que você selecionou no preview e ajustei.');
    H.classList.add('on'); S.classList.add('on'); C.classList.add('on'); C.classList.remove('plain');
    return;
  }

  async function rodar(){
    /* eslint-disable no-constant-condition */
    while(true){
      limpar();
      await esperar(700);
      bolha('ai', 'Oi! Me conta que site você quer criar.');
      await esperar(1100);
      var t1 = digitando('user'); await esperar(950); t1.remove();
      bolha('user', 'Uma landing pra minha cafeteria, tom aconchegante');
      await esperar(700);
      var t2 = digitando('ai'); await esperar(1250); t2.remove();
      bolha('ai', 'Prontinho! Criei um hero com foto e um botão. Quer mudar a cor do botão?');
      await esperar(300); H.classList.add('on');
      await esperar(500); S.classList.add('on');
      await esperar(500); C.classList.add('on');
      await esperar(1300);
      var t3 = digitando('user'); await esperar(950); t3.remove();
      bolha('user', 'Deixa dourado, igual meu logo');
      await esperar(700);
      var t4 = digitando('ai'); await esperar(1150); t4.remove();
      bolha('ai', 'Feito! Cliquei na parte que você selecionou no preview e ajustei.');
      await esperar(250);
      C.classList.add('pv-sel');
      await esperar(220); C.classList.remove('plain');
      await esperar(1500); C.classList.remove('pv-sel');
      await esperar(2800);
    }
  }
  rodar();
}

/* ===== Assistente Mistto (widget de suporte com IA) ===== */
var AST = { hist: [], aberto: false, montado: false };

function astMontar(){
  if(AST.montado || !document.body) return;
  var b = document.createElement('button');
  b.className = 'ast-bubble'; b.id = 'ast-bubble';
  b.setAttribute('aria-label', 'Abrir assistente Mistto');
  b.onclick = astToggle;
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var p = document.createElement('div');
  p.className = 'ast-panel'; p.id = 'ast-panel';
  p.innerHTML =
      '<div class="ast-head"><div><b>Assistente Mistto</b><span>Tira suas dúvidas na hora</span></div>'
    + '<button class="ast-x" aria-label="Fechar" onclick="astToggle()">&times;</button></div>'
    + '<div class="ast-msgs" id="ast-msgs"></div>'
    + '<div class="ast-input"><input id="ast-in" placeholder="Escreva sua dúvida…" onkeydown="astKey(event)" autocomplete="off">'
    + '<button aria-label="Enviar" onclick="astSend()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg></button></div>';
  document.body.appendChild(b);
  document.body.appendChild(p);
  AST.montado = true;
  astBot('Oi! Sou a assistente da Mistto. Posso explicar os planos, os tokens, as WeCoins ou como criar seu site. O que você quer saber?');
  astSugestoes(['Como funciona?', 'Quais são os planos?', 'O que são WeCoins?', 'Tem plano grátis?']);
}
function astToggle(){
  astMontar();
  var p = document.getElementById('ast-panel');
  AST.aberto = !AST.aberto;
  p.classList.toggle('open', AST.aberto);
  if(AST.aberto){ var i = document.getElementById('ast-in'); if(i) setTimeout(function(){ i.focus(); }, 60); }
}
function astAbrir(){ astMontar(); if(!AST.aberto) astToggle(); }
function astScroll(){ var m = document.getElementById('ast-msgs'); if(m) m.scrollTop = m.scrollHeight; }
function astUser(t){ var m = document.getElementById('ast-msgs'); var d = document.createElement('div'); d.className = 'ast-msg user'; d.textContent = t; m.appendChild(d); astScroll(); }
function astBot(t){ var m = document.getElementById('ast-msgs'); var d = document.createElement('div'); d.className = 'ast-msg bot'; d.textContent = t; m.appendChild(d); astScroll(); return d; }
function astSugestoes(arr){
  var m = document.getElementById('ast-msgs');
  var w = document.createElement('div'); w.className = 'ast-chips';
  arr.forEach(function(s){
    var c = document.createElement('span'); c.className = 'ast-chip'; c.textContent = s;
    c.onclick = function(){ w.remove(); astEnviarTexto(s); };
    w.appendChild(c);
  });
  m.appendChild(w); astScroll();
}
function astKey(e){ if(e.key === 'Enter'){ e.preventDefault(); astSend(); } }
function astSend(){ var i = document.getElementById('ast-in'); var t = i ? i.value.trim() : ''; if(!t) return; i.value = ''; astEnviarTexto(t); }
async function astEnviarTexto(t){
  astUser(t);
  AST.hist.push({ role: 'user', content: t });
  var pensando = astBot('');
  pensando.innerHTML = '<span class="ast-typing"><span></span><span></span><span></span></span>';
  try{
    var res = await fetch(SUPABASE_URL + '/functions/v1/assistente', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ messages: AST.hist })
    });
    var data = await res.json();
    if(data.reply){ pensando.textContent = data.reply; AST.hist.push({ role: 'assistant', content: data.reply }); }
    else { pensando.textContent = 'Não consegui responder agora. Escreve pra gente em contato@weblar.app.br que a gente ajuda.'; }
  }catch(e){ pensando.textContent = 'Sem conexão agora. Tenta de novo, ou fala com a gente em contato@weblar.app.br.'; }
  astScroll();
}

/* ---- Lista de espera ---- */
async function joinWaitlist(e){
  e.preventDefault();
  var email = document.getElementById('wl-email').value;
  var msg = document.getElementById('wl-msg');
  try{
    var res = await fetch(SUPABASE_URL + '/rest/v1/waitlist', {
      method:'POST',
      headers:{
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type':'application/json',
        'Prefer':'return=minimal'
      },
      body: JSON.stringify({ email: email, source: 'mistto-landing' })
    });
    if(res.ok){
      msg.style.color = 'var(--green)';
      msg.textContent = '✓ Pronto! Guardamos ' + email + ' na lista. Avisaremos você em primeira mão.';
      document.getElementById('wl-email').value = '';
    } else {
      var t = await res.text();
      msg.style.color = '#d9534f';
      msg.textContent = (t.indexOf('duplicate')>-1) ? 'Esse e-mail já está na lista' : 'Ops, tente de novo em instantes.';
    }
  }catch(err){
    msg.style.color = '#d9534f';
    msg.textContent = 'Sem conexão agora — tente novamente.';
  }
}

/* ===== Tema claro/escuro (botão sol/lua no nav) ===== */
var SVG_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
var SVG_LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function montaTema(){
  if(document.getElementById('tema-btn')) return;
  var host = document.querySelector('.nav-in') || document.querySelector('.ed-chat-top');
  if(!host) return;
  var b = document.createElement('button');
  b.id = 'tema-btn'; b.className = 'tema-btn'; b.type = 'button';
  b.setAttribute('aria-label', 'Alternar tema claro/escuro');
  function ic(){ b.innerHTML = document.documentElement.classList.contains('dark') ? SVG_SOL : SVG_LUA; }
  b.onclick = function(){ var d = document.documentElement.classList.toggle('dark'); try{ localStorage.setItem('mistto-tema', d ? 'dark' : 'claro'); }catch(e){} ic(); };
  ic(); host.appendChild(b);
}
if(document.readyState !== 'loading'){ montaTema(); } else { document.addEventListener('DOMContentLoaded', montaTema); }
