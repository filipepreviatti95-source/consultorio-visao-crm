/**
 * dashboard.js — Métricas, gráfico de barras, feed, "atender hoje"
 */

import { State } from './config.js';
import { esc, fmtData, fmtHora, tempoDesde, iniciais, STATUS_LABEL } from './utils.js';
import { fetchPacientes, fetchAgendamentos, fetchConversasRecentes } from './api.js';
import { openChatPanel } from './chat.js';

export async function loadDashboard() {
  await Promise.all([fetchPacientes(), fetchAgendamentos(), fetchConversasRecentes()]);
  renderDashboardMetrics();
  renderDashboardBarChart();
  renderAtenderHoje();
  renderDashboardAgendamentos();
  renderDashboardFeed();
}

// ── Métricas ──

export function renderDashboardMetrics() {
  const hoje    = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);

  setMetric('metric-total', State.pacientes.length);

  const agHoje = State.agendamentos.filter(a =>
    a.data_hora && a.data_hora.slice(0, 10) === hojeStr && a.status !== 'cancelado'
  );
  setMetric('metric-hoje', agHoje.length);
  document.getElementById('metric-card-hoje')?.classList.toggle('metric-card-highlight', agHoje.length > 0);

  const naoAtendidos = agHoje.filter(a => {
    const d = new Date(a.data_hora);
    return d < hoje && (a.status === 'agendado' || a.status === 'confirmado');
  }).length;
  setMetric('metric-nao-atendidos', naoAtendidos);

  const seteDiasAtras = new Date(hoje);
  seteDiasAtras.setDate(hoje.getDate() - 7);
  setMetric('metric-novos', State.pacientes.filter(p =>
    p.status === 'novo_contato' && new Date(p.created_at) >= seteDiasAtras
  ).length);

  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay());
  inicioSemana.setHours(0, 0, 0, 0);
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 6);
  fimSemana.setHours(23, 59, 59, 999);

  setMetric('metric-confirmados', State.agendamentos.filter(a => {
    const d = new Date(a.data_hora);
    return a.status === 'confirmado' && d >= inicioSemana && d <= fimSemana;
  }).length);

  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  setMetric('metric-concluidos', State.agendamentos.filter(a => {
    const d = new Date(a.data_hora);
    return a.status === 'concluido' && d >= inicioMes;
  }).length);

  setMetric('metric-cancelados', State.agendamentos.filter(a => {
    const d = new Date(a.data_hora);
    return a.status === 'cancelado' && d >= inicioSemana && d <= fimSemana;
  }).length);

  const novosCount = State.pacientes.filter(p => p.status === 'novo_contato').length;
  const badgeEl = document.getElementById('badge-novos');
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

// ── Gráfico de barras ──

function renderDashboardBarChart() {
  const chart = document.getElementById('bar-chart');
  const dias = [];
  const hoje = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    dias.push(d);
  }

  const counts = dias.map(dia => {
    const str = dia.toISOString().slice(0, 10);
    return State.agendamentos.filter(a =>
      a.data_hora && a.data_hora.slice(0, 10) === str && a.status !== 'cancelado'
    ).length;
  });

  const max = Math.max(...counts, 1);
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  chart.innerHTML = dias.map((dia, i) => {
    const pct    = Math.round((counts[i] / max) * 100);
    const isHoje = dia.toDateString() === hoje.toDateString();
    const label  = isHoje ? 'Hoje' : diasSemana[dia.getDay()];
    return `
      <div class="bar-group">
        <div class="bar-fill-wrap">
          <div class="bar-fill" data-value="${counts[i]}"
               style="height:${pct}%;background:${isHoje ? '#00A86B' : 'var(--color-primary)'}">
          </div>
        </div>
        <div class="bar-label">${label}</div>
      </div>`;
  }).join('');
}

// ── Para atender hoje ──

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

// ── Próximos agendamentos ──

export function renderDashboardAgendamentos() {
  const container = document.getElementById('upcoming-list');
  const hoje      = new Date();
  const amanha    = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  amanha.setHours(23, 59, 59, 999);

  const proximos = State.agendamentos
    .filter(a => {
      const d = new Date(a.data_hora);
      return d >= hoje && d <= amanha && a.status !== 'cancelado';
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

// ── Feed de conversas ──

export function renderDashboardFeed() {
  const container = document.getElementById('feed-list');
  const feed = (State.conversasRecentes || []).slice(0, 12);

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
