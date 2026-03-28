# Consultório Visão — Instruções para Claude

## Projeto
CRM + Bot WhatsApp IA para ótica em Tijucas-SC.
Stack: HTML/CSS/JS puro + Supabase + n8n + GPT-4o.

## Arquivos principais
- `app.js` — Lógica do CRM (SPA, Supabase Realtime, renderização)
- `index.html` — Estrutura HTML do CRM
- `styles.css` — Estilos com tema claro/escuro e responsividade
- `supabase-config.js` — Credenciais Supabase (não commitar)

## Credenciais (NUNCA commitar)
`/Users/filipepreviatti/consultorio-visao-context/CONTEXT.md`
Contém: Supabase keys, OpenAI API key, Google OAuth2, WhatsApp tokens, n8n API key.

## Infraestrutura
| Serviço | Referência |
|---------|-----------|
| CRM (Vercel) | `consultorio-visao-crm.vercel.app` — auto-deploy via push em `main` |
| GitHub | `filipepreviatti95-source/consultorio-visao-crm` |
| n8n WhatsApp Bot | Workflow ID: `6tphz1TmSJHV2WJO` |
| n8n Google Calendar | Workflow ID: `T8EDbaofpc8nH8q1` |
| Supabase | Projeto: `qnctvnumzvsetxjifcca` |
| n8n Server | `n8n.clinicavisao.com.br` / `n8n.srv1474226.hstgr.cloud` |

## Banco de dados (Supabase)
- `pacientes` — telefone UNIQUE, status: novo_contato/agendado/confirmado/concluido/cancelado
- `conversas` — mensagens WhatsApp, remetente: paciente/assistente
- `agendamentos` — data_hora TIMESTAMPTZ, google_event_id
- Realtime habilitado nas 3 tabelas

## Regras críticas
- Timezone: sempre `America/Sao_Paulo` com Luxon — nunca `new Date().toLocaleString()`
- Telefone: DDI+DDD+num sem espaço (ex: `554899249063`)
- Upsert pacientes: `ON CONFLICT (telefone) DO UPDATE` com `resolution=merge-duplicates`
- Modelo IA: GPT-4o para respostas do bot — nunca `gpt-4o-mini`
- Nunca usar Google Sheets no workflow — tudo via Supabase
- CSV: separador `;`, BOM UTF-8 para Excel
- Idioma: Português (Brasil)

## Negócio
- Nome: Consultório Visão — Tijucas-SC
- Endereço: Rua Coronel Buchelle, 752
- WhatsApp: (48) 99989-5513
- Instagram: @examedevisao
- Consultas: Terça e Quinta, 9h-12h e 14h-18h
- Duração: 30 min | Valor: R$ 59,90
- Pagamentos: Dinheiro, débito, PIX (sem planos de saúde)
- Bot (Clara): tom consultivo, vende consulta, bloqueia off-topic

## CRM — Features atuais
- Dashboard com 7 métricas
- Kanban automático (drag & drop + Realtime)
- Agendamentos com filtro de datas e exportar CSV
- Chat WhatsApp com notificação sonora
- Pacientes com busca e filtro por status
- Tema claro/escuro
- Google Calendar sync bidirecional

---

# Workflow n8n: Atendimento WhatsApp v3 (Mapa Completo)

## Visao Geral
- Workflow ID: `6tphz1TmSJHV2WJO`
- Versao: 507+ iteracoes
- Status: **Ativo**
- Persona da IA: **Clara** — consultora de atendimento, tom profissional e acolhedor
- Modelo IA: **GPT-4o** (respostas), **GPT-4o-mini** (analise de imagem e resumos)
- Transcricao de audio: **Whisper** (OpenAI)
- Objetivo: **Agendar consultas de exame de vista**
- Total: **39 nodes**

---

## Tabelas Supabase

| Tabela | Uso |
|---|---|
| `pacientes` | Cadastro (telefone PK, nome, status, observacoes, created_at, updated_at) |
| `conversas` | Historico de mensagens (telefone, paciente_id, mensagem, remetente, origem, tipo_midia, message_id) |
| `agendamentos` | Consultas (paciente_id, nome_paciente, telefone, data_hora, status, google_event_id, observacoes) |
| `message_queue` | Fila de debounce temporaria (telefone, message_id, texto, created_at) |
| `base_conhecimento` | FAQ/KB (pergunta, resposta, palavras_chave[], categoria, ativo) |

---

## Lista Completa de Nodes (39)

### Trigger / Entrada
| # | Node | Tipo | ID |
|---|---|---|---|
| 1 | Webhook WhatsApp | webhook (POST /consultorio-visao) | `node-webhook` |
| 2 | Meta Webhook Verify | webhook (GET /consultorio-visao-verify) | `wh-get-meta` |
| 3 | Responder Verificacao | respondToWebhook | `respond-get-meta` |

### Processamento Inicial
| # | Node | Tipo | ID |
|---|---|---|---|
| 4 | Filtrar Mensagem Valida | if (existe messages[0].type?) | `node-filtrar` |
| 5 | Extrair Dados da Mensagem | code | `node-extrair` |
| 6 | Aguardar Digitacao | wait (10s) | `debounce-wait-001` |
| 7 | Checar Ultima Mensagem | code | `debounce-check-001` |

### Pipeline de Midia
| # | Node | Tipo | ID |
|---|---|---|---|
| 8 | E Midia? | if (mediaId notEmpty?) | `verifica-tipo-msg` |
| 9 | Buscar URL Midia | httpRequest (Meta Graph API) | `busca-url-midia` |
| 10 | Processar Midia | code | `processa-midia` |
| 11 | Transcrever Audio | code (Whisper) | `transcreve-audio` |
| 12 | Analisar Imagem | code (GPT-4o-mini Vision) | `analisa-imagem` |
| 13 | Unificar Midia | code | `unifica-midia` |

### Contexto e IA
| # | Node | Tipo | ID |
|---|---|---|---|
| 14 | Buscar Historico Supabase | code | `node-historico-supabase` |
| 15 | Consultar Horarios Disponiveis | code (Google Calendar) | `node-horarios` |
| 16 | Classificar Intencao | code (regex local) | `node-classificar-intencao` |
| 17 | Montar Contexto IA | code (RAG condicional) | `node-contexto` |
| 18 | Gerar Resposta IA | httpRequest (OpenAI GPT-4o) | `node-openai` |
| 19 | Processar Resposta IA | code | `node-processar` |

### Persistencia (Supabase)
| # | Node | Tipo | ID |
|---|---|---|---|
| 20 | Supabase - Prep Upsert | code | `supabase-prep-upsert` |
| 21 | Supabase - Upsert Paciente | httpRequest | `supabase-http-upsert` |
| 22 | Supabase - Prep Conversa | code | `supabase-prep-conversa` |
| 23 | Supabase - Salvar Conversa | httpRequest | `supabase-http-conversa` |
| 24 | Salvar Mensagem Bruta | code (safety net) | `salvar-mensagem-bruta-001` |

### Agendamento
| # | Node | Tipo | ID |
|---|---|---|---|
| 25 | Tem Agendamento? | if | `node-tem-agendamento` |
| 26 | Desempacotar Agendamentos | code | `desempacotar-agendamentos` |
| 27 | Criar Evento Google Agenda | code (Google Calendar) | `criar-evento-agenda` |
| 28 | Supabase - Prep Agendamento | code | `supabase-prep-agendamento` |
| 29 | Supabase - Criar Agendamento | httpRequest | `supabase-http-agendamento` |
| 30 | Atualizar Status Paciente Agendado | code | `supabase-update-status-agendado` |

### Cancelamento
| # | Node | Tipo | ID |
|---|---|---|---|
| 31 | Tem Cancelamento? | if | `tem-cancelamento` |
| 32 | Processar Cancelamento | code | `processar-cancelamento` |

### Envio de Resposta
| # | Node | Tipo | ID |
|---|---|---|---|
| 33 | Precisa de Secretaria? | if | `node-precisa-sec` |
| 34 | Alertar Secretaria | httpRequest (WhatsApp) | `node-alertar-sec` |
| 35 | Delay Humano | wait (3s) | `delay-humano` |
| 36 | Enviar Localizacao? | if | `node-enviar-loc-if` |
| 37 | Enviar Localizacao WhatsApp | httpRequest | `node-enviar-loc` |
| 38 | Enviar Resposta WhatsApp | httpRequest | `node-enviar` |
| 39 | Marcar Mensagem Lida | httpRequest | `node-marcar-lida` |

---

## Fluxo de Conexoes (Pipeline Completo)

### Fluxo Principal
```
Webhook WhatsApp (POST)
  -> Filtrar Mensagem Valida (messages[0].type existe?)
    -> [TRUE] Extrair Dados da Mensagem
      -> (3 branches PARALELAS):
         |-- Branch 1 (DEBOUNCE): Aguardar Digitacao (10s) -> Checar Ultima Mensagem
         |-- Branch 2 (PACIENTE): Supabase - Prep Upsert -> Supabase - Upsert Paciente
         |-- Branch 3 (SAFETY NET): Salvar Mensagem Bruta
```

### Apos Debounce (Branch 1 continua)
```
Checar Ultima Mensagem
  -> E Midia?
    -> [TRUE - tem mediaId]:
       Buscar URL Midia (Meta) -> Processar Midia
         -> (2 branches paralelas):
            |-- Transcrever Audio (Whisper)
            |-- Analisar Imagem (GPT-4o-mini)
         -> Unificar Midia -> Buscar Historico Supabase
    -> [FALSE - texto puro]:
       Buscar Historico Supabase (direto)
```

### Pipeline de IA
```
Buscar Historico Supabase
  -> Consultar Horarios Disponiveis (Google Calendar)
    -> Classificar Intencao (regex local, 7 categorias)
      -> Montar Contexto IA (RAG condicional por intencao)
        -> Gerar Resposta IA (GPT-4o, max_tokens=400)
          -> Processar Resposta IA (extrai tags, valida slots)
```

### Pos-Processamento (4 branches PARALELAS)
```
Processar Resposta IA ->
  |-- Branch 1: Supabase - Prep Conversa -> Supabase - Salvar Conversa
  |-- Branch 2: Tem Agendamento?
  |     -> [TRUE] Desempacotar Agendamentos -> Criar Evento Google Agenda
  |       -> Supabase - Prep Agendamento -> Supabase - Criar Agendamento
  |       -> Atualizar Status Paciente Agendado
  |-- Branch 3: Precisa de Secretaria?
  |     -> [TRUE] Alertar Secretaria (WhatsApp p/ 554899249063) -> Delay Humano (3s)
  |     -> [FALSE] Delay Humano (3s)
  |-- Branch 4: Tem Cancelamento?
        -> [TRUE] Processar Cancelamento (Supabase + Google Calendar)
```

### Envio Final
```
Delay Humano (3s)
  -> Enviar Localizacao?
    -> [TRUE] Enviar Localizacao WhatsApp -> Enviar Resposta WhatsApp -> Marcar Mensagem Lida
    -> [FALSE] Enviar Resposta WhatsApp -> Marcar Mensagem Lida
```

### Fluxo Auxiliar
```
Meta Webhook Verify (GET) -> Responder Verificacao (hub.challenge)
```

---

## Resumo Detalhado dos Code Nodes

### Extrair Dados da Mensagem (`node-extrair`)
- Parseia payload do webhook Meta (WhatsApp Business API)
- Extrai: telefone, messageId, nomeContato, phoneNumberId, tipoMensagem
- Tipos suportados: text, audio, image, document, video, sticker, interactive (botoes/listas), location
- Reactions sao ignoradas (return vazio)
- **DEBOUNCE v4**: insere na tabela `message_queue` do Supabase ANTES do Wait

### Checar Ultima Mensagem (`debounce-check-001`)
- **Debounce via Supabase** (lock externo entre execucoes paralelas)
- Apos Wait 10s, consulta `message_queue` para ver mensagem mais recente do telefone
- Se NAO eh a mais recente: `return []` (descarta — outra execucao processara)
- Se EH a mais recente: busca TODAS as mensagens da fila (ultimos 60s), combina textos
- Deduplica por message_id, limpa fila apos processar

### Transcrever Audio (`transcreve-audio`)
- Download do audio via Meta API (binary buffer)
- Envia para OpenAI Whisper (model: whisper-1, language: pt)
- Retorna: `[Audio transcrito]: <texto>`

### Analisar Imagem (`analisa-imagem`)
- Download da imagem via Meta API, converte para base64
- Envia para GPT-4o-mini Vision
- Prompt: descrever imagem no contexto de otica, extrair dados de receita medica (grau OD/OE, eixo, adicao), ou descrever problema de oculos
- Retorna: `[Imagem enviada]: <descricao>`

### Buscar Historico Supabase (`node-historico-supabase`)
- Busca paciente em `pacientes`
- Busca ultimas 10 conversas em `conversas`
- Busca ate 3 agendamentos ativos (status in agendado/confirmado)
- **Gap de sessao**: se ultima conversa > 2h atras e tem 4+ msgs:
  - Gera resumo via GPT-4o-mini
  - Salva em pacientes.observacoes

### Consultar Horarios Disponiveis (`node-horarios`)
- OAuth2 Google Calendar
- Busca eventos proximos 30 dias do calendar ID especifico
- **Dias: SOMENTE terca (weekday=2) e quinta (weekday=4)**
- **Horarios: 09:00-12:00 e 14:00-18:00 (slots de 30 min)**
- Filtra slots ocupados; ignora eventos fora do horario comercial (8h-19h)
- Retorna ate 30 slots agrupados por dia

### Classificar Intencao (`node-classificar-intencao`)
- Classificacao 100% local via regex (sem IA)
- 7 categorias: `saudacao`, `agendamento`, `objecao`, `informacao`, `reclamacao`, `acompanhamento`, `fora_escopo`
- **Continuidade inteligente**: se Clara falava sobre agendamento e paciente responde "sim/ok/pode" -> classifica como `agendamento`
- Detecta nomes sendo informados quando Clara pediu "nome completo"
- Negativas explicitas (nao, desisto) NAO sao continuidade

### Montar Contexto IA (`node-contexto`)
- **RAG por intencao** — monta system prompt condicional:
  - CORE (sempre): persona Clara, regras absolutas, formato, tom, anti-robo, contexto temporal, dados paciente
  - CONDICIONAL: blocos de consultorio, horarios, fluxo agendamento, argumentos de venda, regras finais
  - BASE CONHECIMENTO: match keywords/bigrams contra tabela `base_conhecimento`
  - HISTORICO: ultimas 5 mensagens formato OpenAI
- Gera array `messages` completo (system + historico + user)

### Processar Resposta IA (`node-processar`)
- Limpa tags ocultas do texto visivel
- **Filtro pos-GPT**: remove frases roboticas ("como posso", "ajudar", etc)
- **Extracao de agendamento**:
  - Metodo A (Tag): `[AGENDAMENTO_CONFIRMADO: nome=X, data=YYYY-MM-DD, horario=HH:MM]`
  - Metodo B (Fallback): regex contextual em texto livre
  - Suporta multiplos agendamentos por mensagem
- **Validacao**: cruza com slots reais do Google Calendar
- **Deduplicacao**: verifica agendamentos existentes no Supabase
- Detecta: precisaSecretaria, temCancelamento, enviarLocalizacao

### Processar Cancelamento (`processar-cancelamento`)
- Busca proximo agendamento futuro (status=agendado, data_hora >= agora)
- Deleta evento do Google Calendar
- Atualiza status para 'cancelado' no Supabase

### Supabase - Prep Upsert (`supabase-prep-upsert`)
- Verifica se paciente existe pelo telefone
- Paciente novo: status = 'novo_contato'
- Paciente existente: NAO sobrescreve status (preserva agendado/confirmado)

### Criar Evento Google Agenda (`criar-evento-agenda`)
- Cria evento de 30 min: `[EXAME] Nome - Telefone`
- Timezone: America/Sao_Paulo, colorId=7
- Reminders: popup 1h + email 24h

---

## Regras de Negocio Embarcadas no Codigo

### Tags de Controle (geradas pelo GPT, processadas pelo workflow)
- `[AGENDAMENTO_CONFIRMADO: nome=X, data=YYYY-MM-DD, horario=HH:MM]` — cria agendamento
- `[CANCELAMENTO: telefone=X]` — cancela proximo agendamento
- `[TRANSFERIR_SECRETARIA]` — alerta secretaria via WhatsApp

### Regras da Clara (system prompt)
- NUNCA indica oftalmologista, medico ou clinica externa
- NUNCA fala sobre assuntos fora de saude visual
- Max 2-3 frases por mensagem, max 1 emoji
- Palavras BANIDAS: "ajudar", "como posso", "fico a disposicao", "nao hesite"
- Sempre conduz para agendamento
- Transfere para secretaria apenas em: reclamacao grave, problema com oculos, situacao financeira
- Argumentos de venda embarcados para objecoes comuns (caro, plano, depois, etc.)

### Localizacao
- Coordenadas: -27.2413, -48.6342
- Enviada quando: agendamento confirmado OU Clara mencionou endereco

### Delay
- 3s antes de enviar resposta (simula digitacao humana)
- 10s de debounce para agrupar mensagens consecutivas

---

## Credentials
| Nome | ID | Uso |
|---|---|---|
| Meta WhatsApp API Token | `1FG133SMhUSwKVxO` | WhatsApp Business API |
| OpenAI API Key | `ZNFsCd4Q93jR9MUr` | GPT-4o, GPT-4o-mini, Whisper |
| Supabase Service Key | `05xFPLxWcffCfMye` | REST API Supabase (service_role) |
| Google Calendar | OAuth2 inline (refresh_token no code) | Google Calendar API |
