/**
 * chat.js — Painel de chat WhatsApp
 */

import { State } from './config.js';
import { iniciais, waLink, esc, fmtData, tempoDesde, toast } from './utils.js';
import { fetchConversasPaciente, insertConversa } from './api.js';

export function initChatPanel() {
  document.getElementById('chat-close').addEventListener('click', closeChatPanel);
  document.getElementById('chat-overlay').addEventListener('click', closeChatPanel);

  const sendBtn = document.getElementById('chat-send');
  const input   = document.getElementById('chat-input');

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

  document.getElementById('chat-status-bar').innerHTML = `
    <span>Status:</span>
    <span class="status-pill status-${paciente.status}">${paciente.status}</span>
    <span style="flex:1"></span>
    <span style="font-size:.75rem;color:var(--text-muted)">Paciente desde ${fmtData(paciente.created_at)}</span>`;

  const msgContainer = document.getElementById('chat-messages');
  msgContainer.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:.8rem">Carregando…</div>';

  document.getElementById('chat-panel').classList.add('open');
  document.getElementById('chat-overlay').style.display = 'block';

  const msgs = await fetchConversasPaciente(paciente.id, paciente.telefone);
  State.conversas = msgs;
  renderChatMessages(msgs);
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

async function sendChatMessage() {
  const input    = document.getElementById('chat-input');
  const msg      = input.value.trim();
  const paciente = State.currentChatPaciente;
  if (!msg || !paciente) return;

  input.value = '';
  input.style.height = 'auto';

  try {
    await insertConversa(paciente.id, paciente.telefone, msg);
    const msgs = await fetchConversasPaciente(paciente.id, paciente.telefone);
    State.conversas = msgs;
    renderChatMessages(msgs);
    toast('Mensagem registrada', 'success', 2000);
  } catch (err) {
    toast(`Erro ao enviar: ${err.message}`, 'error');
    input.value = msg;
  }
}
