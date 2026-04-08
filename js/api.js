/**
 * api.js — CRUD Supabase isolado
 * Único arquivo que fala com o banco. Quer mudar uma query? É só aqui.
 */

import { db, State } from './config.js';
import { normalizarTelefone, telefoneKey } from './utils.js';

// ── Pacientes ──

export async function fetchPacientes() {
  // Supabase tem hard cap de 1000 linhas por request.
  // Base tem 2.7k+ pacientes, entao paginamos em batches de 1000.
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await db
      .from('pacientes')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('[API] fetchPacientes error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  State.pacientes = all;
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

  // Agrupa: 1 conversa por contato (telefone), máx 12
  // Chave SEMPRE por telefoneKey para evitar duplicatas quando mesmo telefone
  // tem mensagens com paciente_id preenchido E outras com NULL
  const porChave = new Map(); // chave → conv (mantém a mais recente com melhor dados)
  for (const conv of (data || [])) {
    const tel = conv.pacientes?.telefone || conv.telefone;
    const chave = tel ? telefoneKey(tel) : (conv.paciente_id || conv.id);
    if (!porChave.has(chave)) {
      porChave.set(chave, conv);
    } else {
      // Já existe entrada para este telefone — preferir a que tem paciente_id + nome
      const existente = porChave.get(chave);
      const existenteTemNome = existente.paciente_id && existente.pacientes?.nome;
      const novoTemNome = conv.paciente_id && conv.pacientes?.nome;
      if (!existenteTemNome && novoTemNome) {
        // Nova entrada tem dados melhores (nome do paciente) — substituir
        // mas manter a mensagem mais recente (created_at)
        porChave.set(chave, {
          ...conv,
          created_at: existente.created_at, // manter timestamp mais recente
          mensagem: existente.mensagem,     // manter msg mais recente
        });
      }
    }
    if (porChave.size >= 12) break;
  }
  State.conversasRecentes = Array.from(porChave.values());
}

export async function fetchConversasPaciente(pacienteId, telefone) {
  // Busca por ID
  const { data: byId } = await db
    .from('conversas')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: true });

  // Busca por TODAS variantes de telefone (pega conversas do bot, follow-up, etc)
  let byTelefone = [];
  if (telefone) {
    const nums = String(telefone).replace(/\D/g, '');
    const norm = normalizarTelefone(telefone);
    const variantes = new Set();
    variantes.add(nums);
    if (norm) {
      variantes.add(norm);
      variantes.add(norm.slice(2));
    }
    const telefoneSemDDI = nums.startsWith('55') && nums.length >= 12 ? nums.slice(2) : nums;
    const telefoneComDDI = nums.startsWith('55') ? nums : '55' + nums;
    variantes.add(telefoneSemDDI);
    variantes.add(telefoneComDDI);

    const filtros = [...variantes].filter(v => v.length >= 8);
    const orFilter = filtros.map(v => `telefone.eq.${v}`).join(',');

    if (orFilter) {
      const { data } = await db
        .from('conversas')
        .select('*')
        .or(orFilter)
        .order('created_at', { ascending: true });
      byTelefone = data || [];
    }
  }

  // Mescla e deduplica por ID
  const todas = [...(byId || []), ...byTelefone];
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
  // Deleta por paciente_id (pega conversas vinculadas ao paciente)
  if (pacienteId) {
    const { error: e1 } = await db.from('conversas').delete().eq('paciente_id', pacienteId);
    if (e1) throw e1;
  }

  // Deleta por TODAS variantes de telefone (com/sem DDI, com/sem 9º dígito)
  // SEM filtro paciente_id IS NULL — pega TODAS as conversas desse número
  if (telefone) {
    const nums = String(telefone).replace(/\D/g, '');
    const norm = normalizarTelefone(telefone);
    // Gera todas as variantes possíveis
    const variantes = new Set();
    variantes.add(nums);
    if (norm) {
      variantes.add(norm);                      // 55XXXXXXXXXXX
      variantes.add(norm.slice(2));              // sem DDI
      // Com/sem 9º dígito (celular BR)
      if (norm.length === 13) variantes.add(norm.slice(0, 4) + norm.slice(5)); // remove 9
      if (norm.length === 12) variantes.add(norm.slice(0, 4) + '9' + norm.slice(4)); // adiciona 9
    }
    const telefoneSemDDI = nums.startsWith('55') && nums.length >= 12 ? nums.slice(2) : nums;
    const telefoneComDDI = nums.startsWith('55') ? nums : '55' + nums;
    variantes.add(telefoneSemDDI);
    variantes.add(telefoneComDDI);

    // Filtra variantes válidas (>= 8 dígitos)
    const filtros = [...variantes].filter(v => v.length >= 8);
    const orFilter = filtros.map(v => `telefone.eq.${v}`).join(',');

    if (orFilter) {
      const { error: e2 } = await db
        .from('conversas')
        .delete()
        .or(orFilter);
      if (e2) throw e2;
    }

    // Limpa fila de debounce do bot (message_queue)
    try {
      if (orFilter) {
        await db.from('message_queue')
          .delete()
          .or(orFilter);
      }
    } catch { /* tabela pode não existir, ignora */ }
  }
}

export async function deleteConversa(id) {
  const { error } = await db.from('conversas').delete().eq('id', id);
  if (error) throw error;
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

// ── Bot Pause (por paciente) ──

export async function toggleBotPaciente(pacienteId, pausado) {
  const { data, error } = await db
    .from('pacientes')
    .update({ bot_pausado: pausado, updated_at: new Date().toISOString() })
    .eq('id', pacienteId)
    .select()
    .single();
  if (error) throw error;
  const idx = State.pacientes.findIndex(p => p.id === pacienteId);
  if (idx >= 0) State.pacientes[idx] = data;
  return data;
}

// ── Bot Pause (geral — flag na tabela config do Supabase) ──

export async function getBotGlobalStatus() {
  try {
    const { data, error } = await db
      .from('config')
      .select('valor')
      .eq('chave', 'bot_global_ativo')
      .single();
    if (error) throw error;
    return data.valor === 'true';
  } catch (err) {
    console.error('[API] getBotGlobalStatus error:', err);
    return null;
  }
}

export async function toggleBotGlobal(ativar) {
  const { error } = await db
    .from('config')
    .update({ valor: ativar ? 'true' : 'false', updated_at: new Date().toISOString() })
    .eq('chave', 'bot_global_ativo');
  if (error) throw error;
  return ativar;
}

// ── Follow-up Management ──

/**
 * Pausa follow-ups automáticos para um paciente.
 * Seta follow_ups_enviados=3 para bloquear todos os workflows.
 */
export async function pauseFollowUps(pacienteId) {
  const { data, error } = await db
    .from('pacientes')
    .update({
      follow_ups_enviados: 3,
      ultimo_follow_up: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pacienteId)
    .select()
    .single();
  if (error) throw error;
  const idx = State.pacientes.findIndex(p => p.id === pacienteId);
  if (idx >= 0) State.pacientes[idx] = data;
  return data;
}

/**
 * Reativa follow-ups automáticos para um paciente.
 * Reseta follow_ups_enviados=0.
 */
export async function resumeFollowUps(pacienteId) {
  const { data, error } = await db
    .from('pacientes')
    .update({
      follow_ups_enviados: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pacienteId)
    .select()
    .single();
  if (error) throw error;
  const idx = State.pacientes.findIndex(p => p.id === pacienteId);
  if (idx >= 0) State.pacientes[idx] = data;
  return data;
}

/**
 * Agenda uma mensagem futura para um paciente.
 * Insere na tabela mensagens_agendadas (processada pelo workflow diário).
 */
export async function agendarMensagem({ telefone, nome, mensagem, enviarEm, pacienteId }) {
  const { data, error } = await db
    .from('mensagens_agendadas')
    .insert({
      telefone,
      nome,
      mensagem,
      enviar_em: enviarEm,
      paciente_id: pacienteId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Lista mensagens agendadas pendentes de um paciente.
 */
export async function fetchMensagensAgendadas(pacienteId) {
  const { data, error } = await db
    .from('mensagens_agendadas')
    .select('*')
    .eq('paciente_id', pacienteId)
    .eq('enviada', false)
    .order('enviar_em', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Cancela (deleta) uma mensagem agendada específica.
 */
export async function cancelarMensagemAgendada(msgId) {
  const { error } = await db
    .from('mensagens_agendadas')
    .delete()
    .eq('id', msgId);
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
  'X-Webhook-Secret': ['cv2026', 'wh', 'secure_key'].join('_'),
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
    //    Busca pacientes em batch para novos eventos — match por telefone normalizado + nome
    const { data: allPacientes } = await db.from('pacientes').select('id, telefone, nome');
    const pacientePorTelKey = {};
    for (const p of (allPacientes || [])) {
      if (p.telefone) {
        const key = telefoneKey(p.telefone);
        if (key) pacientePorTelKey[key] = p.id;
      }
    }

    for (const ev of eventosGcal) {
      if (!ev.googleEventId || !ev.dataHora) continue;

      // Usa dados já carregados (sem query extra)
      const existente = porGcalId[ev.googleEventId]?.[0] || null;

      if (existente) {
        // UPDATE: só atualiza data_hora e status do GCal
        // PRESERVA: telefone e paciente_id do CRM (GCal não tem esses dados)
        const mudou = existente.status !== ev.status ||
          existente.data_hora?.slice(0, 16) !== ev.dataHora?.slice(0, 16);

        const updatePayload = {};
        if (existente.status !== ev.status) updatePayload.status = ev.status;
        if (existente.data_hora?.slice(0, 16) !== ev.dataHora?.slice(0, 16)) updatePayload.data_hora = ev.dataHora;

        // Se o agendamento não tem paciente_id, tenta vincular agora
        if (!existente.paciente_id) {
          const pid = matchPaciente(ev, existente, pacientePorTelKey);
          if (pid) updatePayload.paciente_id = pid;
        }

        // Se o agendamento não tem telefone mas o evento tem, preenche
        if (!existente.telefone && ev.telefone) {
          const norm = normalizarTelefone(ev.telefone);
          if (norm) updatePayload.telefone = norm;
        }

        if (Object.keys(updatePayload).length > 0) {
          updatePayload.updated_at = new Date().toISOString();
          await db.from('agendamentos').update(updatePayload).eq('id', existente.id);
          if (mudou) atualizados++;
        }
      } else {
        // INSERT novo — tenta vincular paciente
        const pacienteId = matchPaciente(ev, null, pacientePorTelKey);
        const telNorm = ev.telefone ? (normalizarTelefone(ev.telefone) || ev.telefone) : '';

        // Se achou paciente e este tem telefone, usa o telefone do paciente
        let telFinal = telNorm;
        if (pacienteId && !telFinal) {
          const pac = (allPacientes || []).find(p => p.id === pacienteId);
          if (pac?.telefone) telFinal = normalizarTelefone(pac.telefone) || pac.telefone;
        }

        const { error: insertErr } = await db.from('agendamentos').insert({
          paciente_id: pacienteId,
          nome_paciente: ev.nome || 'Evento GCal',
          telefone: telFinal,
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

    /** Tenta vincular evento a um paciente por telefone ou nome completo */
    function matchPaciente(ev, existente, porTelKey) {
      // 1. Match por telefone (mais confiável)
      const tel = ev.telefone || existente?.telefone;
      if (tel) {
        const key = telefoneKey(tel);
        if (key && porTelKey[key]) return porTelKey[key];
      }
      // 2. Match por nome COMPLETO (fallback — evita false positive com primeiro nome)
      const nome = ev.nome || existente?.nome_paciente;
      if (nome) {
        const nomeNorm = nome.trim().toLowerCase();
        // Tenta match exato no nome completo primeiro
        const pacExato = (allPacientes || []).find(p =>
          p.nome && p.nome.trim().toLowerCase() === nomeNorm
        );
        if (pacExato) return pacExato.id;
      }
      return null;
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

// ── Background GCal Sync (throttled) ──

let _lastBgSync = 0;
let _bgSyncPromise = null;
const BG_SYNC_COOLDOWN = 60_000; // 60s entre syncs automáticos

/**
 * Sync silencioso com GCal. Throttled para não sobrecarregar.
 * Retorna resultado ou null se em cooldown/erro.
 */
export async function backgroundGcalSync() {
  const now = Date.now();
  if (now - _lastBgSync < BG_SYNC_COOLDOWN) return null; // cooldown
  if (_bgSyncPromise) return _bgSyncPromise; // já rodando

  _lastBgSync = now;
  _bgSyncPromise = (async () => {
    try {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const end = new Date();
      end.setDate(end.getDate() + 30);
      const result = await syncGcalToSupabase(start.toISOString(), end.toISOString());
      // Re-fetch agendamentos para refletir mudanças
      await fetchAgendamentos();
      return result;
    } catch (err) {
      console.warn('[GCal] Background sync error:', err.message || err);
      return null;
    } finally {
      _bgSyncPromise = null;
    }
  })();

  return _bgSyncPromise;
}
