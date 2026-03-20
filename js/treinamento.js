/**
 * treinamento.js — Tela de Treinamento do Bot (Base de Conhecimento)
 * CRUD completo para as meninas do atendimento cadastrarem perguntas e respostas.
 * v2 — Auto-tags, validação obrigatória, UX para não-técnicos
 */

import { State } from './config.js';
import { fetchBaseConhecimento, saveBaseConhecimento, deleteBaseConhecimento, toggleBaseConhecimentoAtivo } from './api.js';
import { toast, esc } from './utils.js';
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

// Stopwords que não servem como tag
const STOPWORDS = new Set([
  'que', 'com', 'para', 'por', 'uma', 'uns', 'das', 'dos', 'nas', 'nos',
  'mas', 'pra', 'pro', 'tem', 'vai', 'vou', 'isso', 'essa', 'esse', 'esta',
  'como', 'mais', 'muito', 'aqui', 'ali', 'ser', 'ter', 'bem', 'sim', 'nao',
  'ele', 'ela', 'seu', 'sua', 'meu', 'minha', 'qual', 'quem', 'onde', 'quando',
  'voce', 'voces', 'gente', 'sobre', 'pode', 'quero', 'preciso', 'tambem',
  'ainda', 'fica', 'faz', 'tipo', 'acho', 'bom', 'dia', 'boa', 'tarde', 'noite',
]);

function catLabel(val) {
  return CATEGORIAS.find(c => c.valor === val) || { label: val, emoji: '📌' };
}

/**
 * Gera sugestões de palavras-chave a partir da pergunta e resposta.
 * Extrai palavras relevantes (>3 chars, sem stopwords).
 */
function gerarSugestoesTags(pergunta, resposta) {
  const texto = `${pergunta} ${resposta}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
  const palavras = texto.split(/\s+/).filter(p => p.length > 3 && !STOPWORDS.has(p));
  // Deduplica e pega top 8
  return [...new Set(palavras)].slice(0, 8);
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
      const semTags = !item.palavras_chave || item.palavras_chave.length === 0;
      html += `
      <div class="treinamento-card ${inativo ? 'treinamento-card-inativo' : ''} ${semTags ? 'treinamento-card-sem-tags' : ''}" data-id="${item.id}">
        <div class="treinamento-card-header">
          <div class="treinamento-pergunta">${esc(item.pergunta)}</div>
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
        <div class="treinamento-resposta">${esc(item.resposta)}</div>
        ${semTags
          ? `<div class="treinamento-tags-aviso">⚠️ Sem palavras-chave — o bot pode não encontrar esta resposta</div>`
          : `<div class="treinamento-tags">${item.palavras_chave.map(t => `<span class="treinamento-tag">${esc(t)}</span>`).join('')}</div>`
        }
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
      <label for="trein-pergunta">Pergunta do paciente</label>
      <small class="form-hint">Escreva como o paciente perguntaria no WhatsApp</small>
      <textarea id="trein-pergunta" rows="2" placeholder="Ex: Fica perto do Posto Shell?">${item?.pergunta || ''}</textarea>
    </div>
    <div class="form-group">
      <label for="trein-resposta">Resposta correta</label>
      <small class="form-hint">Como o bot deve responder (com a informação verdadeira)</small>
      <textarea id="trein-resposta" rows="3" placeholder="Ex: Na verdade ficamos no centro de Tijucas, na Rua Coronel Buchelle 752. Do Posto Shell fica uns 5km.">${item?.resposta || ''}</textarea>
    </div>
    <div class="form-group">
      <label for="trein-tags">Palavras-chave <span class="label-obrigatorio">*obrigatório</span></label>
      <small class="form-hint">Palavras que o paciente usaria ao perguntar isso. Separe por vírgula.</small>
      <input type="text" id="trein-tags" placeholder="posto, shell, perto, referência" value="${(item?.palavras_chave || []).join(', ')}" />
      <div id="trein-tags-sugestoes" class="tags-sugestoes"></div>
      <div id="trein-tags-erro" class="form-field-error hidden">Adicione pelo menos 2 palavras-chave para o bot encontrar essa resposta</div>
    </div>
    <div class="treinamento-dica-box">
      <strong>Dica:</strong> As palavras-chave são como o bot "encontra" essa resposta. Se alguém perguntar "tem estacionamento?",
      o bot procura registros com as tags "estacionamento", "parar", "vaga". Quanto mais tags, melhor!
    </div>
  `;

  openModal({ title: isEdit ? 'Editar Registro' : 'Novo Registro de Treinamento', body, confirmText: 'Salvar', onConfirm: async () => {
    const categoria = document.getElementById('trein-categoria').value;
    const pergunta = document.getElementById('trein-pergunta').value.trim();
    const resposta = document.getElementById('trein-resposta').value.trim();
    const tagsStr = document.getElementById('trein-tags').value.trim();
    const palavras_chave = tagsStr ? tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];

    // Validações
    if (!pergunta || !resposta) {
      toast('Preencha pergunta e resposta', 'error');
      return;
    }

    if (palavras_chave.length < 2) {
      document.getElementById('trein-tags-erro')?.classList.remove('hidden');
      document.getElementById('trein-tags')?.focus();
      toast('Adicione pelo menos 2 palavras-chave', 'error');
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
      toast(isEdit ? 'Registro atualizado! O bot já vai usar na próxima mensagem.' : 'Registro criado! O bot já vai usar na próxima mensagem.', 'success', 4000);
    } catch (err) {
      toast(`Erro ao salvar: ${err.message}`, 'error');
    }
  }});

  // Setup auto-sugestão de tags após modal abrir
  setTimeout(() => {
    const perguntaEl = document.getElementById('trein-pergunta');
    const respostaEl = document.getElementById('trein-resposta');
    const tagsEl = document.getElementById('trein-tags');
    const sugestoesEl = document.getElementById('trein-tags-sugestoes');
    const erroEl = document.getElementById('trein-tags-erro');

    if (!perguntaEl || !respostaEl || !tagsEl || !sugestoesEl) return;

    const atualizarSugestoes = () => {
      const pergunta = perguntaEl.value.trim();
      const resposta = respostaEl.value.trim();
      const tagsAtuais = tagsEl.value.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);

      if (!pergunta && !resposta) {
        sugestoesEl.innerHTML = '';
        return;
      }

      const sugestoes = gerarSugestoesTags(pergunta, resposta)
        .filter(s => !tagsAtuais.includes(s));

      if (sugestoes.length === 0) {
        sugestoesEl.innerHTML = '';
        return;
      }

      sugestoesEl.innerHTML = `<span class="sugestoes-label">Sugestões:</span> ` +
        sugestoes.map(s => `<button type="button" class="tag-sugestao" data-tag="${esc(s)}">${esc(s)}</button>`).join('');

      sugestoesEl.querySelectorAll('.tag-sugestao').forEach(btn => {
        btn.addEventListener('click', () => {
          const current = tagsEl.value.trim();
          tagsEl.value = current ? `${current}, ${btn.dataset.tag}` : btn.dataset.tag;
          btn.remove();
          erroEl?.classList.add('hidden');
        });
      });
    };

    perguntaEl.addEventListener('input', atualizarSugestoes);
    respostaEl.addEventListener('input', atualizarSugestoes);
    tagsEl.addEventListener('input', () => erroEl?.classList.add('hidden'));

    // Gerar sugestões iniciais (para edição)
    atualizarSugestoes();
  }, 100);
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
// escapeHtml removido — agora usa esc() global de utils.js
