# Documento de Requisitos de Software (DRS) — Sistema PDV Não Fiscal

| | |
|---|---|
| **Cliente / marca white-label** | SuaLojaAqui |
| **Versão** | 1.0 |
| **Status** | Implementado (web). Fiscal e app desktop ficam para versões futuras |
| **Tipo de sistema** | Ponto de Venda (PDV) web, construído sobre o sistema de estoque existente |

> Este documento reproduz os requisitos acordados e, em cada item, indica **onde e como foi atendido** no código.

---

## 1. Visão geral

### 1.1 Objetivo

Sistema de Ponto de Venda com arquitetura limpa, modular e desacoplada, focado em desempenho e usabilidade (Clean UI/UX). Ele usa como base o sistema de estoque existente e segue o conceito **white-label**, com o nome genérico "SuaLojaAqui", para que a identidade visual (logotipo, cores e nome) seja trocada para cada cliente sem programar.

### 1.2 Escopo

Nesta versão o sistema é **estritamente NÃO FISCAL**: não emite NFC-e, SAT nem NF-e. O foco é a agilidade no caixa, o controle centralizado de estoque, a gestão de usuários e a flexibilidade de impressão. A versão é **web** (PWA). O aplicativo desktop ainda não foi feito.

---

## 2. Arquitetura e princípios de design

| Requisito | Como foi atendido |
|---|---|
| **Desacoplamento das regras de negócio** | Domínio puro, sem banco nem framework: [`sale-calculator.ts`](../apps/api/src/modules/pos/domain/sale-calculator.ts) (venda, descontos, troco), [`cash-summary.ts`](../apps/api/src/modules/pos/domain/cash-summary.ts) (fechamento), [`escpos.ts`](../apps/api/src/modules/printing/escpos.ts) (impressão térmica) e [`replenishment.ts`](../apps/api/src/modules/products/domain/replenishment.ts) (reposição). Todos têm testes |
| **White-label (rebranding)** | Configuração centralizada em *Configurações → Identidade da loja*: nome, slogan, logotipo, cor principal (os tons são derivados no CSS), tema claro/escuro, CNPJ, endereço, telefone e cabeçalho/rodapé dos comprovantes. A marca é pública (`GET /api/settings/branding`): até a tela de login já sai com a cara do cliente |
| **Offline-first no caixa** | As vendas feitas sem internet ficam no IndexedDB e são enviadas sozinhas quando a conexão volta. Os ids são gerados no caixa, então o reenvio não duplica a venda. O catálogo, com os preços, fica salvo no aparelho |
| **Padrões testáveis** | Injeção de dependência (NestJS), serviços por caso de uso, Prisma como repositório, reducer puro do carrinho ([`cart.ts`](../apps/web/src/features/pos/cart.ts)) e TanStack Query para o estado do servidor. Um teste de **paridade** garante que o cálculo do navegador é idêntico ao do servidor |

### 2.2 Interface (UI/UX)

| Requisito | Como foi atendido |
|---|---|
| Visual limpo e minimalista | O caixa fica em tela cheia, sem o menu lateral, e destaca o total, os itens e os atalhos |
| Operação 100% pelo teclado | Atalhos de F1 a F10, Del, Esc, ↑/↓, +/− e Enter (veja a tabela no README). As teclas F nunca acionam o navegador (o F5 não recarrega a página) |
| Touchscreen e telas a partir de 1024×768 | Botões grandes (mínimo de 44 px) e layout validado em 1024×768 e 1366×768. Também funciona em tablet e celular |

---

## 3. Requisitos funcionais

### 3.1 Caixa (frente de loja)

| ID | Requisito | Situação | Implementação |
|---|---|:-:|---|
| RF01 | Abertura com troco inicial (suprimento de abertura) | ✅ | `POST /cash/open` e tela de abertura. Um turno aberto por terminal, garantido por índice único no banco |
| RF01 | Fechamento com totais por forma de pagamento e diferença de caixa | ✅ | `POST /cash/:id/close`: dinheiro esperado × contado, falta/sobra, resumo congelado e relatório impresso |
| RF02 | Leitura por código de barras, SKU ou busca por nome | ✅ | Campo único com sugestões e multiplicador (`3*código`) |
| RF02 | Inserir, alterar quantidade e remover itens | ✅ | F2 (quantidade), +/−, Del (remover). As remoções vão para a auditoria |
| RF02 | Desconto em R$ ou % por item e no total, com controle de permissão | ✅ | F3/F4. Acima do limite do operador, exige **autorização do supervisor** (gerente digita usuário + PIN) |
| RF03 | Várias formas de pagamento na mesma venda | ✅ | Dinheiro, PIX, crédito e débito combinados |
| RF03 | Calculadora automática de troco | ✅ | Troco previsto ao digitar. Só o dinheiro gera troco |
| RF04 | Sangria e suprimento com justificativa obrigatória | ✅ | F6. Exige permissão ou autorização do supervisor, gera comprovante e não permite sangria maior que o dinheiro esperado |

### 3.2 Estoque e produtos

| ID | Requisito | Situação | Implementação |
|---|---|:-:|---|
| RF05 | Código/SKU, EAN, nome, categoria, preço de custo, preço de venda, unidade e estoque atual/mínimo | ✅ | Preços adicionados ao cadastro. O estoque mínimo continua calculado pelas fórmulas de reposição já existentes (EM, ES e PP) |
| RF06 | Baixa automática ao finalizar a venda | ✅ | Na mesma transação da venda: ou grava tudo, ou nada |
| RF06 | Estorno automático no cancelamento | ✅ | Movimentação `IN_SALE_CANCEL` para cada item |
| RF06 | Ajuste manual restrito ao administrador | ✅ | Permissão `stock:adjust`, verificada no servidor |
| RF07 | Indicador de estoque zerado ou abaixo do mínimo | ✅ | Situações Sem estoque, Crítico e Repor. Alerta no caixa ao vender item sem saldo, com bloqueio opcional |

### 3.3 Impressão e comprovantes

| ID | Requisito | Situação | Implementação |
|---|---|:-:|---|
| RF08 | Térmica 80 mm / 58 mm (ESC/POS) com cabeçalho personalizável, itens, totais, pagamento, troco e agradecimento | ✅ | Pelo navegador (driver do Windows: USB, serial ou rede) **ou** ESC/POS direto pela rede (TCP 9100), com acentuação PC860, corte de papel e gaveta |
| RF08 | Folha A4/Carta para orçamentos e comprovantes detalhados | ✅ | Papel A4 nas configurações. O orçamento (F8) sai sempre em A4 |
| RF08 | Geração de PDF | ✅ | Comprovante, orçamento e fechamento de caixa em PDF (A4 ou no formato da bobina) |
| RF09 | Reimpressão de vendas anteriores | ✅ | F7 no caixa ou tela *Vendas*. Sai marcada como "2ª via" e registrada na auditoria |
| RF09 | Comprovante de fechamento e de sangria | ✅ | Impressos automaticamente. Reimpressão em *Caixas* |

### 3.4 Usuários e controle de acesso (RBAC)

| ID | Requisito | Situação | Implementação |
|---|---|:-:|---|
| RF10 | Administrador com acesso irrestrito | ✅ | Todas as permissões |
| RF10 | Operador de caixa: abrir/fechar caixa, vender e buscar produtos | ✅ | Perfil `CASHIER` (`pos:sell`, `product:read`). Entra direto no caixa |
| RF10 | Gerente: relatórios básicos e autorização de descontos/cancelamentos | ✅ | Perfil `MANAGER` |
| RF11 | Login individual, com senha ou PIN rápido para troca de operador | ✅ | Login por PIN (`POST /auth/pin-login`) na tela de login e no caixa (F9) |
| RF11 | Logs de ações sensíveis | ✅ | Item removido, cupom cancelado, venda cancelada, desconto, sangria/suprimento, abertura de gaveta, reimpressão, autorização do supervisor, abertura/fechamento de caixa e venda offline com preço divergente |

---

## 4. Requisitos não funcionais

| ID | Requisito | Como foi atendido |
|---|---|---|
| RNF01 | Registrar item em menos de 100 ms | O item entra no cupom na hora (estado local). A busca por código é exata e indexada, e sem internet usa o catálogo do aparelho |
| RNF02 | Sem integração com a SEFAZ nem arquivos fiscais; todo recibo diz "Documento Não Fiscal — Sem Valor Fiscal" | Nenhum módulo fiscal. A menção aparece no cabeçalho **e** no rodapé de todo comprovante (venda, orçamento, sangria e fechamento), em HTML, PDF e ESC/POS |
| RNF03 | Compatível com Epson, Bematech, Elgin e Daruma via USB, serial ou rede | USB/serial: pelo driver do fabricante no Windows (impressão pelo navegador; `--kiosk-printing` dispensa a janela). Rede: ESC/POS direto em TCP |
| RNF04 | Banco relacional leve e otimizado | PostgreSQL embutido (ou gerenciado), com índices por data, situação, turno e produto |

---

## 5. Telas principais

| Tela | Onde |
|---|---|
| Login / seleção de operador (PIN) | `/login`, aba "PIN rápido". No caixa: F9 |
| Caixa: busca e itens à esquerda; item selecionado, subtotal e atalhos à direita; rodapé com status do caixa, operador e nome da loja | `/caixa` |
| Modal de pagamento com seleção visual dos métodos | F5 no caixa |
| Painel do administrador: cadastros, vendas do dia e configurações de impressora e marca | `/`, `/produtos`, `/usuarios`, `/vendas`, `/caixas`, `/configuracoes` |

---

## 6. Fora do escopo desta versão (próximas etapas)

- Emissão fiscal (NFC-e/SAT) — a arquitetura deixa o módulo fiscal como um adaptador futuro.
- Aplicativo desktop do PDV (o instalador atual é o do sistema de estoque).
- Integração TEF (maquininha de cartão) e PIX dinâmico (QR Code).
- Leitura de etiquetas de balança (EAN-13 com prefixo 2, com peso ou preço embutido).
