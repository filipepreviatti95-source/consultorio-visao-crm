/**
 * agendamentos.js — Agenda semanal, filtro de datas, CSV, modal agendamento
 * v2 — botões de delete, ações rápidas, sync GCal, UX melhorada
 */

import { State } from './config.js';
import { esc, fmtData, fmtHora, STATUS_LABEL, STATUS_COLOR, toast } from './utils.js';
import { fetchAgendamentos, fetchPacientes, saveAgendamento, deleteAgendamento, updateAgendamentoField, sincronizarGcal, syncGcalToSupabase } from './api.js';
import { openModal, closeModal } from './ui.js';
import { renderDashboardAgendamentos, renderDashboardMetrics } from './dashboard.js';

export async function loadAgendamentos() {
  if (State.agendamentos.length === 0) await fetchAgendamentos();
  if (State.pacientes.length === 0) await fetchPacientes();
  setupAgendamentosNav();
  renderAgendamentos();
}

let agNavSetup = false;
function setupAgendamentosNav() {
  if (agNavSetup) return;
  agNavSetup = true;
  document.getElementById('btn-semana-anterior').onclick = () => { State.semanaOffset--; renderAgendamentos(); };
  document.getElementById('btn-semana-proxima').onclick  = () => { State.semanaOffset++; renderAgendamentos(); };
  document.getElementById('btn-novo-agendamento').onclick = () => openModalAgendamento(null);

  // Sync GCal button
  document.getElementById('btn-sync-gcal-ag')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const origHTML = btn.innerHTML;
    btn.textContent = 'Sincronizando…';
    try {
      const start = new Date(); start.setDate(start.getDate() - 30);
      const end = new Date(); end.setDate(end.getDate() + 60);
      const result = await syncGcalToSupabase(start.toISOString(), end.toISOString());
      const msg = result.criados > 0 || result.atualizados > 0
        ? `Sincronizado! ${result.criados} novos, ${result.atualizados} atualizados`
        : `Tudo sincronizado (${result.total} eventos)`;
      renderAgendamentos();
      toast(msg, 'success', 4000);
    } catch (err) {
      toast(`Erro ao sincronizar: ${err.message}`, 'error', 5000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHTML;
    }
  });
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

// ── Renderizar semana ──

export function renderAgendamentos() {
  const { inicio, fim } = getSemanaAtual();
  const container = document.getElementById('agendamentos-container');
  const labelEl   = document.getElementById('semana-label');
  if (!container || !labelEl) return;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  labelEl.textContent = State.semanaOffset === 0
    ? 'Esta semana'
    : `${fmtData(inicio)} – ${fmtData(fim)}`;

  const agSemana = State.agendamentos
    .filter(a => { const d = new Date(a.data_hora); return d >= inicio && d <= fim; })
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  const porDia = {};
  agSemana.forEach(ag => {
    const dia = new Date(ag.data_hora);
    dia.setHours(0, 0, 0, 0);
    const key = dia.toISOString();
    if (!porDia[key]) porDia[key] = { dia, ags: [] };
    porDia[key].ags.push(ag);
  });

  const html = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(inicio);
    dia.setDate(inicio.getDate() + i);
    dia.setHours(0, 0, 0, 0);
    const key    = dia.toISOString();
    const isHoje = dia.toDateString() === hoje.toDateString();
    const ags    = porDia[key]?.ags || [];

    const diaLabel = dia.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo',
    });

    html.push(`
      <div class="dia-group ${isHoje ? 'dia-hoje' : ''}">
        <div class="dia-label">${diaLabel}${isHoje ? ' — hoje' : ''} <span class="dia-count">(${ags.length})</span></div>
        ${ags.length === 0
          ? `<div style="padding:.3rem 0;color:var(--text-muted);font-size:.82rem">Nenhum agendamento</div>`
          : ags.map(ag => buildAgendamentoRow(ag)).join('')}
      </div>`);
  }

  container.innerHTML = html.join('');
  bindAgendamentoRowEvents(container);
}

function buildAgendamentoRow(ag) {
  const cor = STATUS_COLOR[ag.status] || '#0066CC';
  const isCancelado = ag.status === 'cancelado';
  const isConcluido = ag.status === 'concluido';

  return `
    <div class="agendamento-row ${isCancelado ? 'ag-row-cancelado' : ''}" data-id="${ag.id}">
      <div class="ag-status-bar" style="background:${cor}"></div>
      <div class="ag-hora">${fmtHora(ag.data_hora)}</div>
      <div class="ag-info">
        <div class="ag-name">${esc(ag.nome_paciente)}</div>
        <div class="ag-phone">${esc(ag.telefone)}</div>
        ${ag.observacoes ? `<div style="font-size:.75rem;color:var(--text-muted);margin-top:.15rem">${esc(ag.observacoes)}</div>` : ''}
      </div>
      <span class="status-pill ag-status-pill status-${ag.status}">${STATUS_LABEL[ag.status] || ag.status}</span>
      <div class="ag-actions">
        ${!isConcluido && !isCancelado ? `
        <button class="icon-btn ag-done-btn" data-id="${ag.id}" title="Marcar concluído">
          <svg viewBox="0 0 24 24" fill="none" stroke="#00A86B" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </button>` : ''}
        ${!isCancelado ? `
        <button class="icon-btn ag-cancel-btn" data-id="${ag.id}" title="Cancelar">
          <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>` : ''}
        <button class="icon-btn ag-edit-btn" data-id="${ag.id}" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn ag-delete-btn" data-id="${ag.id}" title="Excluir">
          <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
}

function bindAgendamentoRowEvents(container) {
  // Click na row → editar
  container.querySelectorAll('.agendamento-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return; // ignora cliques nos botões
      const ag = State.agendamentos.find(a => a.id === row.dataset.id);
      if (ag) openModalAgendamento(ag);
    });
  });

  // Botão concluir
  container.querySelectorAll('.ag-done-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      quickUpdateStatus(btn.dataset.id, 'concluido');
    });
  });

  // Botão cancelar
  container.querySelectorAll('.ag-cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Cancelar este agendamento?')) {
        quickUpdateStatus(btn.dataset.id, 'cancelado');
      }
    });
  });

  // Botão editar
  container.querySelectorAll('.ag-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ag = State.agendamentos.find(a => a.id === btn.dataset.id);
      if (ag) openModalAgendamento(ag);
    });
  });

  // Botão excluir
  container.querySelectorAll('.ag-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmarDeleteAgendamento(btn.dataset.id);
    });
  });
}

/** Quick update status + GCal sync (await pra garantir sincronia) */
async function quickUpdateStatus(agId, novoStatus) {
  try {
    await updateAgendamentoField(agId, 'status', novoStatus);
    const ag = State.agendamentos.find(a => a.id === agId);
    if (ag) {
      await sincronizarGcal({
        acao: novoStatus === 'cancelado' ? 'cancelar' : 'atualizar',
        googleEventId: ag.google_event_id || null,
        nome: ag.nome_paciente,
        telefone: ag.telefone,
        dataHora: ag.data_hora,
        obs: ag.observacoes || '',
        status: novoStatus,
      });
    }
    renderAgendamentos();
    renderDashboardMetrics();
    toast(novoStatus === 'concluido' ? 'Consulta concluída ✓' : 'Agendamento cancelado', 'success', 2000);
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

/** Confirmar e deletar agendamento */
function confirmarDeleteAgendamento(id) {
  const ag = State.agendamentos.find(a => a.id === id);
  if (!ag) return;

  openModal({
    title: 'Excluir Agendamento',
    body: `<p style="color:var(--text-secondary)">Tem certeza que deseja excluir o agendamento de <strong>${esc(ag.nome_paciente)}</strong> em <strong>${fmtData(ag.data_hora)} às ${fmtHora(ag.data_hora)}</strong>?<br>Esta ação não pode ser desfeita.</p>`,
    confirmText: 'Excluir',
    onConfirm: async () => {
      try {
        // Cancelar no GCal ANTES de deletar — com await pra garantir
        if (ag.google_event_id) {
          await sincronizarGcal({
            acao: 'cancelar',
            googleEventId: ag.google_event_id,
            nome: ag.nome_paciente,
            telefone: ag.telefone,
            dataHora: ag.data_hora,
            obs: ag.observacoes || '',
            status: 'cancelado',
          });
        }
        await deleteAgendamento(id);
        closeModal();
        toast('Agendamento excluído (GCal também)', 'success');
        renderAgendamentos();
        renderDashboardAgendamentos();
        renderDashboardMetrics();
      } catch (err) {
        toast(`Erro ao excluir: ${err.message}`, 'error');
      }
    },
  });

  // Botão vermelho
  setTimeout(() => {
    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) confirmBtn.className = 'btn btn-danger';
  }, 10);
}

// ── Modal Agendamento ──

export function openModalAgendamento(ag) {
  const isNovo = !ag;
  let dtLocal = '';
  if (ag?.data_hora) {
    const d = new Date(ag.data_hora);
    dtLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  const pacientesOptions = State.pacientes.map(p =>
    `<option value="${p.id}" data-telefone="${esc(p.telefone)}" data-nome="${esc(p.nome)}"
      ${ag?.paciente_id === p.id ? 'selected' : ''}>${esc(p.nome)} — ${esc(p.telefone)}</option>`
  ).join('');

  const body = `
    <div class="form-group">
      <label>Paciente</label>
      <select id="ma-paciente"><option value="">Selecione ou preencha manualmente…</option>${pacientesOptions}</select>
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
    onConfirm: () => handleSaveAgendamento(ag?.id, ag?.google_event_id),
  });

  setTimeout(() => {
    const sel = document.getElementById('ma-paciente');
    if (sel) {
      sel.addEventListener('change', () => {
        const opt = sel.selectedOptions[0];
        if (opt && opt.value) {
          document.getElementById('ma-nome').value     = opt.dataset.nome || '';
          document.getElementById('ma-telefone').value = opt.dataset.telefone || '';
        }
      });
    }
  }, 50);
}

async function handleSaveAgendamento(id, googleEventIdAtual) {
  const nome     = document.getElementById('ma-nome').value.trim();
  const telefone = document.getElementById('ma-telefone').value.trim();
  const dataHora = document.getElementById('ma-datahora').value;
  const status   = document.getElementById('ma-status').value;
  const obs      = document.getElementById('ma-obs').value.trim();
  const pacienteId = document.getElementById('ma-paciente').value || null;

  if (!nome || !telefone || !dataHora) {
    toast('Nome, telefone e data/hora são obrigatórios', 'warning');
    return;
  }

  const dataHoraISO = new Date(dataHora).toISOString();

  try {
    const savedData = await saveAgendamento(id, {
      nome_paciente: nome,
      telefone,
      data_hora: dataHoraISO,
      status,
      observacoes: obs || null,
      paciente_id: pacienteId,
      updated_at: new Date().toISOString(),
    });

    closeModal();
    toast(id ? 'Agendamento atualizado!' : 'Agendamento criado!', 'success');
    renderAgendamentos();
    renderDashboardAgendamentos();
    renderDashboardMetrics();

    // Sync Google Calendar (async, não bloqueia)
    const acaoGcal = status === 'cancelado' ? 'cancelar' : (id ? 'atualizar' : 'criar');
    sincronizarGcal({ acao: acaoGcal, googleEventId: googleEventIdAtual || null, nome, telefone, dataHora: dataHoraISO, obs, status })
      .then(gEventId => {
        if (gEventId && savedData?.id) {
          updateAgendamentoField(savedData.id, 'google_event_id', gEventId);
          toast('Sincronizado com Google Calendar ✓', 'success', 2000);
        } else if (!gEventId && acaoGcal === 'criar') {
          console.warn('[Agendamentos] GCal sync não retornou eventId');
        }
      });
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

// ── Filtro de Datas ──

export function filtrarAgendamentosPorData() {
  const dataIni = document.getElementById('filtro-data-inicio')?.value;
  const dataFim = document.getElementById('filtro-data-fim')?.value;
  if (!dataIni || !dataFim) { toast('Selecione as duas datas para filtrar', 'error'); return; }

  const inicio = new Date(dataIni + 'T00:00:00');
  const fim    = new Date(dataFim + 'T23:59:59');
  if (inicio > fim) { toast('Data inicial deve ser anterior à data final', 'error'); return; }

  const filtrados = State.agendamentos
    .filter(a => { const d = new Date(a.data_hora); return d >= inicio && d <= fim; })
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  const container = document.getElementById('agendamentos-container');
  document.getElementById('semana-label').textContent = `${fmtData(inicio)} – ${fmtData(fim)} (${filtrados.length} resultados)`;

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Nenhum agendamento no período selecionado</div>';
    return;
  }

  const porDia = {};
  filtrados.forEach(ag => {
    const dia = new Date(ag.data_hora); dia.setHours(0, 0, 0, 0);
    const key = dia.toISOString();
    if (!porDia[key]) porDia[key] = { dia, ags: [] };
    porDia[key].ags.push(ag);
  });

  container.innerHTML = Object.values(porDia).map(({ dia, ags }) => {
    const diaLabel = dia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo' });
    return `<div class="dia-group"><div class="dia-label">${diaLabel}</div>${ags.map(ag => buildAgendamentoRow(ag)).join('')}</div>`;
  }).join('');

  bindAgendamentoRowEvents(container);
}

// ── Exportar CSV ──

export function exportarAgendamentosCSV() {
  const labelEl = document.getElementById('semana-label');
  let agExport;

  if (labelEl.textContent.includes('resultados')) {
    const dataIni = document.getElementById('filtro-data-inicio')?.value;
    const dataFim = document.getElementById('filtro-data-fim')?.value;
    if (dataIni && dataFim) {
      const inicio = new Date(dataIni + 'T00:00:00');
      const fim    = new Date(dataFim + 'T23:59:59');
      agExport = State.agendamentos.filter(a => { const d = new Date(a.data_hora); return d >= inicio && d <= fim; });
    } else {
      agExport = State.agendamentos;
    }
  } else {
    const { inicio, fim } = getSemanaAtual();
    agExport = State.agendamentos.filter(a => { const d = new Date(a.data_hora); return d >= inicio && d <= fim; });
  }

  agExport.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
  if (agExport.length === 0) { toast('Nenhum agendamento para exportar', 'error'); return; }

  const headers = ['Data', 'Hora', 'Paciente', 'Telefone', 'Status', 'Observacoes'];
  const rows = agExport.map(ag => [
    fmtData(ag.data_hora), fmtHora(ag.data_hora),
    (ag.nome_paciente || '').replace(/"/g, '""'),
    (ag.telefone || '').replace(/"/g, '""'),
    ag.status || '',
    (ag.observacoes || '').replace(/"/g, '""').replace(/\n/g, ' '),
  ]);

  const csvContent = [headers.join(';'), ...rows.map(r => r.map(c => `"${c}"`).join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `agendamentos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado com sucesso!', 'success');
}
