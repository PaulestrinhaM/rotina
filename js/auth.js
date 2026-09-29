// ═══ LOGIN (SDD seção 3.1) ═══
// O frontend nunca guarda a senha, nunca valida a senha no cliente, e nunca
// embute um token fixo. A camada de login abre sozinha em qualquer 401
// (ver o laço em js/storage.js) e nunca fecha por conta própria.

let loginPendente = null;
let loginResolve = null;

function aguardarLogin() {
  if (!loginPendente) {
    document.getElementById('loginErro').textContent = '';
    document.getElementById('loginOverlay').classList.add('open');
    loginPendente = new Promise(resolve => { loginResolve = resolve; });
    setTimeout(() => document.getElementById('loginSenhaInput').focus(), 100);
  }
  return loginPendente;
}

async function tentarLogin() {
  const input = document.getElementById('loginSenhaInput');
  const senha = input.value;
  if (!senha) return;
  const erroEl = document.getElementById('loginErro');
  erroEl.textContent = '';

  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha }),
    });
    input.value = '';

    if (r.ok) {
      document.getElementById('loginOverlay').classList.remove('open');
      const resolve = loginResolve;
      loginPendente = null;
      loginResolve = null;
      if (resolve) resolve();
    } else if (r.status === 429) {
      erroEl.textContent = 'Muitas tentativas — espera 15 minutos.';
    } else {
      erroEl.textContent = 'Senha incorreta.';
    }
  } catch {
    input.value = '';
    erroEl.textContent = 'Falha de conexão — tenta de novo.';
  }
}

async function sair() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch {}
  location.reload();
}

function setupAuthListeners() {
  document.getElementById('loginSubmitBtn').addEventListener('click', tentarLogin);
  document.getElementById('loginSenhaInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') tentarLogin();
  });
  document.getElementById('logoutBtn').addEventListener('click', sair);
}
