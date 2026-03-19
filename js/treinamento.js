/**
 * treinamento.js — Tela de Treinamento do Bot (Base de Conhecimento)
 * CRUD completo para as meninas do atendimento cadastrarem perguntas e respostas.
 */

import { State } from './config.js';
import { fetchBaseConhecimento, saveBaseConhecimento, deleteBaseConhecimento, toggleBaseConhecimentoAtivo } from './api.js';
import { toast } from './utils.js';
import { openModal, closeModal } from './ui.js';

let itens = [];

const CATEGORIAS = [
  { valor: 'localizacao', label: 'Localização', emoji: '📍' },
  { valor: 'preco', label: 'Preço / Pagamento', emoji: '💰' },
  { valor: 'horario', label: 'Horário / Funcionamento', emoji: '🕐' },
  { valor: 'servico', label: 'Serviços', emoji: '🔬' },
  { valor: 'consulta', label: 'Consulta', emoji: '👁' },
  { valor: 'oculos', label: 'Óculos / Lentes', emoji: '👓' },
  { valor: 'geral', label: 'Geral', emoji: '💬' },
];

function catLabel(val) {
  return CATEGORIAS.find(c => c.valor === val) || { label: val, emoji: '📌' };
}

// ── Load ──

export async function loadTreinamento() {
  itens = await fetchBaseConhecimento();
  renderTreinamento();
}

// ── Render ──

function renderTreinamento() {
  const container = document.getElementById('treinamento-list');
  if (!container) return;

  const search = (document.getElementById('treinamento-search')?.value || '').toLowerCase();
  const filtroCategoria = document.getElementById('treinamento-filter-cat')?.value || '';

  let filtered = itens;
  if (search) {
    filtered = filtered.filter(i =>
      i.pergunta.toLowerCase().includes(search) ||
      i.resposta.toLowerCase().includes(search) ||
      (i.palavras_chave || []).some(p => p.toLowerCase().includes(search))
    );
  }
  if (filtroCategoria) {
    filtered = filtered.filter(i => i.categoria === filtroCategoria);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="treinamento-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.3 6H8.3C6.3 13.7 5 11.5 5 9a7 7 0 0 1 7-7z"/>
          <path d="M9 17v1a3 3 0 0 0 6 0v-1"/>
          <line x1="12" y1="22" x2="12" y2="22"/>
        </svg>
        <p>Nenhum registro encontrado</p>
        <p class="treinamento-empty-sub">Clique em "Novo Registro" para ensinar algo ao bot</p>
      </div>
    `;
    document.getElementById('treinamento-count').textContent = `0 registros`;
    return;
  }

  document.getElementById('treinamento-count').textContent = `${filtered.length} registro${filtered.length !== 1 ? 's' : ''}`;

  // Agrupa por categoria
  const agrupado = {};
  for (const item of filtered) {
    if (!agrupado[item.categoria]) agrupado[item.categoria] = [];
    agrupado[item.categoria].push(item);
  }

  let html = '';
  for (const [cat, items] of Object.entries(agrupado)) {
    const c = catLabel(cat);
    html += `<div class="treinamento-cat-group">
      <div class="treinamento-cat-header">
        <span class="treinamento-cat-emoji">${c.emoji}</span>
        <span class="treinamento-cat-label">${c.label}</span>
        <span class="treinamento-cat-count">${items.length}</span>
      </div>`;

    for (const item of items) {
      const inativo = !item.ativo;
      html += `
      <div class="treinamento-card ${inativo ? 'treinamento-card-inativo' : ''}" data-id="${item.id}">
        <div class="treinamento-card-header">
          <div class="treinamento-pergunta">${escapeHtml(item.pergunta)}</div>
          <div class="treinamento-card-actions">
            <button class="tl-action-btn tl-action-edit treinamento-btn-edit" data-id="${item.id}" title="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="tl-action-btn treinamento-btn-toggle ${inativo ? 'treinamento-toggle-off' : ''}" data-id="${item.id}" data-ativo="${item.ativo}" title="${inativo ? 'Ativar' : 'Desativar'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">${inativo
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="1" y1="1" x2="23" y2="23"/>'
                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
              }</svg>
            </button>
            <button class="tl-action-btn tl-action-cancel treinamento-btn-delete" data-id="${item.id}" title="Excluir">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div class="treinamento-resposta">${escapeHtml(item.resposta)}</div>
        ${(item.palavras_chave && item.palavras_chave.length > 0) ?
          `<div class="treinamento-tags">${item.palavras_chave.map(t => `<span class="treinamento-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </div>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;

  // Event listeners
  container.querySelectorAll('.treinamento-btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = itens.find(i => i.id === btn.dataset.id);
      if (item) abrirModalTreinamento(item);
    });
  });

  container.querySelectorAll('.treinamento-btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Tem certeza que quer excluir este registro?')) return;
      try {
        await deleteBaseConhecimento(btn.dataset.id);
        itens = itens.filter(i => i.id !== btn.dataset.id);
        renderTreinamento();
        toast('Registro excluído', 'success', 3000);
      } catch (err) {
        toast(`Erro: ${err.message}`, 'error');
      }
    });
  });

  container.querySelectorAll('.treinamento-btn-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const novoAtivo = btn.dataset.ativo !== 'true';
      try {
        const updated = await toggleBaseConhecimentoAtivo(btn.dataset.id, novoAtivo);
        const idx = itens.findIndex(i => i.id === btn.dataset.id);
        if (idx >= 0) itens[idx] = updated;
        renderTreinamento();
        toast(novoAtivo ? 'Registro ativado' : 'Registro desativado', 'info', 2000);
      } catch (err) {
        toast(`Erro: ${err.message}`, 'error');
      }
    });
  });
}

// ── Modal de Cadastro/Edição ──

function abrirModalTreinamento(item = null) {
  const isEdit = !!item;

  const categoriaOptions = CATEGORIAS.map(c =>
    `<option value="${c.valor}" ${item?.categoria === c.valor ? 'selected' : ''}>${c.emoji} ${c.label}</option>`
  ).join('');

  const body = `
    <div class="form-group">
      <label for="trein-categoria">Categoria</label>
      <select id="trein-categoria">${categoriaOptions}</select>
    </div>
    <div class="form-group">
      <label for="trein-pergunta">Pergunta do paciente (como ele perguntaria)</label>
      <textarea id="trein-pergunta" rows="2" placeholder="Ex: Fica perto do Posto Shell?">${item?.pergunta || ''}</textarea>
    </div>
    <div class="form-group">
      <label for="trein-resposta">Resposta correta (como o bot deve responder)</label>
      <textarea id="trein-resposta" rows="3" placeholder="Ex: Na verdade ficamos no centro de Tijucas, na Rua Coronel Buchelle 752. Do Posto Shell fica uns 5km.">${item?.resposta || ''}</textarea>
    </div>
    <div class="form-group">
      <label for="trein-tags">Palavras-chave (separadas por vírgula)</label>
      <input type="text" id="trein-tags" placeholder="posto, shell, perto, referência" value="${(item?.palavras_chave || []).join(', ')}" />
      <small style="color:var(--text-muted);font-size:.75rem">Ajudam o bot a encontrar essa resposta. Ex: posto, shell, perto</small>
    </div>
  `;

  openModal({ title: isEdit ? 'Editar Registro' : 'Novo Registro de Treinamento', body, confirmText: 'Salvar', onConfirm: async () => {
    const categoria = document.getElementById('trein-categoria').value;
    const pergunta = document.getElementById('trein-pergunta').value.trim();
    const resposta = document.getElementById('trein-resposta').value.trim();
    const tagsStr = document.getElementById('trein-tags').value.trim();
    const palavras_chave = tagsStr ? tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];

    if (!pergunta || !resposta) {
      toast('Preencha pergunta e resposta', 'error');
      return;
    }

    try {
      const payload = { categoria, pergunta, resposta, palavras_chave };
      if (!isEdit) {
        const user = State.user;
        payload.criado_por = user?.email || 'desconhecido';
      }
      const saved = await saveBaseConhecimento(item?.id || null, payload);

      if (isEdit) {
        const idx = itens.findIndex(i => i.id === item.id);
        if (idx >= 0) itens[idx] = saved;
      } else {
        itens.unshift(saved);
      }

      renderTreinamento();
      closeModal();
      toast(isEdit ? 'Registro atualizado!' : 'Registro criado!', 'success', 3000);
    } catch (err) {
      toast(`Erro ao salvar: ${err.message}`, 'error');
    }
  }});
}

export function abrirNovoTreinamento() {
  abrirModalTreinamento(null);
}

// ── Init ──

export function initTreinamento() {
  const searchInput = document.getElementById('treinamento-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderTreinamento());
  }

  const filterCat = document.getElementById('treinamento-filter-cat');
  if (filterCat) {
    filterCat.addEventListener('change', () => renderTreinamento());
  }

  const btnNovo = document.getElementById('btn-novo-treinamento');
  if (btnNovo) {
    btnNovo.addEventListener('click', () => abrirModalTreinamento(null));
  }
}

// ── Utils ──

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
