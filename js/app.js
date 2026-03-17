/**
 * app.js — Entry point (ES Module)
 * Importa todos os módulos, injeta callbacks e inicializa a aplicação.
 */

import { State } from './config.js';
import { fetchConversasRecentes } from './api.js';

// Auth
import { initAuth, setOnAppInit, setupLogout } from './auth.js';

// Router
import { initNavigation, navigateTo, initSidebar, initDarkMode, setPageLoader } from './router.js';

// UI
import { initGlobalSearch, setOnSearchResultClick, initModal } from './ui.js';

// Chat
import { initChatPanel, openChatPanel } from './chat.js';

// Realtime
import { initRealtime, setOnDataChange } from './realtime.js';

// Páginas
import { loadDashboard, renderDashboardMetrics, renderDashboardAgendamentos, renderDashboardFeed } from './dashboard.js';
import { loadKanban, renderKanban, setOpenModalPaciente } from './kanban.js';
import { loadPacientes, renderPacientesTable, openModalPaciente, setupNovoPacienteBtns } from './pacientes.js';
import { loadAgendamentos, renderAgendamentos, filtrarAgendamentosPorData, exportarAgendamentosCSV } from './agendamentos.js';

// ── Callback: após login bem-sucedido ──

setOnAppInit(async () => {
  // Inicializa UI
  initNavigation();
  initSidebar();
  initDarkMode();
  initGlobalSearch();
  initModal();
  initChatPanel();
  setupLogout();
  setupNovoPacienteBtns();

  // Botão "Limpar filtro" dos agendamentos
  document.getElementById('btn-limpar-filtro')?.addEventListener('click', () => {
    State.semanaOffset = 0;
    renderAgendamentos();
  });

  // Realtime
  initRealtime();

  // Carrega página inicial (ou do hash)
  const page = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(page);
});

// ── Callback: carrega dados ao mudar de página ──

setPageLoader(async (page) => {
  switch (page) {
    case 'dashboard':    await loadDashboard();    break;
    case 'kanban':       await loadKanban();       break;
    case 'pacientes':    await loadPacientes();    break;
    case 'agendamentos': await loadAgendamentos(); break;
  }
});

// ── Callback: re-render quando Realtime notifica mudança ──

setOnDataChange(async (tabela) => {
  const page = State.currentPage;

  if (tabela === 'pacientes') {
    if (page === 'kanban')    renderKanban(State.pacientes);
    if (page === 'pacientes') renderPacientesTable(State.pacientes);
    renderDashboardMetrics();
  }

  if (tabela === 'agendamentos') {
    if (page === 'agendamentos') renderAgendamentos();
    renderDashboardMetrics();
    renderDashboardAgendamentos();
  }

  if (tabela === 'conversas') {
    await fetchConversasRecentes();
    if (page === 'dashboard') renderDashboardFeed();
  }
});

// ── Callback: clique em resultado da busca global → abre chat ──

setOnSearchResultClick((paciente) => {
  openChatPanel(paciente);
});

// ── Callback: botão editar no kanban → abre modal paciente ──

setOpenModalPaciente((paciente) => {
  openModalPaciente(paciente);
});

// ── Expor funções no window para onclick inline do HTML ──

window.filtrarAgendamentosPorData = filtrarAgendamentosPorData;
window.exportarAgendamentosCSV    = exportarAgendamentosCSV;
window.renderAgendamentos         = renderAgendamentos;

// ── Boot ──

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
