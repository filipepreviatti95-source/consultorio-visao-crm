# Consultório Visão — Instruções para Claude

## Projeto
CRM + Bot WhatsApp IA para ótica em Tijucas-SC. Stack: HTML/CSS/JS puro + Supabase + n8n + GPT-4o.

## Arquivos principais
- `app.js` — Lógica do CRM (SPA, Supabase Realtime, renderização)
- `index.html` — Estrutura HTML do CRM
- `styles.css` — Estilos com tema claro/escuro e responsividade
- `supabase-config.js` — Credenciais Supabase (não commitar credenciais reais)
- `CONTEXT.md` — Documentação de arquitetura (seguro para Git, sem credenciais)

## Credenciais (arquivo local, NUNCA commitar)
```
/Users/filipepreviatti/consultorio-visao-context/CONTEXT.md
```
Contém: Supabase keys, OpenAI API key, Google OAuth2, WhatsApp tokens, n8n API key.

## Infraestrutura
| Serviço | Referência |
|---------|-----------|
| CRM (Vercel) | `consultorio-visao-crm.vercel.app` — auto-deploy via push em `main` |
| GitHub | `filipepreviatti95-source/consultorio-visao-crm` |
| n8n WhatsApp Bot | Workflow ID: `6tphz1TmSJHV2WJO` (v3) |
| n8n Google Calendar | Workflow ID: `T8EDbaofpc8nH8q1` |
| Supabase | Projeto: `qnctvnumzvsetxjifcca` |
| n8n Server | `n8n.clinicavisao.com.br` (alias) / `n8n.srv1474226.hstgr.cloud` |

## Banco de dados (Supabase)
- `pacientes` — telefone UNIQUE, status: novo_contato/agendado/confirmado/concluido/cancelado
- `conversas` — mensagens WhatsApp, remetente: paciente/assistente
- `agendamentos` — data_hora TIMESTAMPTZ, google_event_id
- Realtime habilitado nas 3 tabelas

## Regras
- Sempre use timezone `America/Sao_Paulo` para datas
- Idioma do CRM e bot: Português (Brasil)
- Formato telefone: DDI+DDD+num sem espaço (ex: `554899249063`)
- Upsert pacientes: `ON CONFLICT (telefone) DO UPDATE` com `resolution=merge-duplicates`
- Bot IA (Clara): tom consultivo, vende consulta R$59,90, bloqueia off-topic
- CSV: separador `;`, BOM UTF-8 para Excel
- Nunca usar `gpt-4o-mini` para respostas do bot (só para visão/OCR)
- Nunca usar Google Sheets no workflow (tudo via Supabase)
- Nunca usar `new Date().toLocaleString()` para timezone — usar Luxon

## Negócio
```
Consultório Visão — Tijucas-SC
Rua Coronel Buchelle, 752
WhatsApp: (48) 99989-5513
Instagram: @examedevisao
Consultas: Terça e Quinta, 9h-12h e 14h-18h
Duração: 30 min | Valor: R$ 59,90
Pagamentos: Dinheiro, débito, PIX (sem planos de saúde)
```

## Workflow v3 (atual) — 32 nós
Correções aplicadas em 2026-03-14:
1. Upsert `merge-duplicates` (não `ignore`)
2. Luxon timezone (não `toLocaleString`)
3. Histórico via Supabase REST (não Google Sheets)
4. Modelo GPT-4o (não mini)
5. Prompt consultivo com objeções e bloqueio off-topic
6. `data_hora` construída com Luxon `DateTime.fromISO`
7. Node "Atualizar Status Paciente Agendado" adicionado

## CRM — Features atuais
- Dashboard com 7 métricas
- Kanban automático (drag & drop + Realtime)
- Agendamentos com filtro de datas e exportar CSV
- Chat WhatsApp com notificação sonora
- Pacientes com busca e filtro por status
- Tema claro/escuro
- Google Calendar sync bidirecional
