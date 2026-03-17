/**
 * router.js — Navegação SPA, sidebar mobile, dark mode
 */

import { State } from './config.js';

const PAGE_TITLES = {
  dashboard:    'Dashboard',
  kanban:       'Kanban',
  pacientes:    'Pacientes',
  agendamentos: 'Agendamentos',
};

let pageLoader = null; // função injetada que carrega dados de cada página

export function setPageLoader(fn) {
  pageLoader = fn;
}

// ── Navegação ──

export function initNavigation() {
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

export function navigateTo(page, updateHash = true) {
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

  // Carrega dados
  if (pageLoader) pageLoader(page);
}

// ── Sidebar Mobile ──

export function initSidebar() {
  document.getElementById('hamburger').addEventListener('click', openSidebarMobile);
  document.getElementById('sidebar-close').addEventListener('click', closeSidebarMobile);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebarMobile);
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

export function initDarkMode() {
  applyTheme(State.darkMode);
  document.getElementById('dark-toggle').addEventListener('click', () => {
    State.darkMode = !State.darkMode;
    localStorage.setItem('darkMode', State.darkMode);
    applyTheme(State.darkMode);
  });
}

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('icon-sun').style.display  = dark ? 'none' : '';
  document.getElementById('icon-moon').style.display = dark ? ''     : 'none';
}
