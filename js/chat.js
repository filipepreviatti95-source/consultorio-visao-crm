/**
 * chat.js — Painel de chat WhatsApp
 */

import { State } from './config.js';
import { iniciais, waLink, esc, fmtData, tempoDesde, toast } from './utils.js';
import { fetchConversasPaciente, insertConversa, sendWhatsApp, deleteConversasPaciente } from './api.js';

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
      <div class="msg-bubble-wrap ${wrapClass}">
        <div class="msg-sender-label">${fromMe ? label : 'Paciente'}</div>
        <div class="msg-bubble">${esc(msg.mensagem)}</div>
        <div class="msg-time">${tempoDesde(msg.created_at)}</div>
      </div>`;
  }).join('');

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
