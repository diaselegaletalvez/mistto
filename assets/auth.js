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
  var cota = COTAS[planoAtual] || 500;
  var elC = document.getElementById('p-cota');
  if(elC) elC.textContent = cota.toLocaleString('pt-BR');
  // barra de uso de tokens (uso ainda não é rastreado → 0% por enquanto)
  var usados = 0;
  var elU = document.getElementById('p-usados');
  if(elU) elU.textContent = usados.toLocaleString('pt-BR');
  var bar = document.getElementById('tok-bar-fill');
  if(bar) bar.style.width = Math.min(100, Math.round((usados / cota) * 100)) + '%';

  // atalhos da caixa de criar rápido (chips preenchem o textarea)
  document.querySelectorAll('#pnl-chips .chip').forEach(function(c){
    c.addEventListener('click', function(){
      var t = document.getElementById('pnl-prompt');
      if(t){ t.value = c.getAttribute('data-prompt') || c.textContent; t.focus(); }
    });
  });

  // lista os sites do usuário (com ações: ver / tirar do ar / apagar)
  try{
    var { data: meus } = await db.from('sites').select('id,prompt,created_at,published').eq('user_id', u.id).order('created_at', { ascending:false });
    var area = document.getElementById('sites-area');
    if(area && meus && meus.length){
      var bs = 'padding:7px 14px;font-size:.82rem';
      var h = '<div class="gallery">';
      meus.forEach(function(s){
        var t = (s.prompt || 'Site sem descrição').replace(/[<>]/g,'').slice(0,70);
        var pub = s.published !== false;
        h += '<div class="demo-card">'
          + '<div class="demo-thumb" style="background:linear-gradient(135deg,#EFC03A,#B5860F);color:#251a02">Mistto</div>'
          + '<div class="info"><h3>Seu site ' + (pub ? '' : '<span class="soon">fora do ar</span>') + '</h3><p>' + t + '</p>'
          + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'
          + '<a class="btn btn-ghost" style="' + bs + '" href="/s/?id=' + s.id + '" target="_blank" rel="noopener">Ver</a>'
          + '<button class="btn btn-ghost" style="' + bs + '" onclick="toggleSite(\'' + s.id + '\',' + pub + ')">' + (pub ? 'Tirar do ar' : 'Publicar') + '</button>'
          + '<button class="btn btn-ghost" style="' + bs + ';color:#d9534f;border-color:#d9534f" onclick="apagarSite(\'' + s.id + '\')">Apagar</button>'
          + '</div></div></div>';
      });
      h += '</div>';
      area.innerHTML = h;
    }
  }catch(e){}
}

/* ---- Criar rápido a partir do painel (leva o texto pro /create) ---- */
function irCriar(){
  var t = document.getElementById('pnl-prompt');
  var v = t ? t.value.trim() : '';
  location.href = '/create/' + (v ? ('?p=' + encodeURIComponent(v)) : '');
}

/* ---- Gestão dos sites ---- */
async function toggleSite(id, pub){
  try{ await db.from('sites').update({ published: !pub }).eq('id', id); location.reload(); }
  catch(e){ alert('Não consegui mudar o status agora.'); }
}
async function apagarSite(id){
  if(!confirm('Apagar este site de vez? Essa ação não tem volta.')) return;
  try{ await db.from('sites').delete().eq('id', id); location.reload(); }
  catch(e){ alert('Não consegui apagar agora.'); }
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
      if(st){ st.style.color='var(--muted)'; st.textContent='Pronto! Abrindo o editor…'; }
      // vai pra tela de chat + preview pra continuar editando
      location.href = '/editor/?id=' + data.id + '&prov=' + provider + '&novo=1';
    } else if(data.error === 'limite'){
      if(st){ st.style.color='#d9534f'; st.textContent = data.msg || 'Limite do plano grátis atingido. Assine pra criar mais.'; }
    } else {
      if(st){ st.style.color='#d9534f'; st.textContent = 'Não consegui gerar agora. Tente de novo em instantes.'; }
    }
  }catch(e){ if(st){ st.style.color='#d9534f'; st.textContent = 'Erro ao gerar. Tente de novo.'; } }
}

/* ===================== EDITOR (chat + preview) ===================== */
var EDITOR = { id:null, slug:null, publicado:true };

function edAddMsg(texto, tipo){
  var box = document.getElementById('ed-msgs');
  if(!box) return null;
  var d = document.createElement('div');
  d.className = 'msg ' + (tipo || 'ai');
  if(tipo === 'ai'){ d.innerHTML = '<span class="who">Mistto</span>' + texto; }
  else { d.textContent = texto; }
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  return d;
}

function edRefresh(){
  var f = document.getElementById('ed-frame');
  if(f && EDITOR.id){ f.src = '/s/?id=' + EDITOR.id + '&t=' + Date.now(); }
}

async function initEditor(){
  var { data: { session } } = await db.auth.getSession();
  if(!session){ location.href = '/login/'; return; }
  var qs = new URLSearchParams(location.search);
  var id = qs.get('id');
  if(!id){ location.href = '/create/'; return; }
  EDITOR.id = id;

  var prov = qs.get('prov');
  var sel = document.getElementById('ed-provider');
  if(sel && ['gemini','groq','cerebras','openrouter'].indexOf(prov) !== -1) sel.value = prov;

  // carrega dados do site (dono só) pra montar cabeçalho + estado de publicação
  var box = document.getElementById('ed-msgs');
  if(box) box.innerHTML = '';
  try{
    var { data: site } = await db.from('sites').select('id,prompt,slug,published,user_id').eq('id', id).maybeSingle();
    if(!site || site.user_id !== session.user.id){
      edAddMsg('Não encontrei esse site na sua conta.', 'err');
      return;
    }
    EDITOR.slug = site.slug;
    EDITOR.publicado = site.published !== false;
    // primeira "conversa": o pedido original + resposta da Mistto
    if(site.prompt){ edAddMsg(site.prompt, 'user'); }
    if(qs.get('novo')){
      edAddMsg('Prontinho! Montei seu site. Me diga o que quer mudar e eu ajusto na hora.', 'ai');
    } else {
      edAddMsg('Aqui está seu site. Me diga o que quer mudar e eu ajusto.', 'ai');
    }
  }catch(e){ edAddMsg('Não consegui carregar os dados do site agora.', 'err'); }

  // preview + botões
  edRefresh();
  var open = document.getElementById('ed-open');
  if(open) open.href = '/s/?id=' + EDITOR.id;
  var url = document.getElementById('ed-url');
  if(url && EDITOR.slug) url.textContent = 'mistto.weblar.app.br/s/' + EDITOR.slug;
  atualizaBtnPub();

  // Enter envia (Shift+Enter quebra linha)
  var ta = document.getElementById('ed-prompt');
  if(ta){ ta.addEventListener('keydown', function(ev){
    if(ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); enviarEdicao(); }
  }); }
}

async function enviarEdicao(){
  var ta = document.getElementById('ed-prompt');
  var instr = ta ? ta.value.trim() : '';
  if(!instr){ return; }
  if(!EDITOR.id){ return; }

  var btn = document.getElementById('ed-send');
  var provEl = document.getElementById('ed-provider');
  var provider = provEl ? provEl.value : 'gemini';
  var loading = document.getElementById('ed-loading');

  edAddMsg(instr, 'user');
  ta.value = '';
  var pensando = edAddMsg('<span class="ed-typing"><span></span><span></span><span></span></span>', 'ai');
  if(btn){ btn.disabled = true; }
  if(loading){ loading.style.display = 'flex'; }

  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify({ site_id: EDITOR.id, prompt: instr, provider: provider, access_token: session.access_token })
    });
    var data = await res.json();
    if(data.id){
      if(pensando){ pensando.innerHTML = '<span class="who">Mistto</span>Feito! Atualizei a prévia ao lado.'; }
      edRefresh();
    } else {
      if(pensando){ pensando.className = 'msg err'; pensando.textContent = data.msg || 'Não consegui aplicar agora. Tente de novo em instantes.'; }
    }
  }catch(e){
    if(pensando){ pensando.className = 'msg err'; pensando.textContent = 'Erro ao aplicar a mudança. Tente de novo.'; }
  }finally{
    if(btn){ btn.disabled = false; }
    if(loading){ loading.style.display = 'none'; }
  }
}

function atualizaBtnPub(){
  var b = document.getElementById('ed-pub');
  if(!b) return;
  b.textContent = EDITOR.publicado ? 'Tirar do ar' : 'Publicar';
}
async function togglePub(){
  if(!EDITOR.id) return;
  var novo = !EDITOR.publicado;
  try{
    await db.from('sites').update({ published: novo }).eq('id', EDITOR.id);
    EDITOR.publicado = novo;
    atualizaBtnPub();
    edAddMsg(novo ? 'Seu site voltou pro ar.' : 'Tirei seu site do ar. Só você consegue vê-lo agora.', 'ai');
  }catch(e){ edAddMsg('Não consegui mudar o status agora.', 'err'); }
}
