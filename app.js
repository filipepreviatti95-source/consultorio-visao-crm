/**
 * app.js
 * Consultório Visão — CRM
 * SPA em HTML/CSS/JS puro com integração Supabase
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   1. INICIALIZAÇÃO DO SUPABASE
══════════════════════════════════════════════════════ */

// Verifica se as variáveis de configuração foram preenchidas
if (
  typeof SUPABASE_URL === 'undefined' ||
  SUPABASE_URL === 'SUBSTITUIR_PELA_URL' ||
  typeof SUPABASE_ANON_KEY === 'undefined' ||
  SUPABASE_ANON_KEY === 'SUBSTITUIR_PELA_ANON_KEY'
) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                  background:#0F2847;font-family:system-ui;padding:2rem;text-align:center;">
        <div style="background:#fff;border-radius:16px;padding:2.5rem 2rem;max-width:480px;width:100%;
                    box-shadow:0 20px 50px rgba(0,0,0,.3);">
          <svg viewBox="0 0 64 40" width="56" style="margin-bottom:1rem">
            <path d="M32 4C16 4 4 20 4 20s12 16 28 16 28-16 28-16S48 4 32 4z"
                  fill="none" stroke="#0066CC" stroke-width="3.5" stroke-linejoin="round"/>
            <circle cx="32" cy="20" r="8" fill="#0066CC"/>
            <circle cx="32" cy="20" r="4" fill="#ffffff"/>
          </svg>
          <h2 style="color:#1A2B3C;margin-bottom:.5rem">Configuração necessária</h2>
          <p style="color:#5A6A7A;font-size:.9rem;margin-bottom:1.25rem">
            Abra o arquivo <strong>supabase-config.js</strong> e substitua as variáveis
            <code style="background:#F0F4F8;padding:2px 6px;border-radius:4px">SUPABASE_URL</code> e
            <code style="background:#F0F4F8;padding:2px 6px;border-radius:4px">SUPABASE_ANON_KEY</code>
            pelas suas credenciais do projeto Supabase.
          </p>
          <a href="https://app.supabase.com" target="_blank"
             style="display:inline-block;background:#0066CC;color:#fff;padding:.65rem 1.5rem;
                    border-radius:8px;font-weight:600;font-size:.9rem;text-decoration:none">
            Acessar Supabase
          </a>
        </div>
      </div>`;
  });
  throw new Error('Supabase não configurado. Edite supabase-config.js.');
}

// Cria o cliente Supabase
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

/* ═══════════════════════════════════════════════════════
   2. ESTADO GLOBAL
══════════════════════════════════════════════════════ */
const State = {
  user: null,
  currentPage: 'dashboard',
  pacientes: [],
  agendamentos: [],
  conversas: [],
  currentChatPaciente: null,
  darkMode: localStorage.getItem('darkMode') === 'true',
  semanaOffset: 0, // para navegação de semanas em agendamentos
  realtimeChannels: [],
};

/* ═══════════════════════════════════════════════════════
   3. UTILIDADES
══════════════════════════════════════════════════════ */

/**
 * Formata data/hora em pt-BR
 */
function fmt(date, opts = {}) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d)) return '—';
  const defaults = { timeZone: 'America/Sao_Paulo' };
  return d.toLocaleString('pt-BR', { ...defaults, ...opts });
}

function fmtData(date) { return fmt(date, { day:'2-digit', month:'2-digit', year:'numeric' }); }
function fmtHora(date) { return fmt(date, { hour:'2-digit', minute:'2-digit' }); }
function fmtDataHora(date) { return fmt(date, { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); }

/**
 * Diferença de tempo desde uma data (ex: "há 3 horas")
 */
function tempoDesde(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)    return `há ${d}d`;
  return fmtData(date);
}

/**
 * Retorna iniciais de um nome
 */
function iniciais(nome) {
  if (!nome) return '?';
  return nome.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * Formata telefone para link WhatsApp
 */
function waLink(telefone) {
  if (!telefone) return '#';
  const nums = telefone.replace(/\D/g, '');
  const num = nums.startsWith('55') ? nums : `55${nums}`;
  return `https://wa.me/${num}`;
}

/**
 * Escapa HTML para evitar XSS
 */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Label de status
 */
const STATUS_LABEL = {
  novo_contato: 'Novo Contato',
  agendado:     'Agendado',
  confirmado:   'Confirmado',
  concluido:    'Concluído',
  cancelado:    'Cancelado',
};

/**
 * Cor da barra de status para agendamentos
 */
const STATUS_COLOR = {
  agendado:   '#0066CC',
  confirmado: '#00A86B',
  concluido:  '#6B7280',
  cancelado:  '#EF4444',
};

/* ═══════════════════════════════════════════════════════
   4. TOAST (notificações)
══════════════════════════════════════════════════════ */

const TOAST_ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

function toast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `
    <div class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</div>
    <span class="toast-msg">${esc(msg)}</span>
    <button class="toast-close" aria-label="Fechar">&times;</button>`;

  t.querySelector('.toast-close').addEventListener('click', () => removeToast(t));
  container.appendChild(t);

  setTimeout(() => removeToast(t), duration);
  return t;
}

function removeToast(el) {
  el.classList.add('removing');
  setTimeout(() => el.remove(), 300);
}

/* ═══════════════════════════════════════════════════════
   5. AUTENTICAÇÃO
══════════════════════════════════════════════════════ */

async function initAuth() {
  // Verifica sessão atual
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    onLogin(session.user);
  } else {
    showLoginScreen();
  }

  // Escuta mudanças de autenticação
  db.auth.onAuthStateChange((_event, session) => {
    if (session) {
      onLogin(session.user);
    } else {
      onLogout();
    }
  });
}

function onLogin(user) {
  State.user = user;
  // Atualiza UI com dados do usuário
  const email = user.email || '';
  const nome  = user.user_metadata?.full_name || email.split('@')[0] || 'Usuário';
  document.getElementById('user-name').textContent   = nome;
  document.getElementById('user-avatar').textContent = iniciais(nome);
  // Mostra app, esconde login
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  // Inicializa o app
  initApp();
}

function onLogout() {
  State.user = null;
  // Cancela subscriptions realtime
  State.realtimeChannels.forEach(ch => db.removeChannel(ch));
  State.realtimeChannels = [];
  // Volta para login
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

// ── Formulário de login
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const btn  = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');

    // Loading state
    btn.querySelector('.btn-text').classList.add('hidden');
    btn.querySelector('.btn-loading').classList.remove('hidden');
    btn.disabled = true;
    errEl.classList.add('hidden');

    try {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onLogin é chamado via onAuthStateChange
    } catch (err) {
      errEl.textContent = traduzErroAuth(err.message);
      errEl.classList.remove('hidden');
    } finally {
      btn.querySelector('.btn-text').classList.remove('hidden');
      btn.querySelector('.btn-loading').classList.add('hidden');
      btn.disabled = false;
    }
  });

  // Toggle mostrar/ocultar senha
  document.querySelector('.toggle-password').addEventListener('click', function() {
    const input = document.getElementById('login-password');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

function traduzErroAuth(msg) {
  if (!msg) return 'Erro desconhecido';
  if (msg.includes('Invalid login')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'E-mail não confirmado. Verifique sua caixa de entrada.';
  if (msg.includes('Too many requests')) return 'Muitas tentativas. Aguarde alguns minutos.';
  return msg;
}

/* ═══════════════════════════════════════════════════════
   6. INICIALIZAÇÃO DO APP
══════════════════════════════════════════════════════ */

function initApp() {
  // Aplica tema salvo
  applyTheme(State.darkMode);
  // Configura navegação
  initNavigation();
  // Configura sidebar mobile
  initSidebar();
  // Configura dark mode
  initDarkMode();
  // Configura busca global
  initGlobalSearch();
  // Configura logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
  });
  // Configura chat panel
  initChatPanel();
  // Configura modal
  initModal();
  // Inicializa realtime
  initRealtime();
  // Carrega página inicial baseada em hash
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);
}

/* ═══════════════════════════════════════════════════════
   7. NAVEGAÇÃO SPA
══════════════════════════════════════════════════════ */

const PAGE_TITLES = {
  dashboard:    'Dashboard',
  kanban:       'Kanban',
  pacientes:    'Pacientes',
  agendamentos: 'Agendamentos',
};

function initNavigation() {
  // Cliques nos links do menu
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateTo(page);
      // Fecha sidebar no mobile
      closeSidebarMobile();
    });
  });

  // Link "Ver todos" do dashboard
  document.querySelectorAll('[href^="#"]').forEach(a => {
    if (!a.closest('.sidebar-nav')) {
      a.addEventListener('click', (e) => {
        const page = a.getAttribute('href').replace('#', '');
        if (PAGE_TITLES[page]) {
          e.preventDefault();
          navigateTo(page);
        }
      });
    }
  });

  // Hash change (botão voltar/avançar)
  window.addEventListener('hashchange', () => {
    const page = window.location.hash.replace('#', '') || 'dashboard';
    if (PAGE_TITLES[page]) navigateTo(page, false);
  });
}

function navigateTo(page, updateHash = true) {
  if (!PAGE_TITLES[page]) page = 'dashboard';
  State.currentPage = page;

  // Atualiza hash
  if (updateHash) history.pushState(null, '', `#${page}`);

  // Atualiza menu
  document.querySelectorAll('.nav-item').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Atualiza título
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page];

  // Mostra a página
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  // Carrega dados da página
  loadPage(page);
}

async function loadPage(page) {
  switch (page) {
    case 'dashboard':    await loadDashboard(); break;
    case 'kanban':       await loadKanban(); break;
    case 'pacientes':    await loadPacientes(); break;
    case 'agendamentos': await loadAgendamentos(); break;
  }
}

/* ═══════════════════════════════════════════════════════
   8. SIDEBAR MOBILE
══════════════════════════════════════════════════════ */

function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  const closeBtn  = document.getElementById('sidebar-close');

  hamburger.addEventListener('click', openSidebarMobile);
  closeBtn.addEventListener('click', closeSidebarMobile);
  overlay.addEventListener('click', closeSidebarMobile);
}

function openSidebarMobile() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════
   9. DARK MODE
══════════════════════════════════════════════════════ */

function initDarkMode() {
  document.getElementById('dark-toggle').addEventListener('click', () => {
    State.darkMode = !State.darkMode;
    localStorage.setItem('darkMode', State.darkMode);
    applyTheme(State.darkMode);
  });
}

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('icon-sun').style.display  = dark ? 'none'  : '';
  document.getElementById('icon-moon').style.display = dark ? ''      : 'none';
}

/* ═══════════════════════════════════════════════════════
   10. BUSCA GLOBAL (Ctrl+K)
══════════════════════════════════════════════════════ */

function initGlobalSearch() {
  const toggle    = document.getElementById('search-toggle');
  const box       = document.getElementById('global-search-box');
  const input     = document.getElementById('global-search-input');
  const results   = document.getElementById('global-search-results');

  toggle.addEventListener('click', () => {
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) input.focus();
  });

  // Ctrl+K / Cmd+K
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      box.classList.remove('hidden');
      input.focus();
    }
    if (e.key === 'Escape') box.classList.add('hidden');
  });

  // Fechar ao clicar fora
  document.addEventListener('click', (e) => {
    if (!document.getElementById('global-search-wrap').contains(e.target)) {
      box.classList.add('hidden');
    }
  });

  // Busca em tempo real
  let searchTimeout;
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => renderSearchResults(input.value.trim(), results), 200);
  });
}

function renderSearchResults(q, container) {
  if (!q) { container.innerHTML = ''; return; }
  const lower = q.toLowerCase();
  const matches = State.pacientes.filter(p =>
    p.nome.toLowerCase().includes(lower) ||
    (p.telefone && p.telefone.includes(q)) ||
    (p.email && p.email.toLowerCase().includes(lower))
  ).slice(0, 8);

  if (matches.length === 0) {
    container.innerHTML = `<div class="search-empty">Nenhum resultado para "${esc(q)}"</div>`;
    return;
  }

  container.innerHTML = matches.map(p => `
    <div class="search-result-item" data-id="${p.id}">
      <div class="sr-avatar">${iniciais(p.nome)}</div>
      <div class="sr-info">
        <span class="sr-name">${esc(p.nome)}</span>
        <span class="sr-phone">${esc(p.telefone)}</span>
      </div>
      <span class="status-pill status-${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
    </div>`).join('');

  container.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const paciente = State.pacientes.find(p => p.id === item.dataset.id);
      if (paciente) openChatPanel(paciente);
      document.getElementById('global-search-box').classList.add('hidden');
      document.getElementById('global-search-input').value = '';
      container.innerHTML = '';
    });
  });
}

/* ═══════════════════════════════════════════════════════
   11. MODAL GENÉRICO
══════════════════════════════════════════════════════ */

let modalResolve = null;

function initModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function openModal({ title, body, confirmText = 'Salvar', cancelText = 'Cancelar', onConfirm, hideFooter = false }) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = body;
  document.getElementById('modal-confirm').textContent = confirmText;
  document.getElementById('modal-cancel').textContent  = cancelText;
  document.getElementById('modal-footer').style.display = hideFooter ? 'none' : '';

  const confirmBtn = document.getElementById('modal-confirm');
  // Remove listeners anteriores clonando
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
  if (onConfirm) newConfirm.addEventListener('click', onConfirm);

  document.getElementById('modal-overlay').classList.remove('hidden');
  // Foca no primeiro input do modal
  setTimeout(() => {
    const firstInput = document.querySelector('#modal-body input, #modal-body select, #modal-body textarea');
    if (firstInput) firstInput.focus();
  }, 50);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  if (modalResolve) { modalResolve(null); modalResolve = null; }
}

/* ═══════════════════════════════════════════════════════
   12. CHAT PANEL
══════════════════════════════════════════════════════ */

function initChatPanel() {
  document.getElementById('chat-close').addEventListener('click', closeChatPanel);
  document.getElementById('chat-overlay').addEventListener('click', closeChatPanel);

  // Envio de mensagem
  const sendBtn = document.getElementById('chat-send');
  const input   = document.getElementById('chat-input');

  sendBtn.addEventListener('click', sendChatMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
}

async function openChatPanel(paciente) {
  State.currentChatPaciente = paciente;

  // Atualiza cabeçalho
  document.getElementById('chat-avatar').textContent        = iniciais(paciente.nome);
  document.getElementById('chat-patient-name').textContent  = paciente.nome;
  document.getElementById('chat-patient-phone').textContent = paciente.telefone;
  document.getElementById('chat-wa-link').href              = waLink(paciente.telefone);

  // Status bar
  document.getElementById('chat-status-bar').innerHTML = `
    <span>Status:</span>
    <span class="status-pill status-${paciente.status}">${STATUS_LABEL[paciente.status] || paciente.status}</span>
    <span style="flex:1"></span>
    <span style="font-size:.75rem;color:var(--text-muted)">Paciente desde ${fmtData(paciente.created_at)}</span>`;

  // Limpa mensagens
  const msgContainer = document.getElementById('chat-messages');
  msgContainer.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:.8rem">Carregando…</div>';

  // Abre painel
  document.getElementById('chat-panel').classList.add('open');
  document.getElementById('chat-overlay').style.display = 'block';

  // Carrega conversas
  await loadConversas(paciente.id);
}

function closeChatPanel() {
  document.getElementById('chat-panel').classList.remove('open');
  document.getElementById('chat-overlay').style.display = '';
  State.currentChatPaciente = null;
}

async function loadConversas(pacienteId) {
  // Busca o paciente para obter o telefone (para fallback)
  const paciente = State.currentChatPaciente;
  const telefone = paciente?.telefone || '';

  // Busca por paciente_id
  const { data: byId, error: errById } = await db
    .from('conversas')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: true });

  // Busca por telefone (para conversas sem paciente_id, ex: vindas do n8n)
  // Normaliza: remove o DDI 55 se o telefone tiver 13 dígitos (ex: 554899249063 → 4899249063)
  const nums = telefone.replace(/\D/g, '');
  const telefoneSemDDI = nums.startsWith('55') && nums.length >= 12 ? nums.slice(2) : nums;
  const telefoneComDDI = nums.startsWith('55') ? nums : '55' + nums;

  const { data: byTelefone, error: errByTel } = await db
    .from('conversas')
    .select('*')
    .or(`telefone.eq.${nums},telefone.eq.${telefoneSemDDI},telefone.eq.${telefoneComDDI}`)
    .is('paciente_id', null)
    .order('created_at', { ascending: true });

  if (errById && errByTel) {
    toast('Erro ao carregar conversas', 'error');
    return;
  }

  // Mescla e deduplica por id
  const todas = [...(byId || []), ...(byTelefone || [])];
  const vistas = new Set();
  const unicas = todas.filter(c => {
    if (vistas.has(c.id)) return false;
    vistas.add(c.id);
    return true;
  });
  unicas.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  State.conversas = unicas;
  renderChatMessages(State.conversas);
}

function renderChatMessages(msgs) {
  const container = document.getElementById('chat-messages');

  if (!msgs || msgs.length === 0) {
    container.innerHTML = `
      <div class="chat-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>Nenhuma conversa ainda</p>
      </div>`;
    return;
  }

  container.innerHTML = msgs.map(msg => {
    const fromMe    = msg.remetente !== 'paciente';
    const wrapClass = fromMe ? 'from-me' + (msg.remetente === 'humano' ? ' from-humano' : '') : 'from-other';
    const label     = msg.remetente === 'assistente' ? 'Assistente' : msg.remetente === 'humano' ? 'Equipe' : 'Paciente';

    return `
      <div class="msg-bubble-wrap ${wrapClass}">
        <div class="msg-sender-label">${fromMe ? label : 'Paciente'}</div>
        <div class="msg-bubble">${esc(msg.mensagem)}</div>
        <div class="msg-time">${tempoDesde(msg.created_at)}</div>
      </div>`;
  }).join('');

  // Scroll para o final
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input   = document.getElementById('chat-input');
  const msg     = input.value.trim();
  const paciente = State.currentChatPaciente;

  if (!msg || !paciente) return;

  input.value = '';
  input.style.height = 'auto';

  try {
    const { error } = await db.from('conversas').insert({
      paciente_id: paciente.id,
      telefone:    paciente.telefone,
      origem:      'crm',
      mensagem:    msg,
      remetente:   'humano',
      tipo_midia:  'texto',
    });
    if (error) throw error;
    // Recarrega conversas (o realtime também vai atualizar, mas forçamos para feedback imediato)
    await loadConversas(paciente.id);
    toast('Mensagem registrada', 'success', 2000);
  } catch (err) {
    toast(`Erro ao enviar: ${err.message}`, 'error');
    input.value = msg; // restaura
  }
}

/* ═══════════════════════════════════════════════════════
   13. REALTIME (Supabase Subscriptions)
══════════════════════════════════════════════════════ */

function initRealtime() {
  // Canal de pacientes
  const pacientesChannel = db
    .channel('pacientes-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pacientes' }, (payload) => {
      handlePacienteChange(payload);
    })
    .subscribe();

  // Canal de agendamentos
  const agendamentosChannel = db
    .channel('agendamentos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, (payload) => {
      handleAgendamentoChange(payload);
    })
    .subscribe();

  // Canal de conversas
  const conversasChannel = db
    .channel('conversas-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversas' }, (payload) => {
      handleConversaInsert(payload);
    })
    .subscribe();

  State.realtimeChannels = [pacientesChannel, agendamentosChannel, conversasChannel];
}

function handlePacienteChange(payload) {
  const { eventType, new: novo, old } = payload;

  if (eventType === 'INSERT') {
    State.pacientes.unshift(novo);
    toast(`Novo paciente: ${novo.nome}`, 'info');
  } else if (eventType === 'UPDATE') {
    const idx = State.pacientes.findIndex(p => p.id === novo.id);
    if (idx >= 0) State.pacientes[idx] = novo;
  } else if (eventType === 'DELETE') {
    State.pacientes = State.pacientes.filter(p => p.id !== old.id);
  }

  // Atualiza a view atual se necessário
  if (State.currentPage === 'dashboard') loadDashboard();
  if (State.currentPage === 'kanban')    renderKanban(State.pacientes);
  if (State.currentPage === 'pacientes') renderPacientesTable(State.pacientes);
}

function handleAgendamentoChange(payload) {
  const { eventType, new: novo, old } = payload;

  if (eventType === 'INSERT') {
    State.agendamentos.unshift(novo);
  } else if (eventType === 'UPDATE') {
    const idx = State.agendamentos.findIndex(a => a.id === novo.id);
    if (idx >= 0) State.agendamentos[idx] = novo;
  } else if (eventType === 'DELETE') {
    State.agendamentos = State.agendamentos.filter(a => a.id !== old.id);
  }

  if (State.currentPage === 'dashboard')    renderDashboardAgendamentos();
  if (State.currentPage === 'agendamentos') renderAgendamentos();
}

function handleConversaInsert(payload) {
  const nova = payload.new;
  State.conversas.push(nova);

  // Notificação sonora para novas mensagens de pacientes
  if (nova.remetente === 'paciente') {
    playNotificationSound();
    const nomePaciente = State.pacientes.find(p => p.id === nova.paciente_id)?.nome || nova.telefone || 'Paciente';
    toast(`Nova mensagem de ${nomePaciente}`, 'info');
  }

  // Se o chat aberto é do mesmo paciente, atualiza
  // Verifica por paciente_id OU por telefone (para conversas do n8n sem paciente_id)
  if (State.currentChatPaciente) {
    const p = State.currentChatPaciente;
    const nums = (p.telefone || '').replace(/\D/g, '');
    const novaNums = (nova.telefone || '').replace(/\D/g, '');
    const mesmoId = nova.paciente_id === p.id;
    const mesmoTel = novaNums && nums && (novaNums.endsWith(nums) || nums.endsWith(novaNums));
    if (mesmoId || mesmoTel) {
      renderChatMessages(State.conversas);
    }
  }

  // Atualiza feed no dashboard
  if (State.currentPage === 'dashboard') renderDashboardFeed();

  // Badge de nova mensagem no kanban — por paciente_id ou por telefone
  let cardEl = nova.paciente_id
    ? document.querySelector(`.kanban-card[data-id="${nova.paciente_id}"]`)
    : null;

  if (!cardEl && nova.telefone) {
    const novaNums = nova.telefone.replace(/\D/g, '');
    State.pacientes.forEach(p => {
      if (!cardEl) {
        const pNums = (p.telefone || '').replace(/\D/g, '');
        if (novaNums.endsWith(pNums) || pNums.endsWith(novaNums)) {
          cardEl = document.querySelector(`.kanban-card[data-id="${p.id}"]`);
        }
      }
    });
  }

  if (cardEl) {
    let badge = cardEl.querySelector('.card-new-msg-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'card-new-msg-badge';
      cardEl.querySelector('.card-meta')?.appendChild(badge);
    }
    badge.textContent = '● Nova msg';
  }
}

/* ═══════════════════════════════════════════════════════
   14. DASHBOARD
══════════════════════════════════════════════════════ */

async function loadDashboard() {
  await Promise.all([
    fetchPacientes(),
    fetchAgendamentos(),
    fetchConversasRecentes(),
  ]);
  renderDashboardMetrics();
  renderDashboardBarChart();
  renderAtenderHoje();
  renderDashboardAgendamentos();
  renderDashboardFeed();
}

async function fetchPacientes() {
  const { data, error } = await db
    .from('pacientes')
    .select('*')
    .order('created_at', { ascending: false });
  if (!error) State.pacientes = data || [];
}

async function fetchAgendamentos() {
  const { data, error } = await db
    .from('agendamentos')
    .select('*')
    .order('data_hora', { ascending: true });
  if (!error) State.agendamentos = data || [];
}

async function fetchConversasRecentes() {
  // Busca mais registros para garantir que após agrupamento tenhamos 12 conversas distintas
  const { data, error } = await db
    .from('conversas')
    .select('*, pacientes(nome, telefone)')
    .eq('remetente', 'paciente')           // só mensagens DO paciente (não da IA)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) return;

  // Agrupa por paciente: mantém só a mensagem mais recente de cada telefone/paciente_id
  const vistas = new Set();
  const unicas = [];
  for (const conv of (data || [])) {
    const chave = conv.paciente_id || conv.telefone || conv.id;
    if (!vistas.has(chave)) {
      vistas.add(chave);
      unicas.push(conv);
    }
    if (unicas.length >= 12) break;
  }
  State.conversasRecentes = unicas;
}

function renderDashboardMetrics() {
  const hoje     = new Date();
  const hojeStr  = hoje.toISOString().slice(0, 10);

  // ── Total pacientes
  setMetric('metric-total', State.pacientes.length);

  // ── Consultas hoje (todos menos cancelado)
  const agHoje = State.agendamentos.filter(a =>
    a.data_hora && a.data_hora.slice(0, 10) === hojeStr && a.status !== 'cancelado'
  );
  setMetric('metric-hoje', agHoje.length);
  // Destaque visual se tiver consultas hoje
  const cardHoje = document.getElementById('metric-card-hoje');
  if (cardHoje) cardHoje.classList.toggle('metric-card-highlight', agHoje.length > 0);

  // ── Não atendidos hoje: agendado ou confirmado e horário já passou
  const naoAtendidos = agHoje.filter(a => {
    const d = new Date(a.data_hora);
    return d < hoje && (a.status === 'agendado' || a.status === 'confirmado');
  }).length;
  setMetric('metric-nao-atendidos', naoAtendidos);

  // ── Novos contatos nos últimos 7 dias
  const seteDiasAtras = new Date(hoje);
  seteDiasAtras.setDate(hoje.getDate() - 7);
  const novos7d = State.pacientes.filter(p => {
    return p.status === 'novo_contato' && new Date(p.created_at) >= seteDiasAtras;
  }).length;
  setMetric('metric-novos', novos7d);

  // ── Semana atual
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay());
  inicioSemana.setHours(0, 0, 0, 0);
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 6);
  fimSemana.setHours(23, 59, 59, 999);

  const confirmados = State.agendamentos.filter(a => {
    const d = new Date(a.data_hora);
    return a.status === 'confirmado' && d >= inicioSemana && d <= fimSemana;
  }).length;
  setMetric('metric-confirmados', confirmados);

  // ── Concluídos no mês
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const concluidos = State.agendamentos.filter(a => {
    const d = new Date(a.data_hora);
    return a.status === 'concluido' && d >= inicioMes;
  }).length;
  setMetric('metric-concluidos', concluidos);

  // ── Cancelados na semana
  const cancelados = State.agendamentos.filter(a => {
    const d = new Date(a.data_hora);
    return a.status === 'cancelado' && d >= inicioSemana && d <= fimSemana;
  }).length;
  setMetric('metric-cancelados', cancelados);

  // ── Badge menu
  const novosCount = State.pacientes.filter(p => p.status === 'novo_contato').length;
  const badgeEl    = document.getElementById('badge-novos');
  if (badgeEl) {
    badgeEl.textContent = novosCount;
    badgeEl.style.display = novosCount > 0 ? '' : 'none';
  }
}

function setMetric(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.classList.remove('skeleton');
}

function renderDashboardBarChart() {
  const chart = document.getElementById('bar-chart');

  // Últimos 7 dias
  const dias = [];
  const hoje = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    dias.push(d);
  }

  // Conta agendamentos por dia
  const counts = dias.map(dia => {
    const str = dia.toISOString().slice(0, 10);
    return State.agendamentos.filter(a =>
      a.data_hora && a.data_hora.slice(0, 10) === str && a.status !== 'cancelado'
    ).length;
  });

  const max = Math.max(...counts, 1);

  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  chart.innerHTML = dias.map((dia, i) => {
    const pct     = Math.round((counts[i] / max) * 100);
    const isHoje  = dia.toDateString() === hoje.toDateString();
    const label   = isHoje ? 'Hoje' : diasSemana[dia.getDay()];
    return `
      <div class="bar-group">
        <div class="bar-fill-wrap">
          <div class="bar-fill"
               data-value="${counts[i]}"
               style="height:${pct}%;background:${isHoje ? '#00A86B' : 'var(--color-primary)'}">
          </div>
        </div>
        <div class="bar-label">${label}</div>
      </div>`;
  }).join('');
}

function renderAtenderHoje() {
  const container = document.getElementById('atender-hoje-list');
  if (!container) return;
  const hoje    = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);

  const lista = State.agendamentos
    .filter(a => a.data_hora && a.data_hora.slice(0, 10) === hojeStr && a.status !== 'cancelado')
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>Nenhuma consulta para hoje 🎉</p></div>`;
    return;
  }

  container.innerHTML = lista.map(ag => {
    const passou = new Date(ag.data_hora) < hoje;
    const statusIcon = ag.status === 'concluido'
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="#00A86B" stroke-width="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>`
      : ag.status === 'cancelado'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
        : passou
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="#0066CC" stroke-width="2.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

    return `
      <div class="upcoming-item ${passou && ag.status === 'agendado' ? 'upcoming-atrasado' : ''}"
           data-paciente-id="${ag.paciente_id || ''}">
        <span class="upcoming-time">${fmtHora(ag.data_hora)}</span>
        <div class="upcoming-info">
          <div class="upcoming-name">${esc(ag.nome_paciente)}</div>
          <div class="upcoming-phone">${esc(ag.telefone)}</div>
        </div>
        <span class="upcoming-status-icon">${statusIcon}</span>
        <span class="status-pill status-${ag.status}">${STATUS_LABEL[ag.status] || ag.status}</span>
      </div>`;
  }).join('');

  container.querySelectorAll('.upcoming-item').forEach(item => {
    item.addEventListener('click', () => {
      const paciente = State.pacientes.find(p => p.id === item.dataset.pacienteId);
      if (paciente) openChatPanel(paciente);
    });
  });
}

function renderDashboardAgendamentos() {
  const container = document.getElementById('upcoming-list');
  const hoje      = new Date();
  const amanha    = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  const limit = amanha;
  limit.setHours(23, 59, 59, 999);

  const proximos = State.agendamentos
    .filter(a => {
      const d = new Date(a.data_hora);
      return d >= hoje && d <= limit && a.status !== 'cancelado';
    })
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
    .slice(0, 8);

  if (proximos.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>Nenhum agendamento para hoje ou amanhã</p></div>`;
    return;
  }

  container.innerHTML = proximos.map(ag => `
    <div class="upcoming-item" data-paciente-id="${ag.paciente_id || ''}">
      <span class="upcoming-time">${fmtHora(ag.data_hora)}</span>
      <div class="upcoming-info">
        <div class="upcoming-name">${esc(ag.nome_paciente)}</div>
        <div class="upcoming-phone">${esc(ag.telefone)}</div>
      </div>
      <span class="status-pill status-${ag.status}">${STATUS_LABEL[ag.status] || ag.status}</span>
    </div>`).join('');

  container.querySelectorAll('.upcoming-item').forEach(item => {
    item.addEventListener('click', () => {
      const paciente = State.pacientes.find(p => p.id === item.dataset.pacienteId);
      if (paciente) openChatPanel(paciente);
    });
  });
}

function renderDashboardFeed() {
  const container = document.getElementById('feed-list');
  const feed      = (State.conversasRecentes || []).slice(0, 12);

  if (feed.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>Nenhuma conversa recente</p></div>`;
    return;
  }

  container.innerHTML = feed.map(conv => {
    const nome = conv.pacientes?.nome || conv.telefone || '—';
    return `
      <div class="feed-item" data-paciente-id="${conv.paciente_id || ''}">
        <div class="feed-avatar">${iniciais(nome)}</div>
        <div class="feed-info">
          <div class="feed-header">
            <span class="feed-name">${esc(nome)}</span>
            <span class="feed-time">${tempoDesde(conv.created_at)}</span>
          </div>
          <div class="feed-msg">${esc(conv.mensagem)}</div>
        </div>
        <span class="feed-origem">${conv.origem || 'whatsapp'}</span>
      </div>`;
  }).join('');

  container.querySelectorAll('.feed-item').forEach(item => {
    item.addEventListener('click', () => {
      const paciente = State.pacientes.find(p => p.id === item.dataset.pacienteId);
      if (paciente) openChatPanel(paciente);
    });
  });
}

/* ═══════════════════════════════════════════════════════
   15. KANBAN
══════════════════════════════════════════════════════ */

async function loadKanban() {
  if (State.pacientes.length === 0) await fetchPacientes();
  if (State.agendamentos.length === 0) await fetchAgendamentos();
  renderKanban(State.pacientes);
  setupKanbanDragDrop();
  setupKanbanCollapseCancel();
}

function renderKanban(pacientes) {
  const colunas = ['novo_contato', 'agendado', 'confirmado', 'concluido', 'cancelado'];

  colunas.forEach(status => {
    const colEl     = document.getElementById(`col-${status}`);
    const countEl   = document.getElementById(`count-${status}`);
    const filtrados = pacientes.filter(p => p.status === status);

    countEl.textContent = filtrados.length;

    if (filtrados.length === 0) {
      colEl.innerHTML = `<div style="padding:.75rem;text-align:center;color:var(--text-muted);font-size:.8rem">Nenhum paciente</div>`;
      return;
    }

    colEl.innerHTML = filtrados.map(p => buildKanbanCard(p)).join('');

    // Eventos nos botões dos cards
    colEl.querySelectorAll('.kanban-card').forEach(card => {
      const id = card.dataset.id;
      const paciente = pacientes.find(px => px.id === id);
      if (!paciente) return;

      card.querySelector('.btn-card-chat')?.addEventListener('click', () => openChatPanel(paciente));
      card.querySelector('.btn-card-edit')?.addEventListener('click', () => openModalPaciente(paciente));
      card.querySelector('.btn-card-avancar')?.addEventListener('click', () => avancarStatus(paciente));
    });
  });
}

function buildKanbanCard(p) {
  // Busca último agendamento
  const agendamento = State.agendamentos
    .filter(a => a.paciente_id === p.id && a.status !== 'cancelado')
    .sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))[0];

  const tempoStatus = tempoDesde(p.updated_at || p.created_at);

  const proximoStatus = getProximoStatus(p.status);

  return `
    <div class="kanban-card" draggable="true" data-id="${p.id}" data-status="${p.status}">
      <div class="card-top">
        <div class="card-patient-name">${esc(p.nome)}</div>
        <a href="${waLink(p.telefone)}" target="_blank" class="card-wa-link" title="WhatsApp">
          <svg viewBox="0 0 24 24" fill="#25D366" stroke="none">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.128.558 4.122 1.532 5.852L0 24l6.293-1.647C8.066 23.418 9.996 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.912 0-3.692-.526-5.205-1.437l-.374-.222-3.866 1.012 1.029-3.764-.243-.386A9.922 9.922 0 0 1 2 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/>
          </svg>
        </a>
      </div>
      <div class="card-phone">${esc(p.telefone)}</div>
      ${agendamento ? `
        <div class="card-datetime">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${fmtDataHora(agendamento.data_hora)}
        </div>` : ''}
      <div class="card-meta">
        <span class="card-time-badge">${tempoStatus}</span>
      </div>
      <div class="card-actions">
        <button class="card-action-btn btn-card-chat" title="Ver conversa">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Chat
        </button>
        <button class="card-action-btn btn-card-edit" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Editar
        </button>
        ${proximoStatus ? `
        <button class="card-action-btn btn-card-avancar" title="Avançar status" style="color:var(--color-secondary);border-color:var(--color-secondary)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          ${STATUS_LABEL[proximoStatus]}
        </button>` : ''}
      </div>
    </div>`;
}

function getProximoStatus(status) {
  const fluxo = ['novo_contato', 'agendado', 'confirmado', 'concluido'];
  const idx = fluxo.indexOf(status);
  return idx >= 0 && idx < fluxo.length - 1 ? fluxo[idx + 1] : null;
}

async function avancarStatus(paciente) {
  const proximo = getProximoStatus(paciente.status);
  if (!proximo) return;
  await updatePacienteStatus(paciente.id, proximo);
}

async function updatePacienteStatus(id, novoStatus) {
  try {
    const { data, error } = await db
      .from('pacientes')
      .update({ status: novoStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Atualiza estado local
    const idx = State.pacientes.findIndex(p => p.id === id);
    if (idx >= 0) State.pacientes[idx] = data;

    renderKanban(State.pacientes);
    toast(`Status atualizado para "${STATUS_LABEL[novoStatus]}"`, 'success');
  } catch (err) {
    toast(`Erro ao atualizar status: ${err.message}`, 'error');
  }
}

/* ── DRAG AND DROP ──────────────────────────────────── */

function setupKanbanDragDrop() {
  const board = document.getElementById('kanban-board');

  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  });

  board.addEventListener('dragend', (e) => {
    document.querySelectorAll('.kanban-card.dragging').forEach(c => c.classList.remove('dragging'));
    document.querySelectorAll('.col-cards.drag-over').forEach(c => c.classList.remove('drag-over'));
  });

  board.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const col = e.target.closest('.col-cards');
    if (col) {
      document.querySelectorAll('.col-cards.drag-over').forEach(c => {
        if (c !== col) c.classList.remove('drag-over');
      });
      col.classList.add('drag-over');
    }
  });

  board.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.col-cards');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });

  board.addEventListener('drop', async (e) => {
    e.preventDefault();
    const col = e.target.closest('.col-cards');
    if (!col) return;
    col.classList.remove('drag-over');
    const pacienteId = e.dataTransfer.getData('text/plain');
    const novoStatus = col.dataset.status;
    const paciente   = State.pacientes.find(p => p.id === pacienteId);
    if (!paciente || paciente.status === novoStatus) return;
    await updatePacienteStatus(pacienteId, novoStatus);
  });
}

/* ── COLUNA CANCELADO COLAPSÁVEL ───────────────────── */
function setupKanbanCollapseCancel() {
  const toggle = document.getElementById('toggle-cancelado');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const col = toggle.closest('.kanban-col');
    col.classList.toggle('collapsed');
  });
}

/* ── BOTÃO NOVO PACIENTE ────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-novo-paciente')?.addEventListener('click', () => openModalPaciente(null));
  document.getElementById('btn-novo-paciente-2')?.addEventListener('click', () => openModalPaciente(null));
});

/* ═══════════════════════════════════════════════════════
   16. PACIENTES (Tabela)
══════════════════════════════════════════════════════ */

async function loadPacientes() {
  if (State.pacientes.length === 0) await fetchPacientes();
  renderPacientesTable(State.pacientes);
  setupPacientesFilters();
}

function setupPacientesFilters() {
  const searchInput  = document.getElementById('pacientes-search');
  const statusFilter = document.getElementById('pacientes-filter-status');

  let timeout;
  const applyFilter = () => {
    const q      = searchInput.value.toLowerCase();
    const status = statusFilter.value;
    const filtrado = State.pacientes.filter(p => {
      const matchQ = !q || p.nome.toLowerCase().includes(q) || (p.telefone && p.telefone.includes(q));
      const matchS = !status || p.status === status;
      return matchQ && matchS;
    });
    renderPacientesTable(filtrado);
  };

  searchInput.addEventListener('input', () => { clearTimeout(timeout); timeout = setTimeout(applyFilter, 200); });
  statusFilter.addEventListener('change', applyFilter);
}

function renderPacientesTable(pacientes) {
  const tbody  = document.getElementById('pacientes-tbody');
  const emptyEl = document.getElementById('pacientes-empty');

  if (pacientes.length === 0) {
    tbody.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  tbody.innerHTML = pacientes.map(p => `
    <tr>
      <td class="td-name">${esc(p.nome)}</td>
      <td class="td-phone">
        <a href="${waLink(p.telefone)}" target="_blank" style="color:var(--color-primary)">
          ${esc(p.telefone)}
        </a>
      </td>
      <td>
        <span class="status-pill status-${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
      </td>
      <td>${fmtData(p.created_at)}</td>
      <td class="td-actions">
        <button class="btn btn-outline btn-sm btn-chat-paciente" data-id="${p.id}" title="Ver conversa">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button class="btn btn-outline btn-sm btn-edit-paciente" data-id="${p.id}" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-danger btn-sm btn-delete-paciente" data-id="${p.id}" title="Excluir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.btn-chat-paciente').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = State.pacientes.find(px => px.id === btn.dataset.id);
      if (p) openChatPanel(p);
    });
  });
  tbody.querySelectorAll('.btn-edit-paciente').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = State.pacientes.find(px => px.id === btn.dataset.id);
      if (p) openModalPaciente(p);
    });
  });
  tbody.querySelectorAll('.btn-delete-paciente').forEach(btn => {
    btn.addEventListener('click', () => confirmarDeletePaciente(btn.dataset.id));
  });
}

/* ═══════════════════════════════════════════════════════
   17. MODAL PACIENTE (criar / editar)
══════════════════════════════════════════════════════ */

function openModalPaciente(paciente) {
  const isNovo = !paciente;
  const title  = isNovo ? 'Novo Paciente' : 'Editar Paciente';

  const body = `
    <div class="form-group">
      <label>Nome completo *</label>
      <input type="text" id="mf-nome" placeholder="Ex: Maria Silva" value="${esc(paciente?.nome || '')}" required />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Telefone *</label>
        <input type="tel" id="mf-telefone" placeholder="(47) 99999-9999" value="${esc(paciente?.telefone || '')}" required />
      </div>
      <div class="form-group">
        <label>Data de Nascimento</label>
        <input type="date" id="mf-nasc" value="${paciente?.data_nascimento || ''}" />
      </div>
    </div>
    <div class="form-group">
      <label>E-mail</label>
      <input type="email" id="mf-email" placeholder="paciente@email.com" value="${esc(paciente?.email || '')}" />
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="mf-status">
        ${Object.entries(STATUS_LABEL).map(([val, lbl]) =>
          `<option value="${val}" ${(paciente?.status || 'novo_contato') === val ? 'selected' : ''}>${lbl}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Observações</label>
      <textarea id="mf-obs" placeholder="Notas sobre o paciente…">${esc(paciente?.observacoes || '')}</textarea>
    </div>`;

  openModal({
    title,
    body,
    confirmText: isNovo ? 'Criar Paciente' : 'Salvar Alterações',
    onConfirm: () => salvarPaciente(paciente?.id),
  });
}

async function salvarPaciente(id) {
  const nome     = document.getElementById('mf-nome').value.trim();
  const telefone = document.getElementById('mf-telefone').value.trim();
  const email    = document.getElementById('mf-email').value.trim();
  const nasc     = document.getElementById('mf-nasc').value;
  const status   = document.getElementById('mf-status').value;
  const obs      = document.getElementById('mf-obs').value.trim();

  if (!nome || !telefone) { toast('Nome e telefone são obrigatórios', 'warning'); return; }

  const payload = {
    nome, telefone, status,
    email: email || null,
    data_nascimento: nasc || null,
    observacoes: obs || null,
    updated_at: new Date().toISOString(),
  };

  try {
    if (id) {
      // Atualizar
      const { data, error } = await db.from('pacientes').update(payload).eq('id', id).select().single();
      if (error) throw error;
      const idx = State.pacientes.findIndex(p => p.id === id);
      if (idx >= 0) State.pacientes[idx] = data;
      toast('Paciente atualizado com sucesso!', 'success');
    } else {
      // Criar
      const { data, error } = await db.from('pacientes').insert(payload).select().single();
      if (error) throw error;
      State.pacientes.unshift(data);
      toast('Paciente criado com sucesso!', 'success');
    }

    closeModal();

    // Atualiza views
    if (State.currentPage === 'kanban')    renderKanban(State.pacientes);
    if (State.currentPage === 'pacientes') renderPacientesTable(State.pacientes);
    renderDashboardMetrics();
  } catch (err) {
    if (err.message?.includes('unique') || err.code === '23505') {
      toast('Este telefone já está cadastrado', 'warning');
    } else {
      toast(`Erro: ${err.message}`, 'error');
    }
  }
}

async function confirmarDeletePaciente(id) {
  const paciente = State.pacientes.find(p => p.id === id);
  if (!paciente) return;

  openModal({
    title: 'Excluir Paciente',
    body: `<p style="color:var(--text-secondary)">Tem certeza que deseja excluir <strong>${esc(paciente.nome)}</strong>?<br>Esta ação não pode ser desfeita.</p>`,
    confirmText: 'Excluir',
    onConfirm: async () => {
      try {
        const { error } = await db.from('pacientes').delete().eq('id', id);
        if (error) throw error;
        State.pacientes = State.pacientes.filter(p => p.id !== id);
        closeModal();
        toast('Paciente excluído', 'info');
        if (State.currentPage === 'kanban')    renderKanban(State.pacientes);
        if (State.currentPage === 'pacientes') renderPacientesTable(State.pacientes);
      } catch (err) {
        toast(`Erro ao excluir: ${err.message}`, 'error');
      }
    },
  });

  // Deixa o botão de confirmar vermelho
  setTimeout(() => {
    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) {
      confirmBtn.className = 'btn btn-danger';
    }
  }, 10);
}

/* ═══════════════════════════════════════════════════════
   18. AGENDAMENTOS
══════════════════════════════════════════════════════ */

async function loadAgendamentos() {
  if (State.agendamentos.length === 0) await fetchAgendamentos();
  if (State.pacientes.length === 0) await fetchPacientes();
  setupAgendamentosNav();
  renderAgendamentos();
}

function setupAgendamentosNav() {
  document.getElementById('btn-semana-anterior').onclick = () => { State.semanaOffset--; renderAgendamentos(); };
  document.getElementById('btn-semana-proxima').onclick  = () => { State.semanaOffset++; renderAgendamentos(); };
  document.getElementById('btn-novo-agendamento').onclick = () => openModalAgendamento(null);
}

function getSemanaAtual() {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - hoje.getDay() + State.semanaOffset * 7);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  fim.setHours(23, 59, 59, 999);
  return { inicio, fim };
}

function renderAgendamentos() {
  const { inicio, fim } = getSemanaAtual();
  const container = document.getElementById('agendamentos-container');

  // Atualiza label da semana
  const labelEl = document.getElementById('semana-label');
  const hoje    = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (State.semanaOffset === 0) {
    labelEl.textContent = 'Esta semana';
  } else {
    labelEl.textContent = `${fmtData(inicio)} – ${fmtData(fim)}`;
  }

  // Filtra agendamentos da semana
  const agSemana = State.agendamentos
    .filter(a => {
      const d = new Date(a.data_hora);
      return d >= inicio && d <= fim;
    })
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  // Agrupa por dia
  const porDia = {};
  agSemana.forEach(ag => {
    const dia = new Date(ag.data_hora);
    dia.setHours(0, 0, 0, 0);
    const key = dia.toISOString();
    if (!porDia[key]) porDia[key] = { dia, ags: [] };
    porDia[key].ags.push(ag);
  });

  // Gera todos os dias da semana mesmo sem agendamentos
  const html = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(inicio);
    dia.setDate(inicio.getDate() + i);
    dia.setHours(0, 0, 0, 0);
    const key     = dia.toISOString();
    const isHoje  = dia.toDateString() === hoje.toDateString();
    const ags     = (porDia[key]?.ags) || [];

    const diaLabel = dia.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo'
    });

    html.push(`
      <div class="dia-group ${isHoje ? 'dia-hoje' : ''}">
        <div class="dia-label">${diaLabel}${isHoje ? ' — hoje' : ''}</div>
        ${ags.length === 0
          ? `<div style="padding:.3rem 0;color:var(--text-muted);font-size:.82rem">Nenhum agendamento</div>`
          : ags.map(ag => buildAgendamentoRow(ag)).join('')
        }
      </div>`);
  }

  container.innerHTML = html.join('');

  // Eventos nos rows
  container.querySelectorAll('.agendamento-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      const ag = State.agendamentos.find(a => a.id === id);
      if (ag) openModalAgendamento(ag);
    });
  });
}

function buildAgendamentoRow(ag) {
  const cor = STATUS_COLOR[ag.status] || '#0066CC';
  return `
    <div class="agendamento-row" data-id="${ag.id}">
      <div class="ag-status-bar" style="background:${cor}"></div>
      <div class="ag-hora">${fmtHora(ag.data_hora)}</div>
      <div class="ag-info">
        <div class="ag-name">${esc(ag.nome_paciente)}</div>
        <div class="ag-phone">${esc(ag.telefone)}</div>
        ${ag.observacoes ? `<div style="font-size:.75rem;color:var(--text-muted);margin-top:.15rem">${esc(ag.observacoes)}</div>` : ''}
      </div>
      <span class="status-pill ag-status-pill status-${ag.status}">${STATUS_LABEL[ag.status] || ag.status}</span>
      <div class="ag-actions">
        <button class="icon-btn" onclick="event.stopPropagation(); openModalAgendamento(State.agendamentos.find(a=>a.id==='${ag.id}'))" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    </div>`;
}

/* ── MODAL AGENDAMENTO ──────────────────────────────── */

function openModalAgendamento(ag) {
  const isNovo = !ag;

  // Formata data/hora para input datetime-local
  let dtLocal = '';
  if (ag?.data_hora) {
    const d = new Date(ag.data_hora);
    dtLocal  = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  // Monta lista de pacientes para o select
  const pacientesOptions = State.pacientes.map(p =>
    `<option value="${p.id}" data-telefone="${esc(p.telefone)}" data-nome="${esc(p.nome)}"
      ${ag?.paciente_id === p.id ? 'selected' : ''}>${esc(p.nome)} — ${esc(p.telefone)}</option>`
  ).join('');

  const body = `
    <div class="form-group">
      <label>Paciente</label>
      <select id="ma-paciente">
        <option value="">Selecione ou preencha manualmente…</option>
        ${pacientesOptions}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Nome do Paciente *</label>
        <input type="text" id="ma-nome" value="${esc(ag?.nome_paciente || '')}" placeholder="Nome completo" required />
      </div>
      <div class="form-group">
        <label>Telefone *</label>
        <input type="tel" id="ma-telefone" value="${esc(ag?.telefone || '')}" placeholder="(47) 99999-9999" required />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Data e Hora *</label>
        <input type="datetime-local" id="ma-datahora" value="${dtLocal}" required />
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="ma-status">
          <option value="agendado"   ${ag?.status === 'agendado'   ? 'selected' : ''}>Agendado</option>
          <option value="confirmado" ${ag?.status === 'confirmado' ? 'selected' : ''}>Confirmado</option>
          <option value="concluido"  ${ag?.status === 'concluido'  ? 'selected' : ''}>Concluído</option>
          <option value="cancelado"  ${ag?.status === 'cancelado'  ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Observações</label>
      <textarea id="ma-obs" placeholder="Notas sobre o agendamento…">${esc(ag?.observacoes || '')}</textarea>
    </div>`;

  openModal({
    title: isNovo ? 'Novo Agendamento' : 'Editar Agendamento',
    body,
    confirmText: isNovo ? 'Criar Agendamento' : 'Salvar',
    onConfirm: () => salvarAgendamento(ag?.id),
  });

  // Auto-preenche nome e telefone ao selecionar paciente
  setTimeout(() => {
    const selectPaciente = document.getElementById('ma-paciente');
    if (selectPaciente) {
      selectPaciente.addEventListener('change', () => {
        const opt = selectPaciente.selectedOptions[0];
        if (opt && opt.value) {
          document.getElementById('ma-nome').value     = opt.dataset.nome || '';
          document.getElementById('ma-telefone').value = opt.dataset.telefone || '';
        }
      });
    }
  }, 50);
}

const GCAL_WEBHOOK = 'https://n8n.srv1474226.hstgr.cloud/webhook/gcal-sync';

async function sincronizarGcal({ acao, googleEventId, nome, telefone, dataHora, obs, status }) {
  try {
    const res = await fetch(GCAL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, eventId: googleEventId || null, nome, telefone, dataHora, obs, status }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.googleEventId || null;
  } catch {
    // gcal sync é best-effort; não bloqueia o save
    return null;
  }
}

async function salvarAgendamento(id) {
  const nome       = document.getElementById('ma-nome').value.trim();
  const telefone   = document.getElementById('ma-telefone').value.trim();
  const dataHora   = document.getElementById('ma-datahora').value;
  const status     = document.getElementById('ma-status').value;
  const obs        = document.getElementById('ma-obs').value.trim();
  const pacienteId = document.getElementById('ma-paciente').value || null;

  if (!nome || !telefone || !dataHora) {
    toast('Nome, telefone e data/hora são obrigatórios', 'warning');
    return;
  }

  const dataHoraISO = new Date(dataHora).toISOString();

  // Busca google_event_id existente (se for edição)
  const agExistente = id ? State.agendamentos.find(a => a.id === id) : null;
  const googleEventIdAtual = agExistente?.google_event_id || null;

  const payload = {
    nome_paciente: nome,
    telefone,
    data_hora:     dataHoraISO,
    status,
    observacoes:   obs || null,
    paciente_id:   pacienteId,
    updated_at:    new Date().toISOString(),
  };

  try {
    let savedData;
    if (id) {
      const { data, error } = await db.from('agendamentos').update(payload).eq('id', id).select().single();
      if (error) throw error;
      savedData = data;
      const idx = State.agendamentos.findIndex(a => a.id === id);
      if (idx >= 0) State.agendamentos[idx] = data;
      toast('Agendamento atualizado!', 'success');
    } else {
      const { data, error } = await db.from('agendamentos').insert(payload).select().single();
      if (error) throw error;
      savedData = data;
      State.agendamentos.push(data);
      toast('Agendamento criado!', 'success');
    }

    closeModal();
    renderAgendamentos();
    renderDashboardAgendamentos();
    renderDashboardMetrics();

    // Sincroniza com Google Calendar (async, não bloqueia UI)
    const acaoGcal = status === 'cancelado' ? 'cancelar' : (id ? 'atualizar' : 'criar');
    sincronizarGcal({
      acao: acaoGcal,
      googleEventId: googleEventIdAtual,
      nome,
      telefone,
      dataHora: dataHoraISO,
      obs,
      status,
    }).then(gEventId => {
      if (gEventId && savedData?.id) {
        // Salva o google_event_id de volta no Supabase silenciosamente
        db.from('agendamentos')
          .update({ google_event_id: gEventId })
          .eq('id', savedData.id)
          .then(({ error }) => {
            if (!error) {
              const idx = State.agendamentos.findIndex(a => a.id === savedData.id);
              if (idx >= 0) State.agendamentos[idx].google_event_id = gEventId;
            }
          });
      }
    });
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

// Expõe openModalAgendamento globalmente (usado nos onclick inline)
window.openModalAgendamento = openModalAgendamento;

/* ═══════════════════════════════════════════════════════
   19. NOTIFICAÇÃO SONORA
══════════════════════════════════════════════════════ */

/**
 * Toca um som curto de notificação usando Web Audio API
 * Sem dependência de arquivos externos
 */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* silencioso se AudioContext não disponível */ }
}

/* ═══════════════════════════════════════════════════════
   20. FILTRO DE DATAS & EXPORTAR CSV — AGENDAMENTOS
══════════════════════════════════════════════════════ */

/**
 * Filtra agendamentos por intervalo de datas customizado
 */
function filtrarAgendamentosPorData() {
  const dataIni = document.getElementById('filtro-data-inicio')?.value;
  const dataFim = document.getElementById('filtro-data-fim')?.value;
  if (!dataIni || !dataFim) {
    toast('Selecione as duas datas para filtrar', 'error');
    return;
  }
  const inicio = new Date(dataIni + 'T00:00:00');
  const fim = new Date(dataFim + 'T23:59:59');
  if (inicio > fim) {
    toast('Data inicial deve ser anterior à data final', 'error');
    return;
  }

  const filtrados = State.agendamentos
    .filter(a => {
      const d = new Date(a.data_hora);
      return d >= inicio && d <= fim;
    })
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  const container = document.getElementById('agendamentos-container');
  const labelEl = document.getElementById('semana-label');
  labelEl.textContent = `${fmtData(inicio)} – ${fmtData(fim)} (${filtrados.length} resultados)`;

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Nenhum agendamento no período selecionado</div>';
    return;
  }

  // Agrupa por dia
  const porDia = {};
  filtrados.forEach(ag => {
    const dia = new Date(ag.data_hora);
    dia.setHours(0, 0, 0, 0);
    const key = dia.toISOString();
    if (!porDia[key]) porDia[key] = { dia, ags: [] };
    porDia[key].ags.push(ag);
  });

  const html = Object.values(porDia).map(({ dia, ags }) => {
    const diaLabel = dia.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo'
    });
    return `
      <div class="dia-group">
        <div class="dia-label">${diaLabel}</div>
        ${ags.map(ag => buildAgendamentoRow(ag)).join('')}
      </div>`;
  }).join('');

  container.innerHTML = html;
  container.querySelectorAll('.agendamento-row').forEach(row => {
    row.addEventListener('click', () => {
      const ag = State.agendamentos.find(a => a.id === row.dataset.id);
      if (ag) openModalAgendamento(ag);
    });
  });
}

/**
 * Exporta agendamentos visíveis para CSV
 */
function exportarAgendamentosCSV() {
  // Determina quais agendamentos exportar (da semana atual ou filtro ativo)
  const labelEl = document.getElementById('semana-label');
  let agExport;

  if (labelEl.textContent.includes('resultados')) {
    // Filtro customizado ativo — pega os que estão renderizados
    const dataIni = document.getElementById('filtro-data-inicio')?.value;
    const dataFim = document.getElementById('filtro-data-fim')?.value;
    if (dataIni && dataFim) {
      const inicio = new Date(dataIni + 'T00:00:00');
      const fim = new Date(dataFim + 'T23:59:59');
      agExport = State.agendamentos.filter(a => {
        const d = new Date(a.data_hora);
        return d >= inicio && d <= fim;
      });
    } else {
      agExport = State.agendamentos;
    }
  } else {
    // Semana atual
    const { inicio, fim } = getSemanaAtual();
    agExport = State.agendamentos.filter(a => {
      const d = new Date(a.data_hora);
      return d >= inicio && d <= fim;
    });
  }

  agExport.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  if (agExport.length === 0) {
    toast('Nenhum agendamento para exportar', 'error');
    return;
  }

  const headers = ['Data', 'Hora', 'Paciente', 'Telefone', 'Status', 'Observacoes'];
  const rows = agExport.map(ag => [
    fmtData(ag.data_hora),
    fmtHora(ag.data_hora),
    (ag.nome_paciente || '').replace(/"/g, '""'),
    (ag.telefone || '').replace(/"/g, '""'),
    ag.status || '',
    (ag.observacoes || '').replace(/"/g, '""').replace(/\n/g, ' ')
  ]);

  const csvContent = [headers.join(';'), ...rows.map(r => r.map(c => `"${c}"`).join(';'))].join('\n');
  const BOM = '\uFEFF'; // Para Excel reconhecer UTF-8
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agendamentos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado com sucesso!', 'success');
}

// Expõe funções globalmente
window.filtrarAgendamentosPorData = filtrarAgendamentosPorData;
window.exportarAgendamentosCSV = exportarAgendamentosCSV;

/* ═══════════════════════════════════════════════════════
   21. ENTRY POINT — DOMContentLoaded
══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
