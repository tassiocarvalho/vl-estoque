<div align="center">

<img src="apps/web/public/icon.svg" width="88" alt="V&L Estoque" />

# V&L Estoque

**Sistema de gestão de estoque para a V&L Mercadinho e Panificadora**

Entradas e saídas pela bipagem · Alertas automáticos de reposição · Relatórios · Funciona sem internet

![Node.js](https://img.shields.io/badge/Node.js-24_LTS-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline-5A0FC8?logo=pwa&logoColor=white)

<a href="https://github.com/tassiocarvalho/vl-estoque/releases/latest/download/VL-Estoque-Setup-1.3.0.exe"><img src="https://img.shields.io/badge/Baixar_para_Windows-instalador_.exe-0f766e?style=for-the-badge&logo=windows&logoColor=white" alt="Baixar para Windows" /></a>

<img src="docs/screenshots/painel.png" width="900" alt="Painel do sistema" />

</div>

---

## 📑 Sumário

1. [Visão geral](#-visão-geral)
2. [Funcionalidades](#-funcionalidades)
3. [Telas](#-telas)
4. [Casos de uso](#-casos-de-uso)
5. [Arquitetura](#-arquitetura)
6. [Modelo de dados](#-modelo-de-dados)
7. [Diagrama de classes](#-diagrama-de-classes)
8. [Fluxos principais (sequência)](#-fluxos-principais)
9. [Estados](#-diagramas-de-estado)
10. [Regras de negócio e fórmulas](#-regras-de-negócio)
11. [Perfis e permissões](#-perfis-e-permissões)
12. [Segurança](#-segurança)
13. [API](#-api)
14. [Como rodar](#-como-rodar)
15. [Estrutura de pastas](#-estrutura-de-pastas)
16. [Pendências com o cliente](#-pendências-com-o-cliente)

---

## 🎯 Visão geral

O sistema substitui o controle manual de estoque do mercadinho e da panificadora. Cada mercadoria que **entra** (pedido recebido, retorno) ou **sai** (venda, perda, ajuste) é registrada pela **bipagem do código de barras**. O sistema mantém o saldo atualizado, calcula os indicadores de reposição e **avisa a gestão quando é hora de pedir**.

| Requisito do documento | Como foi atendido |
|---|---|
| Cadastro de mercadorias (nome, SKU, EAN, categoria, unidade, consumo e prazo) | Cadastro completo, com prévia ao vivo dos indicadores |
| Edição e exclusão com recuperação por 15 dias | Lixeira com prazo configurável e limpeza automática diária |
| Entrada de itens já cadastrados por SKU ou bipagem | Tela de entrada focada no leitor de código de barras |
| Saldo total e por item | Lista de produtos, busca por nome, SKU ou EAN, e painel |
| Alerta de estoque de segurança e solicitação de pedido | Solicitação automática ao atingir o Ponto de Pedido |
| Cálculo de PP, EM e ES | Domínio isolado e testado (`replenishment.ts`) |
| Relatórios diários, semanais e mensais (estoque parado, ruptura) | Relatórios por período, com exportação para Excel e impressão |
| Integração com o sistema de caixa | API de integração com chave (consulta de estoque e baixa de vendas) |
| Senha para operações, controle de acesso | Usuários com perfis, PIN pessoal e auditoria |
| Nuvem, sem perda de dados com queda de internet ou energia | Banco transacional, fila offline com sincronização automática |
| Rápido em PC básico com Windows | Carregamento sob demanda e buscas indexadas |
| Acesso por vários dispositivos, offline | PWA responsiva (PC, tablet e celular), instalável |

---

## ✨ Funcionalidades

| Módulo | O que faz |
|---|---|
| 📦 **Produtos** | Cadastro, edição, busca, filtros por situação e categoria, histórico por produto |
| 🗂️ **Categorias** | Categorias e subcategorias (vêm prontas para mercadinho e padaria) |
| ⬇️ **Entradas** | Pedido recebido, retorno ao estoque e ajuste, pela bipagem |
| ⬆️ **Saídas** | Venda, perda/quebra/vencimento e ajuste, com **registro rápido** (1 bip = 1 unidade) |
| 🔔 **Reposição** | EM, ES e PP calculados automaticamente, com solicitação de pedido gerada sozinha |
| 📋 **Pedidos** | Fluxo Pendente → Pedido feito → Recebido (ou Cancelado), com impressão da lista |
| 📊 **Relatórios** | Por período: movimentação por produto, estoque parado, rupturas e solicitações. Exporta CSV |
| 🗑️ **Lixeira** | Recupera produtos excluídos dentro do prazo, depois apaga automaticamente |
| 👥 **Usuários** | Administrador, Estoquista e Caixa, com senha provisória, PIN, e-mail e bloqueio |
| 🔑 **Esqueci minha senha** | Código de 6 números por e-mail (Gmail com senha de app ou outro SMTP), válido por 15 min |
| ⚖️ **LGPD** | Termo de Uso e Política de Privacidade com aceite versionado, “Baixar meus dados”, anonimização e retenção automática |
| 🛡️ **Auditoria** | Quem fez o quê e quando, inclusive tentativas de login erradas |
| ⚙️ **Configurações** | Regras ajustáveis sem programação |
| 📴 **Offline** | Registra sem internet e sincroniza quando a conexão volta |
| 🔌 **Integração PDV** | O caixa consulta o estoque e envia as vendas automaticamente |

---

## 🖼️ Telas

| Login | Produtos |
|:-:|:-:|
| <img src="docs/screenshots/login.png" width="440" /> | <img src="docs/screenshots/produtos.png" width="440" /> |
| **Registrar saída (bipagem)** | **Cadastro com indicadores calculados** |
| <img src="docs/screenshots/saida.png" width="440" /> | <img src="docs/screenshots/novo-produto.png" width="440" /> |
| **Detalhe do produto** | **Relatórios** |
| <img src="docs/screenshots/produto-detalhe.png" width="440" /> | <img src="docs/screenshots/relatorios.png" width="440" /> |
| **Solicitações de pedido** | **Modo offline** |
| <img src="docs/screenshots/pedidos.png" width="440" /> | <img src="docs/screenshots/offline.png" width="440" /> |
| **Configurações** | **Celular** |
| <img src="docs/screenshots/configuracoes.png" width="440" /> | <img src="docs/screenshots/celular-painel.png" width="160" /> &nbsp; <img src="docs/screenshots/celular-menu.png" width="160" /> |

---

## 🧑‍🤝‍🧑 Casos de uso

```mermaid
flowchart LR
    CX(("👤<br/>Caixa"))
    EST(("👤<br/>Estoquista"))
    ADM(("👤<br/>Administrador"))
    PDV(("🖥️<br/>Sistema de<br/>caixa (PDV)"))
    CRON(("⏰<br/>Agendador"))

    subgraph SIS["🏪 Sistema V&L Estoque"]
        direction TB
        UC01(["Fazer login"])
        UC02(["Consultar produtos e saldo"])
        UC03(["Registrar saída / venda"])
        UC04(["Registrar entrada"])
        UC05(["Cadastrar / editar produto"])
        UC06(["Gerenciar categorias"])
        UC07(["Consultar movimentações"])
        UC08(["Gerenciar solicitações de pedido"])
        UC09(["Emitir relatórios"])
        UC10(["Excluir produto"])
        UC11(["Restaurar da lixeira"])
        UC12(["Gerenciar usuários"])
        UC13(["Alterar configurações"])
        UC14(["Consultar auditoria"])
        UC15(["Gerar solicitação de pedido automática"])
        UC16(["Confirmar com PIN"])
        UC17(["Limpar lixeira expirada"])
        UC18(["Consultar disponibilidade"])
        UC19(["Enviar venda"])
    end

    CX --- UC01 & UC02 & UC03
    EST --- UC04 & UC05 & UC06 & UC07 & UC08 & UC09
    ADM --- UC10 & UC11 & UC12 & UC13 & UC14
    PDV --- UC18 & UC19
    CRON --- UC17

    EST -.->|herda| CX
    ADM -.->|herda| EST

    UC03 -.->|"«include»"| UC16
    UC04 -.->|"«include»"| UC16
    UC10 -.->|"«include»"| UC16
    UC03 -.->|"«extend» saldo ≤ PP"| UC15
    UC19 -.->|"«include»"| UC03

    classDef actor fill:#18664f,stroke:#134337,color:#fff
    classDef uc fill:#effaf5,stroke:#2a9d76,color:#134337
    class CX,EST,ADM,PDV,CRON actor
    class UC01,UC02,UC03,UC04,UC05,UC06,UC07,UC08,UC09,UC10,UC11,UC12,UC13,UC14,UC15,UC16,UC17,UC18,UC19 uc
```

### Descrição dos casos de uso principais

| ID | Caso de uso | Ator | Fluxo principal | Regras |
|---|---|---|---|---|
| UC03 | **Registrar saída** | Caixa+ | 1. Bipa o produto · 2. Informa a quantidade · 3. Confirma com PIN · 4. O sistema baixa o saldo | Bloqueia saldo insuficiente (configurável). Sem internet, guarda na fila |
| UC04 | **Registrar entrada** | Estoquista+ | 1. Bipa · 2. Escolhe o tipo (pedido ou retorno) · 3. Quantidade · 4. PIN | Soma ao saldo e grava no histórico |
| UC05 | **Cadastrar produto** | Estoquista+ | 1. Preenche os dados · 2. Vê EM, ES e PP calculados · 3. PIN | SKU e EAN únicos, consumo máximo ≥ médio |
| UC15 | **Solicitação automática** | Sistema | Após uma saída, se saldo ≤ PP e não há pedido em aberto, cria a solicitação | Quantidade sugerida pela fórmula de cobertura |
| UC10 | **Excluir produto** | Admin | 1. Confirma · 2. PIN · 3. O produto vai para a lixeira | Recuperável por N dias (padrão 15) |
| UC17 | **Limpar lixeira** | Agendador | Todo dia às 3h, apaga definitivamente o que expirou | Apaga também o histórico do produto |
| UC12 | **Gerenciar usuários** | Admin | Cria com senha provisória, edita, desativa, redefine senha ou PIN | Sempre ao menos 1 admin ativo |
| UC19 | **Enviar venda (PDV)** | PDV | Envia o cupom com os itens, e o sistema dá baixa | Idempotente pelo `externalId` |

---

## 🏗️ Arquitetura

**Monólito modular** com domínio isolado. É simples de operar num PC do mercadinho e cada módulo pode evoluir sem afetar os outros.

```mermaid
flowchart TB
    subgraph CLIENTE["💻 Navegador — PC, tablet ou celular"]
        direction LR
        UI["React 19 + Tailwind<br/>(telas)"]
        RQ["TanStack Query<br/>(cache de dados)"]
        SW["Service Worker<br/>(PWA, app offline)"]
        IDB[("IndexedDB<br/>fila offline<br/>+ catálogo")]
        UI --> RQ
        UI --> IDB
        RQ --> SW
    end

    subgraph SERVIDOR["🖥️ Servidor — Node.js + NestJS"]
        direction TB
        SEC["🛡️ Segurança<br/>Helmet · Rate limit · Anti-CSRF<br/>AuthGuard · PermissionsGuard · PinGuard"]
        subgraph MOD["Módulos"]
            direction LR
            M1[auth]
            M2[users]
            M3[products<br/>+ domain]
            M4[stock]
            M5[purchase-<br/>requests]
            M6[reports]
            M7[settings]
            M8[audit]
            M9[integration<br/>PDV]
        end
        ORM["Prisma ORM"]
        SEC --> MOD --> ORM
    end

    DB[("🐘 PostgreSQL")]
    PDV["🧾 Sistema de caixa (PDV)"]

    SW -->|"HTTPS / JSON + cookie httpOnly"| SEC
    PDV -->|"X-API-Key"| M9
    ORM --> DB

    classDef box fill:#effaf5,stroke:#2a9d76,color:#134337
    classDef dark fill:#18664f,stroke:#134337,color:#fff
    class UI,RQ,SW,M1,M2,M3,M4,M5,M6,M7,M8,M9,ORM box
    class SEC,DB,PDV dark
```

### Camadas de cada módulo

```mermaid
flowchart LR
    HTTP["🌐 Controller<br/>(rotas + DTOs validados)"] --> APP["⚙️ Service<br/>(casos de uso, transações)"]
    APP --> DOM["🧠 Domain<br/>(regras puras, testadas)"]
    APP --> INFRA["💾 Prisma<br/>(banco)"]
    EXT["🔌 Adaptadores<br/>(PDV)"] --> APP

    classDef c fill:#effaf5,stroke:#2a9d76,color:#134337
    class HTTP,APP,DOM,INFRA,EXT c
```

| Decisão | Motivo |
|---|---|
| **Livro de movimentações imutável** | Cada entrada e saída é um registro com o saldo resultante. O histórico dos relatórios sai pronto e permite auditar |
| **Atualização de saldo com trava de linha** | Duas vendas simultâneas nunca deixam o saldo errado |
| **ID gerado no aparelho (idempotência)** | A sincronização offline e o reenvio do PDV não duplicam registros |
| **Domínio puro** (`replenishment.ts`) | Mudar uma fórmula é mudar uma função testada, sem tocar em banco ou tela |
| **Regras em Configurações** | Lixeira, cobertura do pedido, estoque negativo e PIN são ajustáveis sem reprogramar |
| **Integração como adaptador** | Trocar de sistema de caixa afeta só o módulo `integration` |
| **PostgreSQL embutido** | Roda num PC Windows sem instalar banco, e migra para a nuvem só trocando a `DATABASE_URL` |

---

## 🗄️ Modelo de dados

```mermaid
erDiagram
    USERS ||--o{ STOCK_MOVEMENTS : "registra"
    USERS ||--o{ PURCHASE_REQUESTS : "cria"
    USERS ||--o{ AUDIT_LOGS : "gera"
    CATEGORIES ||--o{ CATEGORIES : "subcategoria de"
    CATEGORIES ||--o{ PRODUCTS : "classifica"
    PRODUCTS ||--o{ STOCK_MOVEMENTS : "possui"
    PRODUCTS ||--o{ PURCHASE_REQUESTS : "gera"

    USERS {
        uuid id PK
        string name
        string username UK
        string passwordHash "Argon2id"
        string pinHash "Argon2id, opcional"
        enum role "ADMIN, STOCKIST, CASHIER"
        boolean active
        boolean mustChangePassword
        int failedLoginAttempts
        datetime lockedUntil
        int tokenVersion "revoga sessões"
        datetime lastLoginAt
    }

    CATEGORIES {
        uuid id PK
        string name
        uuid parentId FK "nulo = categoria"
    }

    PRODUCTS {
        uuid id PK
        string name
        string sku UK
        string barcode UK "EAN/GTIN"
        uuid categoryId FK
        enum unit "UN, KG, L, CX..."
        decimal avgDailyConsumption
        decimal maxDailyConsumption
        int leadTimeDays
        decimal minimumStock "EM"
        decimal safetyStock "ES"
        decimal reorderPoint "PP"
        decimal currentStock "saldo"
        datetime deletedAt "lixeira"
    }

    STOCK_MOVEMENTS {
        uuid id PK "gerado no aparelho"
        uuid productId FK
        enum type "IN_PURCHASE, OUT_SALE..."
        decimal quantity
        decimal balanceAfter
        enum source "APP, PDV"
        uuid userId FK
        string note
        datetime occurredAt
    }

    PURCHASE_REQUESTS {
        uuid id PK
        uuid productId FK
        enum status "PENDING, ORDERED, RECEIVED, CANCELED"
        decimal suggestedQuantity
        decimal stockAtRequest
        decimal reorderPoint
        uuid createdById FK "nulo = automática"
        datetime closedAt
    }

    SETTINGS {
        string key PK
        json value
    }

    AUDIT_LOGS {
        uuid id PK
        uuid userId FK
        string action
        string entity
        string entityId
        json details
        string ip
        datetime createdAt
    }
```

### Dicionário resumido

| Tabela | Finalidade | Observações |
|---|---|---|
| `users` | Funcionários com acesso | Nunca são apagados, só desativados (o histórico é preservado) |
| `categories` | Categoria e subcategoria (2 níveis) | Não remove se tiver produtos ou subcategorias |
| `products` | Catálogo e saldo atual | EM, ES e PP gravados para filtros rápidos |
| `stock_movements` | Livro de entradas e saídas | Imutável, com índice por produto e data |
| `purchase_requests` | Solicitações de pedido | Uma em aberto por produto |
| `settings` | Parâmetros do sistema | JSON flexível, sem migration para novas regras |
| `audit_logs` | Rastro de ações | Logins, falhas, cadastros, exclusões |

---

## 🧩 Diagrama de classes

```mermaid
classDiagram
    direction LR

    class Replenishment {
        <<domain>>
        +calculateIndicators(profile) Indicators
        +classifyStock(stock, indicators) StockStatus
        +needsReorder(stock, indicators) boolean
        +suggestOrderQuantity(stock, profile, coverageDays) number
    }
    class ConsumptionProfile {
        <<value object>>
        +avgDailyConsumption: number
        +maxDailyConsumption: number
        +leadTimeDays: number
    }
    class Indicators {
        <<value object>>
        +minimumStock: number
        +safetyStock: number
        +reorderPoint: number
    }
    class StockStatus {
        <<enumeration>>
        OUT_OF_STOCK
        CRITICAL
        REORDER
        OK
    }

    class ProductsService {
        +list(filters) Paginated~ProductView~
        +lookup(code) ProductView
        +create(dto, actor) ProductView
        +update(id, dto, actor) ProductView
        +moveToTrash(id, actor)
    }
    class TrashService {
        +list()
        +restore(id, actor)
        +purge(id, actor)
        +purgeExpired() void
    }
    class StockService {
        +register(command) MovementResult
        +list(filters) Paginated~Movement~
        -applyBalanceChange(tx, command)
        -createPurchaseRequestIfNeeded(tx, product)
    }
    class PurchaseRequestsService {
        +list(status)
        +create(dto, actor)
        +updateStatus(id, status, actor)
    }
    class ReportsService {
        +dashboard()
        +movements(period)
    }
    class AuthService {
        +login(credentials, ip)
        +logout(userId)
        +changePassword(userId, dto)
        +setPin(userId, dto)
    }
    class UsersService {
        +list()
        +create(dto, actor)
        +update(id, dto, actor)
        +resetPassword(id, password, actor)
        +resetPin(id, pin, actor)
    }
    class SettingsService {
        +get() SystemSettings
        +update(patch) SystemSettings
    }
    class AuditService {
        +log(entry)
        +list(page)
    }
    class PdvIntegrationService {
        <<adapter>>
        +availability(code)
        +registerSale(sale)
    }
    class PinGuard {
        <<guard>>
        +canActivate(ctx) boolean
    }

    Replenishment ..> ConsumptionProfile
    Replenishment ..> Indicators
    Replenishment ..> StockStatus
    ProductsService ..> Replenishment
    StockService ..> Replenishment
    StockService ..> SettingsService
    TrashService ..> SettingsService
    PinGuard ..> SettingsService
    PdvIntegrationService --> ProductsService
    PdvIntegrationService --> StockService
    ProductsService --> AuditService
    UsersService --> AuditService
    AuthService --> AuditService
    PurchaseRequestsService --> AuditService
```

---

## 🔄 Fluxos principais

### Registrar uma venda (com alerta de reposição)

```mermaid
sequenceDiagram
    autonumber
    actor C as 👤 Caixa
    participant W as 🌐 Navegador
    participant G as 🛡️ Guards
    participant S as ⚙️ StockService
    participant D as 🧠 Domínio
    participant DB as 🐘 PostgreSQL

    C->>W: Bipa o código de barras
    W->>G: GET /products/lookup?code=789...
    G-->>W: Produto, saldo e situação
    C->>W: Quantidade + "Registrar saída"
    W->>G: POST /stock/exits {id, productId, qty}
    G-->>W: 428 PIN obrigatório
    W->>C: Diálogo de PIN
    C->>W: Digita o PIN
    W->>G: POST /stock/exits + X-Operation-Pin
    G->>G: Sessão ✔ Perfil ✔ PIN ✔
    G->>S: register(command)
    S->>DB: BEGIN
    S->>DB: UPDATE saldo = saldo − qty WHERE saldo ≥ qty
    S->>DB: INSERT movimentação (saldo após)
    S->>D: needsReorder(saldo, PP)?
    alt saldo ≤ PP e sem pedido em aberto
        S->>D: suggestOrderQuantity()
        S->>DB: INSERT solicitação de pedido
    end
    S->>DB: COMMIT
    S-->>W: movimentação + alerta
    W-->>C: ✅ Venda registrada · ⚠️ "Solicitação enviada à gestão"
```

### Venda sem internet (sincronização offline)

```mermaid
sequenceDiagram
    autonumber
    actor C as 👤 Caixa
    participant W as 🌐 App (PWA)
    participant Q as 💾 IndexedDB
    participant API as ⚙️ API

    Note over W: Internet cai
    C->>W: Bipa o produto
    W->>Q: Busca no catálogo local
    C->>W: Registrar saída
    W-xAPI: POST /stock/exits (falha de rede)
    W->>Q: Guarda na fila (id UUID)
    W-->>C: "Salvo no dispositivo"
    Note over W: Internet volta (evento "online" ou a cada 30s)
    loop para cada item da fila
        W->>API: POST /stock/exits (mesmo id)
        alt sucesso ou já registrado
            API-->>W: 201 (idempotente)
            W->>Q: Remove da fila
        else erro de regra (ex.: saldo insuficiente)
            W->>Q: Marca com erro para o usuário decidir
        end
    end
    W-->>C: "Movimentações offline enviadas"
```

### Login e sessão

```mermaid
sequenceDiagram
    autonumber
    actor U as 👤 Usuário
    participant W as 🌐 Navegador
    participant A as 🔐 AuthService
    participant DB as 🐘 PostgreSQL

    U->>W: usuário + senha
    W->>A: POST /auth/login
    A->>DB: busca usuário
    alt bloqueado (5 erros) ou inativo
        A-->>W: 429 / 401
    else senha errada
        A->>DB: tentativas + 1 (bloqueia em 5)
        A-->>W: 401 "Usuário ou senha inválidos"
    else senha correta
        A->>DB: zera tentativas, registra auditoria
        A-->>W: Cookie de sessão httpOnly e SameSite=Strict (JWT + tokenVersion)
        opt senha provisória
            W-->>U: Tela "Crie sua senha pessoal"
        end
    end
```

---

## 🚦 Diagramas de estado

### Solicitação de pedido

```mermaid
stateDiagram-v2
    direction LR
    state "Pedido feito" as PedidoFeito
    [*] --> Pendente: saldo ≤ PP ou manual
    Pendente --> PedidoFeito: gestão faz o pedido
    Pendente --> Cancelado
    PedidoFeito --> Recebido: mercadoria chegou
    PedidoFeito --> Cancelado
    Recebido --> [*]
    Cancelado --> [*]
```

### Ciclo de vida do produto e situação do estoque

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Ativo: cadastro
    Ativo --> Lixeira: excluir (PIN)
    Lixeira --> Ativo: restaurar (até N dias)
    Lixeira --> Apagado: prazo expirou ou exclusão definitiva
    Apagado --> [*]

    state Ativo {
        direction LR
        state "Crítico" as Critico
        state "Sem estoque" as SemEstoque
        Normal --> Repor: saldo ≤ PP
        Repor --> Critico: saldo ≤ ES
        Critico --> SemEstoque: saldo ≤ 0
        SemEstoque --> Normal: entrada
        Critico --> Normal: entrada
        Repor --> Normal: entrada
    }
```

---

## 📐 Regras de negócio

### Fórmulas (conforme o documento de requisitos)

| Indicador | Sigla | Fórmula |
|---|:-:|---|
| Estoque Mínimo | **EM** | `Consumo Médio Diário × Tempo de Reposição` |
| Estoque de Segurança | **ES** | `(Consumo Máximo Diário − Consumo Médio Diário) × Tempo de Reposição` |
| Ponto de Pedido | **PP** | `(Consumo Médio Diário × Tempo de Reposição) + ES` |
| Quantidade sugerida* | — | `ES + Consumo Médio × (Tempo de Reposição + Dias de Cobertura) − Saldo` |

\* O documento não define a quantidade do pedido. Esta é uma premissa, com "dias de cobertura" configurável (padrão **7**).

**Exemplo — Pão de forma:** média 20/dia, máximo 30/dia, entrega em 3 dias.

| EM | ES | PP | Saldo 85 → sugerido |
|:-:|:-:|:-:|:-:|
| 20 × 3 = **60** | (30 − 20) × 3 = **30** | 60 + 30 = **90** | 30 + 20 × (3 + 7) − 85 = **145** |

### Situação do produto

| Situação | Condição | Cor |
|---|---|:-:|
| 🔴 Sem estoque | saldo ≤ 0 | vermelho |
| 🟠 Crítico | saldo ≤ ES | laranja |
| 🟡 Repor | saldo ≤ PP | amarelo |
| 🟢 Normal | saldo > PP | verde |

### Configurações ajustáveis

| Parâmetro | Padrão | Efeito |
|---|:-:|---|
| Dias na lixeira | 15 | Prazo para recuperar um produto excluído |
| Dias de cobertura do pedido | 7 | Usado na quantidade sugerida |
| Permitir estoque negativo | Não | Bloqueia saída maior que o saldo |
| PIN em saídas, entradas, cadastro e exclusão | Sim | Liga ou desliga a confirmação por PIN em cada operação |

---

## 👥 Perfis e permissões

| Ação | 🛡️ Administrador | 📦 Estoquista | 🧾 Caixa |
|---|:-:|:-:|:-:|
| Consultar produtos e saldo | ✅ | ✅ | ✅ |
| Registrar saída (venda, perda) | ✅ | ✅ | ✅ |
| Registrar entrada | ✅ | ✅ | — |
| Cadastrar e editar produtos e categorias | ✅ | ✅ | — |
| Movimentações, pedidos e relatórios | ✅ | ✅ | — |
| Excluir produto e gerenciar lixeira | ✅ | — | — |
| Usuários, configurações e auditoria | ✅ | — | — |

> As permissões são verificadas **no servidor** em todas as rotas. Esconder um botão na tela não é a proteção.

---

## 🔒 Segurança

| Ameaça | Proteção |
|---|---|
| Vazamento de senhas | Hash **Argon2id** (recomendação OWASP) para senhas e PINs |
| Roubo de sessão (XSS) | Sessão em cookie **httpOnly** (inacessível ao JavaScript) e **CSP** rígida |
| CSRF | Cookie **SameSite=Strict** e cabeçalho anti-CSRF obrigatório |
| Força bruta | Conta bloqueada por 15 min após 5 erros, PIN por 5 min, **rate limit** por IP |
| Sessão de funcionário desligado | `tokenVersion`: desativar, trocar senha ou sair derruba todas as sessões na hora |
| Senha padrão / fraca | Senhas aleatórias na instalação, troca obrigatória no 1º acesso, política mínima |
| Acesso indevido | Perfis (RBAC) + PIN para operações sensíveis |
| SQL injection | Consultas parametrizadas (Prisma) |
| Mass assignment | DTOs com *whitelist*: campos extras são rejeitados |
| Enumeração de usuários | Mensagem genérica e tempo de resposta igualado |
| Clickjacking, sniffing | Helmet: `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` |
| Configuração insegura | A API não sobe sem segredo forte (validação com Zod) |
| Banco exposto | PostgreSQL só escuta em `127.0.0.1` |
| Computador compartilhado | O cache offline é apagado no logout |
| Rastreabilidade | **Auditoria** de logins, falhas, cadastros, exclusões e configurações |
| Recuperação de senha | Código de 6 dígitos guardado como hash, 15 min de validade, uso único, 5 tentativas, 3 pedidos/hora, resposta genérica e sessões encerradas ao redefinir |
| Senha do e-mail de envio | Criptografada no banco com **AES-256-GCM** (chave derivada do `JWT_SECRET`); nunca sai da API; TLS obrigatório |

### ⚖️ LGPD (Lei nº 13.709/2018)

| Requisito | Como o sistema atende |
|---|---|
| Transparência (art. 6º, VI, e art. 9º) | **Termo de Uso e Política de Privacidade** em `/termos`, com controlador, encarregado, finalidades, bases legais, compartilhamento e retenção |
| Ciência do titular | Aceite obrigatório no 1º acesso, **versionado** (`TERMS_VERSION`): se o texto mudar, todos aceitam de novo. A API bloqueia o uso até o aceite |
| Minimização (art. 6º, III) | Só nome, login, e-mail (opcional, exceto admin) e auditoria. IP apagado da auditoria após **12 meses**; códigos de recuperação após 1 dia |
| Acesso e portabilidade (art. 18, II e V) | “Baixar meus dados” em Meu perfil (JSON com cadastro, auditoria e operações) |
| Correção (art. 18, III) | O próprio usuário corrige o e-mail; o administrador corrige o nome |
| Eliminação/anonimização (art. 18, IV e VI) | “Anonimizar dados” para usuários desativados: apaga nome, login, e-mail, credenciais e IPs, mantendo o histórico do estoque sem identificação |
| Encarregado (art. 41) | Nome e e-mail configuráveis em Configurações › Empresa e privacidade |
| Segurança (art. 46) | Medidas da tabela acima |

> O texto do termo fica em [`TermsContent.tsx`](apps/web/src/features/legal/TermsContent.tsx). Ele é um modelo e deve ser revisado por um profissional jurídico antes do uso definitivo.

---

## 🔌 API

Prefixo `/api`. Autenticação por cookie de sessão. A integração com o PDV usa `X-API-Key`.

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| `POST` | `/auth/login` | pública | Login (cria o cookie de sessão) |
| `POST` | `/auth/logout` | logado | Encerra e revoga sessões |
| `GET` | `/auth/me` | logado | Perfil e permissões |
| `POST` | `/auth/change-password` · `/auth/pin` | logado | Troca a senha / define o PIN (no 1º acesso: + e-mail e aceite do termo) |
| `GET` | `/auth/recovery` | pública | Se a recuperação por e-mail está ativa |
| `POST` | `/auth/forgot-password` · `/auth/reset-password` | pública | Envia o código por e-mail / redefine a senha com o código |
| `POST` | `/auth/accept-terms` | logado | Aceite da versão atual do termo |
| `PATCH` | `/auth/profile` | logado | Corrige o próprio e-mail (com a senha atual) |
| `GET` | `/auth/my-data` | logado | Exporta os próprios dados pessoais (LGPD) |
| `GET` | `/legal` | pública | Versão do termo e dados da empresa |
| `GET` | `/products` | product:read | Lista (busca, situação, categoria, paginação) |
| `GET` | `/products/lookup?code=` | product:read | Busca exata por SKU ou EAN (bipagem) |
| `POST` `PATCH` | `/products` · `/products/:id` | product:write + PIN | Cadastrar / editar |
| `DELETE` | `/products/:id` | product:delete + PIN | Enviar para a lixeira |
| `GET` `POST` `DELETE` | `/trash` · `/trash/:id/restore` · `/trash/:id` | trash:manage | Lixeira |
| `POST` | `/stock/entries` · `/stock/exits` | stock:in / stock:out + PIN | Registrar movimentação |
| `GET` | `/stock/movements` | movement:read | Histórico com filtros |
| `GET` `POST` `PATCH` | `/purchase-requests` · `/:id/status` | purchase:* | Solicitações de pedido |
| `GET` | `/reports/dashboard` · `/reports/movements` | product:read / report:read | Painel e relatório por período |
| `GET` `POST` `PATCH` | `/users` · `/users/:id/reset-password` · `/reset-pin` | user:manage | Usuários |
| `GET` `PATCH` | `/settings` | settings:manage | Configurações |
| `GET` `PUT` · `POST` | `/settings/mail` · `/settings/mail/test` | settings:manage | E-mail de envio (senha criptografada) / teste |
| `PUT` | `/settings/company` | settings:manage | Dados da empresa e do encarregado |
| `POST` | `/users/:id/anonymize` | user:manage | Anonimiza um usuário desativado (LGPD) |
| `GET` | `/audit` | audit:read | Auditoria |
| `GET` | `/integration/pdv/products/:code/availability` | X-API-Key | PDV consulta estoque |
| `POST` | `/integration/pdv/sales` | X-API-Key | PDV envia venda (idempotente por `externalId`) |

<details>
<summary><b>Exemplo de integração com o PDV</b></summary>

```http
POST /api/integration/pdv/sales
X-API-Key: <PDV_API_KEY do .env>
Content-Type: application/json

{
  "externalId": "NFCE-000123",
  "items": [
    { "code": "7896002301428", "quantity": 2 },
    { "code": "PAO-FRANCES", "quantity": 0.75 }
  ]
}
```

Reenviar o mesmo `externalId` não duplica a baixa.

</details>

---

## 🚀 Como rodar

### Opção 1 · Aplicativo para Windows (recomendado para a loja)

1. Baixe o instalador: **[VL-Estoque-Setup-1.3.0.exe](https://github.com/tassiocarvalho/vl-estoque/releases/latest/download/VL-Estoque-Setup-1.3.0.exe)**
2. Execute e siga os passos. Ele cria um atalho **VL Estoque** na área de trabalho.
3. Na primeira abertura, o app **entra sozinho como `admin`** e pede para criar a **senha pessoal e o PIN**. Ninguém precisa ver a senha provisória.
4. O **Manual de uso (PDF)** fica no menu lateral e também aparece num aviso de boas-vindas no painel. Para atualizá-lo, edite [`docs/manual/manual.html`](docs/manual/manual.html) e rode `npm run manual`.

O app abre em **janela própria** (sem barra de endereço) e já traz tudo embutido: banco PostgreSQL, API e telas. Não é preciso instalar Node.js nem nada além dele.

| Item | Onde fica |
|---|---|
| Dados do estoque | `%LOCALAPPDATA%\VLEstoque\pgdata` (preservados ao desinstalar) |
| Segredos gerados na instalação | `%LOCALAPPDATA%\VLEstoque\config.json` (a senha provisória é apagada após o primeiro acesso) |
| Logs | `%LOCALAPPDATA%\VLEstoque\logs` |
| Backups automáticos | `Meu Drive\VL Estoque - Backups` no Google Drive (ou `%LOCALAPPDATA%\VLEstoque\backups` sem o Drive) |
| Acesso pelo celular (mesma rede) | `http://IP-DO-COMPUTADOR:3030` |

#### ☁️ Backup no Google Drive

Atende ao requisito de **salvamento em nuvem** sem servidor nem mensalidade:

1. Instale o [Google Drive para computador](https://www.google.com/drive/download/) e entre com a conta Google da loja.
2. O app encontra a pasta **Meu Drive** sozinho e passa a salvar uma cópia dos dados **ao abrir, a cada 4 horas e ao fechar**. É um arquivo por dia, e ficam guardados os últimos 30 dias.
3. O Drive sincroniza essas cópias com a nuvem.

**Se o computador der defeito:** instale o Drive e o V&L Estoque no computador novo. Na primeira abertura, o app encontra o backup mais recente e pergunta se deseja **restaurar os dados**.

| Situação | O que acontece |
|---|---|
| Drive ainda não instalado | O app avisa e oferece escolher outra pasta sincronizada; enquanto isso, guarda o backup só no computador |
| Drive fechado ou sem internet | O backup é salvo no computador e o Drive envia quando voltar |
| Backup de uma versão anterior | Restaura normalmente: os dados entram no formato da versão atual |

> ⚠️ Como o instalador não tem assinatura digital, o Windows pode exibir o aviso “O Windows protegeu o computador”. Clique em **Mais informações → Executar assim mesmo**.

Para gerar um novo instalador: `npm run dist` (saída em `apps/desktop/release/`).

### Opção 2 · Pelo código-fonte

| Item | Versão |
|---|---|
| Node.js | 22 ou superior (LTS) |
| Banco de dados | Nenhuma instalação: o PostgreSQL vem embutido via npm |
| Sistema | Windows, macOS ou Linux |

### Passo a passo

```bash
# 1. Instala, gera senhas aleatórias, cria o banco e o usuário admin
npm run setup

# 2. (opcional) 22 produtos de exemplo com 30 dias de movimentação
npm run db:demo

# 3a. Desenvolvimento: http://localhost:5173
npm run dev

# 3b. Produção (uso na loja): http://localhost:3000
npm run build && npm start
```

No Windows, para usar no dia a dia, basta dar **dois cliques em `iniciar-sistema.bat`**.

O usuário inicial é `admin`. A senha aparece no fim do `setup` e fica em `apps/api/.env` (`ADMIN_INITIAL_PASSWORD`). O sistema obriga a troca no primeiro acesso.

### Comandos

| Comando | Descrição |
|---|---|
| `npm run setup` | Instalação completa (primeira vez) |
| `npm run dev` | Banco, API e front com recarga automática |
| `npm run build` · `npm start` | Build e execução em produção |
| `npm test` | Testes das regras de negócio (Vitest) |
| `npm run desktop` | Abre o app desktop (Electron) a partir do código |
| `npm run dist` | Gera o instalador do Windows (`.exe`) |
| `npm run typecheck` | Verificação de tipos da API e do front |
| `npm run db:demo -w @vl/api` | Dados de demonstração |
| `npm run db:stop -w @vl/api` | Desliga o banco embutido |
| `npm run db:studio -w @vl/api` | Abre o Prisma Studio |

> 💾 Os dados ficam em `%LOCALAPPDATA%\vl-estoque\pgdata`, **fora do OneDrive** de propósito, porque a sincronização de arquivos corrompe bancos de dados. Para publicar na nuvem, troque a `DATABASE_URL`, use **HTTPS** e defina `COOKIE_SECURE=true`.

---

## 🗂️ Estrutura de pastas

```
sistema-estoque/
├── apps/
│   ├── api/                         # Back-end (NestJS)
│   │   ├── prisma/                  # schema, migrations, seed, demo
│   │   ├── scripts/database.mjs     # PostgreSQL embutido (pg_ctl)
│   │   └── src/
│   │       ├── common/              # auth, permissões, segurança, erros
│   │       ├── config/env.ts        # variáveis validadas com Zod
│   │       └── modules/
│   │           ├── products/domain/ # 🧠 EM · ES · PP (+ testes)
│   │           ├── products/        # catálogo + lixeira
│   │           ├── stock/           # entradas e saídas
│   │           ├── purchase-requests/
│   │           ├── reports/
│   │           ├── auth/ users/ settings/ audit/ categories/
│   │           └── integration/     # 🔌 adaptador do PDV
│   ├── web/                         # Front-end (React PWA)
│   │   └── src/
│   │       ├── components/          # layout + UI reutilizável
│   │       ├── features/            # uma pasta por funcionalidade
│   │       └── lib/                 # cliente HTTP, tipos, formatação
│   └── desktop/                     # 🖥️ App Windows (Electron + instalador NSIS)
│       ├── src/main.mjs             # liga banco → migrations → API → janela
│       └── scripts/package.mjs      # gera o VL-Estoque-Setup.exe
├── docs/screenshots/
├── scripts/setup.mjs
└── iniciar-sistema.bat
```

### Stack

| Camada | Tecnologias |
|---|---|
| **Front-end** | React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · TanStack Query · React Hook Form + Zod · React Router 7 · Lucide |
| **PWA / Offline** | vite-plugin-pwa (Workbox) · IndexedDB (idb-keyval) |
| **Back-end** | Node.js 24 · NestJS 11 · class-validator · @nestjs/schedule |
| **Banco** | PostgreSQL 18 · Prisma 6 |
| **Segurança** | Argon2id · JWT (cookie httpOnly) · Helmet · @nestjs/throttler |
| **Testes** | Vitest (domínio) · testes ponta a ponta da API e da interface |

---

## 📝 Pendências com o cliente

- [ ] Qual é o **sistema de caixa (PDV)** atual e como ele exporta as vendas (API, arquivo, banco)?
- [ ] Validar a **regra da quantidade sugerida** no pedido.
- [ ] Manter o **PIN em toda venda**? (padrão do documento, mas pode atrasar o caixa)
- [ ] **Ficha técnica** da padaria (baixa de insumos ao produzir) entra no escopo?
- [ ] Hospedagem em nuvem e domínio com HTTPS.

---

<div align="center">
<sub>Desenvolvido para a V&L Mercadinho e Panificadora · 2026</sub>
</div>
