/**
 * pacientes.js — Tabela de pacientes + modal criar/editar/excluir
 */

import { State, isAdmin } from './config.js';
import { esc, fmtData, waLink, STATUS_LABEL, toast } from './utils.js';
import { fetchPacientes, savePaciente, deletePaciente } from './api.js';
import { openModal, closeModal } from './ui.js';
import { openChatPanel } from './chat.js';
import { renderKanban } from './kanban.js';
import { renderDashboardMetrics } from './dashboard.js';

export async function loadPacientes() {
  if (State.pacientes.length === 0) await fetchPacientes();
  renderPacientesTable(State.pacientes);
  setupPacientesFilters();
}

// ── Filtros ──

let pacFilterSetup = false;
function setupPacientesFilters() {
  if (pacFilterSetup) return;
  const searchInput  = document.getElementById('pacientes-search');
  const statusFilter = document.getElementById('pacientes-filter-status');
  if (!searchInput || !statusFilter) return;
  pacFilterSetup = true;

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

// ── Tabela ──

export function renderPacientesTable(pacientes) {
  const tbody   = document.getElementById('pacientes-tbody');
  const emptyEl = document.getElementById('pacientes-empty');
  if (!tbody || !emptyEl) return;

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
        <a href="${waLink(p.telefone)}" target="_blank" style="color:var(--color-primary)">${esc(p.telefone)}</a>
      </td>
      <td><span class="status-pill status-${p.status}">${STATUS_LABEL[p.status] || p.status}</span></td>
      <td>${fmtData(p.created_at)}</td>
      <td class="td-actions">
        <button class="btn btn-outline btn-sm btn-chat-paciente" data-id="${p.id}" title="Ver conversa">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        ${isAdmin() ? `<button class="btn btn-outline btn-sm btn-edit-paciente" data-id="${p.id}" title="Editar">
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
        </button>` : ''}
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

// ── Modal Criar/Editar ──

export function openModalPaciente(paciente) {
  const isNovo = !paciente;
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
    title: isNovo ? 'Novo Paciente' : 'Editar Paciente',
    body,
    confirmText: isNovo ? 'Criar Paciente' : 'Salvar Alterações',
    onConfirm: () => handleSavePaciente(paciente?.id),
  });
}

async function handleSavePaciente(id) {
  const nome     = document.getElementById('mf-nome').value.trim();
  const telefone = document.getElementById('mf-telefone').value.trim();
  const email    = document.getElementById('mf-email').value.trim();
  const nasc     = document.getElementById('mf-nasc').value;
  const status   = document.getElementById('mf-status').value;
  const obs      = document.getElementById('mf-obs').value.trim();

  if (!nome || !telefone) { toast('Nome e telefone são obrigatórios', 'warning'); return; }

  try {
    await savePaciente(id, {
      nome, telefone, status,
      email: email || null,
      data_nascimento: nasc || null,
      observacoes: obs || null,
      updated_at: new Date().toISOString(),
    });
    closeModal();
    toast(id ? 'Paciente atualizado!' : 'Paciente criado!', 'success');
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

// ── Excluir ──

function confirmarDeletePaciente(id) {
  const paciente = State.pacientes.find(p => p.id === id);
  if (!paciente) return;

  openModal({
    title: 'Excluir Paciente',
    body: `<p style="color:var(--text-secondary)">Tem certeza que deseja excluir <strong>${esc(paciente.nome)}</strong>?<br>Esta ação não pode ser desfeita.</p>`,
    confirmText: 'Excluir',
    onConfirm: async () => {
      try {
        await deletePaciente(id);
        closeModal();
        toast('Paciente excluído', 'info');
        if (State.currentPage === 'kanban')    renderKanban(State.pacientes);
        if (State.currentPage === 'pacientes') renderPacientesTable(State.pacientes);
      } catch (err) {
        toast(`Erro ao excluir: ${err.message}`, 'error');
      }
    },
  });

  setTimeout(() => {
    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) confirmBtn.className = 'btn btn-danger';
  }, 10);
}

// ── Botões "Novo Paciente" ──

let novoPacBtnsSetup = false;

export function setupNovoPacienteBtns() {
  if (novoPacBtnsSetup) return;
  novoPacBtnsSetup = true;

  document.getElementById('btn-novo-paciente')?.addEventListener('click', () => openModalPaciente(null));
  document.getElementById('btn-novo-paciente-2')?.addEventListener('click', () => openModalPaciente(null));
}
