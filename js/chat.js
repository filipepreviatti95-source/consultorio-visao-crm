/**
 * chat.js — Painel de chat WhatsApp
 */

import { State } from './config.js';
import { iniciais, waLink, esc, fmtData, tempoDesde, toast } from './utils.js';
import {
  fetchConversasPaciente, insertConversa, sendWhatsApp, deleteConversasPaciente, deleteConversa,
  pauseFollowUps, resumeFollowUps, agendarMensagem, fetchMensagensAgendadas, cancelarMensagemAgendada,
  toggleBotPaciente,
} from './api.js';
import { openModal, closeModal } from './ui.js';

let chatInitDone = false;

export function initChatPanel() {
  if (chatInitDone) return;
  const closeEl  = document.getElementById('chat-close');
  const overlayEl = document.getElementById('chat-overlay');
  const sendBtn  = document.getElementById('chat-send');
  const input    = document.getElementById('chat-input');
  if (!closeEl || !overlayEl || !sendBtn || !input) return;
  chatInitDone = true;

  closeEl.addEventListener('click', closeChatPanel);
  overlayEl.addEventListener('click', closeChatPanel);

  // Botão Limpar Histórico
  const deleteBtn = document.getElementById('chat-delete-history');
  if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteHistory);

  // Botão Pausar/Reativar Follow-ups
  const followupBtn = document.getElementById('chat-pause-followup');
  if (followupBtn) followupBtn.addEventListener('click', handleToggleFollowUp);

  // Botão Agendar Mensagem
  const scheduleBtn = document.getElementById('chat-schedule-followup');
  if (scheduleBtn) scheduleBtn.addEventListener('click', handleScheduleFollowUp);

  // Botão Pausar/Reativar Bot (por paciente)
  const botPauseBtn = document.getElementById('chat-pause-bot');
  if (botPauseBtn) botPauseBtn.addEventListener('click', handleToggleBotPaciente);

  // Clique fora do modal (no padding do chat-panel) também fecha
  const panelEl = document.getElementById('chat-panel');
  if (panelEl) {
    panelEl.addEventListener('click', (e) => {
      if (e.target === panelEl) closeChatPanel();
    });
  }

  sendBtn.addEventListener('click', sendChatMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
}

export async function openChatPanel(paciente) {
  State.currentChatPaciente = paciente;

  document.getElementById('chat-avatar').textContent        = iniciais(paciente.nome);
  document.getElementById('chat-patient-name').textContent  = paciente.nome;
  document.getElementById('chat-patient-phone').textContent = paciente.telefone;
  document.getElementById('chat-wa-link').href              = waLink(paciente.telefone);

  const statusBar = document.getElementById('chat-status-bar');
  if (statusBar) statusBar.innerHTML = `
    <span class="status-pill status-${esc(paciente.status)}">${esc(paciente.status)}</span>
    <span style="font-size:.72rem">Desde ${esc(fmtData(paciente.created_at))}</span>`;

  // Atualiza visual do botão de follow-up (pausado ou ativo)
  updateFollowUpButton(paciente);

  // Atualiza visual do botão de pausar bot (por paciente)
  updateBotPauseButton(paciente);

  const msgContainer = document.getElementById('chat-messages');
  msgContainer.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:.8rem">Carregando…</div>';

  document.getElementById('chat-panel').classList.add('open');
  document.getElementById('chat-overlay').style.display = 'block';
  // Foco no input após abertura
  setTimeout(() => document.getElementById('chat-input')?.focus(), 350);

  try {
    const msgs = await fetchConversasPaciente(paciente.id, paciente.telefone);
    State.conversas = msgs;
    renderChatMessages(msgs);
  } catch (err) {
    console.error('[Chat] Erro ao carregar conversas:', err);
    const msgContainer = document.getElementById('chat-messages');
    msgContainer.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--color-danger);font-size:.8rem">Erro ao carregar conversas</div>';
  }
}

export function closeChatPanel() {
  document.getElementById('chat-panel').classList.remove('open');
  document.getElementById('chat-overlay').style.display = '';
  State.currentChatPaciente = null;
}

// v6.7: Renderiza conteúdo da mensagem baseado no tipo de mídia
function renderMsgContent(msg) {
  const tipo = msg.tipo_midia || 'texto';

  if (tipo === 'audio') {
    const transcricao = msg.transcricao
      ? `<div class="msg-transcription">${esc(msg.transcricao)}</div>`
      : '<div class="msg-transcription msg-processing">Processando áudio...</div>';
    return `<div class="msg-media-content"><span class="msg-audio-badge">🎵 Áudio</span>${transcricao}</div>`;
  }

  if (tipo === 'imagem') {
    const img = msg.media_url
      ? `<img class="msg-image" src="${esc(msg.media_url)}" alt="Imagem do paciente" loading="lazy" onclick="window.open('${esc(msg.media_url)}','_blank')" />`
      : '<div class="msg-processing">Processando imagem...</div>';
    const desc = msg.transcricao
      ? `<div class="msg-image-desc">${esc(msg.transcricao)}</div>`
      : '';
    return `<div class="msg-media-content">${img}${desc}</div>`;
  }

  // texto normal (default)
  return esc(msg.mensagem);
}

export function renderChatMessages(msgs) {
  const container = document.getElementById('chat-messages');

  if (!msgs || msgs.length === 0) {
    container.innerHTML = `
      <div class="chat-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>Nenhuma conversa ainda</p>
      </div>`;
    return;
  }

  container.innerHTML = msgs.map(msg => {
    const fromMe    = msg.remetente !== 'paciente';
    const wrapClass = fromMe ? 'from-me' + (msg.remetente === 'humano' ? ' from-humano' : '') : 'from-other';
    const label     = msg.remetente === 'assistente' ? 'Assistente' : msg.remetente === 'humano' ? 'Equipe' : 'Paciente';
    return `
      <div class="msg-bubble-wrap ${wrapClass}" data-msg-id="${msg.id}">
        <div class="msg-sender-label">${fromMe ? label : 'Paciente'}</div>
        <div class="msg-bubble-row">
          <div class="msg-bubble">${renderMsgContent(msg)}</div>
          <button class="btn-delete-msg" title="Apagar mensagem" data-msg-id="${msg.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
        <div class="msg-time">${tempoDesde(msg.created_at)}</div>
      </div>`;
  }).join('');

  // Bind delete buttons
  container.querySelectorAll('.btn-delete-msg').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteSingleMsg(btn.dataset.msgId);
    });
  });

  container.scrollTop = container.scrollHeight;
}

async function handleDeleteHistory() {
  const paciente = State.currentChatPaciente;
  if (!paciente) return;

  const confirmou = confirm(`Tem certeza que deseja apagar todo o histórico de conversa com ${paciente.nome}?\n\nIsso vai apagar todas as mensagens (paciente, bot e equipe). Essa ação não pode ser desfeita.`);
  if (!confirmou) return;

  const btn = document.getElementById('chat-delete-history');
  if (btn) btn.disabled = true;

  try {
    await deleteConversasPaciente(paciente.id, paciente.telefone);
    State.conversas = [];
    renderChatMessages([]);
    toast('Histórico apagado com sucesso', 'success', 3000);
  } catch (err) {
    console.error('[Chat] Erro ao deletar histórico:', err);
    toast(`Erro ao apagar: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleDeleteSingleMsg(msgId) {
  if (!msgId) return;
  if (!confirm('Apagar esta mensagem do CRM?')) return;

  try {
    await deleteConversa(msgId);
    // Remove do State local e re-renderiza
    State.conversas = State.conversas.filter(m => m.id !== msgId);
    renderChatMessages(State.conversas);
    toast('Mensagem apagada', 'info', 2000);
  } catch (err) {
    console.error('[Chat] Erro ao deletar mensagem:', err);
    toast(`Erro: ${err.message}`, 'error');
  }
}

// ── Follow-up Management ──

function isFollowUpPaused(paciente) {
  return paciente && paciente.follow_ups_enviados >= 3;
}

function updateFollowUpButton(paciente) {
  const btn = document.getElementById('chat-pause-followup');
  if (!btn) return;
  const paused = isFollowUpPaused(paciente);
  btn.classList.toggle('is-paused', paused);
  btn.title = paused ? 'Follow-ups pausados — clique para reativar' : 'Pausar follow-ups automáticos';
  btn.innerHTML = paused
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
}

async function handleToggleFollowUp() {
  const paciente = State.currentChatPaciente;
  if (!paciente) return;

  const paused = isFollowUpPaused(paciente);
  const acao = paused ? 'reativar' : 'pausar';
  const msg = paused
    ? `Reativar follow-ups automáticos para ${paciente.nome}?\n\nO paciente voltará a receber mensagens de acompanhamento.`
    : `Pausar TODOS os follow-ups automáticos para ${paciente.nome}?\n\nNenhuma mensagem automática será enviada (vácuo 3h, reengajamento, lembrete).`;

  if (!confirm(msg)) return;

  const btn = document.getElementById('chat-pause-followup');
  if (btn) btn.disabled = true;

  try {
    let updated;
    if (paused) {
      updated = await resumeFollowUps(paciente.id);
    } else {
      updated = await pauseFollowUps(paciente.id);
    }
    // Atualiza referência local
    Object.assign(paciente, updated);
    State.currentChatPaciente = paciente;
    updateFollowUpButton(paciente);
    toast(paused ? 'Follow-ups reativados' : 'Follow-ups pausados', 'success', 3000);
  } catch (err) {
    console.error('[Chat] Erro ao alterar follow-up:', err);
    toast(`Erro: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleScheduleFollowUp() {
  const paciente = State.currentChatPaciente;
  if (!paciente) return;

  // Carregar mensagens agendadas pendentes
  let pendentes = [];
  try {
    pendentes = await fetchMensagensAgendadas(paciente.id);
  } catch { /* ignora */ }

  const listaPendentes = pendentes.length > 0
    ? `<div class="scheduled-list">
        <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:.5rem">Mensagens agendadas:</p>
        ${pendentes.map(m => `
          <div class="scheduled-item" data-id="${m.id}">
            <div class="scheduled-info">
              <span class="scheduled-date">${new Date(m.enviar_em).toLocaleDateString('pt-BR')} ${new Date(m.enviar_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span class="scheduled-msg">${esc(m.mensagem.length > 60 ? m.mensagem.slice(0, 60) + '...' : m.mensagem)}</span>
            </div>
            <button class="btn-cancel-scheduled" title="Cancelar" data-msg-id="${m.id}">&times;</button>
          </div>
        `).join('')}
      </div>`
    : '';

  // Data mínima = hoje (workflow roda a cada hora)
  const minDate = new Date().toISOString().slice(0, 10);

  const body = `
    ${listaPendentes}
    <div class="form-group" style="margin-top:.75rem">
      <label>Data de envio *</label>
      <input type="date" id="sched-date" min="${minDate}" required />
    </div>
    <div class="form-group">
      <label>Horário</label>
      <input type="time" id="sched-time" value="10:00" />
    </div>
    <div class="form-group">
      <label>Mensagem *</label>
      <textarea id="sched-msg" rows="3" placeholder="Ex: Oi ${(paciente.nome || '').split(' ')[0]}! Lembra que ficou de retornar? Temos horários disponíveis..." style="width:100%;resize:vertical;font-family:inherit;font-size:.85rem;padding:.5rem;border:1px solid var(--border);border-radius:var(--radius-sm)"></textarea>
    </div>`;

  openModal({
    title: `Agendar mensagem — ${paciente.nome}`,
    body,
    confirmText: 'Agendar',
    onConfirm: async () => {
      const dateVal = document.getElementById('sched-date')?.value;
      const timeVal = document.getElementById('sched-time')?.value || '10:00';
      const msgVal  = document.getElementById('sched-msg')?.value?.trim();

      if (!dateVal) { toast('Selecione uma data', 'error'); return; }
      if (!msgVal) { toast('Escreva a mensagem', 'error'); return; }

      // Monta datetime no fuso de SP (UTC-3)
      const enviarEm = `${dateVal}T${timeVal}:00-03:00`;

      await agendarMensagem({
        telefone: paciente.telefone,
        nome: paciente.nome,
        mensagem: msgVal,
        enviarEm,
        pacienteId: paciente.id,
      });

      closeModal();
      toast('Mensagem agendada com sucesso!', 'success', 3000);
    },
  });

  // Bind cancelar mensagens pendentes (após modal abrir)
  setTimeout(() => {
    document.querySelectorAll('.btn-cancel-scheduled').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const msgId = btn.dataset.msgId;
        if (!msgId) return;
        if (!confirm('Cancelar esta mensagem agendada?')) return;
        btn.disabled = true;
        try {
          await cancelarMensagemAgendada(msgId);
          btn.closest('.scheduled-item')?.remove();
          toast('Mensagem cancelada', 'success', 2000);
        } catch (err) {
          toast(`Erro: ${err.message}`, 'error');
        }
      });
    });
  }, 100);
}

// ── Bot Pause (por paciente) ──

function updateBotPauseButton(paciente) {
  const btn = document.getElementById('chat-pause-bot');
  if (!btn) return;
  const paused = paciente && paciente.bot_pausado === true;
  btn.classList.toggle('is-paused', paused);
  btn.title = paused ? 'Bot pausado para este paciente — clique para reativar' : 'Pausar bot para este paciente';
  btn.innerHTML = paused
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.3 6H8.3C6.3 13.7 5 11.5 5 9a7 7 0 0 1 7-7z"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/><line x1="4" y1="4" x2="20" y2="20" stroke="#ef4444" stroke-width="2.5"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.3 6H8.3C6.3 13.7 5 11.5 5 9a7 7 0 0 1 7-7z"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/></svg>`;
}

async function handleToggleBotPaciente() {
  const paciente = State.currentChatPaciente;
  if (!paciente) return;

  const paused = paciente.bot_pausado === true;
  const msg = paused
    ? `Reativar o bot automático para ${paciente.nome}?\n\nO paciente voltará a receber respostas automáticas do bot.`
    : `Pausar o bot automático para ${paciente.nome}?\n\nO bot NÃO responderá mais a este paciente. Somente a equipe poderá responder manualmente pelo CRM.`;

  if (!confirm(msg)) return;

  const btn = document.getElementById('chat-pause-bot');
  if (btn) btn.disabled = true;

  try {
    const updated = await toggleBotPaciente(paciente.id, !paused);
    Object.assign(paciente, updated);
    State.currentChatPaciente = paciente;
    updateBotPauseButton(paciente);
    toast(paused ? 'Bot reativado para este paciente' : 'Bot pausado para este paciente', 'success', 3000);
  } catch (err) {
    console.error('[Chat] Erro ao alterar bot:', err);
    toast(`Erro: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Send Chat Message ──

let chatSending = false;
async function sendChatMessage() {
  if (chatSending) return;
  const input    = document.getElementById('chat-input');
  const sendBtn  = document.getElementById('chat-send');
  const msg      = input.value.trim();
  const paciente = State.currentChatPaciente;
  if (!msg || !paciente) return;

  chatSending = true;
  sendBtn.disabled = true;
  input.value = '';
  input.style.height = 'auto';

  try {
    // 1. Salva no Supabase (aparece no CRM imediatamente via Realtime)
    await insertConversa(paciente.id, paciente.telefone, msg);

    // 2. Re-renderiza chat local
    const msgs = await fetchConversasPaciente(paciente.id, paciente.telefone);
    State.conversas = msgs;
    renderChatMessages(msgs);

    // 3. Envia via WhatsApp (async — best-effort, não bloqueia UI)
    sendWhatsApp(paciente.telefone, msg).then((ok) => {
      if (ok) {
        toast('Mensagem enviada via WhatsApp ✓', 'success', 3000);
      }
    });

  } catch (err) {
    toast(`Erro ao salvar: ${err.message}`, 'error');
    input.value = msg;
  } finally {
    chatSending = false;
    sendBtn.disabled = false;
  }
}
