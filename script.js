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
function assinar(plano){
  loadSupabase(async function(){
    try{
      if(!db) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      var { data: { session } } = await db.auth.getSession();
      if(!session){ location.href = '/cadastro/'; return; } // precisa ter conta
      var res = await fetch(SUPABASE_URL + '/functions/v1/create-order', {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization':'Bearer ' + session.access_token
        },
        body: JSON.stringify({ plano: plano, access_token: session.access_token })
      });
      var data = await res.json();
      if(data.url){ location.href = data.url; }
      else { alert('Não consegui iniciar o pagamento agora. Tente de novo em instantes.'); }
    }catch(e){ alert('Ops, algo deu errado. Tente de novo.'); }
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
  var sel = document.getElementById('tok-pack');
  var out = document.getElementById('tok-total');
  if(!sel || !out) return;
  var op = sel.options[sel.selectedIndex];
  out.textContent = 'R$' + op.getAttribute('data-preco');
}
function comprarTokens(){
  var sel = document.getElementById('tok-pack');
  if(!sel) return;
  assinar(sel.options[sel.selectedIndex].getAttribute('data-id'));
}

/* ---- Criar site (home) → /create se logado, senão cadastro ---- */
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
});

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
      msg.textContent = '✓ Pronto! Guardamos ' + email + ' na lista. Avisaremos você em primeira mão. 🌬️';
      document.getElementById('wl-email').value = '';
    } else {
      var t = await res.text();
      msg.style.color = '#d9534f';
      msg.textContent = (t.indexOf('duplicate')>-1) ? 'Esse e-mail já está na lista 😉' : 'Ops, tente de novo em instantes.';
    }
  }catch(err){
    msg.style.color = '#d9534f';
    msg.textContent = 'Sem conexão agora — tente novamente.';
  }
}
