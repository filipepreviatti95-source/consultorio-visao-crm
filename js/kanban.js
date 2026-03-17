/**
 * kanban.js — Quadro Kanban com drag & drop + confetti
 */

import { State } from './config.js';
import { esc, fmtDataHora, tempoDesde, waLink, STATUS_LABEL, toast } from './utils.js';
import { fetchPacientes, fetchAgendamentos, updatePacienteStatus } from './api.js';
import { openChatPanel } from './chat.js';
import { renderDashboardMetrics } from './dashboard.js';

let openModalPacienteFn = null;
let kanbanDragSetup = false; // evita re-setup do drag&drop a cada render

export function setOpenModalPaciente(fn) {
  openModalPacienteFn = fn;
}

export async function loadKanban() {
  if (State.pacientes.length === 0) await fetchPacientes();
  if (State.agendamentos.length === 0) await fetchAgendamentos();
  renderKanban(State.pacientes);
  if (!kanbanDragSetup) {
    setupKanbanDragDrop();
    setupKanbanCollapseCancel();
    kanbanDragSetup = true;
  }
}

export function renderKanban(pacientes) {
  const colunas = ['novo_contato', 'agendado', 'confirmado', 'concluido', 'cancelado'];

  colunas.forEach(status => {
    const colEl   = document.getElementById(`col-${status}`);
    const countEl = document.getElementById(`count-${status}`);
    if (!colEl || !countEl) return;
    const filtrados = pacientes.filter(p => p.status === status);

    countEl.textContent = filtrados.length;

    if (filtrados.length === 0) {
      colEl.innerHTML = `<div style="padding:.75rem;text-align:center;color:var(--text-muted);font-size:.8rem">Nenhum paciente</div>`;
      return;
    }

    colEl.innerHTML = filtrados.map(p => buildKanbanCard(p)).join('');

    colEl.querySelectorAll('.kanban-card').forEach(card => {
      const id = card.dataset.id;
      const paciente = pacientes.find(px => px.id === id);
      if (!paciente) return;

      card.querySelector('.btn-card-chat')?.addEventListener('click', (e) => { e.stopPropagation(); openChatPanel(paciente); });
      card.querySelector('.btn-card-edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (openModalPacienteFn) openModalPacienteFn(paciente);
      });
      card.querySelector('.btn-card-avancar')?.addEventListener('click', (e) => { e.stopPropagation(); avancarStatus(paciente); });
    });
  });
}

function buildKanbanCard(p) {
  const agendamento = State.agendamentos
    .filter(a => a.paciente_id === p.id && a.status !== 'cancelado')
    .sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))[0];

  const tempoStatus   = tempoDesde(p.updated_at || p.created_at);
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
          </svg> Chat
        </button>
        <button class="card-action-btn btn-card-edit" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg> Editar
        </button>
        ${proximoStatus ? `
        <button class="card-action-btn btn-card-avancar" title="Avançar status" style="color:var(--color-secondary);border-color:var(--color-secondary)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg> ${STATUS_LABEL[proximoStatus]}
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
  try {
    await updatePacienteStatus(paciente.id, proximo);
    renderKanban(State.pacientes);
    toast(`Status atualizado para "${STATUS_LABEL[proximo]}"`, 'success');

    // 🎉 Confetti quando confirmado!
    if (proximo === 'confirmado') {
      launchConfetti();
    }
  } catch (err) {
    toast(`Erro ao atualizar status: ${err.message}`, 'error');
  }
}

// ── Drag & Drop ──

function setupKanbanDragDrop() {
  const board = document.getElementById('kanban-board');

  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  });

  board.addEventListener('dragend', () => {
    document.querySelectorAll('.kanban-card.dragging').forEach(c => c.classList.remove('dragging'));
    document.querySelectorAll('.col-cards.drag-over').forEach(c => c.classList.remove('drag-over'));
  });

  board.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const col = e.target.closest('.col-cards');
    if (col) {
      document.querySelectorAll('.col-cards.drag-over').forEach(c => { if (c !== col) c.classList.remove('drag-over'); });
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
    try {
      await updatePacienteStatus(pacienteId, novoStatus);
      renderKanban(State.pacientes);
      toast(`Status atualizado para "${STATUS_LABEL[novoStatus]}"`, 'success');

      // 🎉 Confetti quando confirmado!
      if (novoStatus === 'confirmado') {
        launchConfetti();
      }
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
    }
  });
}

function setupKanbanCollapseCancel() {
  const toggle = document.getElementById('toggle-cancelado');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    toggle.closest('.kanban-col').classList.toggle('collapsed');
  });
}

// ── Confetti 🎉 ──

function launchConfetti() {
  const container = document.getElementById('kanban-board') || document.body;
  const colors = ['#00A86B', '#0066CC', '#F59E0B', '#EF4444', '#7C3AED', '#EC4899'];
  const count = 60;

  for (let i = 0; i < count; i++) {
    const confetto = document.createElement('div');
    confetto.className = 'confetti-piece';
    confetto.style.setProperty('--x', `${(Math.random() - 0.5) * 400}px`);
    confetto.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    confetto.style.left = `${40 + Math.random() * 20}%`;
    confetto.style.top = '40%';
    confetto.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetto.style.animationDelay = `${Math.random() * 0.3}s`;
    confetto.style.animationDuration = `${0.8 + Math.random() * 0.6}s`;
    container.appendChild(confetto);
    confetto.addEventListener('animationend', () => confetto.remove());
  }

  // Safety cleanup
  setTimeout(() => {
    container.querySelectorAll('.confetti-piece').forEach(el => el.remove());
  }, 2500);
}
