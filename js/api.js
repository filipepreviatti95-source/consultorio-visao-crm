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
  if (error) {
    console.error('[API] fetchPacientes error:', error.message);
    return;
  }
  State.pacientes = data || [];
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
  if (error) {
    console.error('[API] fetchAgendamentos error:', error.message);
    return;
  }
  State.agendamentos = data || [];
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
  if (error) {
    console.error('[API] fetchConversasRecentes error:', error.message);
    return;
  }

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

export async function deleteConversasPaciente(pacienteId, telefone) {
  // Deleta por paciente_id
  if (pacienteId) {
    const { error: e1 } = await db.from('conversas').delete().eq('paciente_id', pacienteId);
    if (e1) throw e1;
  }

  // Deleta por telefone (conversas do bot sem paciente_id)
  if (telefone) {
    const nums = (telefone || '').replace(/\D/g, '');
    const telefoneSemDDI = nums.startsWith('55') && nums.length >= 12 ? nums.slice(2) : nums;
    const telefoneComDDI = nums.startsWith('55') ? nums : '55' + nums;

    const { error: e2 } = await db
      .from('conversas')
      .delete()
      .or(`telefone.eq.${nums},telefone.eq.${telefoneSemDDI},telefone.eq.${telefoneComDDI}`)
      .is('paciente_id', null);
    if (e2) throw e2;

    // Limpa fila de debounce do bot (message_queue)
    try {
      await db.from('message_queue')
        .delete()
        .or(`telefone.eq.${nums},telefone.eq.${telefoneSemDDI},telefone.eq.${telefoneComDDI}`);
    } catch { /* tabela pode não existir, ignora */ }
  }
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

// ── Base de Conhecimento (Treinamento do Bot) ──

export async function fetchBaseConhecimento() {
  const { data, error } = await db
    .from('base_conhecimento')
    .select('*')
    .order('categoria', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[API] fetchBaseConhecimento error:', error.message);
    return [];
  }
  return data || [];
}

export async function saveBaseConhecimento(id, payload) {
  payload.updated_at = new Date().toISOString();
  if (id) {
    const { data, error } = await db.from('base_conhecimento').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await db.from('base_conhecimento').insert(payload).select().single();
    if (error) throw error;
    return data;
  }
}

export async function deleteBaseConhecimento(id) {
  const { error } = await db.from('base_conhecimento').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleBaseConhecimentoAtivo(id, ativo) {
  const { data, error } = await db
    .from('base_conhecimento')
    .update({ ativo, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Webhook Auth ──

const WEBHOOK_HEADERS = {
  'Content-Type': 'application/json',
  'X-Webhook-Secret': 'cv2026_wh_secure_key',
};

// ── WhatsApp — Enviar mensagem via n8n webhook ──

const WA_SEND_WEBHOOK = 'https://n8n.srv1474226.hstgr.cloud/webhook/crm-send-whatsapp';

export async function sendWhatsApp(telefone, mensagem) {
  try {
    const res = await fetch(WA_SEND_WEBHOOK, {
      method: 'POST',
      headers: WEBHOOK_HEADERS,
      body: JSON.stringify({ telefone, mensagem }),
    });

    // Lê o body (pode ser JSON ou texto)
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* não é JSON */ }

    if (!res.ok) {
      console.warn(`[WA] HTTP ${res.status}:`, text.slice(0, 200));
      return false;
    }

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

/**
 * Busca eventos do Google Calendar via n8n e sincroniza com Supabase.
 * v2 — reverse sync, dedup, anti-reimport
 */
export async function syncGcalToSupabase(dataInicio, dataFim) {
  try {
    // 1. Busca eventos do GCal via n8n webhook
    const res = await fetch(GCAL_FETCH, {
      method: 'POST',
      headers: WEBHOOK_HEADERS,
      body: JSON.stringify({ dataInicio, dataFim }),
    });
    if (!res.ok) throw new Error(`GCal fetch error: ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.erro || 'Erro desconhecido');

    const eventosGcal = json.eventos || [];
    let criados = 0, atualizados = 0, removidos = 0, dupsLimpas = 0;

    // Set de google_event_ids vindos do GCal (fonte de verdade)
    const gcalIds = new Set(eventosGcal.filter(e => e.googleEventId).map(e => e.googleEventId));

    // 2. Busca TODOS agendamentos do Supabase que têm google_event_id no range
    const { data: agSupabase } = await db
      .from('agendamentos')
      .select('id, google_event_id, status, data_hora, nome_paciente')
      .not('google_event_id', 'is', null)
      .gte('data_hora', dataInicio)
      .lte('data_hora', dataFim);

    const agendamentosDb = agSupabase || [];

    // 3. DEDUP — agrupa por google_event_id, deleta extras
    const porGcalId = {};
    for (const ag of agendamentosDb) {
      if (!ag.google_event_id) continue;
      if (!porGcalId[ag.google_event_id]) porGcalId[ag.google_event_id] = [];
      porGcalId[ag.google_event_id].push(ag);
    }

    for (const [gid, registros] of Object.entries(porGcalId)) {
      if (registros.length > 1) {
        // Mantém o primeiro, deleta o resto
        const [manter, ...extras] = registros;
        for (const dup of extras) {
          await db.from('agendamentos').delete().eq('id', dup.id);
          dupsLimpas++;
        }
        console.log(`[GCal Sync] Dedup: manteve ${manter.id}, removeu ${extras.length} duplicatas de ${gid}`);
      }
    }

    // 4. REVERSE SYNC — agendamentos no Supabase que NÃO existem mais no GCal
    //    (foram deletados/cancelados no Google Calendar)
    //    Só remove se tem google_event_id e NÃO está no set do GCal
    for (const ag of agendamentosDb) {
      if (!ag.google_event_id) continue;
      // Já foi deletado como duplicata? Pula
      if (porGcalId[ag.google_event_id]?.length > 1 &&
          porGcalId[ag.google_event_id][0].id !== ag.id) continue;

      if (!gcalIds.has(ag.google_event_id)) {
        // Evento sumiu do GCal → cancela no Supabase (não deleta, para manter histórico)
        if (ag.status !== 'cancelado') {
          await db.from('agendamentos').update({
            status: 'cancelado',
            observacoes: '(cancelado — removido do Google Calendar)',
            updated_at: new Date().toISOString(),
          }).eq('id', ag.id);
          removidos++;
          console.log(`[GCal Sync] Reverse: cancelou ${ag.nome_paciente} (${ag.google_event_id}) — não existe mais no GCal`);
        }
      }
    }

    // 5. FORWARD SYNC — cria/atualiza do GCal → Supabase
    //    Usa porGcalId (já construído acima) para evitar N+1 queries
    //    Busca pacientes em batch para novos eventos
    const { data: allPacientes } = await db.from('pacientes').select('id, telefone');
    const pacientePorTel = {};
    for (const p of (allPacientes || [])) {
      if (p.telefone) pacientePorTel[p.telefone.replace(/\D/g, '').slice(-8)] = p.id;
    }

    for (const ev of eventosGcal) {
      if (!ev.googleEventId || !ev.dataHora) continue;

      // Usa dados já carregados (sem query extra)
      const existente = porGcalId[ev.googleEventId]?.[0] || null;

      if (existente) {
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
        // Busca paciente_id no cache local
        let pacienteId = null;
        if (ev.telefone) {
          const tel8 = ev.telefone.replace(/\D/g, '').slice(-8);
          pacienteId = pacientePorTel[tel8] || null;
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
          if (insertErr.code === '23505') {
            console.warn('[GCal Sync] Duplicate ignored:', ev.googleEventId);
          } else {
            console.error('[GCal Sync] Insert error:', insertErr);
          }
        } else {
          criados++;
        }
      }
    }

    // 6. Re-fetch agendamentos do Supabase para atualizar State
    await fetchAgendamentos();

    const resultado = { total: eventosGcal.length, criados, atualizados, removidos, dupsLimpas };
    console.log('[GCal Sync] Resultado:', resultado);
    return resultado;
  } catch (err) {
    console.error('syncGcalToSupabase error:', err);
    throw err;
  }
}

export async function sincronizarGcal({ acao, googleEventId, nome, telefone, dataHora, obs, status }) {
  try {
    const res = await fetch(GCAL_WEBHOOK, {
      method: 'POST',
      headers: WEBHOOK_HEADERS,
      body: JSON.stringify({ acao, eventId: googleEventId || null, nome, telefone, dataHora, obs, status }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.googleEventId || null;
  } catch {
    return null; // best-effort
  }
}
