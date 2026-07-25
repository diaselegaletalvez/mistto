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
    var { data: meus } = await db.from('mistto_sites').select('id,nome,prompt,created_at,published').eq('user_id', u.id).order('created_at', { ascending:false });
    var area = document.getElementById('sites-area');
    if(area && meus && meus.length){
      var bs = 'padding:7px 14px;font-size:.82rem';
      var esc = function(x){ return String(x||'').replace(/[<>]/g,''); };
      var h = '<div class="gallery">';
      meus.forEach(function(s){
        var titulo = esc(s.nome) || 'Seu site';
        var t = esc(s.prompt || 'Site sem descrição').slice(0,70);
        var pub = s.published !== false;
        h += '<div class="demo-card">'
          + '<div class="demo-thumb" style="background:linear-gradient(135deg,#EFC03A,#B5860F);color:#251a02">Mistto</div>'
          + '<div class="info"><h3>' + titulo + (pub ? '' : ' <span class="soon">fora do ar</span>') + '</h3><p>' + t + '</p>'
          + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'
          + '<a class="btn btn-ghost" style="' + bs + '" href="/s/?id=' + s.id + '" target="_blank" rel="noopener">Abrir</a>'
          + '<a class="btn btn-ghost" style="' + bs + '" href="/editor/?id=' + s.id + '">Editar</a>'
          + '<a class="btn btn-ghost" style="' + bs + '" href="/config/?id=' + s.id + '">Configurar</a>'
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

/* ---- Gestão dos sites (atalhos do painel) ---- */
async function toggleSite(id, pub){
  try{ await db.from('mistto_sites').update({ published: !pub }).eq('id', id); location.reload(); }
  catch(e){ alert('Não consegui mudar o status agora.'); }
}
async function apagarSite(id){
  if(!confirm('Apagar este site de vez? Essa ação não tem volta.')) return;
  try{ await db.from('mistto_sites').delete().eq('id', id); location.reload(); }
  catch(e){ alert('Não consegui apagar agora.'); }
}

/* ===================== CONFIGURAÇÕES DO SITE (/config) ===================== */
var CFG = { id:null, slug:null, publicado:true };

function cfgSlugLimpo(v){
  return String(v||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function cfgLink(slug){ return 'https://mistto.weblar.app.br/s/?s=' + encodeURIComponent(slug); }
function cfgPreview(){
  var s = cfgSlugLimpo(document.getElementById('cfg-slug').value);
  var a = document.getElementById('cfg-link');
  if(a){ a.textContent = s ? cfgLink(s) : '—'; a.href = s ? cfgLink(s) : '#'; }
}
function cfgMsg(id, txt, ok){
  var m = document.getElementById(id); if(!m) return;
  m.style.color = ok ? 'var(--green)' : '#d9534f'; m.textContent = txt;
}
function cfgStatus(){
  var s = document.getElementById('cfg-status'), b = document.getElementById('cfg-pub');
  if(s) s.textContent = CFG.publicado ? 'No ar' : 'Fora do ar';
  if(b) b.textContent = CFG.publicado ? 'Tirar do ar' : 'Publicar';
}

async function initConfig(){
  var { data: { session } } = await db.auth.getSession();
  if(!session){ location.href = '/login/'; return; }
  var id = new URLSearchParams(location.search).get('id');
  if(!id){ location.href = '/painel/'; return; }
  CFG.id = id;
  try{
    var { data: site } = await db.from('mistto_sites').select('id,nome,slug,published,user_id').eq('id', id).maybeSingle();
    if(!site || site.user_id !== session.user.id){
      document.getElementById('cfg-load').textContent = 'Não encontrei esse site na sua conta.';
      return;
    }
    CFG.slug = site.slug; CFG.publicado = site.published !== false;
    document.getElementById('cfg-nome').value = site.nome || '';
    document.getElementById('cfg-slug').value = site.slug || '';
    cfgPreview(); cfgStatus();
    var open = document.getElementById('cfg-open'); if(open) open.href = '/s/?id=' + id;
    var edit = document.getElementById('cfg-edit'); if(edit) edit.href = '/editor/?id=' + id;
    document.getElementById('cfg-load').style.display = 'none';
    document.getElementById('cfg').style.display = 'block';
  }catch(e){ document.getElementById('cfg-load').textContent = 'Não consegui carregar as configurações agora.'; }
}

async function salvarNomeSite(){
  if(!CFG.id) return;
  var nome = document.getElementById('cfg-nome').value.trim();
  try{
    var { error } = await db.from('mistto_sites').update({ nome: nome || null }).eq('id', CFG.id);
    if(error){ cfgMsg('cfg-nome-msg', 'Não consegui salvar agora.', false); return; }
    cfgMsg('cfg-nome-msg', 'Nome salvo!', true);
  }catch(e){ cfgMsg('cfg-nome-msg', 'Erro ao salvar.', false); }
}

async function salvarSlug(){
  if(!CFG.id) return;
  var s = cfgSlugLimpo(document.getElementById('cfg-slug').value);
  if(!s || s.length < 3){ cfgMsg('cfg-slug-msg', 'Use ao menos 3 letras/números (ex: meu-cafe).', false); return; }
  document.getElementById('cfg-slug').value = s;
  cfgPreview();
  try{
    var { error } = await db.from('mistto_sites').update({ slug: s }).eq('id', CFG.id);
    if(error){
      var dup = /duplicate|unique/i.test(error.message || '');
      cfgMsg('cfg-slug-msg', dup ? 'Esse endereço já está em uso. Tente outro.' : 'Não consegui salvar agora.', false);
      return;
    }
    CFG.slug = s;
    cfgMsg('cfg-slug-msg', 'Endereço salvo! Seu site abre no link acima.', true);
  }catch(e){ cfgMsg('cfg-slug-msg', 'Erro ao salvar.', false); }
}

async function cfgTogglePub(){
  if(!CFG.id) return;
  var novo = !CFG.publicado;
  try{
    var { error } = await db.from('mistto_sites').update({ published: novo }).eq('id', CFG.id);
    if(error) return;
    CFG.publicado = novo; cfgStatus();
  }catch(e){}
}

async function apagarSiteCfg(){
  if(!CFG.id) return;
  if(!confirm('Apagar este site de vez? Essa ação não tem volta.')) return;
  try{ await db.from('mistto_sites').delete().eq('id', CFG.id); location.href = '/painel/'; }
  catch(e){ alert('Não consegui apagar agora.'); }
}

/* pedir subdomínio ou domínio próprio — cai na tabela + e-mail pro admin */
async function solicitarDominio(tipo){
  var inputId = (tipo === 'subdominio') ? 'cfg-sub' : 'cfg-dom';
  var msgId = (tipo === 'subdominio') ? 'cfg-sub-msg' : 'cfg-dom-msg';
  var el = document.getElementById(inputId);
  var valor = el ? el.value.trim() : '';
  if(!valor){ cfgMsg(msgId, 'Escreva o endereço que você quer.', false); return; }
  if(tipo === 'subdominio'){ valor = cfgSlugLimpo(valor); if(el) el.value = valor; }
  else { valor = valor.toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'').trim(); if(el) el.value = valor; }
  if(!valor){ cfgMsg(msgId, 'Endereço inválido.', false); return; }
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var { error } = await db.from('domain_requests').insert({ site_id: CFG.id, user_id: session.user.id, tipo: tipo, valor: valor });
    if(error){ cfgMsg(msgId, 'Não consegui enviar agora. Tente de novo.', false); return; }
    cfgMsg(msgId, 'Pedido enviado! A gente te avisa por e-mail quando estiver no ar.', true);
    if(el) el.value = '';
  }catch(e){ cfgMsg(msgId, 'Erro ao enviar o pedido.', false); }
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
/* /create só COLETA (nome + descrição) e leva pro chat, que conduz a conversa */
async function gerarSite(){
  var ta = document.getElementById('create-prompt');
  var prompt = ta ? ta.value.trim() : '';
  if(!prompt){ alert('Conta pra Mistto o que você quer criar (mesmo que só uma ideia).'); return; }
  var nomeEl = document.getElementById('create-nome');
  var nome = nomeEl ? nomeEl.value.trim() : '';
  var provEl = document.getElementById('create-provider');
  var provider = provEl ? provEl.value : 'gemini';
  var st = document.getElementById('create-status');
  if(st){ st.style.display='block'; st.style.color='var(--muted)'; st.textContent='Abrindo o chat…'; }
  location.href = '/editor/?novo=1&nome=' + encodeURIComponent(nome) + '&desc=' + encodeURIComponent(prompt) + '&prov=' + provider;
}

/* traduz o erro da function gerar-site pra algo acionável */
function traduzGerar(data, status){
  var e = data && (data.error || '');
  if(e === 'ia_sem_resposta') return 'A IA não respondeu' + (data.detail ? ' — ' + data.detail : '') + '. Tente outro provedor no seletor.';
  if(e === 'db') return 'Erro ao salvar o site. A tabela existe? Rode o mistto-tudo.sql. (' + (data.detail || '') + ')';
  if(e === 'precisa estar logado') return 'Sua sessão expirou. Entre de novo.';
  if(e === 'prompt vazio') return 'Descreva o site que você quer criar.';
  if(status === 404) return 'A função gerar-site não foi encontrada. Falta deployar? (supabase functions deploy gerar-site --no-verify-jwt)';
  return 'Não consegui gerar agora (' + (data.detail || e || status) + ').';
}

/* ===================== EDITOR (chat + preview) ===================== */
var EDITOR = { id:null, slug:null, publicado:true, fase:'edicao', nome:'', provider:'gemini', msgs:[] };

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; });
}
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
/* bolha "digitando" da Mistto */
function edPensando(){
  return edAddMsg('<span class="ed-typing"><span></span><span></span><span></span></span>', 'ai');
}
function edRefresh(){
  var f = document.getElementById('ed-frame');
  if(f && EDITOR.id){ f.src = '/s/?id=' + EDITOR.id + '&t=' + Date.now(); }
}
async function edSalvar(role, content){
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session || !EDITOR.id) return;
    await db.from('site_messages').insert({ site_id: EDITOR.id, user_id: session.user.id, role: role, content: content });
  }catch(e){}
}

async function initEditor(){
  var { data: { session } } = await db.auth.getSession();
  if(!session){ location.href = '/login/'; return; }
  var qs = new URLSearchParams(location.search);

  var prov = qs.get('prov');
  var sel = document.getElementById('ed-provider');
  if(sel && ['gemini','groq','cerebras','openrouter'].indexOf(prov) !== -1) sel.value = prov;
  EDITOR.provider = sel ? sel.value : (prov || 'gemini');
  if(sel){ sel.addEventListener('change', function(){ EDITOR.provider = sel.value; }); }

  var box = document.getElementById('ed-msgs');
  if(box) box.innerHTML = '';

  // Enter envia (Shift+Enter quebra linha)
  var ta = document.getElementById('ed-prompt');
  if(ta){ ta.addEventListener('keydown', function(ev){
    if(ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); enviarEdicao(); }
  }); }

  var id = qs.get('id');
  if(id){ return initEditorExistente(session, id, qs); }

  // ---------- MODO NOVO: entrevista → geração ----------
  var desc = qs.get('desc') || '';
  if(!desc){ location.href = '/create/'; return; }
  EDITOR.fase = 'entrevista';
  EDITOR.nome = qs.get('nome') || '';
  EDITOR.msgs = [{ role:'user', content: desc }];
  var url = document.getElementById('ed-url'); if(url) url.textContent = EDITOR.nome || 'novo site';
  var pb = document.getElementById('ed-pub'); if(pb) pb.style.display = 'none';
  var ob = document.getElementById('ed-open'); if(ob) ob.style.display = 'none';
  if(EDITOR.nome) edAddMsg('Projeto: ' + EDITOR.nome, 'user');
  edAddMsg(desc, 'user');
  entrevistaPasso();
}

/* abre um site que já existe (edição) */
async function initEditorExistente(session, id, qs){
  EDITOR.id = id; EDITOR.fase = 'edicao';
  try{
    var { data: site } = await db.from('mistto_sites').select('id,prompt,slug,published,user_id').eq('id', id).maybeSingle();
    if(!site || site.user_id !== session.user.id){ edAddMsg('Não encontrei esse site na sua conta.', 'err'); return; }
    EDITOR.slug = site.slug;
    EDITOR.publicado = site.published !== false;
    var { data: msgs } = await db.from('site_messages').select('role,content').eq('site_id', id).order('created_at', { ascending: true });
    if(msgs && msgs.length){
      msgs.forEach(function(m){ edAddMsg(m.content, m.role === 'user' ? 'user' : 'ai'); });
    } else {
      var saud = qs.get('novo')
        ? 'Prontinho! Montei seu site. Me diga o que quer mudar e eu ajusto na hora.'
        : 'Aqui está seu site. Me diga o que quer mudar e eu ajusto.';
      var seed = [];
      if(site.prompt){ edAddMsg(site.prompt, 'user'); seed.push({ site_id:id, user_id:session.user.id, role:'user', content:site.prompt }); }
      edAddMsg(saud, 'ai'); seed.push({ site_id:id, user_id:session.user.id, role:'assistant', content:saud });
      try{ await db.from('site_messages').insert(seed); }catch(e){}
    }
  }catch(e){ edAddMsg('Não consegui carregar os dados do site agora.', 'err'); }
  edRefresh();
  var open = document.getElementById('ed-open'); if(open){ open.href = '/s/?id=' + EDITOR.id; open.style.display = ''; }
  var url = document.getElementById('ed-url'); if(url && EDITOR.slug) url.textContent = 'mistto.weblar.app.br/s/' + EDITOR.slug;
  var pb = document.getElementById('ed-pub'); if(pb) pb.style.display = '';
  atualizaBtnPub();
}

/* um passo da entrevista: pergunta a próxima coisa OU decide gerar */
async function entrevistaPasso(){
  var btn = document.getElementById('ed-send'); if(btn) btn.disabled = true;
  var pensando = edPensando();
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify({ entrevista:true, nome:EDITOR.nome, messages:EDITOR.msgs, provider:EDITOR.provider, access_token:session.access_token })
    });
    var data = await res.json();
    if(data.pronto){
      var m1 = 'Perfeito! Vou montar seu site agora — leva alguns segundos.';
      if(pensando){ pensando.innerHTML = '<span class="who">Mistto</span>' + m1; }
      EDITOR.msgs.push({ role:'assistant', content:m1 });
      gerarDoResumo(data.resumo);
    } else if(data.pergunta){
      if(pensando){ pensando.innerHTML = '<span class="who">Mistto</span>' + escapeHtml(data.pergunta); }
      EDITOR.msgs.push({ role:'assistant', content:data.pergunta });
      if(btn) btn.disabled = false;
      var i = document.getElementById('ed-prompt'); if(i) i.focus();
    } else {
      if(pensando){ pensando.className = 'msg err'; pensando.textContent = traduzGerar(data, res.status); }
      if(btn) btn.disabled = false;
    }
  }catch(e){
    if(pensando){ pensando.className = 'msg err'; pensando.textContent = 'Erro na conversa. Tente de novo.'; }
    if(btn) btn.disabled = false;
  }
}

/* com o resumo pronto, gera o site de fato e entra no modo edição */
async function gerarDoResumo(resumo){
  EDITOR.fase = 'gerando';
  var loading = document.getElementById('ed-loading'); if(loading) loading.style.display = 'flex';
  var btn = document.getElementById('ed-send'); if(btn) btn.disabled = true;
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var prompt = resumo + (EDITOR.nome ? ('\n\nNome do projeto: ' + EDITOR.nome) : '');
    var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify({ prompt: prompt, nome: EDITOR.nome, provider:EDITOR.provider, access_token:session.access_token })
    });
    var data = await res.json();
    if(data.id){
      EDITOR.id = data.id; EDITOR.slug = data.slug; EDITOR.fase = 'edicao'; EDITOR.publicado = true;
      var okMsg = 'Pronto! Seu site está aí do lado. Agora é só me dizer o que quer ajustar.';
      var seed = EDITOR.msgs.map(function(m){ return { site_id:EDITOR.id, user_id:session.user.id, role:m.role, content:m.content }; });
      seed.push({ site_id:EDITOR.id, user_id:session.user.id, role:'assistant', content:okMsg });
      try{ await db.from('site_messages').insert(seed); }catch(e){}
      edAddMsg(okMsg, 'ai');
      edRefresh();
      var open = document.getElementById('ed-open'); if(open){ open.href = '/s/?id=' + EDITOR.id; open.style.display = ''; }
      var url = document.getElementById('ed-url'); if(url) url.textContent = 'mistto.weblar.app.br/s/' + EDITOR.slug;
      var pb = document.getElementById('ed-pub'); if(pb){ pb.style.display = ''; atualizaBtnPub(); }
    } else if(data.error === 'limite'){
      EDITOR.fase = 'entrevista';
      edAddMsg(data.msg || 'Você atingiu o limite do plano grátis (1 site). Assine pra criar mais.', 'err');
    } else {
      EDITOR.fase = 'entrevista';
      edAddMsg(traduzGerar(data, res.status), 'err');
    }
  }catch(e){ EDITOR.fase = 'entrevista'; edAddMsg('Erro ao montar o site. Tente de novo.', 'err'); }
  finally{
    var l = document.getElementById('ed-loading'); if(l) l.style.display = 'none';
    var b = document.getElementById('ed-send'); if(b) b.disabled = false;
  }
}

async function enviarEdicao(){
  var ta = document.getElementById('ed-prompt');
  var instr = ta ? ta.value.trim() : '';
  if(!instr){ return; }

  // fase de entrevista: cada envio é uma resposta às perguntas da Mistto
  if(EDITOR.fase === 'entrevista'){
    edAddMsg(instr, 'user');
    EDITOR.msgs.push({ role:'user', content:instr });
    ta.value = '';
    entrevistaPasso();
    return;
  }
  if(EDITOR.fase === 'gerando'){ return; }        // já está montando, ignora

  // fase de edição: o site já existe, cada envio é uma alteração
  if(!EDITOR.id){ return; }
  var btn = document.getElementById('ed-send');
  var loading = document.getElementById('ed-loading');

  edAddMsg(instr, 'user');
  edSalvar('user', instr);
  ta.value = '';
  var pensando = edPensando();
  if(btn){ btn.disabled = true; }
  if(loading){ loading.style.display = 'flex'; }

  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify({ site_id: EDITOR.id, prompt: instr, provider: EDITOR.provider, access_token: session.access_token })
    });
    var data = await res.json();
    if(data.id){
      var okMsg = 'Feito! Atualizei a prévia ao lado.';
      if(pensando){ pensando.innerHTML = '<span class="who">Mistto</span>' + okMsg; }
      edSalvar('assistant', okMsg);
      edRefresh();
    } else {
      if(pensando){ pensando.className = 'msg err'; pensando.textContent = traduzGerar(data, res.status); }
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
    await db.from('mistto_sites').update({ published: novo }).eq('id', EDITOR.id);
    EDITOR.publicado = novo;
    atualizaBtnPub();
    edAddMsg(novo ? 'Seu site voltou pro ar.' : 'Tirei seu site do ar. Só você consegue vê-lo agora.', 'ai');
  }catch(e){ edAddMsg('Não consegui mudar o status agora.', 'err'); }
}
