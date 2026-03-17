/**
 * dashboard.js — Dashboard redesenhado para secretária
 * Métricas com filtro de período, agenda timeline, conversas agrupadas
 */

import { State } from './config.js';
import { esc, fmtHora, fmtData, tempoDesde, iniciais, waLink, STATUS_LABEL, toast } from './utils.js';
import { fetchPacientes, fetchAgendamentos, fetchConversasRecentes, syncGcalToSupabase, updateAgendamentoField, sincronizarGcal } from './api.js';
import { openChatPanel } from './chat.js';

// ── Estado do filtro de período ──

let currentPeriod = 'hoje';
let customStart = null;
let customEnd = null;

/** Retorna { start: Date, end: Date } baseado no período selecionado */
function getPeriodRange() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  switch (currentPeriod) {
    case 'hoje':
      return { start: todayStart, end: todayEnd };
    case 'ontem': {
      const yStart = new Date(todayStart);
      yStart.setDate(yStart.getDate() - 1);
      return { start: yStart, end: todayStart };
    }
    case '7d': {
      const wStart = new Date(todayStart);
      wStart.setDate(wStart.getDate() - 7);
      return { start: wStart, end: todayEnd };
    }
    case 'mes': {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: mStart, end: todayEnd };
    }
    case 'custom':
      if (customStart && customEnd) {
        const cEnd = new Date(customEnd);
        cEnd.setDate(cEnd.getDate() + 1); // inclui o dia final
        return { start: new Date(customStart), end: cEnd };
      }
      return { start: todayStart, end: todayEnd };
    default:
      return { start: todayStart, end: todayEnd };
  }
}

/** Formata label do período para o header da agenda */
function getPeriodLabel() {
  const { start, end } = getPeriodRange();
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  switch (currentPeriod) {
    case 'hoje': return `${dias[start.getDay()]}, ${fmtData(start.toISOString())}`;
    case 'ontem': return `Ontem, ${fmtData(start.toISOString())}`;
    case '7d': return `Últimos 7 dias`;
    case 'mes': return `Mês atual`;
    case 'custom': return `${fmtData(start.toISOString())} — ${fmtData(new Date(end.getTime() - 86400000).toISOString())}`;
    default: return '';
  }
}

// ── Calendar Picker State ──

let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth();
let calPickStart = null;   // Date or null
let calPickEnd = null;     // Date or null
let calStep = 'start';     // 'start' | 'end'

function renderCalendar() {
  const daysEl = document.getElementById('cal-days');
  const labelEl = document.getElementById('cal-month-label');
  const rangeLabelEl = document.getElementById('cal-range-label');
  if (!daysEl || !labelEl) return;

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  labelEl.textContent = `${meses[calViewMonth]} ${calViewYear}`;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const firstDay = new Date(calViewYear, calViewMonth, 1);
  const startDow = firstDay.getDay(); // 0=Dom
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

  // Dias do mês anterior para preencher
  const prevMonthDays = new Date(calViewYear, calViewMonth, 0).getDate();

  let html = '';

  // Dias do mês anterior (cinza)
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    html += `<div class="cal-day cal-other" data-date="">${d}</div>`;
  }

  // Dias do mês atual
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calViewYear}-${String(calViewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dateObj = new Date(calViewYear, calViewMonth, d);

    let cls = 'cal-day';
    if (dateStr === todayStr) cls += ' cal-today';

    // Range highlighting
    if (calPickStart && calPickEnd) {
      const startT = calPickStart.getTime();
      const endT = calPickEnd.getTime();
      const curT = dateObj.getTime();
      if (curT === startT && curT === endT) cls += ' cal-start cal-end';
      else if (curT === startT) cls += ' cal-start';
      else if (curT === endT) cls += ' cal-end';
      else if (curT > startT && curT < endT) cls += ' cal-in-range';
    } else if (calPickStart && !calPickEnd) {
      if (dateObj.getTime() === calPickStart.getTime()) cls += ' cal-start cal-end';
    }

    html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
  }

  // Próximo mês para completar grid (até 42 cells = 6 semanas)
  const totalCells = startDow + daysInMonth;
  const remaining = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
  for (let d = 1; d <= remaining; d++) {
    html += `<div class="cal-day cal-other" data-date="">${d}</div>`;
  }

  daysEl.innerHTML = html;

  // Range label
  if (rangeLabelEl) {
    if (calPickStart && calPickEnd) {
      rangeLabelEl.textContent = `${fmtDateShort(calPickStart)} → ${fmtDateShort(calPickEnd)}`;
    } else if (calPickStart) {
      rangeLabelEl.textContent = `${fmtDateShort(calPickStart)} → selecione o fim`;
    } else {
      rangeLabelEl.textContent = 'Selecione a data inicial';
    }
  }

  // Botão confirmar — só habilita quando ambas as datas estão selecionadas
  const confirmBtn = document.getElementById('cal-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = !(calPickStart && calPickEnd);
  }

  // Click handler nos dias
  daysEl.querySelectorAll('.cal-day:not(.cal-other)').forEach(dayEl => {
    dayEl.addEventListener('click', () => {
      const ds = dayEl.dataset.date;
      if (!ds) return;
      const parts = ds.split('-');
      const clicked = new Date(+parts[0], +parts[1]-1, +parts[2]);

      if (calStep === 'start') {
        calPickStart = clicked;
        calPickEnd = null;
        calStep = 'end';
        renderCalendar();
      } else {
        // step = 'end'
        if (clicked < calPickStart) {
          // Se clicou antes do start, inverte
          calPickEnd = calPickStart;
          calPickStart = clicked;
        } else {
          calPickEnd = clicked;
        }
        calStep = 'start';
        renderCalendar();
        // NÃO fecha automaticamente — espera o botão "Confirmar"
      }
    });
  });
}

function fmtDateShort(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

function applyCalendarRange() {
  if (!calPickStart || !calPickEnd) return;
  customStart = `${calPickStart.getFullYear()}-${String(calPickStart.getMonth()+1).padStart(2,'0')}-${String(calPickStart.getDate()).padStart(2,'0')}`;
  customEnd = `${calPickEnd.getFullYear()}-${String(calPickEnd.getMonth()+1).padStart(2,'0')}-${String(calPickEnd.getDate()).padStart(2,'0')}`;
  currentPeriod = 'custom';
  const btns = document.querySelectorAll('.period-btn');
  btns.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-period="custom"]')?.classList.add('active');
  refreshDashboard();
  // Fecha o calendário após aplicar
  setTimeout(() => {
    document.getElementById('period-calendar-wrap')?.classList.add('hidden');
  }, 350);
}

// ── Init filtros ──

export function initDashboardFilters() {
  const btns = document.querySelectorAll('.period-btn');
  const calWrap = document.getElementById('period-calendar-wrap');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      if (period === 'custom') {
        calWrap?.classList.toggle('hidden');
        if (!calWrap?.classList.contains('hidden')) {
          // Reset to current month and render
          const now = new Date();
          calViewYear = now.getFullYear();
          calViewMonth = now.getMonth();
          renderCalendar();
        }
        return;
      }
      currentPeriod = period;
      calWrap?.classList.add('hidden');
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refreshDashboard();
    });
  });

  // Calendar navigation
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    calViewMonth--;
    if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    calViewMonth++;
    if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCalendar();
  });

  // Confirmar seleção de período
  document.getElementById('cal-confirm')?.addEventListener('click', () => {
    applyCalendarRange();
  });

  // Clear selection
  document.getElementById('cal-clear')?.addEventListener('click', () => {
    calPickStart = null;
    calPickEnd = null;
    calStep = 'start';
    renderCalendar();
  });

  // Close calendar on click outside
  // Usa mousedown em vez de click para evitar race condition com innerHTML re-render
  // (click dispara APÓS mouseup, mas nesse ponto o renderCalendar() já removeu o target do DOM)
  document.addEventListener('mousedown', (e) => {
    if (!calWrap || calWrap.classList.contains('hidden')) return;
    const customBtn = document.querySelector('[data-period="custom"]');
    if (calWrap.contains(e.target) || customBtn?.contains(e.target)) return;
    calWrap.classList.add('hidden');
  });

  // Botão novo agendamento na agenda do dashboard
  document.getElementById('btn-dash-novo-ag')?.addEventListener('click', async () => {
    const { openModalAgendamento } = await import('./agendamentos.js');
    openModalAgendamento(null);
  });

  // Botão limpar feed de conversas
  document.getElementById('btn-limpar-feed')?.addEventListener('click', () => {
    State.conversasRecentes = [];
    renderDashboardFeed();
    toast('Feed de conversas limpo', 'info', 2000);
  });

  // Botão sincronizar Google Calendar
  document.getElementById('btn-sync-gcal')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Sincronizando…';
    try {
      // Busca 60 dias: 30 passados + 30 futuros
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const end = new Date();
      end.setDate(end.getDate() + 30);
      const result = await syncGcalToSupabase(start.toISOString(), end.toISOString());
      const partes = [];
      if (result.criados > 0) partes.push(`${result.criados} novos`);
      if (result.atualizados > 0) partes.push(`${result.atualizados} atualizados`);
      if (result.removidos > 0) partes.push(`${result.removidos} removidos do GCal`);
      if (result.dupsLimpas > 0) partes.push(`${result.dupsLimpas} duplicatas limpas`);
      const msg = partes.length > 0
        ? `Sincronizado! ${partes.join(', ')}`
        : `Tudo sincronizado (${result.total} eventos no Google)`;
      renderDashboardMetrics();
      renderDashboardAgenda();
      toast(msg, 'success', 4000);
    } catch (err) {
      toast(`Erro ao sincronizar: ${err.message}`, 'error', 5000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;vertical-align:-2px;margin-right:3px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Sincronizar`;
    }
  });
}

// ── Load ──

let feedPollInterval = null;

/** Para o polling do feed (chamar ao sair do dashboard) */
export function stopDashboardPolling() {
  if (feedPollInterval) {
    clearInterval(feedPollInterval);
    feedPollInterval = null;
  }
}

export async function loadDashboard() {
  await Promise.all([fetchPacientes(), fetchAgendamentos(), fetchConversasRecentes()]);
  renderDashboardMetrics();
  renderDashboardAgenda();
  renderDashboardFeed();

  // Polling fallback: atualiza feed de conversas a cada 30s (com lock anti-overlap)
  stopDashboardPolling();
  let polling = false;
  feedPollInterval = setInterval(async () => {
    if (State.currentPage !== 'dashboard') {
      stopDashboardPolling();
      return;
    }
    if (polling) return; // Evita fetches sobrepostos
    polling = true;
    try {
      await fetchConversasRecentes();
      renderDashboardFeed();
    } catch (e) {
      console.warn('[Dashboard] Polling error:', e.message || e);
    } finally {
      polling = false;
    }
  }, 30000);
}

/** Re-render tudo com novo período (sem re-fetch, dados já em memória) */
function refreshDashboard() {
  renderDashboardMetrics();
  renderDashboardAgenda();
}

// ── Métricas ──

export function renderDashboardMetrics() {
  const { start, end } = getPeriodRange();
  const startT = start.getTime();
  const endT = end.getTime();

  // 1. Consultas no período (comparação por timestamp, timezone-safe)
  const agPeriodo = State.agendamentos.filter(a => {
    if (!a.data_hora || a.status === 'cancelado') return false;
    const t = new Date(a.data_hora).getTime();
    return t >= startT && t < endT;
  });
  setMetric('metric-hoje', agPeriodo.length);
  document.getElementById('metric-card-hoje')?.classList.toggle('metric-card-highlight', agPeriodo.length > 0);

  // Label dinâmico do card
  const labelEl = document.querySelector('#metric-card-hoje .metric-label');
  if (labelEl) {
    const labels = { hoje: 'Consultas Hoje', ontem: 'Consultas Ontem', '7d': 'Consultas (7d)', mes: 'Consultas (Mês)', custom: 'Consultas' };
    labelEl.textContent = labels[currentPeriod] || 'Consultas';
  }

  // 2. Taxa de Conversão — pacientes com ≥1 agendamento ativo (não-cancelado)
  const totalContatos = State.pacientes.length;
  const pacientesComAgendamento = new Set(
    State.agendamentos
      .filter(a => a.paciente_id && a.status !== 'cancelado')
      .map(a => a.paciente_id)
  );
  const convertidos = pacientesComAgendamento.size;
  const taxa = totalContatos > 0 ? Math.round((convertidos / totalContatos) * 100) : 0;
  setMetric('metric-conversao', taxa + '%');
  const subConv = document.getElementById('metric-conversao-sub');
  if (subConv) subConv.textContent = `${convertidos} de ${totalContatos} contatos`;

  // 3. Novos Contatos no período — qualquer paciente criado no range
  const novosNoPeriodo = State.pacientes.filter(p => {
    const t = new Date(p.created_at).getTime();
    return t >= startT && t < endT;
  }).length;
  setMetric('metric-novos', novosNoPeriodo);

  // Label dinâmico novos
  const novosLabel = document.querySelector('#metric-novos')?.closest('.metric-card')?.querySelector('.metric-label');
  if (novosLabel) {
    const labels = { hoje: 'Novos Hoje', ontem: 'Novos Ontem', '7d': 'Novos (7d)', mes: 'Novos (Mês)', custom: 'Novos Contatos' };
    novosLabel.textContent = labels[currentPeriod] || 'Novos Contatos';
  }

  // Badge sidebar (sempre total global)
  const novosCount = State.pacientes.filter(p => p.status === 'novo_contato').length;
  const badgeEl = document.getElementById('badge-novos');
  if (badgeEl) {
    badgeEl.textContent = novosCount;
    badgeEl.style.display = novosCount > 0 ? '' : 'none';
  }

  // Data label no header da agenda
  const dateLabel = document.getElementById('dash-date-label');
  if (dateLabel) dateLabel.textContent = getPeriodLabel();
}

function setMetric(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.classList.remove('skeleton');
}

// ── Agenda (Timeline) ──

export function renderDashboardAgenda() {
  const container = document.getElementById('dash-agenda-timeline');
  if (!container) return;
  const { start, end } = getPeriodRange();
  const startT = start.getTime();
  const endT = end.getTime();
  const now = new Date();

  // Título dinâmico
  const titleEl = document.querySelector('.dash-agenda-card .card-title');
  if (titleEl) {
    const svgIcon = titleEl.querySelector('svg')?.outerHTML || '';
    const titles = { hoje: 'Agenda de Hoje', ontem: 'Agenda de Ontem', '7d': 'Agenda (7 dias)', mes: 'Agenda do Mês', custom: 'Agenda' };
    titleEl.innerHTML = svgIcon + (titles[currentPeriod] || 'Agenda');
  }

  // Filtra, deduplica por google_event_id, e ordena
  const listaRaw = State.agendamentos
    .filter(a => {
      if (!a.data_hora || a.status === 'cancelado') return false;
      const t = new Date(a.data_hora).getTime();
      return t >= startT && t < endT;
    })
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  // Dedup: se dois agendamentos têm o mesmo google_event_id, mantém só o primeiro
  const vistos = new Set();
  const lista = listaRaw.filter(a => {
    if (a.google_event_id) {
      if (vistos.has(a.google_event_id)) return false;
      vistos.add(a.google_event_id);
    }
    return true;
  });

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="dash-agenda-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="width:40px;height:40px;margin-bottom:8px">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
        </svg>
        <p>Nenhuma consulta agendada${currentPeriod === 'hoje' ? ' para hoje' : ''}</p>
        <a href="#agendamentos" class="btn btn-outline btn-sm" style="margin-top:8px">Agendar consulta</a>
      </div>`;
    return;
  }

  container.innerHTML = lista.map(ag => {
    const hora = new Date(ag.data_hora);
    const passou = hora < now;
    const isConcluido = ag.status === 'concluido';

    let statusClass = 'timeline-pending';
    let statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

    if (isConcluido) {
      statusClass = 'timeline-done';
      statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary)" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (passou) {
      statusClass = 'timeline-late';
      statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }

    // Mostra data se período > 1 dia
    const showDate = currentPeriod !== 'hoje' && currentPeriod !== 'ontem';
    const datePrefix = showDate ? `<span class="timeline-date-tag">${fmtData(ag.data_hora)}</span>` : '';

    return `
      <div class="timeline-item ${statusClass}" data-paciente-id="${ag.paciente_id || ''}" data-ag-id="${ag.id}">
        <div class="timeline-time">${fmtHora(ag.data_hora)}${datePrefix}</div>
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
        <div class="timeline-actions">
          ${ag.status !== 'concluido' ? `<button class="tl-action-btn tl-action-done" data-ag-id="${ag.id}" title="Marcar como concluído">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
          </button>` : ''}
          ${ag.status !== 'cancelado' ? `<button class="tl-action-btn tl-action-cancel" data-ag-id="${ag.id}" title="Cancelar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>` : ''}
          <button class="tl-action-btn tl-action-edit" data-ag-id="${ag.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');

  // Click no item abre chat (exceto botões de ação)
  container.querySelectorAll('.timeline-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.tl-action-btn') || e.target.closest('.timeline-wa')) return;
      const paciente = State.pacientes.find(p => p.id === item.dataset.pacienteId);
      if (paciente) openChatPanel(paciente);
    });
  });

  // Ações rápidas: concluir
  container.querySelectorAll('.tl-action-done').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      quickUpdateAgStatus(btn.dataset.agId, 'concluido');
    });
  });

  // Ações rápidas: cancelar
  container.querySelectorAll('.tl-action-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Cancelar este agendamento?')) {
        quickUpdateAgStatus(btn.dataset.agId, 'cancelado');
      }
    });
  });

  // Ações rápidas: editar (abre modal de agendamentos)
  container.querySelectorAll('.tl-action-edit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ag = State.agendamentos.find(a => a.id === btn.dataset.agId);
      if (ag) {
        const { openModalAgendamento } = await import('./agendamentos.js');
        openModalAgendamento(ag);
      }
    });
  });
}

/** Atualiza status do agendamento via quick-action + sync GCal */
async function quickUpdateAgStatus(agId, novoStatus) {
  try {
    await updateAgendamentoField(agId, 'status', novoStatus);
    const ag = State.agendamentos.find(a => a.id === agId);
    if (ag) {
      // Sync GCal — await garante que GCal reflete antes de seguir
      const acao = novoStatus === 'cancelado' ? 'cancelar' : 'atualizar';
      await sincronizarGcal({
        acao,
        googleEventId: ag.google_event_id || null,
        nome: ag.nome_paciente,
        telefone: ag.telefone,
        dataHora: ag.data_hora,
        obs: ag.observacoes || '',
        status: novoStatus,
      });
    }
    renderDashboardAgenda();
    renderDashboardMetrics();
    toast(novoStatus === 'concluido' ? 'Consulta concluída ✓' : 'Agendamento cancelado', 'success', 2000);
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

// ── Feed de Conversas (agrupado por contato) ──

export function renderDashboardFeed() {
  const container = document.getElementById('feed-list');
  if (!container) return;

  const feed = (State.conversasRecentes || []).slice(0, 12);

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

  container.querySelectorAll('.conv-item').forEach(item => {
    item.addEventListener('click', () => {
      const paciente = State.pacientes.find(p => p.id === item.dataset.pacienteId);
      if (paciente) {
        openChatPanel(paciente);
      } else {
        const tel = (item.dataset.telefone || '').replace(/\D/g, '');
        if (tel.length >= 8) {
          const suffix = tel.slice(-8);
          const pacByTel = State.pacientes.find(p => {
            const pNums = (p.telefone || '').replace(/\D/g, '');
            return pNums.length >= 8 && pNums.endsWith(suffix);
          });
          if (pacByTel) openChatPanel(pacByTel);
        }
      }
    });
  });
}

// ── Aliases para compatibilidade com app.js ──

export function renderDashboardAgendamentos() {
  renderDashboardAgenda();
}
