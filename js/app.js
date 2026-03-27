/**
 * app.js — Entry point (ES Module)
 * Importa todos os módulos, injeta callbacks e inicializa a aplicação.
 */

import { State } from './config.js';
import { fetchConversasRecentes, getBotGlobalStatus, toggleBotGlobal } from './api.js';
import { unlockAudio, toast } from './utils.js';

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
import { loadTreinamento, initTreinamento } from './treinamento.js';

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
  try { initBotGlobalToggle(); } catch (e) { console.error('[App] initBotGlobalToggle error:', e); }
  try { setupNovoPacienteBtns(); } catch (e) { console.error('[App] setupNovoPacienteBtns error:', e); }
  try { initTreinamento(); } catch (e) { console.error('[App] initTreinamento error:', e); }

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
    case 'treinamento':  await loadTreinamento();  break;
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

// ── Bot Global Toggle ──

async function initBotGlobalToggle() {
  const btn = document.getElementById('bot-global-toggle');
  if (!btn) return;

  // Checar status atual do workflow
  const ativo = await getBotGlobalStatus();
  updateBotGlobalUI(ativo);

  btn.addEventListener('click', async () => {
    const atualAtivo = !btn.classList.contains('bot-off');
    const acao = atualAtivo ? 'DESATIVAR' : 'ATIVAR';
    const msg = atualAtivo
      ? 'Desativar o bot geral?\n\nNenhum paciente receberá respostas automáticas. Somente a equipe poderá responder pelo CRM.'
      : 'Reativar o bot geral?\n\nTodos os pacientes voltarão a receber respostas automáticas (exceto os pausados individualmente).';

    if (!confirm(msg)) return;

    btn.disabled = true;
    try {
      const novoEstado = await toggleBotGlobal(!atualAtivo);
      updateBotGlobalUI(novoEstado);
      toast(novoEstado ? 'Bot ATIVADO' : 'Bot DESATIVADO', novoEstado ? 'success' : 'warning', 3000);
    } catch (err) {
      console.error('[App] Erro ao toggle bot global:', err);
      toast(`Erro: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

function updateBotGlobalUI(ativo) {
  const btn = document.getElementById('bot-global-toggle');
  const iconOn = document.getElementById('icon-bot-on');
  const iconOff = document.getElementById('icon-bot-off');
  if (!btn) return;

  if (ativo) {
    btn.classList.remove('bot-off');
    btn.title = 'Bot ativo — clique para desativar';
    if (iconOn) iconOn.style.display = '';
    if (iconOff) iconOff.style.display = 'none';
  } else {
    btn.classList.add('bot-off');
    btn.title = 'Bot DESATIVADO — clique para reativar';
    if (iconOn) iconOn.style.display = 'none';
    if (iconOff) iconOff.style.display = '';
  }
}

// ── Boot ──

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
