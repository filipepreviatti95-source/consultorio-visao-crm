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
  currentPage: 'dashboard',
  pacientes: [],
  agendamentos: [],
  conversas: [],
  conversasRecentes: [],
  currentChatPaciente: null,
  darkMode: localStorage.getItem('darkMode') === 'true',
  semanaOffset: 0,
  realtimeChannels: [],
};
