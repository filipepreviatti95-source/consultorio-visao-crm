/**
 * app.js — Entry point (ES Module)
 * Importa todos os módulos, injeta callbacks e inicializa a aplicação.
 */

import { State } from './config.js';
import { fetchConversasRecentes } from './api.js';
import { unlockAudio } from './utils.js';

// Auth
import { initAuth, setOnAppInit, setupLogout } from './auth.js';

// Router
import { initNavigation, navigateTo, initSidebar, initDarkMode, initSoundToggle, setPageLoader } from './router.js';

// UI
import { initGlobalSearch, setOnSearchResultClick, initModal } from './ui.js';

// Chat
import { initChatPanel, openChatPanel } from './chat.js';

// Realtime
import { initRealtime, setOnDataChange } from './realtime.js';

// Páginas
import { loadDashboard, renderDashboardMetrics, renderDashboardAgenda, renderDashboardFeed, initDashboardFilters, stopDashboardPolling } from './dashboard.js';
import { loadKanban, renderKanban, setOpenModalPaciente } from './kanban.js';
import { loadPacientes, renderPacientesTable, openModalPaciente, setupNovoPacienteBtns } from './pacientes.js';
import { loadAgendamentos, renderAgendamentos, filtrarAgendamentosPorData, exportarAgendamentosCSV } from './agendamentos.js';

// ── Callback: após login bem-sucedido ──

setOnAppInit(async () => {
  console.log('[App] onAppInit start');

  // Desbloqueia AudioContext na primeira interação (autoplay policy)
  unlockAudio();

  // Inicializa UI — cada init em try/catch para não quebrar os seguintes
  try { initNavigation(); } catch (e) { console.error('[App] initNavigation error:', e); }
  try { initSidebar(); } catch (e) { console.error('[App] initSidebar error:', e); }
  try { initDarkMode(); } catch (e) { console.error('[App] initDarkMode error:', e); }
  try { initSoundToggle(); } catch (e) { console.error('[App] initSoundToggle error:', e); }
  try { initGlobalSearch(); } catch (e) { console.error('[App] initGlobalSearch error:', e); }
  try { initModal(); } catch (e) { console.error('[App] initModal error:', e); }
  try { initChatPanel(); } catch (e) { console.error('[App] initChatPanel error:', e); }
  try { initDashboardFilters(); } catch (e) { console.error('[App] initDashboardFilters error:', e); }
  try { setupLogout(); } catch (e) { console.error('[App] setupLogout error:', e); }
  try { setupNovoPacienteBtns(); } catch (e) { console.error('[App] setupNovoPacienteBtns error:', e); }

  // Botão "Limpar filtro" dos agendamentos (guard via dataset)
  const btnLimpar = document.getElementById('btn-limpar-filtro');
  if (btnLimpar && !btnLimpar._initDone) {
    btnLimpar._initDone = true;
    btnLimpar.addEventListener('click', () => {
      State.semanaOffset = 0;
      renderAgendamentos();
    });
  }

  // Realtime
  initRealtime();

  // Carrega página inicial (ou do hash)
  const page = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(page);

  console.log('[App] onAppInit complete');
});

// ── Callback: carrega dados ao mudar de página ──

setPageLoader(async (page) => {
  // Limpa polling do dashboard ao sair
  if (page !== 'dashboard') stopDashboardPolling();

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
    if (page === 'dashboard') renderDashboardMetrics();
  }

  if (tabela === 'agendamentos') {
    if (page === 'agendamentos') renderAgendamentos();
    if (page === 'dashboard') {
      renderDashboardAgenda();
      renderDashboardMetrics();
    }
  }

  if (tabela === 'conversas') {
    try {
      await fetchConversasRecentes();
      renderDashboardFeed(); // Atualiza sempre (DOM só muda se elementos existem)
    } catch (e) {
      console.warn('Erro ao atualizar feed de conversas:', e);
    }
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

// ── Boot ──

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
