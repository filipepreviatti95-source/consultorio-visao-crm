/**
 * config.js — Supabase client + Estado global
 * Consultório Visão CRM
 */

// ── Supabase Client ──
const { createClient } = supabase;

export const SUPABASE_URL = window.SUPABASE_URL;
export const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ── Estado Global (reativo por referência) ──
export const State = {
  user: null,
  userRole: 'funcionario', // 'admin' | 'funcionario'
  currentPage: 'dashboard',
  pacientes: [],
  agendamentos: [],
  conversas: [],
  conversasRecentes: [],
  todasConversas: [],
  conversasFiltro: 'todas', // todas | com-resposta | so-enviadas | bot
  conversasBusca: '',
  currentChatPaciente: null,
  darkMode: localStorage.getItem('darkMode') === 'true',
  semanaOffset: 0,
  realtimeChannels: [],
};

/** Verifica se o usuário logado é admin */
export function isAdmin() {
  return State.userRole === 'admin';
}
