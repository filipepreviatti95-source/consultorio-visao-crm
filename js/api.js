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
  const { data, error } = await db
    .from('agendamentos')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const idx = State.agendamentos.findIndex(a => a.id === id);
  if (idx >= 0) State.agendamentos[idx] = data;
  return data;
}

export async function deleteAgendamento(id) {
  const { error } = await db.from('agendamentos').delete().eq('id', id);
  if (error) throw error;
  State.agendamentos = State.agendamentos.filter(a => a.id !== id);
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

// ── WhatsApp — Enviar mensagem via n8n webhook ──

const WA_SEND_WEBHOOK = 'https://n8n.srv1474226.hstgr.cloud/webhook/crm-send-whatsapp';

export async function sendWhatsApp(telefone, mensagem) {
  try {
    const res = await fetch(WA_SEND_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone, mensagem }),
    });

    // Lê o body (pode ser JSON ou texto)
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* não é JSON */ }

    // Log para debug (sem alarmar o usuário)
    if (!res.ok) {
      console.warn(`[WA] HTTP ${res.status}:`, text.slice(0, 200));
    }

    // Retorna true em quase todos os cenários — o n8n/Meta API
    // frequentemente retorna erros/warnings mesmo quando a mensagem foi enviada.
    // Só retorna false se o webhook EXPLICITAMENTE disse que falhou.
    if (json && json.ok === false) {
      console.warn('[WA] Webhook retornou ok:false —', json.erro || 'sem detalhes');
      return false;
    }

    return true;

  } catch (err) {
    // Erros de rede, CORS, timeout — logamos mas não explodimos
    console.warn('[WA] Network/fetch error (best-effort):', err.message || err);
    return false;
  }
}

// ── Google Calendar Sync ──

const GCAL_WEBHOOK = 'https://n8n.srv1474226.hstgr.cloud/webhook/gcal-sync';
const GCAL_FETCH   = 'https://n8n.srv1474226.hstgr.cloud/webhook/gcal-fetch';

/** Busca eventos do Google Calendar via n8n e sincroniza com Supabase */
export async function syncGcalToSupabase(dataInicio, dataFim) {
  try {
    const res = await fetch(GCAL_FETCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataInicio, dataFim }),
    });
    if (!res.ok) throw new Error(`GCal fetch error: ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.erro || 'Erro desconhecido');

    const eventosGcal = json.eventos || [];
    let criados = 0, atualizados = 0;

    for (const ev of eventosGcal) {
      if (!ev.googleEventId || !ev.dataHora) continue;

      // Busca por google_event_id — usa .limit(1) em vez de .maybeSingle()
      // para evitar erro quando já existem duplicatas
      const { data: existentes } = await db
        .from('agendamentos')
        .select('id, status, data_hora')
        .eq('google_event_id', ev.googleEventId)
        .limit(1);

      const existente = existentes?.[0] || null;

      if (existente) {
        // Atualiza status/horário se mudou
        const mudou = existente.status !== ev.status ||
          existente.data_hora?.slice(0, 16) !== ev.dataHora?.slice(0, 16);
        if (mudou) {
          await db.from('agendamentos').update({
            status: ev.status,
            data_hora: ev.dataHora,
            updated_at: new Date().toISOString(),
          }).eq('id', existente.id);
          atualizados++;
        }
      } else {
        // Cria novo agendamento — unique constraint previne duplicata
        let pacienteId = null;
        if (ev.telefone) {
          const { data: pacs } = await db
            .from('pacientes')
            .select('id')
            .like('telefone', `%${ev.telefone.slice(-8)}`)
            .limit(1);
          pacienteId = pacs?.[0]?.id || null;
        }

        const { error: insertErr } = await db.from('agendamentos').insert({
          paciente_id: pacienteId,
          nome_paciente: ev.nome || 'Evento GCal',
          telefone: ev.telefone || '',
          data_hora: ev.dataHora,
          status: ev.status || 'agendado',
          google_event_id: ev.googleEventId,
          observacoes: ev.isCRM ? '' : '(importado do Google Calendar)',
        });

        if (insertErr) {
          // Unique constraint violation = duplicata, ignora
          if (insertErr.code === '23505') {
            console.warn('[GCal] Duplicate ignored:', ev.googleEventId);
          } else {
            console.error('[GCal] Insert error:', insertErr);
          }
        } else {
          criados++;
        }
      }
    }

    // Re-fetch agendamentos do Supabase para atualizar State
    await fetchAgendamentos();
    return { total: eventosGcal.length, criados, atualizados };
  } catch (err) {
    console.error('syncGcalToSupabase error:', err);
    throw err;
  }
}

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
