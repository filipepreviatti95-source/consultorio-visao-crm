# Consultório Visão — Contexto do Projeto

> **Data do snapshot:** 2026-03-14
> Documento de referência de arquitetura e estado do projeto.
> ⚠️ As credenciais reais estão em `/Users/filipepreviatti/consultorio-visao-context/CONTEXT.md` (arquivo local, fora do Git).

---

## 1. VISÃO GERAL

Sistema completo de atendimento para **Consultório Visão** (ótica em Tijucas-SC).

| Componente | Status | Referência |
|---|---|---|
| CRM Web (Vercel) | ✅ Ativo | auto-deploy via push em `main` |
| GitHub (CRM) | ✅ | `filipepreviatti95-source/consultorio-visao-crm` |
| n8n WhatsApp Bot | ✅ Ativo | ID: `6tphz1TmSJHV2WJO` |
| n8n Google Calendar Sync | ✅ Ativo | ID: `T8EDbaofpc8nH8q1` |
| Supabase | ✅ Ativo | projeto: `qnctvnumzvsetxjifcca` |
| n8n Server | ✅ | `n8n.srv1474226.hstgr.cloud` |

---

## 2. BANCO DE DADOS — SUPABASE

### `pacientes`
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| nome | TEXT | |
| telefone | TEXT UNIQUE | DDI+DDD+num sem espaço: `554899249063` |
| status | TEXT | `novo_contato` \| `agendado` \| `confirmado` \| `concluido` \| `cancelado` |
| updated_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | DEFAULT now() |

Upsert: `ON CONFLICT (telefone) DO UPDATE SET nome, status, updated_at`

### `conversas`
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| paciente_id | UUID FK | pode ser NULL |
| telefone | TEXT | sempre preenchido |
| origem | TEXT | `whatsapp` |
| mensagem | TEXT | |
| remetente | TEXT | `paciente` \| `assistente` |
| tipo_midia | TEXT | `texto` \| `audio` \| `image` \| `document` \| `video` |
| created_at | TIMESTAMPTZ | |

### `agendamentos`
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| paciente_id | UUID FK | |
| nome_paciente | TEXT | |
| telefone | TEXT | |
| data_hora | TIMESTAMPTZ | |
| status | TEXT | `agendado` \| `confirmado` \| `concluido` \| `cancelado` |
| observacoes | TEXT | |
| google_event_id | TEXT | ID do evento no Google Calendar |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Realtime
Habilitado nas 3 tabelas. CRM usa canais: `pacientes-changes`, `conversas-changes`, `agendamentos-changes`.

---

## 3. N8N — WORKFLOWS

### Workflow 1: Atendimento WhatsApp v2
- **ID:** `6tphz1TmSJHV2WJO`
- **Webhook:** `POST .../webhook/consultorio-visao`
- **Fluxo:** WhatsApp → filtro → extração → (mídia opcional) → debounce → histórico → horários disponíveis → GPT-4o → Supabase + Google Calendar + WhatsApp API

**Kanban automático:** Node "Supabase - Prep Upsert" salva `status: 'agendado'` quando `temAgendamento === true`.

### Workflow 2: Google Calendar Sync
- **ID:** `T8EDbaofpc8nH8q1`
- **Webhook:** `POST .../webhook/gcal-sync`
- **Payload:** `{ acao, eventId, nome, telefone, dataHora, obs, status }`
- **Retorno:** `{ ok, acao, googleEventId }`
- Suporta `criar`, `atualizar`, `cancelar`

---

## 4. CRM — ARQUITETURA

**Stack:** HTML + CSS + JS puro, sem framework. Supabase JS SDK via CDN.

**Abas:** Dashboard | Kanban | Agendamentos | Pacientes | Chat

**Integração Google Calendar:**
```javascript
const GCAL_WEBHOOK = 'https://n8n.srv1474226.hstgr.cloud/webhook/gcal-sync';
```
`salvarAgendamento()` → salva Supabase → chama gcal-sync async → salva `google_event_id` de volta.

---

## 5. INFORMAÇÕES DO NEGÓCIO

```
Nome:        Consultório Visão
Cidade:      Tijucas-SC
Endereço:    Rua Coronel Buchelle, 752
WhatsApp:    (48) 99989-5513
Instagram:   @examedevisao
Profissional: Optometrista

Consultas:   Terça e Quinta, 9h-12h e 14h-18h
Duração:     30 min | Valor: R$ 59,90
Pagamentos:  Dinheiro, débito, PIX (sem planos)
```

---

## 6. TAREFAS PENDENTES

### 🔴 Crítico
- [ ] Meta WhatsApp: adicionar número de teste `+5548996467148` na lista de testers do app `1550354296195567`

### 🟡 Melhorias desejadas
- [ ] Notificação push/som no CRM para nova mensagem
- [ ] Confirmação automática de agendamento (WhatsApp 24h antes)
- [ ] Filtro de data no histórico de agendamentos
- [ ] Exportar agendamentos para CSV
- [ ] Login/autenticação no CRM
- [ ] Busca global de pacientes

### 🟢 Pode melhorar
- [ ] Migrar histórico 100% do Google Sheets para Supabase
- [ ] Verificar campo `data_hora` no n8n ao criar agendamento via WhatsApp (usa `dataConsulta` + `horarioConsulta` separados)

---

## 7. ESTADO ATUAL

### ✅ Funcionando
- Bot WhatsApp com IA (Clara): responde, agenda, transcreve áudio, analisa imagens
- Dados em tempo real no Supabase
- CRM completo: Dashboard (7 métricas), Kanban, Agendamentos, Pacientes, Chat
- Google Calendar Sync bidirecional via n8n
- Kanban automático por Supabase Realtime

### 📁 Últimos commits
```
e143252 docs: contexto completo (revertido do push por segurança)
55530f8 feat: dashboard completo, Google Calendar sync e Kanban automático
24fe878 fix: buscar conversas por paciente_id OU telefone no chat
f4374cd feat: CRM Kanban completo para Consultório Visão
```

---

## 8. ARQUIVO COM CREDENCIAIS REAIS

**Localização local (nunca commitar):**
```
/Users/filipepreviatti/consultorio-visao-context/CONTEXT.md        ← credenciais completas
/Users/filipepreviatti/consultorio-visao-context/n8n-workflow-whatsapp.json
/Users/filipepreviatti/consultorio-visao-context/n8n-workflow-gcal.json
```
