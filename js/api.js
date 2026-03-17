/**
 * api.js — CRUD Supabase isolado
 * Único arquivo que fala com o banco. Quer mudar uma query? É só aqui.
 */

import { db, State } from './config.js';

// ── Pacientes ──

export async function fetchPacientes() {
  const { data, error } = await db
    .from('pacientes')
    .select('*')
    .order('created_at', { ascending: false });
  if (!error) State.pacientes = data || [];
}

export async function updatePacienteStatus(id, novoStatus) {
  const { data, error } = await db
    .from('pacientes')
    .update({ status: novoStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const idx = State.pacientes.findIndex(p => p.id === id);
  if (idx >= 0) State.pacientes[idx] = data;
  return data;
}

export async function savePaciente(id, payload) {
  if (id) {
    const { data, error } = await db.from('pacientes').update(payload).eq('id', id).select().single();
    if (error) throw error;
    const idx = State.pacientes.findIndex(p => p.id === id);
    if (idx >= 0) State.pacientes[idx] = data;
    return data;
  } else {
    const { data, error } = await db.from('pacientes').insert(payload).select().single();
    if (error) throw error;
    State.pacientes.unshift(data);
    return data;
  }
}

export async function deletePaciente(id) {
  const { error } = await db.from('pacientes').delete().eq('id', id);
  if (error) throw error;
  State.pacientes = State.pacientes.filter(p => p.id !== id);
}

// ── Agendamentos ──

export async function fetchAgendamentos() {
  const { data, error } = await db
    .from('agendamentos')
    .select('*')
    .order('data_hora', { ascending: true });
  if (!error) State.agendamentos = data || [];
}

export async function saveAgendamento(id, payload) {
  if (id) {
    const { data, error } = await db.from('agendamentos').update(payload).eq('id', id).select().single();
    if (error) throw error;
    const idx = State.agendamentos.findIndex(a => a.id === id);
    if (idx >= 0) State.agendamentos[idx] = data;
    return data;
  } else {
    const { data, error } = await db.from('agendamentos').insert(payload).select().single();
    if (error) throw error;
    State.agendamentos.push(data);
    return data;
  }
}

export async function updateAgendamentoField(id, field, value) {
  const { error } = await db.from('agendamentos').update({ [field]: value }).eq('id', id);
  if (!error) {
    const idx = State.agendamentos.findIndex(a => a.id === id);
    if (idx >= 0) State.agendamentos[idx][field] = value;
  }
}

// ── Conversas ──

export async function fetchConversasRecentes() {
  const { data, error } = await db
    .from('conversas')
    .select('*, pacientes(nome, telefone)')
    .eq('remetente', 'paciente')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) return;

  // Agrupa: 1 por paciente, máx 12
  const vistas = new Set();
  const unicas = [];
  for (const conv of (data || [])) {
    const chave = conv.paciente_id || conv.telefone || conv.id;
    if (!vistas.has(chave)) {
      vistas.add(chave);
      unicas.push(conv);
    }
    if (unicas.length >= 12) break;
  }
  State.conversasRecentes = unicas;
}

export async function fetchConversasPaciente(pacienteId, telefone) {
  // Busca por ID
  const { data: byId } = await db
    .from('conversas')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: true });

  // Busca por telefone (conversas do n8n sem paciente_id)
  const nums = (telefone || '').replace(/\D/g, '');
  const telefoneSemDDI = nums.startsWith('55') && nums.length >= 12 ? nums.slice(2) : nums;
  const telefoneComDDI = nums.startsWith('55') ? nums : '55' + nums;

  const { data: byTelefone } = await db
    .from('conversas')
    .select('*')
    .or(`telefone.eq.${nums},telefone.eq.${telefoneSemDDI},telefone.eq.${telefoneComDDI}`)
    .is('paciente_id', null)
    .order('created_at', { ascending: true });

  // Mescla e deduplica
  const todas = [...(byId || []), ...(byTelefone || [])];
  const vistas = new Set();
  const unicas = todas.filter(c => {
    if (vistas.has(c.id)) return false;
    vistas.add(c.id);
    return true;
  });
  unicas.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return unicas;
}

export async function insertConversa(pacienteId, telefone, mensagem) {
  const { error } = await db.from('conversas').insert({
    paciente_id: pacienteId,
    telefone,
    origem: 'crm',
    mensagem,
    remetente: 'humano',
    tipo_midia: 'texto',
  });
  if (error) throw error;
}

// ── Bot Stats ──

export async function fetchBotStats() {
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);

  // Conta mensagens do assistente (bot) de hoje
  const { count: botHoje, error: e1 } = await db
    .from('conversas')
    .select('*', { count: 'exact', head: true })
    .eq('remetente', 'assistente')
    .gte('created_at', hojeStr + 'T00:00:00')
    .lt('created_at', hojeStr + 'T23:59:59.999');

  // Conta pacientes únicos que o bot atendeu hoje
  const { data: botPacientes, error: e2 } = await db
    .from('conversas')
    .select('telefone')
    .eq('remetente', 'assistente')
    .gte('created_at', hojeStr + 'T00:00:00')
    .lt('created_at', hojeStr + 'T23:59:59.999');

  const pacientesUnicos = new Set((botPacientes || []).map(c => c.telefone)).size;

  return {
    mensagensHoje: botHoje || 0,
    pacientesAtendidos: pacientesUnicos,
  };
}

// ── Google Calendar Sync ──

const GCAL_WEBHOOK = 'https://n8n.srv1474226.hstgr.cloud/webhook/gcal-sync';

export async function sincronizarGcal({ acao, googleEventId, nome, telefone, dataHora, obs, status }) {
  try {
    const res = await fetch(GCAL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, eventId: googleEventId || null, nome, telefone, dataHora, obs, status }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.googleEventId || null;
  } catch {
    return null; // best-effort
  }
}
