/**
 * realtime.js — Supabase Realtime channels + handlers
 */

import { db, State } from './config.js';
import { toast, playNotificationSound } from './utils.js';
import { renderChatMessages } from './chat.js';

let onDataChange = null; // callback injetado pelo app.js pra re-render

export function setOnDataChange(fn) {
  onDataChange = fn;
}

export function initRealtime() {
  const pacientesChannel = db
    .channel('pacientes-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pacientes' }, handlePacienteChange)
    .subscribe();

  const agendamentosChannel = db
    .channel('agendamentos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, handleAgendamentoChange)
    .subscribe();

  const conversasChannel = db
    .channel('conversas-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversas' }, handleConversaInsert)
    .subscribe();

  State.realtimeChannels = [pacientesChannel, agendamentosChannel, conversasChannel];
}

function handlePacienteChange(payload) {
  const { eventType, new: novo, old } = payload;

  if (eventType === 'INSERT') {
    State.pacientes.unshift(novo);
    toast(`Novo paciente: ${novo.nome}`, 'info');
  } else if (eventType === 'UPDATE') {
    const idx = State.pacientes.findIndex(p => p.id === novo.id);
    if (idx >= 0) State.pacientes[idx] = novo;
  } else if (eventType === 'DELETE') {
    State.pacientes = State.pacientes.filter(p => p.id !== old.id);
  }

  if (onDataChange) onDataChange('pacientes');
}

function handleAgendamentoChange(payload) {
  const { eventType, new: novo, old } = payload;

  if (eventType === 'INSERT') {
    State.agendamentos.unshift(novo);
  } else if (eventType === 'UPDATE') {
    const idx = State.agendamentos.findIndex(a => a.id === novo.id);
    if (idx >= 0) State.agendamentos[idx] = novo;
  } else if (eventType === 'DELETE') {
    State.agendamentos = State.agendamentos.filter(a => a.id !== old.id);
  }

  if (onDataChange) onDataChange('agendamentos');
}

function handleConversaInsert(payload) {
  const nova = payload.new;
  State.conversas.push(nova);

  // Notificação sonora para mensagens de pacientes
  if (nova.remetente === 'paciente') {
    playNotificationSound();
    const nome = State.pacientes.find(p => p.id === nova.paciente_id)?.nome || nova.telefone || 'Paciente';
    toast(`Nova mensagem de ${nome}`, 'info');
  }

  // Atualiza chat aberto (por ID ou telefone)
  if (State.currentChatPaciente) {
    const p = State.currentChatPaciente;
    const nums = (p.telefone || '').replace(/\D/g, '');
    const novaNums = (nova.telefone || '').replace(/\D/g, '');
    const mesmoId  = nova.paciente_id === p.id;
    const mesmoTel = novaNums && nums && (novaNums.endsWith(nums) || nums.endsWith(novaNums));
    if (mesmoId || mesmoTel) {
      renderChatMessages(State.conversas);
    }
  }

  // Badge no kanban
  let cardEl = nova.paciente_id
    ? document.querySelector(`.kanban-card[data-id="${nova.paciente_id}"]`)
    : null;

  if (!cardEl && nova.telefone) {
    const novaNums = nova.telefone.replace(/\D/g, '');
    State.pacientes.forEach(p => {
      if (!cardEl) {
        const pNums = (p.telefone || '').replace(/\D/g, '');
        if (novaNums.endsWith(pNums) || pNums.endsWith(novaNums)) {
          cardEl = document.querySelector(`.kanban-card[data-id="${p.id}"]`);
        }
      }
    });
  }

  if (cardEl) {
    let badge = cardEl.querySelector('.card-new-msg-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'card-new-msg-badge';
      cardEl.querySelector('.card-meta')?.appendChild(badge);
    }
    badge.textContent = '● Nova msg';
  }

  if (onDataChange) onDataChange('conversas');
}
