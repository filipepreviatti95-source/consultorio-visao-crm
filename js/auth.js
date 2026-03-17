/**
 * auth.js — Autenticação Supabase
 */

import { db, State } from './config.js';
import { iniciais } from './utils.js';

let onAppInit = null; // callback injetado pelo app.js

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

  // Verifica sessão + escuta mudanças
  checkSession();
  db.auth.onAuthStateChange((_event, session) => {
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
  document.getElementById('user-name').textContent  = nome;
  document.getElementById('user-avatar').textContent = iniciais(nome);
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  if (onAppInit) onAppInit();
}

function onLogout() {
  State.user = null;
  State.realtimeChannels.forEach(ch => db.removeChannel(ch));
  State.realtimeChannels = [];
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function traduzErroAuth(msg) {
  if (!msg) return 'Erro desconhecido';
  if (msg.includes('Invalid login')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'E-mail não confirmado. Verifique sua caixa de entrada.';
  if (msg.includes('Too many requests')) return 'Muitas tentativas. Aguarde alguns minutos.';
  return msg;
}

export function setupLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
  });
}
