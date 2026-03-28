/**
 * router.js — Navegação SPA, sidebar mobile, dark mode
 */

import { State } from './config.js';
import { isSoundEnabled, setSoundEnabled, requestNotificationPermission } from './utils.js';

const PAGE_TITLES = {
  dashboard:    'Dashboard',
  kanban:       'Kanban',
  pacientes:    'Pacientes',
  agendamentos: 'Agendamentos',
  treinamento:  'Treinamento do Bot',
};

let pageLoader = null; // função injetada que carrega dados de cada página
let navInitDone = false;

export function setPageLoader(fn) {
  pageLoader = fn;
}

// ── Navegação ──

export function initNavigation() {
  if (navInitDone) return;
  navInitDone = true;

  // Menu lateral
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.page);
      closeSidebarMobile();
    });
  });

  // Links "Ver todos" no dashboard
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

  // Hash change (voltar/avançar)
  window.addEventListener('hashchange', () => {
    const page = window.location.hash.replace('#', '') || 'dashboard';
    if (PAGE_TITLES[page]) navigateTo(page, false);
  });
}

export async function navigateTo(page, updateHash = true) {
  if (!PAGE_TITLES[page]) page = 'dashboard';
  State.currentPage = page;

  if (updateHash) history.pushState(null, '', `#${page}`);

  // Menu ativo
  document.querySelectorAll('.nav-item').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Título
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page];

  // Página visível
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  // Loading indicator
  if (target) target.classList.add('page-loading');

  // Carrega dados
  if (pageLoader) {
    try {
      await pageLoader(page);
    } catch (e) {
      console.error(`[Router] Error loading ${page}:`, e);
    } finally {
      if (target) target.classList.remove('page-loading');
    }
  } else {
    if (target) target.classList.remove('page-loading');
  }
}

// ── Sidebar Mobile ──

let sidebarInitDone = false;

export function initSidebar() {
  if (sidebarInitDone) return;
  const hamburger = document.getElementById('hamburger');
  const sideClose = document.getElementById('sidebar-close');
  const sideOver  = document.getElementById('sidebar-overlay');
  if (!hamburger || !sideClose || !sideOver) return;
  sidebarInitDone = true;

  hamburger.addEventListener('click', openSidebarMobile);
  sideClose.addEventListener('click', closeSidebarMobile);
  sideOver.addEventListener('click', closeSidebarMobile);
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

// ── Dark Mode ──

let darkModeInitDone = false;

export function initDarkMode() {
  applyTheme(State.darkMode);
  if (darkModeInitDone) return;
  const btn = document.getElementById('dark-toggle');
  if (!btn) { console.warn('[Router] dark-toggle button not found'); return; }
  darkModeInitDone = true;

  btn.addEventListener('click', () => {
    State.darkMode = !State.darkMode;
    localStorage.setItem('darkMode', State.darkMode);
    applyTheme(State.darkMode);
  });
}

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const sun  = document.getElementById('icon-sun');
  const moon = document.getElementById('icon-moon');
  if (sun)  sun.style.display  = dark ? 'none' : '';
  if (moon) moon.style.display = dark ? ''     : 'none';
}

// ── Sound Toggle ──

let soundInitDone = false;

export function initSoundToggle() {
  applySoundUI(isSoundEnabled());
  if (soundInitDone) return;
  const btn = document.getElementById('sound-toggle');
  if (!btn) { console.warn('[Router] sound-toggle button not found'); return; }
  soundInitDone = true;

  btn.addEventListener('click', () => {
    const newVal = !isSoundEnabled();
    setSoundEnabled(newVal);
    applySoundUI(newVal);
    if (newVal) requestNotificationPermission();
  });
  // Pede permissão de notificação no init se som está ativo
  if (isSoundEnabled()) requestNotificationPermission();
}

function applySoundUI(enabled) {
  const on  = document.getElementById('icon-sound-on');
  const off = document.getElementById('icon-sound-off');
  if (on)  on.style.display  = enabled ? '' : 'none';
  if (off) off.style.display = enabled ? 'none' : '';
}

// Aplica tema imediatamente no load (antes do login) para evitar flash
applyThemeEarly();
function applyThemeEarly() {
  const dark = localStorage.getItem('darkMode') === 'true';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
