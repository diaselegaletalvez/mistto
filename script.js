/* ===== Mistto — script compartilhado ===== */

/* ---- CONFIG SUPABASE (cole a anon key do projeto Weblar aqui) ---- */
const SUPABASE_URL = "https://unsvccbzrrgnvzvdwwrz.supabase.co";
const SUPABASE_ANON_KEY = ""; // <-- COLE A ANON (public) KEY AQUI pra ativar a lista de espera

/* ---- Menu mobile ---- */
function toggleNav(){
  var l = document.querySelector('.nav-links');
  if(l) l.classList.toggle('open');
}

/* ---- Chips do prompt (home) ---- */
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.chip').forEach(function(c){
    c.addEventListener('click', function(){
      var t = document.querySelector('.prompt-box textarea');
      if(!t) return;
      var map = {
        '☕ Cafeteria':'Quero um site pra minha cafeteria, com cardápio, fotos e botão de WhatsApp.',
        '💼 Portfólio':'Quero um portfólio pra mostrar meus trabalhos de design, elegante e minimalista.',
        '🏋️ Personal':'Quero um site de personal trainer, com planos, depoimentos e agendamento.'
      };
      t.value = map[c.textContent.trim()] || '';
      t.focus();
    });
  });
});

/* ---- Lista de espera ---- */
async function joinWaitlist(e){
  e.preventDefault();
  var email = document.getElementById('wl-email').value;
  var msg = document.getElementById('wl-msg');

  // Se a anon key estiver configurada, grava no Supabase
  if(SUPABASE_ANON_KEY){
    try{
      var res = await fetch(SUPABASE_URL + '/rest/v1/waitlist', {
        method:'POST',
        headers:{
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type':'application/json',
          'Prefer':'return-minimal'
        },
        body: JSON.stringify({ email: email, source: 'mistto-landing' })
      });
      if(res.ok){
        msg.style.color = 'var(--green)';
        msg.textContent = '✓ Pronto! Guardamos ' + email + ' na lista. Avisaremos você em primeira mão. 🌬️';
        document.getElementById('wl-email').value = '';
      } else {
        var t = await res.text();
        msg.style.color = '#ff8080';
        msg.textContent = (t.indexOf('duplicate')>-1) ? 'Esse e-mail já está na lista 😉' : 'Ops, tente de novo em instantes.';
      }
    }catch(err){
      msg.style.color = '#ff8080';
      msg.textContent = 'Sem conexão agora — tente novamente.';
    }
  } else {
    // Fallback visual (ainda sem backend configurado)
    msg.style.color = 'var(--green)';
    msg.textContent = '✓ Pronto! Guardamos ' + email + ' na lista. Avisaremos você em primeira mão. 🌬️';
    document.getElementById('wl-email').value = '';
  }
}
