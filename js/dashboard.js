/**
 * dashboard.js — Dashboard redesenhado para secretária
 * Métricas: Consultas Hoje, Bot Hoje, Conversão, Novos 7d
 * Agenda do dia estilo timeline
 * Conversas agrupadas por contato (1 linha por número)
 */

import { State } from './config.js';
import { esc, fmtHora, fmtData, tempoDesde, iniciais, waLink, STATUS_LABEL } from './utils.js';
import { fetchPacientes, fetchAgendamentos, fetchConversasRecentes, fetchBotStats } from './api.js';
import { openChatPanel } from './chat.js';

// ── Load ──

export async function loadDashboard() {
  await Promise.all([fetchPacientes(), fetchAgendamentos(), fetchConversasRecentes()]);
  renderDashboardMetrics();
  renderDashboardAgenda();
  renderDashboardFeed();

  // Bot stats async (não bloqueia render)
  fetchBotStats().then(stats => renderBotMetric(stats)).catch(() => {});
}

// ── Métricas ──

export function renderDashboardMetrics() {
  const hoje    = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);

  // 1. Consultas Hoje
  const agHoje = State.agendamentos.filter(a =>
    a.data_hora && a.data_hora.slice(0, 10) === hojeStr && a.status !== 'cancelado'
  );
  setMetric('metric-hoje', agHoje.length);
  document.getElementById('metric-card-hoje')?.classList.toggle('metric-card-highlight', agHoje.length > 0);

  // 2. Taxa de Conversão (contatos que viraram agendamento)
  const totalContatos = State.pacientes.length;
  const convertidos = State.pacientes.filter(p =>
    p.status !== 'novo_contato' && p.status !== 'cancelado'
  ).length;
  const taxa = totalContatos > 0 ? Math.round((convertidos / totalContatos) * 100) : 0;
  setMetric('metric-conversao', taxa + '%');
  const subConv = document.getElementById('metric-conversao-sub');
  if (subConv) subConv.textContent = `${convertidos} de ${totalContatos} contatos`;

  // 3. Novos Contatos (7d)
  const seteDiasAtras = new Date(hoje);
  seteDiasAtras.setDate(hoje.getDate() - 7);
  setMetric('metric-novos', State.pacientes.filter(p =>
    p.status === 'novo_contato' && new Date(p.created_at) >= seteDiasAtras
  ).length);

  // Badge sidebar
  const novosCount = State.pacientes.filter(p => p.status === 'novo_contato').length;
  const badgeEl = document.getElementById('badge-novos');
  if (badgeEl) {
    badgeEl.textContent = novosCount;
    badgeEl.style.display = novosCount > 0 ? '' : 'none';
  }

  // Data de hoje no header da agenda
  const dateLabel = document.getElementById('dash-date-label');
  if (dateLabel) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    dateLabel.textContent = `${dias[hoje.getDay()]}, ${fmtData(hoje.toISOString())}`;
  }
}

function renderBotMetric(stats) {
  setMetric('metric-bot', stats.pacientesAtendidos);
  const sub = document.getElementById('metric-bot-sub');
  if (sub) sub.textContent = `${stats.mensagensHoje} msgs enviadas`;
}

function setMetric(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.classList.remove('skeleton');
}

// ── Agenda do Dia (Timeline) ──

export function renderDashboardAgenda() {
  const container = document.getElementById('dash-agenda-timeline');
  if (!container) return;
  const hoje    = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);

  const lista = State.agendamentos
    .filter(a => a.data_hora && a.data_hora.slice(0, 10) === hojeStr && a.status !== 'cancelado')
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="dash-agenda-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="width:40px;height:40px;margin-bottom:8px">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
        </svg>
        <p>Nenhuma consulta agendada para hoje</p>
        <a href="#agendamentos" class="btn btn-outline btn-sm" style="margin-top:8px">Agendar consulta</a>
      </div>`;
    return;
  }

  container.innerHTML = lista.map(ag => {
    const hora = new Date(ag.data_hora);
    const passou = hora < hoje;
    const isConcluido = ag.status === 'concluido';

    // Status visual
    let statusClass = 'timeline-pending';
    let statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#0066CC" stroke-width="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

    if (isConcluido) {
      statusClass = 'timeline-done';
      statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#00A86B" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (passou) {
      statusClass = 'timeline-late';
      statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }

    return `
      <div class="timeline-item ${statusClass}" data-paciente-id="${ag.paciente_id || ''}" data-ag-id="${ag.id}">
        <div class="timeline-time">${fmtHora(ag.data_hora)}</div>
        <div class="timeline-dot">${statusIcon}</div>
        <div class="timeline-content">
          <div class="timeline-name">${esc(ag.nome_paciente)}</div>
          <div class="timeline-phone">
            <a href="${waLink(ag.telefone)}" target="_blank" class="timeline-wa" title="WhatsApp" onclick="event.stopPropagation()">
              <svg viewBox="0 0 24 24" fill="#25D366" stroke="none" width="13" height="13"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.128.558 4.122 1.532 5.852L0 24l6.293-1.647C8.066 23.418 9.996 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.912 0-3.692-.526-5.205-1.437l-.374-.222-3.866 1.012 1.029-3.764-.243-.386A9.922 9.922 0 0 1 2 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/></svg>
              ${esc(ag.telefone)}
            </a>
          </div>
          ${ag.observacoes ? `<div class="timeline-obs">${esc(ag.observacoes)}</div>` : ''}
        </div>
        <div class="timeline-status">
          <span class="status-pill status-${ag.status}">${STATUS_LABEL[ag.status] || ag.status}</span>
        </div>
      </div>`;
  }).join('');

  // Click abre chat
  container.querySelectorAll('.timeline-item').forEach(item => {
    item.addEventListener('click', () => {
      const paciente = State.pacientes.find(p => p.id === item.dataset.pacienteId);
      if (paciente) openChatPanel(paciente);
    });
  });
}

// ── Feed de Conversas (agrupado por contato) ──

export function renderDashboardFeed() {
  const container = document.getElementById('feed-list');
  if (!container) return;

  // conversasRecentes já vem agrupada (1 por paciente), mas vamos garantir
  const feed = (State.conversasRecentes || []).slice(0, 15);

  if (feed.length === 0) {
    container.innerHTML = `
      <div class="dash-agenda-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="width:40px;height:40px;margin-bottom:8px">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>Nenhuma conversa recente</p>
      </div>`;
    return;
  }

  container.innerHTML = feed.map(conv => {
    const nome = conv.pacientes?.nome || conv.telefone || '—';
    const telefone = conv.pacientes?.telefone || conv.telefone || '';

    // Conta msgs não lidas? Simplificado: mostra última msg
    return `
      <div class="conv-item" data-paciente-id="${conv.paciente_id || ''}" data-telefone="${esc(telefone)}">
        <div class="conv-avatar">${iniciais(nome)}</div>
        <div class="conv-info">
          <div class="conv-header">
            <span class="conv-name">${esc(nome)}</span>
            <span class="conv-time">${tempoDesde(conv.created_at)}</span>
          </div>
          <div class="conv-last-msg">${esc(conv.mensagem)}</div>
        </div>
        <div class="conv-actions">
          <a href="${waLink(telefone)}" target="_blank" class="conv-wa-btn" title="Abrir WhatsApp" onclick="event.stopPropagation()">
            <svg viewBox="0 0 24 24" fill="#25D366" stroke="none" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.128.558 4.122 1.532 5.852L0 24l6.293-1.647C8.066 23.418 9.996 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.912 0-3.692-.526-5.205-1.437l-.374-.222-3.866 1.012 1.029-3.764-.243-.386A9.922 9.922 0 0 1 2 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/></svg>
          </a>
        </div>
      </div>`;
  }).join('');

  // Click abre chat panel
  container.querySelectorAll('.conv-item').forEach(item => {
    item.addEventListener('click', () => {
      const paciente = State.pacientes.find(p => p.id === item.dataset.pacienteId);
      if (paciente) {
        openChatPanel(paciente);
      } else {
        // Se não encontrar por ID, tenta pelo telefone
        const tel = item.dataset.telefone;
        const pacByTel = State.pacientes.find(p => p.telefone && p.telefone.includes(tel.replace(/\D/g, '').slice(-8)));
        if (pacByTel) openChatPanel(pacByTel);
      }
    });
  });
}

// ── Aliases para compatibilidade com app.js ──

export function renderDashboardAgendamentos() {
  renderDashboardAgenda();
}
