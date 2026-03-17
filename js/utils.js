/**
 * utils.js — Funções puras, constantes, toast, som
 * Zero dependências externas. Reutilizável entre projetos.
 */

// ── Constantes ──

export const STATUS_LABEL = {
  novo_contato: 'Novo Contato',
  agendado:     'Agendado',
  confirmado:   'Confirmado',
  concluido:    'Concluído',
  cancelado:    'Cancelado',
};

export const STATUS_COLOR = {
  agendado:   '#0066CC',
  confirmado: '#00A86B',
  concluido:  '#6B7280',
  cancelado:  '#EF4444',
};

// ── Formatação de data/hora ──

export function fmt(date, opts = {}) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', ...opts });
}

export function fmtData(date) {
  return fmt(date, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtHora(date) {
  return fmt(date, { hour: '2-digit', minute: '2-digit' });
}

export function fmtDataHora(date) {
  return fmt(date, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function tempoDesde(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)    return `há ${d}d`;
  return fmtData(date);
}

// ── Helpers ──

export function iniciais(nome) {
  if (!nome) return '?';
  return nome.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

export function waLink(telefone) {
  if (!telefone) return '#';
  const nums = telefone.replace(/\D/g, '');
  return `https://wa.me/${nums.startsWith('55') ? nums : '55' + nums}`;
}

export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Toast (notificações UI) ──

const TOAST_ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

export function toast(msg, type = 'info', duration = 3500) {
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

// ── Som & Notificações ──

/** Estado do som — persiste no localStorage */
export function isSoundEnabled() {
  return localStorage.getItem('soundEnabled') !== 'false'; // default: true
}
export function setSoundEnabled(val) {
  localStorage.setItem('soundEnabled', val ? 'true' : 'false');
}

export function playNotificationSound() {
  if (!isSoundEnabled()) return;
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
  } catch (e) { /* silencioso */ }
}

/** Browser push notification */
export function sendBrowserNotification(title, body) {
  if (!isSoundEnabled()) return; // respeita o toggle de som/notificações
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico', tag: 'crm-' + Date.now() });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico' });
    });
  }
}

/** Pede permissão para notificações (chamar no init) */
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
