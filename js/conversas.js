/**
 * conversas.js — Aba "Conversas": lista completa de todas as conversas do WhatsApp
 * agrupadas por contato (telefone), com busca + filtros. Click abre o chat panel.
 */

import { db, State } from './config.js';
import { fetchTodasConversas, fetchPacientes } from './api.js';
import { openChatPanel } from './chat.js';
import { esc, iniciais, tempoDesde, telefoneKey, normalizarTelefone, toast } from './utils.js';

/** Loader da página — chamado pelo router */
export async function loadConversas() {
  // Garante que temos pacientes pra fazer fallback de nome quando paciente_id é null
  if (!State.pacientes || State.pacientes.length === 0) {
    await fetchPacientes();
  }
  await fetchTodasConversas({ limit: 1000 });
  renderConversas();
  wireConversasEventos();
}

/** Reutilizável pelo realtime/router */
export async function reloadConversas() {
  await fetchTodasConversas({ limit: 1000 });
  renderConversas();
}

// ── Helpers ──

function resolveContato(item) {
  // Tenta enriquecer com nome via State.pacientes quando paciente_id é null
  // (caso típico: linhas inseridas pelo backfill da campanha)
  if (item.nome) return { nome: item.nome, paciente_id: item.paciente_id };
  const chave = item.chave || telefoneKey(item.telefone);
  const p = (State.pacientes || []).find(x => telefoneKey(x.telefone) === chave);
  if (p) return { nome: p.nome, paciente_id: p.id };
  return { nome: null, paciente_id: item.paciente_id };
}

function previewMensagem(conv) {
  if (!conv) return '';
  if (conv.tipo_midia === 'audio') return '🎤 Áudio';
  if (conv.tipo_midia === 'imagem') return '📷 Imagem';
  if (conv.tipo_midia === 'documento') return '📎 Documento';
  const txt = (conv.mensagem || '').trim();
  if (!txt) return '(sem texto)';
  return txt.length > 90 ? txt.substring(0, 90) + '…' : txt;
}

function badgeRemetente(conv) {
  if (!conv) return '';
  if (conv.remetente === 'paciente') return '<span class="conv-badge conv-badge-paciente">Paciente</span>';
  if (conv.remetente === 'humano') return '<span class="conv-badge conv-badge-humano">Você</span>';
  if (conv.remetente === 'assistente') return '<span class="conv-badge conv-badge-bot">Clara</span>';
  return '';
}

function aplicarFiltros(lista) {
  const busca = (State.conversasBusca || '').trim().toLowerCase();
  const filtro = State.conversasFiltro || 'todas';
  return lista.filter(item => {
    // Filtro por categoria
    if (filtro === 'com-resposta' && !item.temRespostaPaciente) return false;
    if (filtro === 'so-enviadas' && (item.temRespostaPaciente || item.temBot)) return false;
    if (filtro === 'bot' && !item.temBot) return false;
    // Busca textual
    if (busca) {
      const nome = (item.nome || '').toLowerCase();
      const tel = (item.telefone || '').toLowerCase();
      const telNorm = normalizarTelefone(item.telefone || '').toLowerCase();
      const msg = (item.ultimaMsg?.mensagem || '').toLowerCase();
      if (!nome.includes(busca) && !tel.includes(busca) && !telNorm.includes(busca) && !msg.includes(busca)) {
        return false;
      }
    }
    return true;
  });
}

// ── Render ──

export function renderConversas() {
  const lista = State.todasConversas || [];
  // Enriquece nomes via fallback do State.pacientes
  const enriquecida = lista.map(item => {
    const resolved = resolveContato(item);
    return { ...item, nome: resolved.nome || item.nome, paciente_id: resolved.paciente_id || item.paciente_id };
  });

  const filtrada = aplicarFiltros(enriquecida);
  // Ordena pela última mensagem desc
  filtrada.sort((a, b) => {
    const ta = new Date(a.ultimaMsg?.created_at || 0).getTime();
    const tb = new Date(b.ultimaMsg?.created_at || 0).getTime();
    return tb - ta;
  });

  // Contadores por filtro
  const total = enriquecida.length;
  const comResposta = enriquecida.filter(x => x.temRespostaPaciente).length;
  const soEnviadas = enriquecida.filter(x => !x.temRespostaPaciente && !x.temBot).length;
  const comBot = enriquecida.filter(x => x.temBot).length;

  const container = document.getElementById('page-conversas');
  if (!container) return;

  container.innerHTML = `
    <div class="conversas-header">
      <div class="conversas-title-row">
        <h2>Conversas</h2>
        <span class="conversas-count">${total} contato${total === 1 ? '' : 's'}</span>
      </div>
      <div class="conversas-toolbar">
        <div class="conversas-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="conversas-busca" type="text" placeholder="Buscar por nome, telefone ou mensagem…" value="${esc(State.conversasBusca || '')}" />
        </div>
        <div class="conversas-filters">
          <button class="conv-filter-btn ${State.conversasFiltro === 'todas' ? 'active' : ''}" data-filtro="todas">Todas <span>${total}</span></button>
          <button class="conv-filter-btn ${State.conversasFiltro === 'com-resposta' ? 'active' : ''}" data-filtro="com-resposta">Com resposta <span>${comResposta}</span></button>
          <button class="conv-filter-btn ${State.conversasFiltro === 'so-enviadas' ? 'active' : ''}" data-filtro="so-enviadas">Só enviadas <span>${soEnviadas}</span></button>
          <button class="conv-filter-btn ${State.conversasFiltro === 'bot' ? 'active' : ''}" data-filtro="bot">Bot <span>${comBot}</span></button>
        </div>
      </div>
    </div>
    <div class="conversas-lista" id="conversas-lista">
      ${filtrada.length === 0 ? `
        <div class="conversas-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>${State.conversasBusca ? 'Nenhuma conversa encontrada pra "' + esc(State.conversasBusca) + '"' : 'Nenhuma conversa ainda'}</p>
        </div>
      ` : filtrada.map(renderItem).join('')}
    </div>
  `;
}

function renderItem(item) {
  const nome = item.nome || item.telefone || 'Sem nome';
  const preview = previewMensagem(item.ultimaMsg);
  const tempo = tempoDesde(item.ultimaMsg?.created_at);
  const badge = badgeRemetente(item.ultimaMsg);
  const tel = item.telefone || '';
  return `
    <div class="conv-list-item" data-chave="${esc(item.chave)}" data-telefone="${esc(tel)}" data-paciente-id="${esc(item.paciente_id || '')}">
      <div class="conv-avatar">${esc(iniciais(nome))}</div>
      <div class="conv-body">
        <div class="conv-top">
          <span class="conv-nome">${esc(nome)}</span>
          <span class="conv-tempo">${esc(tempo)}</span>
        </div>
        <div class="conv-preview-row">
          ${badge}
          <span class="conv-preview">${esc(preview)}</span>
        </div>
        <div class="conv-meta-row">
          <span class="conv-tel">${esc(tel)}</span>
          <span class="conv-total">${item.total} msg${item.total === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  `;
}

// ── Eventos ──

function wireConversasEventos() {
  const input = document.getElementById('conversas-busca');
  if (input) {
    input.addEventListener('input', (e) => {
      State.conversasBusca = e.target.value;
      renderConversas();
      const novoInput = document.getElementById('conversas-busca');
      if (novoInput) {
        novoInput.focus();
        const v = novoInput.value;
        novoInput.setSelectionRange(v.length, v.length);
      }
    });
  }

  document.querySelectorAll('#page-conversas .conv-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      State.conversasFiltro = btn.dataset.filtro;
      renderConversas();
    });
  });

  document.querySelectorAll('#page-conversas .conv-list-item').forEach(el => {
    el.addEventListener('click', async () => {
      const pacId = el.dataset.pacienteId;
      const tel = el.dataset.telefone;
      let paciente = null;
      if (pacId) {
        paciente = (State.pacientes || []).find(p => p.id === pacId);
      }
      if (!paciente && tel) {
        const chave = telefoneKey(tel);
        paciente = (State.pacientes || []).find(p => telefoneKey(p.telefone) === chave);
      }
      if (!paciente) {
        // Lead sem registro em pacientes — cria um paciente shim pra abrir o chat
        paciente = {
          id: null,
          nome: tel || 'Contato',
          telefone: tel,
          status: 'novo_contato',
          bot_pausado: false,
        };
      }
      openChatPanel(paciente);
    });
  });
}
