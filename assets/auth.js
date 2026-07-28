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

/* ===================== LOGIN COM BIOMETRIA (WebAuthn / passkey local) =====================
   Gate biométrico do aparelho (Touch ID / Face ID / Windows Hello) pra reentrar rápido.
   Guarda a sessão neste aparelho e só libera após a verificação biométrica. */
function _bufToB64url(buf){ var b=new Uint8Array(buf), s=''; for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function _b64urlToBuf(str){ str=String(str).replace(/-/g,'+').replace(/_/g,'/'); var pad=str.length%4; if(pad)str+='='.repeat(4-pad); var bin=atob(str), b=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i); return b.buffer; }
function _rnd(n){ var a=new Uint8Array(n); crypto.getRandomValues(a); return a; }
async function biometriaSuportada(){
  if(!window.PublicKeyCredential || !navigator.credentials) return false;
  try{ return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }catch(e){ return false; }
}
function biometriaAtiva(){ return !!localStorage.getItem('mistto-bio'); }

async function ativarBiometria(){
  if(!(await biometriaSuportada())){ ctMsg('ct-bio-msg', 'Este aparelho não tem biometria compatível.', false); return; }
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var cred = await navigator.credentials.create({ publicKey: {
      challenge: _rnd(32),
      rp: { name: 'Mistto', id: location.hostname },
      user: { id: new TextEncoder().encode(session.user.id), name: session.user.email || 'usuario', displayName: session.user.email || 'usuário' },
      pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
      authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required', residentKey:'preferred' },
      timeout: 60000, attestation: 'none'
    }});
    if(!cred){ ctMsg('ct-bio-msg', 'Não consegui ativar agora.', false); return; }
    localStorage.setItem('mistto-bio', JSON.stringify({ credId: _bufToB64url(cred.rawId), email: session.user.email, at: session.access_token, rt: session.refresh_token }));
    ctMsg('ct-bio-msg', 'Biometria ativada neste aparelho! Da próxima vez, é só o dedo/rosto.', true);
    bioBotaoConta();
  }catch(e){ ctMsg('ct-bio-msg', 'Ativação cancelada.', false); }
}
function desativarBiometria(){
  localStorage.removeItem('mistto-bio');
  ctMsg('ct-bio-msg', 'Biometria desativada neste aparelho.', true);
  bioBotaoConta();
}
async function bioBotaoConta(){
  var wrap = document.getElementById('ct-bio-wrap'); if(!wrap) return;
  var sup = await biometriaSuportada();
  if(!sup){ wrap.innerHTML = '<span style="color:var(--muted);font-size:.85rem">Este aparelho não tem biometria compatível.</span>'; return; }
  var b = document.getElementById('ct-bio-btn');
  if(b){ b.textContent = biometriaAtiva() ? 'Desativar biometria' : 'Ativar login com biometria';
    b.setAttribute('onclick', biometriaAtiva() ? 'desativarBiometria()' : 'ativarBiometria()'); }
}

async function entrarComBiometria(){
  var raw = localStorage.getItem('mistto-bio'); if(!raw){ return; }
  var info; try{ info = JSON.parse(raw); }catch(e){ return; }
  setMsg('Verificando biometria…', true);
  try{
    var assertion = await navigator.credentials.get({ publicKey: {
      challenge: _rnd(32), rpId: location.hostname,
      allowCredentials: [{ type:'public-key', id: _b64urlToBuf(info.credId) }],
      userVerification: 'required', timeout: 60000
    }});
    if(!assertion){ setMsg('Biometria não reconhecida.', false); return; }
    var { data, error } = await db.auth.setSession({ access_token: info.at, refresh_token: info.rt });
    if(error || !data || !data.session){ setMsg('Sua sessão expirou. Entre com e-mail e senha uma vez (a biometria volta a valer depois).', false); return; }
    info.at = data.session.access_token; info.rt = data.session.refresh_token;
    localStorage.setItem('mistto-bio', JSON.stringify(info));
    location.href = '/painel/';
  }catch(e){ setMsg('Não consegui entrar com biometria. Use e-mail e senha.', false); }
}

async function initLogin(){
  if(!biometriaAtiva()) return;
  if(await biometriaSuportada()){
    var b = document.getElementById('bio-btn'); if(b) b.style.display = 'flex';
  }
}

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
      if(elV){
        var quando = new Date(sub.valid_until).toLocaleDateString('pt-BR');
        var auto = sub.auto_renovar === true;
        elV.innerHTML = (auto ? '↻ Renova automático em ' : 'Vence em ') + quando
          + ' · <a href="#" onclick="assinar(\'' + sub.plano + '\');return false;" style="color:var(--golddark);font-weight:600">' + (auto ? 'Gerenciar' : 'Renovar') + '</a>';
      }
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

  // WeCoins (saldo real da carteira de fidelidade)
  PAINEL_TOKENS = { usados: usados, cota: cota };
  carregarWecoins();

  // aviso do trial só pra quem está no grátis
  var avisoTrial = document.getElementById('trial-aviso');
  if(avisoTrial && planoAtual === 'zefiro'){ avisoTrial.style.display = 'flex'; }

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
          + '<div class="demo-thumb live"><iframe loading="lazy" scrolling="no" tabindex="-1" src="/s/?id=' + s.id + '&edit=1&thumb=1"></iframe><span class="thumb-tag">Mistto</span></div>'
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

  // sites compartilhados comigo (sou colaborador, não dono)
  try{
    var { data: convites } = await db.from('site_collaborators')
      .select('site_id').or('user_id.eq.' + u.id + ',email.ilike.' + (u.email || ''));
    var ids = (convites || []).map(function(c){ return c.site_id; }).filter(Boolean);
    if(ids.length){
      var { data: comp } = await db.from('mistto_sites').select('id,nome,prompt,user_id').in('id', ids);
      comp = (comp || []).filter(function(s){ return s.user_id !== u.id; }); // tira os que já são meus
      var sbox = document.getElementById('sites-shared');
      var swrap = document.getElementById('sites-shared-box');
      if(sbox && swrap && comp.length){
        var esc2 = function(x){ return String(x||'').replace(/[<>]/g,''); };
        var bs2 = 'padding:7px 14px;font-size:.82rem';
        var hs = '<div class="gallery">';
        comp.forEach(function(s){
          hs += '<div class="demo-card">'
            + '<div class="demo-thumb live"><iframe loading="lazy" scrolling="no" tabindex="-1" src="/s/?id=' + s.id + '&edit=1&thumb=1"></iframe><span class="thumb-tag">Mistto</span></div>'
            + '<div class="info"><h3>' + (esc2(s.nome) || 'Site compartilhado') + '</h3><p>' + esc2(s.prompt || '').slice(0,70) + '</p>'
            + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'
            + '<a class="btn btn-ghost" style="' + bs2 + '" href="/s/?id=' + s.id + '" target="_blank" rel="noopener">Abrir</a>'
            + '<a class="btn btn-ghost" style="' + bs2 + '" href="/editor/?id=' + s.id + '">Editar no chat</a>'
            + '</div></div></div>';
        });
        hs += '</div>';
        sbox.innerHTML = hs;
        swrap.style.display = 'block';
      }
    }
  }catch(e){}
}

/* ---- WeCoins: carteira de fidelidade (saldo real + trocar por tokens) ---- */
var PAINEL_TOKENS = { usados: 0, cota: 500 };
var WECOINS = { saldo: 0 };
async function chamarWecoins(action, amount){
  var { data: { session } } = await db.auth.getSession();
  if(!session) return null;
  var res = await fetch(SUPABASE_URL + '/functions/v1/wecoins', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
    body: JSON.stringify({ action: action, amount: amount, access_token: session.access_token })
  });
  return await res.json().catch(function(){ return null; });
}
async function carregarWecoins(){
  var el = document.getElementById('p-wecoins');
  try{
    var d = await chamarWecoins('saldo');
    if(d && typeof d.saldo === 'number'){ WECOINS.saldo = d.saldo; if(el) el.textContent = d.saldo.toLocaleString('pt-BR'); }
  }catch(e){}
}
function wcMsg(txt, ok){
  var m = document.getElementById('p-wecoins-msg'); if(!m) return;
  m.style.color = ok ? 'var(--green)' : '#d9534f'; m.textContent = txt || '';
}
async function resgatarWecoins(){
  if(WECOINS.saldo <= 0){ wcMsg('Você ainda não tem WeCoins pra trocar.', false); return; }
  var pergunta = 'Você tem ' + WECOINS.saldo + ' WeCoins. Quantas quer trocar por tokens extras deste mês? (1 WeCoin = 1 token)';
  var resp = prompt(pergunta, String(WECOINS.saldo));
  if(resp === null) return;
  var n = Math.floor(Number(resp) || 0);
  if(n <= 0){ wcMsg('Escolha um número válido.', false); return; }
  if(n > WECOINS.saldo){ wcMsg('Você não tem WeCoins suficientes.', false); return; }
  wcMsg('Trocando…', true);
  try{
    var d = await chamarWecoins('resgatar', n);
    if(!d || d.error){ wcMsg((d && d.msg) || 'Não consegui trocar agora.', false); return; }
    WECOINS.saldo = d.saldo;
    var el = document.getElementById('p-wecoins'); if(el) el.textContent = d.saldo.toLocaleString('pt-BR');
    // atualiza a barra de tokens na hora (o resgate soma como tokens extras do mês)
    PAINEL_TOKENS.usados -= n;
    var elU = document.getElementById('p-usados'); if(elU) elU.textContent = Math.max(0, PAINEL_TOKENS.usados).toLocaleString('pt-BR');
    var bar = document.getElementById('tok-bar-fill'); if(bar) bar.style.width = Math.max(0, Math.min(100, Math.round((PAINEL_TOKENS.usados / PAINEL_TOKENS.cota) * 100))) + '%';
    wcMsg('Pronto! ' + n + ' tokens extras adicionados neste mês.', true);
  }catch(e){ wcMsg('Erro ao trocar. Tente de novo.', false); }
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
  var prov = 'cerebras';
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
    bioBotaoConta();
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
  var dp = document.getElementById('cfg-danger-pub');
  if(dp) dp.textContent = CFG.publicado ? 'Tirar do ar' : 'Publicar de novo';
}

async function initConfig(){
  var { data: { session } } = await db.auth.getSession();
  if(!session){ location.href = '/login/'; return; }
  var id = new URLSearchParams(location.search).get('id');
  if(!id){ location.href = '/painel/'; return; }
  CFG.id = id;
  try{
    var { data: site } = await db.from('mistto_sites').select('id,nome,slug,published,favicon_url,user_id').eq('id', id).maybeSingle();
    if(!site || site.user_id !== session.user.id){
      document.getElementById('cfg-load').textContent = 'Não encontrei esse site na sua conta.';
      return;
    }
    CFG.slug = site.slug; CFG.publicado = site.published !== false;
    document.getElementById('cfg-nome').value = site.nome || '';
    document.getElementById('cfg-slug').value = site.slug || '';
    cfgMostraFavicon(site.favicon_url);
    cfgPreview(); cfgStatus();
    var open = document.getElementById('cfg-open'); if(open) open.href = '/s/?id=' + id;
    var edit = document.getElementById('cfg-edit'); if(edit) edit.href = '/editor/?id=' + id;
    document.getElementById('cfg-load').style.display = 'none';
    document.getElementById('cfg').style.display = 'block';
    carregarPedidos();
    carregarColaboradores();
  }catch(e){ document.getElementById('cfg-load').textContent = 'Não consegui carregar as configurações agora.'; }
}

/* ---- Compartilhar site (colaboradores) ---- */
async function carregarColaboradores(){
  if(!CFG.id) return;
  var box = document.getElementById('cfg-colab-list'); if(!box) return;
  try{
    var { data: cols } = await db.from('site_collaborators').select('id,email,user_id').eq('site_id', CFG.id).order('created_at', { ascending:true });
    if(!cols || !cols.length){ box.innerHTML = ''; return; }
    var esc = function(x){ return String(x||'').replace(/[<>]/g,''); };
    box.innerHTML = cols.map(function(c){
      var estado = c.user_id ? 'ativo' : 'convite enviado';
      return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--line);border-radius:12px;padding:9px 13px">'
        + '<b style="font-size:.9rem">' + esc(c.email) + '</b>'
        + '<span style="font-size:.74rem;color:var(--muted)">' + estado + '</span>'
        + '<button class="btn btn-ghost danger-btn" style="margin-left:auto;padding:5px 12px;font-size:.78rem" onclick="removerColaborador(\'' + c.id + '\')">Remover</button>'
        + '</div>';
    }).join('');
  }catch(e){ box.innerHTML = ''; }
}
async function convidarColaborador(){
  if(!CFG.id) return;
  var el = document.getElementById('cfg-colab-email');
  var email = (el ? el.value : '').trim().toLowerCase();
  if(!email || email.indexOf('@') < 1){ cfgMsg('cfg-colab-msg', 'Escreva um e-mail válido.', false); return; }
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    if(email === (session.user.email || '').toLowerCase()){ cfgMsg('cfg-colab-msg', 'Esse é o seu próprio e-mail :)', false); return; }
    var { error } = await db.from('site_collaborators').insert({ site_id: CFG.id, email: email, convidado_por: session.user.id });
    if(error){
      var dup = /duplicate|unique/i.test(error.message || '');
      cfgMsg('cfg-colab-msg', dup ? 'Essa pessoa já foi convidada.' : 'Não consegui convidar agora.', false); return;
    }
    cfgMsg('cfg-colab-msg', 'Convite enviado! A pessoa acessa o site entrando na Mistto com esse e-mail.', true);
    if(el) el.value = '';
    carregarColaboradores();
  }catch(e){ cfgMsg('cfg-colab-msg', 'Erro ao convidar.', false); }
}
async function removerColaborador(idc){
  if(!idc) return;
  if(!confirm('Remover o acesso desta pessoa a este site?')) return;
  try{
    var { error } = await db.from('site_collaborators').delete().eq('id', idc);
    if(error){ cfgMsg('cfg-colab-msg', 'Não consegui remover agora.', false); return; }
    carregarColaboradores();
  }catch(e){ cfgMsg('cfg-colab-msg', 'Erro ao remover.', false); }
}

/* andamento dos pedidos de endereço (subdomínio/domínio) */
var CFG_STATUS = {
  requisitado: { txt:'Recebido', cor:'#B5860F', bg:'rgba(212,160,23,.14)' },
  analise:     { txt:'Em análise', cor:'#2b6cb0', bg:'rgba(43,108,176,.12)' },
  aprovado:    { txt:'Aprovado', cor:'#2f855a', bg:'rgba(47,133,90,.14)' },
  recusado:    { txt:'Não aprovado', cor:'#c53030', bg:'rgba(197,48,48,.12)' }
};
async function carregarPedidos(){
  if(!CFG.id) return;
  var box = document.getElementById('cfg-pedidos');
  var wrap = document.getElementById('cfg-pedidos-box');
  if(!box || !wrap) return;
  try{
    var { data: pedidos } = await db.from('domain_requests')
      .select('tipo,valor,status,created_at').eq('site_id', CFG.id).order('created_at', { ascending:false });
    if(!pedidos || !pedidos.length){ wrap.style.display = 'none'; return; }
    var esc = function(x){ return String(x||'').replace(/[<>]/g,''); };
    box.innerHTML = pedidos.map(function(p){
      var s = CFG_STATUS[p.status] || CFG_STATUS.requisitado;
      var endereco = p.tipo === 'subdominio' ? (esc(p.valor) + '.weblar.app.br') : esc(p.valor);
      var quando = p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '';
      var extra = p.status === 'aprovado'
        ? '<a href="https://' + endereco + '" target="_blank" rel="noopener" style="color:var(--golddark);font-weight:600;font-size:.82rem">abrir &rarr;</a>'
        : (p.status === 'recusado' ? '<span style="color:var(--muted);font-size:.8rem">fale com a gente</span>' : '<span style="color:var(--muted);font-size:.8rem">a gente te avisa por e-mail</span>');
      return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--line);border-radius:12px;padding:10px 14px">'
        + '<b style="font-size:.92rem">' + endereco + '</b>'
        + '<span style="font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:999px;color:' + s.cor + ';background:' + s.bg + '">' + s.txt + '</span>'
        + '<span style="color:var(--muted);font-size:.78rem">' + quando + '</span>'
        + '<span style="margin-left:auto">' + extra + '</span>'
        + '</div>';
    }).join('');
    wrap.style.display = 'block';
  }catch(e){ wrap.style.display = 'none'; }
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

/* ---- Favicon do site (aparece na aba do navegador) ---- */
function cfgMostraFavicon(url){
  var prev = document.getElementById('cfg-fav-prev');
  var rm = document.getElementById('cfg-fav-rm');
  if(url){
    if(prev){ prev.src = url; prev.style.display = ''; }
    if(rm) rm.style.display = '';
  } else {
    if(prev){ prev.src = ''; prev.style.display = 'none'; }
    if(rm) rm.style.display = 'none';
  }
}
async function salvarFavicon(ev){
  if(!CFG.id) return;
  var file = ev && ev.target && ev.target.files && ev.target.files[0];
  if(!file) return;
  if(!/^image\//.test(file.type)){ cfgMsg('cfg-fav-msg', 'Escolha uma imagem (PNG, JPG, SVG).', false); return; }
  if(file.size > 1024 * 1024){ cfgMsg('cfg-fav-msg', 'Imagem muito grande (máx 1 MB).', false); return; }
  cfgMsg('cfg-fav-msg', 'Enviando ícone…', true);
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g,'');
    var path = session.user.id + '/favicon-' + CFG.id + '-' + Date.now() + '.' + ext;
    var up = await db.storage.from('site-uploads').upload(path, file, { upsert: true, contentType: file.type });
    if(up.error){ cfgMsg('cfg-fav-msg', 'Não consegui subir a imagem (o bucket site-uploads existe?).', false); return; }
    var pub = db.storage.from('site-uploads').getPublicUrl(path);
    var url = pub && pub.data && pub.data.publicUrl;
    var { error } = await db.from('mistto_sites').update({ favicon_url: url }).eq('id', CFG.id);
    if(error){ cfgMsg('cfg-fav-msg', 'Não consegui salvar agora.', false); return; }
    cfgMostraFavicon(url);
    cfgMsg('cfg-fav-msg', 'Ícone salvo! Já aparece na aba do seu site.', true);
  }catch(e){ cfgMsg('cfg-fav-msg', 'Erro ao enviar o ícone.', false); }
}
async function removerFavicon(){
  if(!CFG.id) return;
  try{
    var { error } = await db.from('mistto_sites').update({ favicon_url: null }).eq('id', CFG.id);
    if(error){ cfgMsg('cfg-fav-msg', 'Não consegui remover agora.', false); return; }
    cfgMostraFavicon(null);
    cfgMsg('cfg-fav-msg', 'Ícone removido.', true);
  }catch(e){ cfgMsg('cfg-fav-msg', 'Erro ao remover.', false); }
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
  try{
    try{ await db.from('site_messages').delete().eq('site_id', CFG.id); }catch(e){}
    await db.from('mistto_sites').delete().eq('id', CFG.id);
    location.href = '/painel/';
  }
  catch(e){ cfgMsg('cfg-danger-msg', 'Não consegui apagar agora.', false); }
}
async function apagarHistoricoChat(){
  if(!CFG.id) return;
  if(!confirm('Apagar todo o histórico da conversa deste site? O site continua igual, só o chat é limpo.')) return;
  try{
    var { error } = await db.from('site_messages').delete().eq('site_id', CFG.id);
    if(error){ cfgMsg('cfg-danger-msg', 'Não consegui apagar a conversa agora.', false); return; }
    cfgMsg('cfg-danger-msg', 'Histórico da conversa apagado.', true);
  }catch(e){ cfgMsg('cfg-danger-msg', 'Erro ao apagar a conversa.', false); }
}
/* apaga TODOS os sites da conta (zona de perigo do /conta) */
async function apagarTodosSites(){
  try{
    var { data: { session } } = await db.auth.getSession();
    if(!session){ location.href = '/login/'; return; }
    var { count } = await db.from('mistto_sites').select('id', { count:'exact', head:true }).eq('user_id', session.user.id);
    if(!count){ ctMsg('ct-danger-msg', 'Você não tem sites pra apagar.', true); return; }
    if(!confirm('Apagar TODOS os seus ' + count + ' site(s) de vez? Essa ação não tem volta.')) return;
    if(!confirm('Tem certeza mesmo? Isso apaga tudo permanentemente.')) return;
    try{
      var { data: ids } = await db.from('mistto_sites').select('id').eq('user_id', session.user.id);
      var lista = (ids || []).map(function(r){ return r.id; });
      if(lista.length){ try{ await db.from('site_messages').delete().in('site_id', lista); }catch(e){} }
    }catch(e){}
    var { error } = await db.from('mistto_sites').delete().eq('user_id', session.user.id);
    if(error){ ctMsg('ct-danger-msg', 'Não consegui apagar agora.', false); return; }
    ctMsg('ct-danger-msg', 'Todos os seus sites foram apagados.', true);
  }catch(e){ ctMsg('ct-danger-msg', 'Erro ao apagar os sites.', false); }
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
    carregarPedidos();
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
/* Assinar: usa o link recorrente da InfinitePay (débito automático) se existir;
   senão cai no pagamento avulso (create-order). */
async function assinar(plano){
  try{
    var { data } = await db.from('plano_links').select('link').eq('plano', plano).maybeSingle();
    if(data && data.link){ location.href = data.link; return; }
  }catch(e){}
  checkout({ plano: plano });
}
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
var CRIAR = { imgs: [] };

/* sobe uma imagem pro Storage e devolve {url,name} (reutilizável) */
async function subirImagem(file, prefixo){
  var { data: { session } } = await db.auth.getSession();
  if(!session) return null;
  var ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g,'');
  var path = session.user.id + '/' + (prefixo||'img') + '-' + Date.now() + '-' + Math.floor(Math.random()*1e4) + '.' + ext;
  var up = await db.storage.from('site-uploads').upload(path, file, { upsert: true, contentType: file.type });
  if(up.error) return null;
  var pub = db.storage.from('site-uploads').getPublicUrl(path);
  return { url: pub && pub.data && pub.data.publicUrl, name: file.name };
}

function criarRenderImgs(){
  var box = document.getElementById('create-imgs-list'); if(!box) return;
  box.innerHTML = CRIAR.imgs.map(function(im, i){
    return '<div class="thumb"><img src="' + im.url + '" alt=""><span class="x" title="Remover" onclick="criarRemoveImg(' + i + ')">&times;</span></div>';
  }).join('');
}
function criarRemoveImg(i){ CRIAR.imgs.splice(i, 1); criarRenderImgs(); }

async function criarAddImgs(files){
  var drop = document.getElementById('create-drop');
  var arr = Array.prototype.slice.call(files || []).filter(function(f){ return /^image\//.test(f.type); });
  if(!arr.length) return;
  if(drop){ drop.innerHTML = '<span>Enviando…</span>'; }
  for(var k=0;k<arr.length;k++){
    if(arr[k].size > 5*1024*1024){ continue; }
    var im = await subirImagem(arr[k], 'ref');
    if(im && im.url){ CRIAR.imgs.push(im); }
  }
  if(drop){ drop.innerHTML = '<span>Arraste imagens aqui ou <b>clique pra escolher</b></span>'; }
  criarRenderImgs();
}

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
  // imagens: clicar e arrastar-e-soltar
  var drop = document.getElementById('create-drop');
  var file = document.getElementById('create-imgs');
  if(drop && file){
    drop.addEventListener('click', function(){ file.click(); });
    file.addEventListener('change', function(ev){ criarAddImgs(ev.target.files); file.value=''; });
    ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('drag'); }); });
    ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('drag'); }); });
    drop.addEventListener('drop', function(e){ if(e.dataTransfer && e.dataTransfer.files) criarAddImgs(e.dataTransfer.files); });
  }
}

/* /create COLETA tudo e leva pro chat (ou importa direto, se colou um HTML pronto) */
async function gerarSite(){
  var ta = document.getElementById('create-prompt');
  var prompt = ta ? ta.value.trim() : '';
  var startHtml = ((document.getElementById('create-html')||{}).value || '').trim();
  if(!prompt && !startHtml){ alert('Conta pra Mistto o que você quer criar (mesmo que só uma ideia), ou cole um HTML pronto em "Mais opções".'); return; }
  var nome = ((document.getElementById('create-nome')||{}).value || '').trim();
  var provider = (document.getElementById('create-provider')||{}).value || 'cerebras';
  var slug = cfgSlugLimpo((document.getElementById('create-slug')||{}).value || '');
  var st = document.getElementById('create-status');

  // começar de um HTML pronto -> usa o modo importar (recria como página editável)
  if(startHtml){
    if(st){ st.style.display='block'; st.style.color='var(--muted)'; st.textContent='Montando seu site a partir do HTML…'; }
    try{
      var { data: { session } } = await db.auth.getSession();
      if(!session){ location.href = '/login/'; return; }
      var res = await fetch(SUPABASE_URL + '/functions/v1/gerar-site', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer ' + session.access_token },
        body: JSON.stringify({ importar:true, html_importado:startHtml, nome:nome, slug:slug, provider:provider, fp: miFingerprint(), access_token: session.access_token })
      });
      var d = await res.json().catch(function(){ return {}; });
      if(!res.ok || d.error){ if(st){ st.style.color='#d9534f'; st.textContent = traduzGerar(d, res.status); } return; }
      location.href = '/editor/?id=' + d.id + '&novo=1';
    }catch(e){ if(st){ st.style.color='#d9534f'; st.textContent='Algo deu errado. Tente de novo.'; } }
    return;
  }

  // fluxo normal: monta a descrição (com as imagens) e leva pro chat
  var desc = prompt;
  if(CRIAR.imgs.length){
    desc += '\n\n(Imagens enviadas pelo dono pra usar no site, coloque-as em <img>: ' + CRIAR.imgs.map(function(i){ return i.url; }).join(' , ') + ')';
  }
  if(st){ st.style.display='block'; st.style.color='var(--muted)'; st.textContent='Abrindo o chat…'; }
  location.href = '/editor/?novo=1&nome=' + encodeURIComponent(nome) + '&desc=' + encodeURIComponent(desc) + '&prov=' + provider + (slug ? ('&slug=' + encodeURIComponent(slug)) : '');
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
var EDITOR = { id:null, slug:null, publicado:true, fase:'edicao', nome:'', provider:'cerebras', msgs:[], gerando:false, abort:null, ultimaInstr:'', anexo:null, selecao:null };

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
function edAddMsg(texto, tipo, autor){
  var box = document.getElementById('ed-msgs');
  if(!box) return null;
  var d = document.createElement('div');
  d.className = 'msg ' + (tipo || 'ai');
  if(tipo === 'ai'){
    d.innerHTML = '<span class="who">Mistto</span>' + texto;
  } else if(tipo === 'user' && autor){
    // mensagem de um COLABORADOR: mostra o nome e não deixa editar (não é sua)
    d.className = 'msg user other';
    d.innerHTML = '<span class="who">' + escapeHtml(autor) + '</span>';
    d.appendChild(document.createTextNode(texto));
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

/* salva o HTML editado direto no banco (sem IA) + guarda no histórico */
async function edSalvarHtmlDireto(html){
  if(!EDITOR.id || !html) return;
  try{
    await db.from('mistto_sites').update({ html: html }).eq('id', EDITOR.id);
    try{ await db.from('site_versions').insert({ site_id: EDITOR.id, user_id: EDITOR.meuId, html: html, resumo: 'Edição rápida na prévia', autor: EDITOR.meuNome }); }catch(e){}
    edToast('Alteração salva');
  }catch(e){ edToast('Não consegui salvar a alteração', true); }
}

/* ---- Histórico do site (ver e restaurar versões) ---- */
async function edHistorico(){
  var panel = document.getElementById('ed-hist-panel');
  var list = document.getElementById('ed-hist-list');
  if(!panel || !list || !EDITOR.id) return;
  if(panel.style.display === 'block'){ panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  list.innerHTML = '<p style="color:var(--muted);font-size:.85rem;padding:8px 2px">Carregando…</p>';
  try{
    var { data: vs } = await db.from('site_versions').select('id,resumo,autor,created_at').eq('site_id', EDITOR.id).order('created_at', { ascending:false }).limit(40);
    if(!vs || !vs.length){ list.innerHTML = '<p style="color:var(--muted);font-size:.85rem;padding:8px 2px">Ainda não há histórico. Cada mudança que você fizer aparece aqui.</p>'; return; }
    var esc = function(x){ return String(x||'').replace(/[<>]/g,''); };
    list.innerHTML = vs.map(function(v){
      var quando = v.created_at ? new Date(v.created_at).toLocaleString('pt-BR') : '';
      return '<div class="ed-hist-item"><div><b>' + (esc(v.resumo) || 'Alteração') + '</b><span>' + quando + (v.autor ? (' · ' + esc(v.autor)) : '') + '</span></div>'
        + '<button class="btn btn-ghost ed-mini" onclick="edRestaurarVersao(\'' + v.id + '\')">Restaurar</button></div>';
    }).join('');
  }catch(e){ list.innerHTML = '<p style="color:#d9534f;font-size:.85rem;padding:8px 2px">Não consegui carregar o histórico.</p>'; }
}
function edFecharHistorico(){ var p = document.getElementById('ed-hist-panel'); if(p) p.style.display = 'none'; }
async function edRestaurarVersao(id){
  if(!EDITOR.id || !id) return;
  if(!confirm('Restaurar o site pra esta versão? A versão de agora também fica salva no histórico.')) return;
  try{
    var { data: v } = await db.from('site_versions').select('html').eq('id', id).maybeSingle();
    if(!v || !v.html){ alert('Não achei essa versão.'); return; }
    await db.from('mistto_sites').update({ html: v.html }).eq('id', EDITOR.id);
    try{ await db.from('site_versions').insert({ site_id: EDITOR.id, user_id: EDITOR.meuId, html: v.html, resumo: 'Restaurado de uma versão anterior', autor: EDITOR.meuNome }); }catch(e){}
    edFecharHistorico();
    edRefresh();
    edAddMsg('Pronto! Restaurei a versão que você escolheu.', 'ai');
  }catch(e){ alert('Não consegui restaurar agora.'); }
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
    var autor = role === 'user' ? (EDITOR.meuNome || '') : null;
    await db.from('site_messages').insert({ site_id: EDITOR.id, user_id: session.user.id, role: role, content: content, autor: autor });
  }catch(e){}
}

async function initEditor(){
  var { data: { session } } = await db.auth.getSession();
  if(!session){ location.href = '/login/'; return; }
  EDITOR.meuId = session.user.id;
  EDITOR.meuNome = (session.user.user_metadata && (session.user.user_metadata.nome || session.user.user_metadata.full_name)) || (session.user.email || '').split('@')[0];
  var qs = new URLSearchParams(location.search);

  var prov = qs.get('prov');
  var sel = document.getElementById('ed-provider');
  if(sel && ['gemini','groq','cerebras','openrouter'].indexOf(prov) !== -1) sel.value = prov;
  EDITOR.provider = sel ? sel.value : (prov || 'cerebras');
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
  EDITOR.slugDesejado = qs.get('slug') || '';
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
  EDITOR.meuId = session.user.id;
  EDITOR.meuNome = (session.user.user_metadata && (session.user.user_metadata.nome || session.user.user_metadata.full_name)) || (session.user.email || '').split('@')[0];
  try{
    var { data: site } = await db.from('mistto_sites').select('id,prompt,slug,published,user_id').eq('id', id).maybeSingle();
    if(!site){ edAddMsg('Não encontrei esse site, ou você não tem acesso a ele.', 'err'); return; }
    EDITOR.ehDono = site.user_id === session.user.id;
    EDITOR.slug = site.slug;
    EDITOR.publicado = site.published !== false;
    // colaborador abrindo pela 1ª vez: carimba o user_id no convite (pra acesso futuro)
    if(!EDITOR.ehDono){
      try{ await db.from('site_collaborators').update({ user_id: session.user.id }).eq('site_id', id).is('user_id', null).ilike('email', session.user.email); }catch(e){}
    }
    var { data: msgs } = await db.from('site_messages').select('role,content,user_id,autor').eq('site_id', id).order('created_at', { ascending: true });
    if(msgs && msgs.length){
      msgs.forEach(function(m){
        if(m.role === 'user'){ edAddMsg(m.content, 'user', (m.user_id && m.user_id !== EDITOR.meuId) ? (m.autor || 'Colaborador') : null); }
        else { edAddMsg(m.content, 'ai'); }
      });
    } else {
      var saud = qs.get('novo')
        ? 'Prontinho! Montei seu site. Me diga o que quer mudar e eu ajusto na hora.'
        : 'Aqui está seu site. Me diga o que quer mudar e eu ajusto.';
      var seed = [];
      if(site.prompt){ edAddMsg(site.prompt, 'user'); seed.push({ site_id:id, user_id:session.user.id, role:'user', content:site.prompt, autor: EDITOR.meuNome }); }
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
      body: JSON.stringify({ prompt: prompt, nome: EDITOR.nome, slug: EDITOR.slugDesejado || undefined, provider:EDITOR.provider, fp: miFingerprint(), access_token:session.access_token }),
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
    if(data.resposta){
      // foi uma pergunta/conversa: Mistto respondeu sem mexer no site
      if(pensando){ pensando.innerHTML = '<span class="who">Mistto</span>' + escapeHtml(data.resposta); edTools(pensando, data.resposta, false); }
      edSalvar('assistant', data.resposta);
    } else if(data.id){
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
