# Meu Rachão Pro - Documentação Completa

## Visão Geral

App de gerenciamento de rachões (peladas de futebol) feito em **vanilla JS + HTML + CSS**, sem framework nem backend. Todos os dados são persistidos em **localStorage**. Funciona como **PWA** (Progressive Web App) com suporte offline via Service Worker.

**Repositório:** https://github.com/brunovs80-lab/meu-rachao-pro.git

---

## Estrutura de Arquivos

```
meu-rachao-pro/
├── index.html          # Página única (SPA) com todas as telas (881 linhas)
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (cache v4)
├── .gitignore          # Ignora .claude/
├── simulator.html      # (arquivo legado)
├── css/
│   ├── style.css       # Estilos globais, componentes, tema dark (1537 linhas)
│   └── pages.css       # Estilos específicos de páginas (504 linhas)
├── js/
│   ├── data.js         # Camada de dados / localStorage CRUD (304 linhas)
│   ├── app.js          # Lógica principal do app (1227 linhas)
│   └── fantasy.js      # Liga Fantasy (244 linhas)
└── assets/
    └── logo.png        # Logo do app
```

---

## Conceito Principal: Rachão como Grupo Permanente

O **Rachão** é um grupo permanente (pode durar anos). Exemplo: "Rachão de Domingo" que existe desde 2020.

Dentro de cada rachão acontecem **Sessões** (dias de jogo individuais). O custo da quadra é **mensal** e dividido entre todos os participantes do rachão.

### Fluxo

1. Um jogador **cria** um Rachão (define dia da semana, horário, local, custo mensal)
2. O sistema gera um **código de 6 dígitos** alfanumérico (ex: `R4CH40`)
3. Outros jogadores **entram** no rachão usando esse código
4. No dia do jogo, o admin **cria uma Sessão** (dia de jogo)
5. Jogadores **confirmam presença** na sessão
6. Times são **sorteados** apenas com os confirmados
7. O custo mensal é **dividido** entre todos os participantes

---

## Modelo de Dados (localStorage)

Todas as chaves no localStorage têm prefixo `rachao_`.

### `rachaos[]` - Grupos permanentes
```js
{
  id: string,
  code: string,              // código 6 dígitos para entrar (ex: "R4CH40")
  name: string,              // "Rachão de Domingo"
  location: string,          // "Quadra Society Central"
  dayOfWeek: 0-6,            // 0=Domingo, 1=Segunda...
  time: "20:00",
  playersPerTeam: 5,         // jogadores de linha (+ 1 goleiro)
  tieRule: string,           // "playing_leaves" | "newest_leaves"
  monthlyVenueCost: number,  // custo mensal da quadra em R$
  pixKey: string,            // chave PIX para pagamento
  participants: string[],    // IDs de todos os membros
  createdBy: string,         // ID do criador (admin)
  status: 'active'
}
```

### `sessions[]` - Dias de jogo
```js
{
  id: string,
  rachaoId: string,          // referência ao rachão
  date: "2026-04-20",        // data do jogo
  confirmed: string[],       // IDs dos confirmados PARA ESTE jogo
  waiting: string[],         // lista de espera
  teams: null | Team[],      // times sorteados (array de arrays de IDs)
  leftover: string[],        // jogadores que sobraram do sorteio
  status: 'open' | 'done'
}
```

### `monthlyBilling[]` - Cobrança mensal
```js
{
  id: string,
  rachaoId: string,
  month: "2026-04",          // YYYY-MM
  totalCost: number,         // custo total (ex: 800)
  participantCount: number,
  perPerson: number,         // totalCost / participantCount
  payments: [{
    playerId: string,
    status: 'pending' | 'paid',
    paidAt: string | null    // ISO date
  }]
}
```

### `players[]` - Jogadores cadastrados
```js
{
  id: string,
  name: string,
  phone: string,
  position: string,          // "Atacante"|"Meia"|"Volante"|"Zagueiro"|"Lateral"|"Goleiro"
  goals: number, assists: number, tackles: number,
  fouls: number, yellows: number, reds: number,
  saves: number, cleanSheets: number,
  matches: number,
  blocked: boolean
}
```

### `pendingStats[]` / `validatedStats[]` - Estatísticas
```js
{
  id: string,
  playerId: string,
  sessionId: string,
  rachaoId: string,
  goals: number, assists: number, tackles: number,
  saves: number, cleanSheets: number,
  fouls: number, yellows: number, reds: number,
  submittedBy: string,
  submittedAt: string        // ISO date
}
```

### `fantasyTeams[]` - Times do Fantasy
```js
{
  userId: string,
  rachaoId: string,          // escopado por rachão
  name: string,
  slots: {
    ATK1: Player|null, ATK2: Player|null,
    MID1: Player|null, MID2: Player|null,
    DEF1: Player|null,
    GK: Player|null
  },
  savedAt: string
}
```

### `fantasyScores[]` - Pontuação Fantasy
```js
{
  userId: string,
  rachaoId: string,
  name: string,
  points: number,            // total geral
  daily: number,             // pontos do dia
  monthly: number            // pontos do mês
}
```

### Outros dados
- `currentUser` - Usuário logado `{ id, name, phone, position }`
- `rotationState` - Estado da rotação ativa
- `notifications[]` - Notificações do app (máx 50)
- `blockedPlayers[]` - IDs dos bloqueados
- `releaseRequests[]` - Pedidos de liberação
- `prizes` - Prêmios do Fantasy
- `syncQueue[]` - Fila de sincronização offline
- `migrationVersion` - Versão da migração de dados

---

## Páginas da SPA (index.html)

Navegação: `navigateTo('page-name')` → ativa `#page-{name}`.

| Page ID | Descrição |
|---------|-----------|
| `page-login` | Login por celular (simulado) |
| `page-verify` | Verificação SMS (aceita qualquer código de 4 dígitos) |
| `page-register` | Cadastro: nome e posição |
| `page-dashboard` | Tela inicial: rachões do usuário, menu grid, ranking |
| `page-matches` | Lista de rachões (tabs: Próximos / Anteriores) |
| `page-match-create` | Criar rachão (dia da semana, custo mensal, local...) |
| `page-match-join` | Entrar em rachão por código de 6 dígitos |
| `page-match-detail` | Detalhe do rachão com 3 tabs: Jogo / Jogadores / Financeiro |
| `page-rotation` | Rotação de times ao vivo com placar |
| `page-payments` | Lista de rachões com status de pagamento |
| `page-stats` | Estatísticas (tabs: Ranking / Artilharia / Assist. / Desarmes) |
| `page-register-stats` | Registrar estatísticas de uma sessão |
| `page-players` | Lista de jogadores com busca |
| `page-player-add` | Adicionar jogador manualmente |
| `page-fantasy` | Fantasy League (tabs: Ranking / Meu Time / Pontos / Prêmios) |
| `page-profile` | Perfil do usuário com stats e menu admin |
| `page-admin` | Painel admin: validar stats, pagamentos, bloqueados |
| `page-admin-stats` | Aprovar/rejeitar estatísticas pendentes |
| `page-admin-payments` | Gerenciar pagamentos dos jogadores |
| `page-admin-blocked` | Jogadores bloqueados e pedidos de liberação |
| `page-settings` | Configurações de notificações e modo offline |
| `page-notifications` | Lista de notificações |

### Modais
- `modal-fantasy-picker` - Escolher jogador para o Fantasy
- `modal-match-menu` - Menu de opções do rachão (stats, rotação, encerrar)
- `modal-request-release` - Solicitar liberação de bloqueio

---

## Funções Principais (js/app.js)

### Inicialização
- `DOMContentLoaded` → `migrateToRachaoModel()` → `seedDemoData()` → `checkAuth()`
- `registerSW()` - Registra Service Worker
- `initOfflineDetection()` - Badge offline/online

### Autenticação (simulada)
- `handleLogin()` - Valida celular, cria/recupera usuário
- `handleVerify()` - Aceita qualquer 4 dígitos como código SMS
- `checkAuth()` - Se logado, vai para dashboard
- `logout()` - Remove currentUser

### Navegação
- `navigateTo(page)` - Ativa página, chama `onPageLoad()`
- `onPageLoad(page)` - Despacha para handler correto (loadDashboard, loadRachaos, etc.)

### Dashboard
- `loadDashboard()` - Lista rachões do usuário no card, ou mostra empty state
- `loadDashRanking()` - Top 5 jogadores por pontuação

### Rachão (CRUD)
- `createRachao()` - Cria rachão com dayOfWeek, monthlyVenueCost, code de 6 dígitos
- `generateRachaoCode()` - Gera código alfanumérico de 6 chars (0-9, A-Z exceto O/I/L)
- `joinRachaoByCode()` - Entra em rachão por código, adiciona a participants
- `shareRachaoCode()` - Copia código para clipboard
- `loadRachaos()` - Lista rachões do usuário
- `openRachao(id)` - Seta `currentRachaoId` e navega para detalhe

### Detalhe do Rachão (3 tabs)
- `loadRachaoDetail()` - Carrega info + despacha tabs
- `loadRachaoGameTab(rachao, user)` - Tab "Jogo": sessão ativa, criar sessão, sorteio
- `loadSessionPresence(session, rachao, user)` - Lista confirmados, botão presença
- `loadSessionTeams(session)` - Renderiza times sorteados
- `loadRachaoMembersTab(rachao)` - Tab "Jogadores": lista de participantes
- `loadRachaoFinanceTab(rachao, user)` - Tab "Financeiro": divisão, pagamentos, PIX

### Sessão (dia de jogo)
- `createSession()` - Cria sessão com data do próximo dia da semana
- `togglePresence()` - Alterna presença na sessão (confirmado/não)
- `endSession()` - Marca sessão como done
- `drawTeams()` - Sorteia times com os confirmados da sessão

### Financeiro
- `getOrCreateBilling(rachao, month, perPerson)` - Auto-cria billing do mês se não existir
- `confirmBillingPayment(billingId, playerId)` - Admin confirma pagamento
- `notifyPayment()` - Jogador informa que pagou
- `copyFinancePix()` - Copia chave PIX

### Sorteio de Times
- `drawTeams()` - Divide confirmados em times iguais (shuffle aleatório)
- `getTeamName(idx)` / `getTeamClass(idx)` - Nomes e classes CSS dos times
- `renderAllTeams(teams)` - Renderiza cards dos times

### Rotação
- `loadRotation()` - Verifica se há rotação ativa
- `startRotation()` - Inicia rotação com times sorteados + fila de espera
- `addGoalRotation(team)` - Registra gol (time a ou b)
- `finishRound()` - Finaliza partida, aplica regra de empate
- `renderRotationState(state)` - Renderiza placar, fila, próximo time
- `buildRotationTeam(teamData)` - Monta HTML de um time na rotação
- `endRotation()` - Encerra rotação e salva histórico

### Estatísticas
- `loadStats()` / `renderStatsTab(tab)` - Tabs de ranking por diferentes métricas
- `loadRegisterStats()` - Form para registrar stats de jogadores da sessão
- `saveMatchStats()` - Envia stats para validação (pendingStats)
- `loadAdminStats()` - Lista stats pendentes para admin aprovar
- `validateStat(statId, approved)` - Admin aprova/rejeita stat (atualiza player)

### Pagamentos e Bloqueio
- `loadPayments()` - Lista rachões com status de pagamento do usuário
- `loadAdminPayments()` - Admin vê todos os jogadores e pode bloquear
- `blockPlayer(pid)` / `unblockPlayer(pid)` - Bloqueia/desbloqueia jogador
- `loadAdminBlocked()` - Lista bloqueados e pedidos de liberação
- `requestRelease()` - Jogador solicita liberação
- `approveRelease(reqId, playerId)` / `denyRelease(reqId)` - Admin responde

### Jogadores
- `loadPlayers()` / `renderPlayerList(players)` - Lista com busca
- `filterPlayers()` - Filtra por nome
- `addPlayer()` - Adiciona jogador manualmente

### Perfil
- `loadProfile()` - Mostra dados e stats do usuário logado

### Notificações
- `loadNotifications()` - Lista notificações com ícones e timestamps

### UI Helpers
- `initTabs()` - Gerencia tabs genéricos (data-tab)
- `showToast(msg)` - Toast de 2.5s
- `closeModal(name)` - Fecha modal
- `show(id)` / `hide(id)` - Display block/none
- `adjustNumber(id, delta)` - Incrementa/decrementa input numérico

---

## Funções de Dados (js/data.js)

### CRUD
| Função | Descrição |
|--------|-----------|
| `getRachaos()` / `saveRachaos(r)` | Lista de rachões |
| `getRachaoById(id)` | Busca rachão por ID |
| `updateRachao(id, data)` | Atualiza rachão (merge) |
| `getSessions()` / `saveSessions(s)` | Lista de sessões |
| `getSessionById(id)` | Busca sessão por ID |
| `getSessionsByRachao(rachaoId)` | Sessões de um rachão |
| `updateSession(id, data)` | Atualiza sessão (merge) |
| `getMonthlyBilling()` / `saveMonthlyBilling(b)` | Cobranças mensais |
| `getPlayers()` / `savePlayers(p)` | Jogadores |
| `getPlayerById(id)` | Busca jogador por ID |
| `updatePlayer(id, data)` | Atualiza jogador (merge) |
| `getPendingStats()` / `savePendingStats(s)` | Stats pendentes |
| `getValidatedStats()` / `saveValidatedStats(s)` | Stats validadas |
| `getFantasyTeams()` / `saveFantasyTeams(t)` | Times do Fantasy |
| `getFantasyScores()` / `saveFantasyScores(s)` | Scores do Fantasy |
| `getRotationState()` / `saveRotationState(s)` | Estado da rotação |
| `getBlockedPlayers()` / `saveBlockedPlayers(b)` | Jogadores bloqueados |
| `getReleaseRequests()` / `saveReleaseRequests(r)` | Pedidos de liberação |
| `getPrizes()` / `savePrizesData(p)` | Prêmios do Fantasy |
| `getNotifications()` / `addNotification(notif)` | Notificações |
| `getCurrentUser()` / `setCurrentUser(user)` | Usuário logado |

### Utilitários
| Função | Descrição |
|--------|-----------|
| `generateId()` | ID único (timestamp base36 + random) |
| `formatPhone(phone)` | Formata `(11) 99999-9999` |
| `formatCurrency(v)` | Formata `R$ 99,99` |
| `formatDateBR(s)` | Formata `DD/MM/YYYY` |
| `getMonthAbbr(i)` | Mês abreviado (JAN, FEV...) |
| `getDayName(i)` | Dia da semana (Domingo, Segunda...) |
| `getDayNameShort(i)` | Dia abreviado (DOM, SEG...) |
| `getCurrentMonth()` | Mês atual `YYYY-MM` |
| `getNextDayOfWeek(day)` | Próxima data do dia da semana |

### Migração
- `migrateToRachaoModel()` - Converte dados antigos (`matches[]`, `payments[]`) para o novo modelo (`rachaos[]`, `sessions[]`, `monthlyBilling[]`). Roda uma vez (controlada por `migrationVersion`).

### Seed
- `seedDemoData()` - Cria dados demo se o app estiver vazio:
  - 18 jogadores com stats variadas
  - 1 rachão "Rachão de Domingo" (código `R4CH40`, custo R$800/mês)
  - 1 sessão aberta com 12 confirmados
  - Billing mensal com 10 pagos e 8 pendentes
  - 5 scores de Fantasy

### Sistema de Pontos Fantasy (`POINTS`)
```js
field:      { goal: 5, assist: 3, tackle: 2, win: 2, presence: 1, foul: -1, yellow: -2, red: -4 }
goalkeeper: { save: 1, cleanSheet: 5, win: 3, presence: 1, goalConceded: -0.5, multiplier: 1.3 }
```

---

## Fantasy League (js/fantasy.js)

Tudo escopado por `currentRachaoId`.

- `loadFantasy()` - Carrega time e ranking do rachão atual
- `renderFantasyRanking(period)` - Ranking filtrado por rachão (daily/monthly/alltime)
- `openFantasyPicker(slot)` - Abre modal para escolher jogador (da sessão ou participantes)
- `selectFantasyPlayer(playerId)` - Seleciona jogador para um slot
- `renderFantasyFormation()` - Renderiza formação 2-2-1-1 no campo
- `saveFantasyTeam()` - Salva time (mínimo 3 jogadores)
- `updateFantasyScoresFromStat(stat)` - Calcula pontos quando stat é validada
- `loadPrizes()` / `savePrizes()` - Gerencia prêmios configuráveis

### Formação
```
ATK1  ATK2     (Atacantes)
MID1  MID2     (Meias)
  DEF1         (Zagueiro)
   GK          (Goleiro)
```

---

## Service Worker (sw.js)

- Cache: `rachao-v4`
- Estratégia: **cache-first com atualização em background**
- Assets cacheados: `/`, `/index.html`, CSS, JS, logo
- No fetch: retorna cache, tenta atualizar em background
- Na instalação: pré-cacheia todos os assets
- Na ativação: limpa caches antigos

---

## PWA (manifest.json)

- Nome: "Meu Rachão Pro"
- Display: standalone (sem barra do navegador)
- Tema: `#7B2CBF` (roxo)
- Background: `#0D0D1A` (dark)
- Ícone: `assets/logo.png`

---

## Estilo e Tema

- **Dark theme** com fundo `#0D0D1A`
- Cores principais:
  - `--purple`: `#7B2CBF` / `--purple-light`: `#A855F7`
  - `--orange`: `#FF7A00`
  - `--green`: `#00C853`
  - `--red`: `#FF5252`
  - `--yellow`: `#FFD600`
- Font: Inter (Google Fonts)
- Ícones: Font Awesome 6.5.1
- Layout mobile-first, max-width ~480px
- Bottom nav fixa em páginas principais
- Cards com glassmorphism e gradientes

---

## Regras de Negócio

### Criação de Rachão
- Nome, dia da semana, horário, local, jogadores por time, regra de empate, custo mensal, chave PIX
- Código de 6 dígitos gerado automaticamente (chars: 0-9, A-Z sem O/I/L para evitar confusão)
- Criador é automaticamente o admin e primeiro participante

### Entrada por Código
- Jogador digita código de 6 dígitos (case-insensitive, convertido para uppercase)
- Se código válido e jogador não está no rachão, é adicionado a `participants[]`
- Se já participa, mostra mensagem

### Sessão de Jogo
- Admin cria sessão → data é calculada automaticamente pelo próximo dia da semana do rachão
- Jogadores confirmam/cancelam presença individualmente
- Apenas confirmados participam do sorteio de times
- Sessão pode ser encerrada (status = 'done')

### Sorteio de Times
- Jogadores confirmados são embaralhados (Fisher-Yates)
- Divididos em N times de `playersPerTeam` jogadores
- Se sobram jogadores (número não divisível), ficam em `leftover[]`
- Após sorteio, botão de iniciar rotação aparece

### Rotação
- 2 times jogam, demais ficam na fila
- Admin registra gols
- Ao finalizar partida:
  - **Vencedor** fica no campo
  - **Empate**: aplica `tieRule` do rachão
    - `playing_leaves`: time que estava jogando sai
    - `newest_leaves`: time que entrou por último sai
  - Próximo time da fila entra
- Histórico de rodadas é salvo

### Financeiro
- Custo mensal da quadra / número de participantes = valor por pessoa
- Billing é criado automaticamente ao acessar a tab financeiro do mês
- Admin pode confirmar pagamento de cada jogador
- Jogador pode informar pagamento (cria notificação para admin)
- Jogador pode copiar chave PIX

### Estatísticas (Anti-fraude)
- Qualquer jogador pode registrar stats (gols, assists, desarmes, defesas, etc.)
- Stats vão para `pendingStats[]` (aguardando validação)
- Admin aprova ou rejeita cada stat
- Ao aprovar: stats são somadas ao perfil do jogador e scores do Fantasy são atualizados
- Ao rejeitar: stat é descartada

### Bloqueio por Inadimplência
- Admin pode bloquear jogador manualmente
- Jogador bloqueado pode solicitar liberação (com mensagem)
- Admin aprova ou nega liberação
- Jogador bloqueado não pode confirmar presença

---

## Variáveis Globais (app.js)

```js
let currentRachaoId = null;   // ID do rachão sendo visualizado
let currentSessionId = null;  // ID da sessão ativa
```

## Variáveis Globais (fantasy.js)

```js
let fantasySlotSelection = null;   // Slot sendo editado
let fantasyTeamSlots = {           // Jogadores selecionados
  ATK1: null, ATK2: null,
  MID1: null, MID2: null,
  DEF1: null, GK: null
};
```

---

## Como Testar

1. Limpar localStorage: `localStorage.clear()` no console
2. Recarregar a página → `seedDemoData()` cria dados demo
3. Login: qualquer número de celular (11 dígitos)
4. Código SMS: qualquer 4 dígitos
5. Cadastro: nome e posição
6. No dashboard: rachão demo "Rachão de Domingo" aparece
7. Código para entrar: `R4CH40`

### Testar com servidor local
```bash
npx serve .
# ou
python -m http.server 8000
```

---

## Histórico de Commits

1. `feat: Meu Rachão Pro - app completo de gerenciamento de peladas` — versão inicial
2. `feat: rotação de times, fantasy detalhado e suporte offline PWA` — rotação, PWA, pontos fantasy
3. `fix: adicionar slots de formação do Fantasy no HTML` — fix HTML do fantasy
4. `feat: código de 6 dígitos para entrar no rachão + renomear pelada para rachão` — código de entrada, renaming
5. `feat: reestruturar app para modelo rachão permanente + sessões` — reestruturação completa para modelo rachão + sessões + billing mensal

---

## Possíveis Melhorias Futuras

- [ ] Backend real (Firebase, Supabase ou API própria) para multi-device
- [ ] Notificações push reais via Web Push API
- [ ] Foto de perfil e avatar do rachão
- [ ] Histórico de sessões com detalhes (times, placar, MVP)
- [ ] Gráficos de evolução de stats por jogador
- [ ] Chat interno por rachão
- [ ] Exportar dados (PDF/Excel)
- [ ] Integração com calendário do celular
- [ ] Sistema de convite por link (além do código)
- [ ] Múltiplos admins por rachão
