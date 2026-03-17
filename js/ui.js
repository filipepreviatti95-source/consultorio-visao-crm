/**
 * ui.js — Busca global (Ctrl+K) + Modal genérico
 */

import { State } from './config.js';
import { esc, iniciais, STATUS_LABEL } from './utils.js';

// ── Busca Global ──

let onSearchResultClick = null;
let searchInitDone = false;

export function setOnSearchResultClick(fn) {
  onSearchResultClick = fn;
}

export function initGlobalSearch() {
  if (searchInitDone) return;
  const toggle  = document.getElementById('search-toggle');
  const box     = document.getElementById('global-search-box');
  const input   = document.getElementById('global-search-input');
  const results = document.getElementById('global-search-results');
  if (!toggle || !box || !input || !results) return;
  searchInitDone = true;

  toggle.addEventListener('click', () => {
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) input.focus();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      box.classList.remove('hidden');
      input.focus();
    }
    if (e.key === 'Escape') box.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('global-search-wrap')?.contains(e.target)) {
      box.classList.add('hidden');
    }
  });

  let timeout;
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => renderSearchResults(input.value.trim(), results), 200);
  });
}

function renderSearchResults(q, container) {
  if (!q) { container.innerHTML = ''; return; }
  const lower = q.toLowerCase();
  const matches = State.pacientes.filter(p =>
    p.nome.toLowerCase().includes(lower) ||
    (p.telefone && p.telefone.includes(q)) ||
    (p.email && p.email.toLowerCase().includes(lower))
  ).slice(0, 8);

  if (matches.length === 0) {
    container.innerHTML = `<div class="search-empty">Nenhum resultado para "${esc(q)}"</div>`;
    return;
  }

  container.innerHTML = matches.map(p => `
    <div class="search-result-item" data-id="${p.id}">
      <div class="sr-avatar">${iniciais(p.nome)}</div>
      <div class="sr-info">
        <span class="sr-name">${esc(p.nome)}</span>
        <span class="sr-phone">${esc(p.telefone)}</span>
      </div>
      <span class="status-pill status-${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
    </div>`).join('');

  container.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const paciente = State.pacientes.find(p => p.id === item.dataset.id);
      if (paciente && onSearchResultClick) onSearchResultClick(paciente);
      document.getElementById('global-search-box').classList.add('hidden');
      document.getElementById('global-search-input').value = '';
      container.innerHTML = '';
    });
  });
}

// ── Modal Genérico ──

let modalInitDone = false;

export function initModal() {
  if (modalInitDone) return;
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');
  const overlay = document.getElementById('modal-overlay');
  if (!closeBtn || !cancelBtn || !overlay) return;
  modalInitDone = true;

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

export function openModal({ title, body, confirmText = 'Salvar', cancelText = 'Cancelar', onConfirm, hideFooter = false }) {
  document.getElementById('modal-title').textContent   = title;
  document.getElementById('modal-body').innerHTML      = body;
  document.getElementById('modal-confirm').textContent = confirmText;
  document.getElementById('modal-cancel').textContent  = cancelText;
  document.getElementById('modal-footer').style.display = hideFooter ? 'none' : '';

  const confirmBtn = document.getElementById('modal-confirm');
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
  newConfirm.className = 'btn btn-primary'; // reset class (remove btn-danger etc)

  if (onConfirm) {
    newConfirm.addEventListener('click', async () => {
      // Previne double-click: desabilita e mostra loading
      newConfirm.disabled = true;
      const origText = newConfirm.textContent;
      newConfirm.textContent = 'Salvando…';
      try {
        await onConfirm();
      } finally {
        newConfirm.disabled = false;
        newConfirm.textContent = origText;
      }
    });
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
  setTimeout(() => {
    const firstInput = document.querySelector('#modal-body input, #modal-body select, #modal-body textarea');
    if (firstInput) firstInput.focus();
  }, 50);
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
