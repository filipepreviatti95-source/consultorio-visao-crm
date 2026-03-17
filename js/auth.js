/**
 * auth.js — Autenticação Supabase
 */

import { db, State } from './config.js';
import { iniciais, toast } from './utils.js';
import { openModal, closeModal } from './ui.js';
import { stopDashboardPolling } from './dashboard.js';

let onAppInit = null; // callback injetado pelo app.js
let appInitialized = false; // guard: só roda uma vez

export function setOnAppInit(fn) {
  onAppInit = fn;
}

export function initAuth() {
  // Formulário de login
  const form = document.getElementById('login-form');
  const btn  = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');

    btn.querySelector('.btn-text').classList.add('hidden');
    btn.querySelector('.btn-loading').classList.remove('hidden');
    btn.disabled = true;
    errEl.classList.add('hidden');

    try {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      errEl.textContent = traduzErroAuth(err.message);
      errEl.classList.remove('hidden');
    } finally {
      btn.querySelector('.btn-text').classList.remove('hidden');
      btn.querySelector('.btn-loading').classList.add('hidden');
      btn.disabled = false;
    }
  });

  // Toggle senha
  document.querySelector('.toggle-password').addEventListener('click', function () {
    const input = document.getElementById('login-password');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Esqueci minha senha — toggle entre formulários
  initForgotPassword();

  // Verifica sessão + escuta mudanças
  checkSession();
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      // Usuário clicou no link de reset — mostrar modal de nova senha
      if (session) onLogin(session.user);
      setTimeout(() => showChangePasswordModal(), 500);
      return;
    }
    session ? onLogin(session.user) : onLogout();
  });
}

async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    onLogin(session.user);
  } else {
    showLoginScreen();
  }
}

function onLogin(user) {
  State.user = user;
  const email = user.email || '';
  const nome  = user.user_metadata?.full_name || email.split('@')[0] || 'Usuário';
  const role  = user.user_metadata?.role || 'funcionario';
  State.userRole = role;

  document.getElementById('user-name').textContent  = nome;
  document.getElementById('user-avatar').textContent = iniciais(nome);
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Atualiza label de role no sidebar
  const roleEl = document.querySelector('.user-role');
  if (roleEl) roleEl.textContent = role === 'admin' ? 'Administrador' : 'Atendimento';

  // Aplica classes de permissão no body para CSS condicional
  document.body.classList.toggle('role-admin', role === 'admin');
  document.body.classList.toggle('role-funcionario', role !== 'admin');

  // Guard: onAppInit só roda uma vez (onAuthStateChange pode disparar múltiplas vezes)
  if (onAppInit && !appInitialized) {
    appInitialized = true;
    try {
      const result = onAppInit();
      // Se retornar Promise, captura erros async
      if (result && typeof result.catch === 'function') {
        result.catch(err => console.error('[Auth] onAppInit async error:', err));
      }
    } catch (err) {
      console.error('[Auth] onAppInit sync error:', err);
    }
  }
}

function onLogout() {
  State.user = null;
  State.userRole = 'funcionario';
  appInitialized = false; // permite re-init no próximo login
  stopDashboardPolling(); // para polling interval do dashboard
  State.realtimeChannels.forEach(ch => db.removeChannel(ch));
  State.realtimeChannels = [];
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.body.classList.remove('role-admin', 'role-funcionario');
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

// ── Esqueci minha senha ──

function initForgotPassword() {
  const forgotLink   = document.getElementById('forgot-password-link');
  const backLink     = document.getElementById('back-to-login');
  const loginForm    = document.getElementById('login-form');
  const forgotForm   = document.getElementById('forgot-form');
  const forgotWrap   = document.querySelector('.login-forgot-wrap');
  const loginHeading = document.querySelector('.login-heading');
  const loginDesc    = document.querySelector('.login-desc');

  if (!forgotLink || !forgotForm) return;

  // Mostra formulário de reset
  forgotLink.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    forgotWrap.classList.add('hidden');
    forgotForm.classList.remove('hidden');
    loginHeading.textContent = 'Recuperar senha';
    loginDesc.textContent = 'Enviaremos um link para seu e-mail';
    document.getElementById('forgot-email').focus();
    // Limpa estados anteriores
    document.getElementById('forgot-error').classList.add('hidden');
    document.getElementById('forgot-success').classList.add('hidden');
  });

  // Volta pro login
  backLink.addEventListener('click', () => {
    forgotForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    forgotWrap.classList.remove('hidden');
    loginHeading.textContent = 'Bem-vindo de volta';
    loginDesc.textContent = 'Acesse o painel de gestão do consultório';
  });

  // Submit do reset
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email   = document.getElementById('forgot-email').value.trim();
    const btn     = document.getElementById('forgot-btn');
    const errEl   = document.getElementById('forgot-error');
    const succEl  = document.getElementById('forgot-success');

    if (!email) return;

    btn.querySelector('.btn-text').classList.add('hidden');
    btn.querySelector('.btn-loading').classList.remove('hidden');
    btn.disabled = true;
    errEl.classList.add('hidden');
    succEl.classList.add('hidden');

    try {
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;

      succEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:-3px;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>
        Link enviado! Verifique sua caixa de entrada.`;
      succEl.classList.remove('hidden');
      btn.querySelector('.btn-text').textContent = 'Reenviar link';
    } catch (err) {
      errEl.textContent = traduzErroReset(err.message);
      errEl.classList.remove('hidden');
    } finally {
      btn.querySelector('.btn-text').classList.remove('hidden');
      btn.querySelector('.btn-loading').classList.add('hidden');
      btn.disabled = false;
    }
  });
}

// ── Modal Trocar Senha (pós-reset) ──

function showChangePasswordModal() {
  const body = `
    <p style="color:var(--text-secondary);margin-bottom:1rem">Defina sua nova senha para continuar.</p>
    <div class="form-group">
      <label>Nova senha</label>
      <input type="password" id="mf-new-password" placeholder="Mínimo 6 caracteres" minlength="6" required />
    </div>
    <div class="form-group">
      <label>Confirmar senha</label>
      <input type="password" id="mf-confirm-password" placeholder="Repita a senha" minlength="6" required />
    </div>`;

  openModal({
    title: 'Definir Nova Senha',
    body,
    confirmText: 'Salvar Senha',
    onConfirm: async () => {
      const newPass    = document.getElementById('mf-new-password').value;
      const confirmPass = document.getElementById('mf-confirm-password').value;

      if (!newPass || newPass.length < 6) {
        toast('Senha deve ter no mínimo 6 caracteres', 'warning');
        return;
      }
      if (newPass !== confirmPass) {
        toast('As senhas não coincidem', 'warning');
        return;
      }

      try {
        const { error } = await db.auth.updateUser({ password: newPass });
        if (error) throw error;
        closeModal();
        toast('Senha alterada com sucesso!', 'success');
      } catch (err) {
        toast(`Erro ao alterar senha: ${err.message}`, 'error');
      }
    },
  });
}

function traduzErroReset(msg) {
  if (!msg) return 'Erro desconhecido';
  if (msg.includes('rate limit') || msg.includes('Too many')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (msg.includes('not found') || msg.includes('User not found')) return 'E-mail não encontrado no sistema.';
  return msg;
}

function traduzErroAuth(msg) {
  if (!msg) return 'Erro desconhecido';
  if (msg.includes('Invalid login')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'E-mail não confirmado. Verifique sua caixa de entrada.';
  if (msg.includes('Too many requests')) return 'Muitas tentativas. Aguarde alguns minutos.';
  return msg;
}

let logoutInitDone = false;

export function setupLogout() {
  if (logoutInitDone) return;
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  logoutInitDone = true;

  btn.addEventListener('click', async () => {
    await db.auth.signOut();
  });
}
