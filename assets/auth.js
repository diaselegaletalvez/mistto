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
/* impressão digital leve do dispositivo (o servidor re-hasha com sal) */
function miFingerprint(){
  try{
    var n = navigator, s = [
      n.userAgent, n.language, (n.languages||[]).join(','),
      screen.width + 'x' + screen.height, screen.colorDepth,
      new Date().getTimezoneOffset(), n.hardwareConcurrency||'',
      n.platform||'', n.maxTouchPoints||''
    ].join('|');
    var h = 5381; for(var i=0;i<s.length;i++){ h = (((h<<5)+h) ^ s.charCodeAt(i)) >>> 0; }
    return h.toString(16);
  }catch(e){ return ''; }
}

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
  // barra de uso de tokens (uso REAL deste mês)
  var usados = 0;
  try{
    var _d = new Date();
    var _inicio = new Date(Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), 1)).toISOString();
    var { data: usos } = await db.from('token_usage').select('tokens').eq('user_id', u.id).gte('created_at', _inicio);
    if(usos) usados = usos.reduce(function(a,r){ return a + (r.tokens||0); }, 0);
  }catch(e){}
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

  // se a pessoa assinou um plano pago, reativa os sites que estavam com prazo (limpa expiração)
  if(planoAtual !== 'zefiro'){
    try{ await db.from('mistto_sites').update({ expires_at:null }).eq('user_id', u.id).not('expires_at','is',null); }catch(e){}
  }

  // lista os sites do usuário (com ações: ver / tirar do ar / apagar)
  try{
    var { data: meus } = await db.from('mistto_sites').select('id,nome,prompt,created_at,published,expires_at').eq('user_id', u.id).order('created_at', { ascending:false });
    var area = document.getElementById('sites-area');
    if(area && meus && meus.length){
      var bs = 'padding:7px 14px;font-size:.82rem';
      var esc = function(x){ return String(x||'').replace(/[<>]/g,''); };
      var h = '<div class="gallery">';
      meus.forEach(function(s){
        var titulo = esc(s.nome) || 'Seu site';
        var t = esc(s.prompt || 'Site sem descrição').slice(0,70);
        var pub = s.published !== false;
        // status do prazo (plano grátis: 5 dias no ar)
        var selo = '';
        if(!pub){ selo = ' <span class="soon">fora do ar</span>'; }
        if(s.expires_at){
          var ms = new Date(s.expires_at).getTime() - Date.now();
          if(ms <= 0){ selo = ' <span class="soon" style="background:#d9534f;color:#fff">expirou</span>'; }
          else{
            var dias = Math.ceil(ms / 864e5);
            selo += ' <span class="soon">cai em ' + dias + (dias === 1 ? ' dia' : ' dias') + '</span>';
          }
        }
        var expirou = s.expires_at && (new Date(s.expires_at).getTime() - Date.now() <= 0);
        h += '<div class="demo-card">'
          + '<div class="demo-thumb" style="background:linear-gradient(135deg,#EFC03A,#B5860F);color:#251a02">Mistto</div>'
          + '<div class="info"><h3>' + titulo + selo + '</h3><p>' + t + '</p>'
          + (expirou ? '<p style="font-size:.8rem;color:var(--golddark);margin-top:6px"><a href="/precos/" style="color:var(--golddark);font-weight:600">Assine pra colocar de volta no ar</a> — seu site está guardado.</p>' : '')
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

/* ---- Importar site de outro criador (Base44, Lovable, v0…) ---- */
async function importarSite(){
  var btn = document.getElementById('imp-btn');
  var msg = document.getElementById('imp-msg');
  var nome = (document.getElementById('imp-nome')||{}).value || '';
  var url  = (document.getElementById('imp-url')||{}).value || '';
  var html = (document.getElementById('imp-html')||{}).value || '';
  function m(txt, err){ if(msg){ msg.style.display='block'; msg.style.color = err ? '#d9534f' : 'var(--muted)'; msg.textContent = txt; } }
  if(!url.trim() && !html.trim()){ m('Cole o link ou o código do site que você quer importar.', true); return; }
  var prov = 'gemini';
  var provEl = document.getElementById('imp-provider'); if(provEl) prov = provEl.value;
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    if(btn){ btn.style.pointerEvents='none'; btn.style.opacity='.6'; btn.textContent='Importando…'; }
    m('A Mistto está recriando seu site… isso pode levar alguns segundos.');
    var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify({ importar:true, url:url.trim(), html_importado:html, nome:nome, provider:prov, fp: miFingerprint(), access_token: session.access_token })
    });
    var d = await res.json().catch(function(){ return {}; });
    if(!res.ok || d.error){ m(d.msg || 'Não consegui importar agora. Tente colar o código HTML da página.', true); if(btn){ btn.style.pointerEvents=''; btn.style.opacity=''; btn.textContent='Importar site'; } return; }
    location.href = '/editor/?id=' + d.id + '&novo=1';
  }catch(e){
    m('Algo deu errado. Tente novamente.', true);
    if(btn){ btn.style.pointerEvents=''; btn.style.opacity=''; btn.textContent='Importar site'; }
  }
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

/* ===================== MINHA CONTA (/conta) ===================== */
var CONTA = { refUrl: '' };
function ctMsg(id, txt, ok){
  var m = document.getElementById(id); if(!m) return;
  m.style.color = ok ? 'var(--green)' : '#d9534f'; m.textContent = txt;
}
async function initConta(){
  var { data: { session } } = await db.auth.getSession();
  if(!session){ location.href = '/login/'; return; }
  var u = session.user;
  try{
    var nome = (u.user_metadata && (u.user_metadata.nome || u.user_metadata.full_name)) || '';
    var n = document.getElementById('ct-nome'); if(n) n.value = nome;
    var e = document.getElementById('ct-email'); if(e) e.value = u.email || '';
    var ie = document.getElementById('ct-info-email'); if(ie) ie.textContent = u.email || '-';
    var ic = document.getElementById('ct-info-criada'); if(ic) ic.textContent = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '-';
    // indicação (compartilhada com o Weblar): profiles.referral_code
    try{
      var { data: perfil } = await db.from('profiles').select('referral_code').eq('id', u.id).maybeSingle();
      var code = perfil && perfil.referral_code;
      var refEl = document.getElementById('ct-ref');
      if(code){ CONTA.refUrl = 'https://weblar.app.br/cadastro/?ref=' + code; if(refEl) refEl.textContent = CONTA.refUrl; }
      else if(refEl){ refEl.textContent = 'Seu link de indicação aparece aqui.'; }
    }catch(err){ var r=document.getElementById('ct-ref'); if(r) r.textContent = 'Seu link de indicação aparece aqui.'; }
    document.getElementById('ct-load').style.display = 'none';
    document.getElementById('ct').style.display = 'block';
  }catch(e){ document.getElementById('ct-load').textContent = 'Não consegui carregar sua conta agora.'; }
}
async function salvarNomeConta(){
  var nome = (document.getElementById('ct-nome').value || '').trim();
  if(!nome){ ctMsg('ct-nome-msg', 'Escreva seu nome.', false); return; }
  try{
    var { error } = await db.auth.updateUser({ data: { nome: nome, full_name: nome } });
    if(error){ ctMsg('ct-nome-msg', traduz(error.message), false); return; }
    try{ var { data:{ user } } = await db.auth.getUser(); if(user) await db.from('profiles').update({ full_name: nome }).eq('id', user.id); }catch(e){}
    ctMsg('ct-nome-msg', 'Nome salvo!', true);
  }catch(e){ ctMsg('ct-nome-msg', 'Erro ao salvar.', false); }
}
async function trocarEmailConta(){
  var email = (document.getElementById('ct-email').value || '').trim();
  if(!email){ ctMsg('ct-email-msg', 'Escreva o novo e-mail.', false); return; }
  try{
    var { error } = await db.auth.updateUser({ email: email });
    if(error){ ctMsg('ct-email-msg', traduz(error.message), false); return; }
    ctMsg('ct-email-msg', 'Enviamos um link de confirmação pro novo e-mail. A troca vale depois que você confirmar lá.', true);
  }catch(e){ ctMsg('ct-email-msg', 'Erro ao trocar o e-mail.', false); }
}
async function redefinirSenhaConta(){
  try{
    var { data: { session } } = await db.auth.getSession();
    var email = session && session.user && session.user.email;
    if(!email){ ctMsg('ct-senha-msg', 'Sessão expirada. Entre de novo.', false); return; }
    var { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: 'https://weblar.app.br/nova-senha/' });
    if(error){ ctMsg('ct-senha-msg', traduz(error.message), false); return; }
    ctMsg('ct-senha-msg', 'Link enviado pro seu e-mail. Abra pra criar uma nova senha.', true);
  }catch(e){ ctMsg('ct-senha-msg', 'Erro ao enviar o link.', false); }
}
async function sairDeTudo(){
  try{ await db.auth.signOut({ scope: 'global' }); location.href = '/'; }
  catch(e){ try{ await db.auth.signOut(); }catch(_){} location.href = '/'; }
}
async function copiarIndicacao(){
  if(!CONTA.refUrl){ ctMsg('ct-ref-msg', 'Seu link ainda não está disponível.', false); return; }
  try{ await navigator.clipboard.writeText(CONTA.refUrl); ctMsg('ct-ref-msg', 'Link copiado!', true); }
  catch(e){ ctMsg('ct-ref-msg', 'Copie manualmente: ' + CONTA.refUrl, false); }
}
async function excluirContaMistto(){
  if(!confirm('Isso vai apagar sua conta, sites e dados permanentemente (Mistto e Weblar). Você vai receber um e-mail de confirmação. Continuar?')) return;
  var btn = document.getElementById('ct-excluir'); if(btn){ btn.disabled = true; btn.textContent = 'Enviando…'; }
  try{
    var { data: { session } } = await db.auth.getSession();
    var token = session && session.access_token;
    if(!token){ alert('Sessão expirada. Entre de novo.'); return; }
    var resp = await fetch(SUPABASE_URL + '/functions/v1/solicitar-exclusao-conta', {
      method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + token }
    });
    var data = await resp.json().catch(function(){ return {}; });
    if(!resp.ok){ alert(data.error || 'Não consegui enviar o e-mail de confirmação.'); return; }
    alert('Enviamos um e-mail de confirmação. Clique no link pra concluir a exclusão.');
  }catch(e){ alert('Erro de conexão. Tente de novo.'); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = 'Excluir minha conta'; } }
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
  if(e === 'sem_tokens') return data.msg || 'Seus tokens do mês acabaram. Faça upgrade ou compre tokens avulsos.';
  if(e === 'email_nao_confirmado') return data.msg || 'Confirme seu e-mail pra criar seu site grátis.';
  if(e === 'abuso') return data.msg || 'Já existe um site grátis criado neste dispositivo. Assine um plano pra criar mais.';
  if(e === 'limite') return data.msg || 'Você atingiu o limite do plano grátis (1 site). Assine pra criar mais.';
  if(e === 'ia_sem_resposta') return 'A IA não respondeu' + (data.detail ? ' — ' + data.detail : '') + '. Tente outro provedor no seletor.';
  if(e === 'db') return 'Erro ao salvar o site. A tabela existe? Rode o mistto-tudo.sql. (' + (data.detail || '') + ')';
  if(e === 'precisa estar logado') return 'Sua sessão expirou. Entre de novo.';
  if(e === 'prompt vazio') return 'Descreva o site que você quer criar.';
  if(status === 404) return 'A função gerar-site não foi encontrada. Falta deployar? (supabase functions deploy gerar-site --no-verify-jwt)';
  return 'Não consegui gerar agora (' + (data.detail || e || status) + ').';
}

/* ===================== EDITOR (chat + preview) ===================== */
var EDITOR = { id:null, slug:null, publicado:true, fase:'edicao', nome:'', provider:'gemini', msgs:[], gerando:false, abort:null, ultimaInstr:'', anexo:null, selecao:null };

var SVG_SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
var SVG_STOP = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>';
var SVG_LAPIS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
var SVG_COPIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
var SVG_REGERAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
function edIconBtn(svg, titulo){ var b = document.createElement('button'); b.className = 'ed-ic'; b.title = titulo; b.setAttribute('aria-label', titulo); b.innerHTML = svg; return b; }

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; });
}
/* botão enviar vira "parar" enquanto gera */
function edBusy(on){
  EDITOR.gerando = on;
  var b = document.getElementById('ed-send');
  if(b){ b.innerHTML = on ? SVG_STOP : SVG_SETA; b.setAttribute('aria-label', on ? 'Parar' : 'Enviar'); b.disabled = false; }
}
function edSendOrStop(){ if(EDITOR.gerando){ edParar(); } else { enviarEdicao(); } }
function edParar(){ if(EDITOR.abort){ try{ EDITOR.abort.abort(); }catch(e){} } }
function edAbortado(e){ return e && (e.name === 'AbortError' || /abort/i.test(String(e && e.message))); }

/* barra de ações abaixo de uma resposta da Mistto */
function edTools(bubble, texto, comRegenerar){
  if(!bubble) return;
  var bar = document.createElement('div'); bar.className = 'ed-tools';
  var cop = edIconBtn(SVG_COPIAR, 'Copiar');
  cop.onclick = function(){ try{ navigator.clipboard.writeText(texto); cop.classList.add('ok'); setTimeout(function(){ cop.classList.remove('ok'); }, 1200); }catch(e){} };
  bar.appendChild(cop);
  if(comRegenerar){
    var reg = edIconBtn(SVG_REGERAR, 'Regenerar');
    reg.onclick = function(){ if(EDITOR.gerando || !EDITOR.ultimaInstr) return; aplicarEdicao(EDITOR.ultimaInstr, true); };
    bar.appendChild(reg);
  }
  bubble.appendChild(bar);
}

/* anexar imagem: sobe pro Storage e guarda a URL pra usar no próximo pedido */
function edAnexar(){ var f = document.getElementById('ed-file'); if(f) f.click(); }
function edLimpaAnexo(){
  EDITOR.anexo = null;
  var a = document.getElementById('ed-anexo'); if(a){ a.style.display = 'none'; a.innerHTML = ''; }
  var f = document.getElementById('ed-file'); if(f) f.value = '';
}
async function edArquivoEscolhido(ev){
  var file = ev && ev.target && ev.target.files && ev.target.files[0];
  if(!file) return;
  if(!/^image\//.test(file.type)){ alert('Por enquanto dá pra anexar só imagens.'); return; }
  if(file.size > 5 * 1024 * 1024){ alert('Imagem muito grande (máx 5 MB).'); return; }
  var box = document.getElementById('ed-anexo');
  if(box){ box.style.display = 'flex'; box.innerHTML = '<span>Enviando imagem…</span>'; }
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g,'');
    var path = session.user.id + '/' + Date.now() + '.' + ext;
    var up = await db.storage.from('site-uploads').upload(path, file, { upsert: true, contentType: file.type });
    if(up.error){ if(box){ box.innerHTML = '<span style="color:#d9534f">Não consegui subir a imagem. (o bucket site-uploads existe?)</span><span class="x" onclick="edLimpaAnexo()">&times;</span>'; } return; }
    var pub = db.storage.from('site-uploads').getPublicUrl(path);
    var url = pub && pub.data && pub.data.publicUrl;
    EDITOR.anexo = { url: url, name: file.name };
    if(box){ box.innerHTML = '<img src="' + url + '" alt=""><span>' + escapeHtml(file.name) + '</span><span class="x" title="Remover" onclick="edLimpaAnexo()">&times;</span>'; }
  }catch(e){ if(box){ box.innerHTML = '<span style="color:#d9534f">Erro ao anexar.</span><span class="x" onclick="edLimpaAnexo()">&times;</span>'; } }
}
function edAddMsg(texto, tipo){
  var box = document.getElementById('ed-msgs');
  if(!box) return null;
  var d = document.createElement('div');
  d.className = 'msg ' + (tipo || 'ai');
  if(tipo === 'ai'){
    d.innerHTML = '<span class="who">Mistto</span>' + texto;
  } else if(tipo === 'user'){
    // sua mensagem: texto + lápis pra editar (recoloca no compositor)
    d.appendChild(document.createTextNode(texto));
    var bar = document.createElement('div'); bar.className = 'ed-tools ed-tools-user';
    var ed = edIconBtn(SVG_LAPIS, 'Editar');
    ed.onclick = function(){
      var t = document.getElementById('ed-prompt');
      if(t){ t.value = texto; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 150) + 'px'; t.focus(); }
    };
    bar.appendChild(ed);
    d.appendChild(bar);
  } else { d.textContent = texto; }
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
  if(f && EDITOR.id){ f.src = '/s/?id=' + EDITOR.id + '&edit=1&t=' + Date.now(); }
}

/* mostra/limpa a "parte selecionada" no preview */
function edMostraSelecao(sel){
  EDITOR.selecao = sel;
  var box = document.getElementById('ed-selecao');
  if(box){
    box.style.display = 'flex';
    box.innerHTML = 'Selecionado: <b>' + escapeHtml(sel.desc) + '</b><span class="x" title="Tirar seleção" onclick="edLimpaSelecao()">&times;</span>';
  }
  var acoes = document.getElementById('ed-acoes'); if(acoes) acoes.style.display = 'flex';
  var c = document.getElementById('ed-cor'); if(c && sel.cor) c.value = sel.cor;
  var f = document.getElementById('ed-fundo'); if(f && sel.fundo) f.value = sel.fundo;
  var hint = document.getElementById('ed-hint'); if(hint) hint.classList.add('hide');
  var ta = document.getElementById('ed-prompt'); if(ta){ ta.placeholder = 'Peça uma mudança nessa parte… ou use os botões acima'; }
}
function edLimpaSelecao(){
  EDITOR.selecao = null;
  var box = document.getElementById('ed-selecao'); if(box){ box.style.display = 'none'; box.innerHTML = ''; }
  var acoes = document.getElementById('ed-acoes'); if(acoes) acoes.style.display = 'none';
  var ta = document.getElementById('ed-prompt'); if(ta){ ta.placeholder = 'Escreva uma mensagem…'; }
}

/* ação direta na parte selecionada — instantânea e sem gastar tokens */
function edAcao(action, value){
  var f = document.getElementById('ed-frame');
  if(!f || !f.contentWindow || !EDITOR.selecao) return;
  if(action === 'apagar'){
    if(!confirm('Apagar essa parte do site?')) return;
  }
  try{ f.contentWindow.postMessage({ mistto:'act', action: action, value: value }, '*'); }catch(e){}
}

/* salva o HTML editado direto no banco (sem IA) */
async function edSalvarHtmlDireto(html){
  if(!EDITOR.id || !html) return;
  try{
    await db.from('mistto_sites').update({ html: html }).eq('id', EDITOR.id);
    edToast('Alteração salva');
  }catch(e){ edToast('Não consegui salvar a alteração', true); }
}

/* aviso rápido no canto do preview */
function edToast(txt, erro){
  var wrap = document.querySelector('.ed-frame-wrap'); if(!wrap) return;
  var t = document.createElement('div');
  t.className = 'ed-toast' + (erro ? ' erro' : '');
  t.textContent = txt;
  wrap.appendChild(t);
  setTimeout(function(){ t.classList.add('show'); }, 10);
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 300); }, 1800);
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

  // escuta o iframe /s/?edit=1: seleção de parte + ações diretas (apagar/mover/cor…)
  window.addEventListener('message', function(ev){
    var d = ev.data; if(!d || !d.mistto) return;
    if(d.mistto === 'select' && d.desc){ edMostraSelecao(d); }
    else if(d.mistto === 'saved' && d.html){ edSalvarHtmlDireto(d.html); }
    else if(d.mistto === 'cleared'){ edLimpaSelecao(); }
  });

  // Enter envia (Shift+Enter quebra linha) + campo cresce conforme digita
  var ta = document.getElementById('ed-prompt');
  if(ta){
    ta.addEventListener('keydown', function(ev){
      if(ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); enviarEdicao(); }
    });
    ta.addEventListener('input', function(){
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
    });
  }

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
  var pensando = edPensando();
  EDITOR.abort = new AbortController();
  edBusy(true);
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify({ entrevista:true, nome:EDITOR.nome, messages:EDITOR.msgs, provider:EDITOR.provider, access_token:session.access_token }),
      signal: EDITOR.abort.signal
    });
    var data = await res.json();
    if(data.pronto){
      var m1 = 'Perfeito! Vou montar seu site agora — leva alguns segundos.';
      if(pensando){ pensando.innerHTML = '<span class="who">Mistto</span>' + m1; }
      EDITOR.msgs.push({ role:'assistant', content:m1 });
      await gerarDoResumo(data.resumo);
    } else if(data.pergunta){
      if(pensando){ pensando.innerHTML = '<span class="who">Mistto</span>' + escapeHtml(data.pergunta); edTools(pensando, data.pergunta, false); }
      EDITOR.msgs.push({ role:'assistant', content:data.pergunta });
      var i = document.getElementById('ed-prompt'); if(i) i.focus();
    } else {
      if(pensando){ pensando.className = 'msg err'; pensando.textContent = traduzGerar(data, res.status); }
    }
  }catch(e){
    if(edAbortado(e)){ if(pensando){ pensando.className = 'msg err'; pensando.textContent = 'Cancelado.'; } }
    else if(pensando){ pensando.className = 'msg err'; pensando.textContent = 'Erro na conversa. Tente de novo.'; }
  }finally{ edBusy(false); }
}

/* com o resumo pronto, gera o site de fato e entra no modo edição */
async function gerarDoResumo(resumo){
  EDITOR.fase = 'gerando';
  var loading = document.getElementById('ed-loading'); if(loading) loading.style.display = 'flex';
  EDITOR.abort = new AbortController();
  edBusy(true);
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var prompt = resumo + (EDITOR.nome ? ('\n\nNome do projeto: ' + EDITOR.nome) : '');
    var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify({ prompt: prompt, nome: EDITOR.nome, provider:EDITOR.provider, fp: miFingerprint(), access_token:session.access_token }),
      signal: EDITOR.abort.signal
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
  }catch(e){
    EDITOR.fase = 'entrevista';
    if(edAbortado(e)){ edAddMsg('Geração cancelada. Me diga de novo o que quer e eu monto.', 'err'); }
    else{ edAddMsg('Erro ao montar o site. Tente de novo.', 'err'); }
  }
  finally{
    var l = document.getElementById('ed-loading'); if(l) l.style.display = 'none';
    edBusy(false);
  }
}

async function enviarEdicao(){
  if(EDITOR.gerando){ return; }
  var ta = document.getElementById('ed-prompt');
  var instr = ta ? ta.value.trim() : '';
  var temAnexo = !!(EDITOR.anexo && EDITOR.anexo.url);
  if(!instr && !temAnexo){ return; }
  var notaAnexo = temAnexo ? ('\n\n(Imagem enviada pelo dono pra usar no site, coloque num <img>: ' + EDITOR.anexo.url + ')') : '';
  var visivel = (instr || 'Usar a imagem que anexei') + (temAnexo ? ' (imagem anexada)' : '');

  // fase de entrevista: cada envio é uma resposta às perguntas da Mistto
  if(EDITOR.fase === 'entrevista'){
    edAddMsg(visivel, 'user');
    EDITOR.msgs.push({ role:'user', content: instr + notaAnexo });
    edLimpaAnexo();
    ta.value = ''; ta.style.height = 'auto';
    entrevistaPasso();
    return;
  }
  if(EDITOR.fase === 'gerando'){ return; }
  if(!EDITOR.id){ return; }

  var ctxSel = '';
  if(EDITOR.selecao){
    ctxSel = 'Foque APENAS nesta parte do site: ' + EDITOR.selecao.desc
      + (EDITOR.selecao.text ? (' (que contém o texto "' + EDITOR.selecao.text + '")') : '')
      + '. Não mexa no resto. Pedido: ';
    visivel = '(sobre "' + (EDITOR.selecao.text || EDITOR.selecao.tag) + '") ' + visivel;
  }
  var conteudo = ctxSel + instr + notaAnexo;
  edAddMsg(visivel, 'user');
  edSalvar('user', conteudo);
  edLimpaAnexo();
  edLimpaSelecao();
  ta.value = ''; ta.style.height = 'auto';
  aplicarEdicao(conteudo, false);
}

/* aplica uma instrução de edição (usada no envio normal e no "Regenerar") */
async function aplicarEdicao(instr, regen){
  if(EDITOR.gerando || !EDITOR.id){ return; }
  EDITOR.ultimaInstr = instr;
  var loading = document.getElementById('ed-loading');
  var pensando = edPensando();
  EDITOR.abort = new AbortController();
  edBusy(true);
  if(loading){ loading.style.display = 'flex'; }
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
      body: JSON.stringify({ site_id: EDITOR.id, prompt: instr, provider: EDITOR.provider, access_token: session.access_token }),
      signal: EDITOR.abort.signal
    });
    var data = await res.json();
    if(data.id){
      var okMsg = regen ? 'Regenerei — dá uma olhada na prévia.' : 'Feito! Atualizei a prévia ao lado.';
      if(pensando){ pensando.innerHTML = '<span class="who">Mistto</span>' + okMsg; edTools(pensando, okMsg, true); }
      edSalvar('assistant', okMsg);
      edRefresh();
    } else {
      if(pensando){ pensando.className = 'msg err'; pensando.textContent = traduzGerar(data, res.status); }
    }
  }catch(e){
    if(edAbortado(e)){ if(pensando){ pensando.className = 'msg err'; pensando.textContent = 'Cancelado.'; } }
    else if(pensando){ pensando.className = 'msg err'; pensando.textContent = 'Erro ao aplicar a mudança. Tente de novo.'; }
  }finally{
    if(loading){ loading.style.display = 'none'; }
    edBusy(false);
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
