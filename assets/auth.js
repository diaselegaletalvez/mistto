/* ===== Mistto — auth (Supabase Auth, conta compartilhada com o Weblar) ===== */
const SUPABASE_URL = "https://unsvccbzrrgnvzvdwwrz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuc3ZjY2J6cnJnbnZ6dmR3d3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MzE0OTUsImV4cCI6MjEwMDAwNzQ5NX0.LI121gkIHkiplDTcolv6e6is6LxN0I1Ebmil5tJKRxY";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function toggleNav(){ var l=document.querySelector('.nav-links'); if(l) l.classList.toggle('open'); }

function setMsg(text, ok){
  var m = document.getElementById('auth-msg');
  if(!m) return;
  m.style.color = ok ? 'var(--green)' : '#d9534f';
  m.textContent = text;
}

function traduz(m){
  if(/already registered|already been registered|already exists/i.test(m)) return 'Esse e-mail já tem conta. Tente entrar.';
  if(/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if(/at least 6|password should be/i.test(m)) return 'A senha precisa ter ao menos 6 caracteres.';
  if(/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  return 'Ops: ' + m;
}

/* ---- Cadastro ---- */
async function doSignup(e){
  e.preventDefault();
  var nome = document.getElementById('nome').value.trim();
  var email = document.getElementById('email').value.trim();
  var senha = document.getElementById('senha').value;
  setMsg('Criando sua conta...', true);
  var { data, error } = await db.auth.signUp({
    email: email, password: senha,
    options: { data: { nome: nome } }
  });
  if(error){ setMsg(traduz(error.message), false); return; }
  if(data.session){ location.href = '/painel/'; }
  else { setMsg('✓ Conta criada! Confira seu e-mail pra confirmar e depois é só entrar.', true); }
}

/* ---- Login ---- */
async function doLogin(e){
  e.preventDefault();
  var email = document.getElementById('email').value.trim();
  var senha = document.getElementById('senha').value;
  setMsg('Entrando...', true);
  var { data, error } = await db.auth.signInWithPassword({ email: email, password: senha });
  if(error){ setMsg(traduz(error.message), false); return; }
  location.href = '/painel/';
}

/* ---- Logout ---- */
async function doLogout(){ await db.auth.signOut(); location.href = '/'; }

/* ---- Guarda + preenche o painel ---- */
async function initPainel(){
  var { data: { session } } = await db.auth.getSession();
  if(!session){ location.href = '/login/'; return; }
  var u = session.user;
  var nome = (u.user_metadata && u.user_metadata.nome) || u.email.split('@')[0];
  var elN = document.getElementById('u-nome'); if(elN) elN.textContent = nome;
  var elE = document.getElementById('u-email'); if(elE) elE.textContent = u.email;
  // lê a assinatura ativa (se houver) e ajusta plano + cota de tokens
  var COTAS = { zefiro:500, minuano:9900, siroco:30000, boreas:150000 };
  var planoAtual = 'zefiro';
  try{
    var { data: sub } = await db.from('subscriptions').select('*').eq('user_id', u.id).maybeSingle();
    if(sub && sub.status === 'active' && sub.valid_until && new Date(sub.valid_until) > new Date()){
      planoAtual = sub.plano;
      var nomes = { zefiro:'Zéfiro', minuano:'Minuano', siroco:'Siroco', boreas:'Bóreas' };
      var elP = document.getElementById('p-plano');
      if(elP) elP.textContent = nomes[sub.plano] || sub.plano;
      var elV = document.getElementById('p-validade');
      if(elV) elV.innerHTML = 'Ativo até ' + new Date(sub.valid_until).toLocaleDateString('pt-BR');
    }
  }catch(e){}
  var elC = document.getElementById('p-cota');
  if(elC) elC.textContent = (COTAS[planoAtual] || 500).toLocaleString('pt-BR');

  // lista os sites do usuário
  try{
    var { data: meus } = await db.from('sites').select('id,prompt,created_at').eq('user_id', u.id).order('created_at', { ascending:false });
    var area = document.getElementById('sites-area');
    if(area && meus && meus.length){
      var h = '<div class="gallery">';
      meus.forEach(function(s){
        var t = (s.prompt || 'Site sem descrição').replace(/[<>]/g,'').slice(0,70);
        h += '<a class="demo-card" href="/s/?id=' + s.id + '" target="_blank" rel="noopener">'
          + '<div class="demo-thumb" style="background:linear-gradient(135deg,#EFC03A,#B5860F);color:#251a02">Mistto</div>'
          + '<div class="info"><h3>Seu site</h3><p>' + t + '</p></div></a>';
      });
      h += '</div>';
      area.innerHTML = h;
    }
  }catch(e){}
}

/* ---- Comprar plano / tokens (a partir do painel) ---- */
async function checkout(payload){
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/cadastro/'; return; }
    payload.access_token = session.access_token;
    var res = await fetch(SUPABASE_URL + '/functions/v1/create-order', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify(payload)
    });
    var data = await res.json();
    if(data.url){ location.href = data.url; } else { alert(data.msg || 'Não consegui iniciar o pagamento agora. Tente de novo.'); }
  }catch(e){ alert('Ops, algo deu errado. Tente de novo.'); }
}
function assinar(plano){ checkout({ plano: plano }); }
function comprarTokens(){
  var inp = document.getElementById('tok-qty');
  var q = inp ? parseInt(inp.value, 10) || 0 : 0;
  if(q < 1000){ alert('O mínimo é 1.000 tokens (R$10,00).'); return; }
  checkout({ tokens: q });
}
function calcTokens(){
  var inp = document.getElementById('tok-qty'), o = document.getElementById('tok-total');
  if(inp && o){ var q = parseInt(inp.value, 10) || 0; o.textContent = 'R$' + (q/100).toFixed(2).replace('.', ','); }
}

/* ---- Página /create (protegida) ---- */
async function initCreate(){
  var { data: { session } } = await db.auth.getSession();
  if(!session){ location.href = '/login/'; return; }
  var p = new URLSearchParams(location.search).get('p');
  var ta = document.getElementById('create-prompt');
  if(ta && p){ ta.value = p; }
  document.querySelectorAll('#create-chips .chip').forEach(function(c){
    c.addEventListener('click', function(){
      var t = document.getElementById('create-prompt');
      if(t){ t.value = c.getAttribute('data-prompt') || c.textContent; t.focus(); }
    });
  });
}
async function gerarSite(){
  var ta = document.getElementById('create-prompt');
  var prompt = ta ? ta.value.trim() : '';
  if(!prompt){ alert('Descreva o site que você quer criar.'); return; }
  var st = document.getElementById('create-status');
  var box = document.getElementById('create-result');
  if(st){ st.style.display='block'; st.style.color='var(--muted)'; st.textContent='Gerando seu site… leva alguns segundos.'; }
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var provEl = document.getElementById('create-provider');
    var provider = provEl ? provEl.value : 'gemini';
    var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify({ prompt: prompt, provider: provider, access_token: session.access_token })
    });
    var data = await res.json();
    if(data.id){
      if(st) st.style.display='none';
      if(box){
        box.style.display='block';
        box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">'
          + '<b>Prontinho! Seu site:</b><span>'
          + '<a class="btn btn-ghost" href="/s/?id='+data.id+'" target="_blank" style="padding:9px 18px">Abrir em nova aba</a> '
          + '<button class="btn btn-gold" onclick="gerarSite()" style="padding:9px 18px">Regenerar</button></span></div>'
          + '<iframe src="/s/?id='+data.id+'" style="width:100%;height:520px;border:1px solid var(--line);border-radius:16px;background:#fff"></iframe>';
        box.scrollIntoView({ behavior:'smooth', block:'start' });
      }
    } else if(data.error === 'limite'){
      if(st){ st.style.color='#d9534f'; st.textContent = data.msg || 'Limite do plano grátis atingido. Assine pra criar mais.'; }
    } else {
      if(st){ st.style.color='#d9534f'; st.textContent = 'Não consegui gerar agora. Tente de novo em instantes.'; }
    }
  }catch(e){ if(st){ st.style.color='#d9534f'; st.textContent = 'Erro ao gerar. Tente de novo.'; } }
}
