# Documento de Requisitos de Software (DRS) v2 — Evolução do SuaLojaAqui

| | |
|---|---|
| **Produto** | SuaLojaAqui — frente de caixa (PDV não fiscal) e gestão de estoque, white-label |
| **Versão do documento** | 2.0 |
| **Status** | Em implementação — RF12, RF13, RF14 e RF22 entregues (ver a coluna Situação) |
| **Base** | Continua o [DRS v1](DRS-PDV.md) (RF01–RF11 e RNF01–RNF04, já implementados) |

---

## 1. Objetivo desta versão

O DRS v1 entregou o caixa, o estoque, o controle de acesso e a impressão. Este documento lista o que **falta para o sistema ser implantado em lojas reais com pouca adaptação**:

1. o pós-venda do balcão (troca, devolução, cliente, fiado);
2. as compras e o estoque completos (fornecedor, nota de entrada, custo médio, inventário, validade);
3. um financeiro simples (contas a pagar e a receber, resultado do período);
4. a operação segura (backup automático, LGPD);
5. a preparação do catálogo para a emissão fiscal futura.

### Como ler as prioridades

| Prioridade | Significado |
|---|---|
| **Alta** | Sem isso, a implantação em boa parte das lojas fica difícil. Entra na Fase 1 |
| **Média** | Muito pedido, mas a loja consegue operar sem ele por um tempo. Fase 2 |
| **Baixa** | Atende segmentos específicos ou lojas maiores. Fase 3 |

| Tamanho | Esforço estimado |
|---|---|
| **P** | Até 3 dias |
| **M** | 1 a 2 semanas |
| **G** | 3 semanas ou mais |

> As estimativas são de ordem de grandeza, para planejar fases. Elas serão refinadas ao detalhar cada item.

---

## 2. Visão geral do backlog

| ID | Requisito | Prioridade | Fase | Tamanho | Depende de | Situação |
|---|---|:-:|:-:|:-:|---|:-:|
| RF12 | Cadastro de clientes | Alta | 1 | M | — | ✅ |
| RF13 | Cliente e CPF na venda | Alta | 1 | P | RF12 | ✅ |
| RF14 | Formas de pagamento configuráveis | Alta | 1 | M | — | ✅ |
| RF15 | Troca e devolução (parcial e após o fechamento) | Alta | 1 | G | RF12, RF16 | — |
| RF16 | Vale-troca / crédito do cliente | Alta | 1 | M | RF12 | — |
| RF17 | Fornecedores | Alta | 1 | P | — | — |
| RF18 | Entrada de mercadoria por nota (custo médio) | Alta | 1 | G | RF17 | — |
| RF19 | Importação de produtos por planilha | Alta | 1 | M | — | — |
| RF20 | Campos fiscais no produto e na venda | Alta | 1 | M | RF13 | — |
| RF21 | Backup automático (versão web) | Alta | 1 | M | — | — |
| RF22 | LGPD: consentimento, exportação e exclusão | Alta | 1 | M | RF12 | ✅ |
| RF23 | Fiado / crediário (contas a receber) | Média | 2 | G | RF12, RF14 | — |
| RF24 | Contas a pagar | Média | 2 | M | RF17, RF18 | — |
| RF25 | Fluxo de caixa e resultado do período | Média | 2 | M | RF23, RF24 | — |
| RF26 | Orçamento salvo e conversão em venda | Média | 2 | M | RF12 | — |
| RF27 | Promoções e preços diferenciados | Média | 2 | G | RF12 | — |
| RF28 | Inventário (contagem e ajuste em lote) | Média | 2 | M | — | — |
| RF29 | Lote e validade | Média | 2 | G | RF18 | — |
| RF30 | Etiquetas de gôndola e de código de barras | Média | 2 | M | — | — |
| RF31 | Histórico de preço e de custo | Média | 2 | P | RF18 | — |
| RF32 | Recuperação de senha pelo próprio usuário | Baixa | 3 | M | RNF08 | — |
| RF33 | Vendedor na venda, comissão e metas | Baixa | 3 | M | — | — |
| RF34 | Variações de produto (grade) | Baixa | 3 | G | — | — |
| RF35 | Multi-loja | Baixa | 3 | G | quase todos | — |

---

## 3. Requisitos funcionais

### 3.1 Clientes e pós-venda

#### RF12 — Cadastro de clientes · Alta · Fase 1 · ✅ entregue
Cadastro com nome, CPF/CNPJ (opcional e validado), telefone, e-mail, endereço, data de nascimento e observações. Busca por nome, CPF ou telefone, inclusive no caixa.

- **Critérios de aceite**
  - Não aceita CPF/CNPJ inválido nem duplicado.
  - O cliente pode ser cadastrado **no caixa** (cadastro rápido: nome + CPF ou telefone), sem sair da venda.
  - O cliente nunca é apagado se tiver vendas, fiado ou crédito: ele é **inativado** (ou anonimizado, ver RF22).
  - O detalhe do cliente mostra o histórico de compras, o saldo de crédito (RF16) e o fiado em aberto (RF23).
- **Permissões:** operador cadastra e consulta; gerente e administrador editam e inativam.

#### RF13 — Cliente e CPF na venda · Alta · Fase 1 · ✅ entregue
No caixa, um atalho identifica o cliente da venda (por busca) ou digita só o CPF/CNPJ "na nota".

- **Critérios de aceite**
  - O CPF/CNPJ sai no comprovante ("CPF do consumidor: ...").
  - A venda guarda o cliente e uma cópia do documento informado (base para a NFC-e futura).
  - Funciona offline com os clientes salvos no aparelho. Um cadastro feito offline sincroniza depois.

#### RF14 — Formas de pagamento configuráveis · Alta · Fase 1 · ✅ entregue
O cadastro de formas de pagamento substitui a lista fixa atual. Vem pronto com: Dinheiro, PIX, Crédito, Débito, Vale-alimentação, Vale-refeição, Cheque, Crediário/Fiado (RF23), Crédito do cliente (RF16) e "Outros".

- **Critérios de aceite**
  - Para cada forma: nome, ativa/inativa, **se gera troco** (só dinheiro, por padrão), se exige cliente identificado (fiado, crédito), atalho no caixa e **taxa (%) e prazo de recebimento** (usados no fluxo de caixa, RF25).
  - As formas usadas em vendas antigas não podem ser apagadas, apenas desativadas.
  - O fechamento de caixa e os relatórios agrupam pelas formas cadastradas.
- **Impacto:** o enum `PaymentMethod` vira uma tabela, com migração dos dados atuais.

#### RF15 — Troca e devolução · Alta · Fase 1
Devolução de **um ou mais itens** de uma venda (inclusive parcial na quantidade), **mesmo depois do fechamento do turno**, com motivo obrigatório.

- **Critérios de aceite**
  - Localiza a venda pelo número, pelo cliente ou bipando os produtos (com busca no período).
  - Não deixa devolver mais do que foi vendido (somando as devoluções anteriores do mesmo item).
  - Formas de reembolso: **dinheiro** (sai do caixa aberto atual, como uma saída registrada), **estorno na forma original** (registro, sem integração com maquininha) ou **vale-troca/crédito** (RF16).
  - **Troca**: devolução + nova venda numa única operação. A diferença é cobrada ou devolvida.
  - Opção de **voltar ao estoque** (padrão) ou registrar como **perda** (produto avariado).
  - Gera o comprovante de devolução ou troca (não fiscal) e entra no fechamento do caixa em que foi feita.
  - Exige a permissão `pos:return`; o operador sem ela pede autorização do supervisor, como já acontece no cancelamento.
  - Respeita um prazo máximo configurável (ex.: 30 dias), que o gerente pode liberar.
- **Observação:** o cancelamento atual (venda inteira, mesmo turno) continua existindo para erros de digitação.

#### RF16 — Vale-troca / crédito do cliente · Alta · Fase 1
Saldo de crédito por cliente (ou vale ao portador, com código), gerado em devoluções e usado como forma de pagamento.

- **Critérios de aceite**
  - Extrato de crédito: origem (devolução nº X), usos e saldo.
  - O vale impresso tem um código único e validade configurável.
  - O pagamento com crédito não pode passar do saldo e não gera troco em dinheiro.

### 3.2 Estoque e compras

#### RF17 — Fornecedores · Alta · Fase 1
Cadastro com razão social, nome fantasia, CNPJ, contatos, prazo médio de entrega e condições de pagamento. O produto pode ter vários fornecedores, com código do produto no fornecedor e último custo.

- **Critérios de aceite**
  - A solicitação de pedido (já existente) passa a sugerir o **fornecedor preferencial** e o último custo.
  - A lista de pedidos é impressa **agrupada por fornecedor**.

#### RF18 — Entrada de mercadoria por nota · Alta · Fase 1
A tela de entrada ganha uma versão completa: fornecedor, número e série da nota, data de emissão, vários itens com quantidade e **custo unitário**, frete/desconto rateado e conferência do total da nota.

- **Critérios de aceite**
  - Ao confirmar, atualiza o saldo e recalcula o **custo médio ponderado**: `(saldo × custo médio + qtd × custo de entrada) ÷ (saldo + qtd)`.
  - O produto passa a ter **custo médio** e **último custo**. A margem dos relatórios usa o custo médio.
  - A nota pode ser salva como rascunho (conferência em andamento) e só mexe no estoque ao ser finalizada.
  - Fecha automaticamente a solicitação de pedido correspondente (status Recebido).
  - **Fase 2:** importar o XML da NF-e do fornecedor para preencher os itens.
- **Permissões:** estoquista e administrador.

#### RF19 — Importação de produtos por planilha · Alta · Fase 1
Importação de CSV/XLSX com modelo para baixar.

- **Critérios de aceite**
  - Colunas: nome, SKU, EAN, categoria/subcategoria, unidade, preço de venda, custo, estoque inicial, reposição (sim/não), consumo, prazo, NCM e demais campos fiscais.
  - **Pré-visualização** com validação linha a linha (erros em vermelho) antes de gravar.
  - Modos: só criar novos, ou criar e **atualizar** existentes (por SKU ou EAN), por exemplo para reajustar preços em massa.
  - Cria categorias que não existem (opcional).
  - A importação é atômica: grava tudo ou nada. Fica registrada na auditoria.
  - Também **exporta** o catálogo no mesmo formato.

#### RF28 — Inventário · Média · Fase 2
Contagem geral ou por categoria, com várias pessoas bipando ao mesmo tempo (celulares).

- **Critérios de aceite**
  - Abrir o inventário "congela" o saldo esperado. As vendas durante a contagem são consideradas no cálculo da divergência.
  - Relatório de divergência (esperado × contado, em quantidade e em valor de custo).
  - O ajuste em lote, com aprovação do administrador, gera os movimentos de ajuste.
  - Itens não contados: manter o saldo ou zerar (escolha ao fechar).

#### RF29 — Lote e validade · Média · Fase 2
Produtos marcados como "controla validade" recebem lote e data de validade na entrada.

- **Critérios de aceite**
  - Saída por **PEPS/FEFO** (vence primeiro, sai primeiro) automaticamente na venda.
  - Painel e alerta de **produtos vencendo** (prazo configurável, ex.: 7 dias) e vencidos.
  - Baixa de vencidos como perda, por lote.

#### RF30 — Etiquetas · Média · Fase 2
Impressão de etiquetas de gôndola (nome, preço, preço promocional, código) e de código de barras.

- **Critérios de aceite**
  - Gera um **código interno EAN-13 válido** (prefixo 2) para produtos sem EAN.
  - Modelos para folha A4 (Pimaco) e para impressoras de etiqueta (Argox, Zebra, Elgin), em PDF ou impressão direta.
  - Seleção por produto, por categoria ou "produtos com preço alterado desde a data X".

#### RF31 — Histórico de preço e de custo · Média · Fase 2
Cada alteração de preço de venda ou de custo fica registrada (data, valor anterior, novo valor, usuário e origem: edição, nota, importação). Aparece no detalhe do produto.

#### RF34 — Variações (grade) · Baixa · Fase 3
Produto "pai" com variações (tamanho × cor, por exemplo), cada uma com SKU, EAN e saldo próprios. A venda é por variação, e os relatórios saem por produto e por variação.

### 3.3 Vendas: orçamento e preços

#### RF26 — Orçamento salvo · Média · Fase 2
O F8 grava o orçamento (número, cliente, itens, validade e vendedor).

- **Critérios de aceite**
  - Lista de orçamentos com situação: Aberto, Convertido, Vencido ou Cancelado.
  - Reabrir no caixa e **converter em venda** com um clique. Avisa quando um preço mudou desde o orçamento e deixa escolher entre o preço novo e o orçado (o orçado exige permissão de desconto).
  - Envio em PDF (já existente) e opção de não baixar estoque até a conversão.

#### RF27 — Promoções e preços diferenciados · Média · Fase 2
- **Preço promocional com período** (de/até) por produto ou categoria.
- **Leve X, pague Y** e **combo** (kit com preço fechado).
- **Preço de atacado** por quantidade (ex.: a partir de 6 unidades).
- **Tabela de preços por tipo de cliente** (ex.: revenda, funcionário).
- **Critérios de aceite**
  - O caixa aplica a melhor regra automaticamente e mostra a economia no cupom e no comprovante ("Você economizou R$ X").
  - As regras promocionais **não contam** no limite de desconto do operador.
  - Relatório de vendas por promoção.

#### RF33 — Vendedor, comissão e metas · Baixa · Fase 3
Campo **vendedor** na venda, diferente do operador do caixa (ex.: loja de roupas). Percentual de comissão por vendedor ou categoria, meta mensal e relatório de comissão a pagar (com o desconto das devoluções).

### 3.4 Financeiro

#### RF23 — Fiado / crediário · Média · Fase 2
Venda com forma de pagamento "Fiado", só para cliente identificado com **limite de crédito**.

- **Critérios de aceite**
  - Bloqueia a venda acima do limite ou com atraso; o gerente pode liberar.
  - Gera títulos a receber (à vista ou em parcelas, com vencimentos).
  - **Recebimento no caixa:** baixa total ou parcial, em qualquer forma de pagamento, com comprovante. Entra no fechamento do turno.
  - Extrato do cliente e relatório de inadimplência (vencidos por cliente e por faixa de atraso).
  - Juros e multa por atraso: opcional e configurável.

#### RF24 — Contas a pagar · Média · Fase 2
Títulos a pagar com origem manual (despesas: aluguel, energia, salários, por **categoria de despesa**) ou automática (nota de entrada, RF18, com parcelas).

- **Critérios de aceite**
  - Agenda de vencimentos (hoje, semana, vencidos) e baixa com data e forma de pagamento.
  - Anexo do comprovante (imagem ou PDF).

#### RF25 — Fluxo de caixa e resultado · Média · Fase 2
- **Fluxo de caixa** diário e mensal, realizado e previsto: vendas por forma de pagamento (aplicando as taxas e prazos de RF14), recebimentos de fiado, contas pagas e a pagar.
- **Resultado simples (DRE gerencial)** do período: vendas − devoluções − custo das mercadorias vendidas (custo médio) − despesas = resultado.
- Exportação para Excel e PDF.

### 3.5 Preparação para o fiscal

#### RF20 — Campos fiscais · Alta · Fase 1
**No produto:** NCM (8 dígitos, validado), CEST, CFOP padrão, origem da mercadoria (0–8), CST ou CSOSN, alíquotas de ICMS, PIS e COFINS, unidade tributável e GTIN tributável.

**Na loja (configurações):** razão social, CNPJ, inscrição estadual, regime tributário (Simples Nacional, Lucro Presumido, Lucro Real) e UF.

**Na venda:** CPF/CNPJ do consumidor (RF13) e cópia dos campos fiscais de cada item no momento da venda, como já é feito com nome e preço.

- **Critérios de aceite**
  - Os campos são **opcionais** nesta fase. Um relatório mostra os "produtos sem dados fiscais".
  - Edição em massa por categoria e pela planilha (RF19).
  - O sistema **continua não fiscal**. O objetivo é que o futuro adaptador de NFC-e não exija recadastrar o catálogo.

> ⚖️ **Alerta legal.** Na maioria dos estados, quem vende ao consumidor final é obrigado a emitir documento fiscal (NFC-e ou equivalente). Na prática, o modo não fiscal serve a estabelecimentos dispensados ou que emitem a nota por outro meio. **A situação de cada cliente deve ser confirmada com o contador dele.** Este documento não é orientação contábil nem jurídica.

### 3.6 Operação, segurança e plataforma

#### RF21 — Backup automático (versão web) · Alta · Fase 1
- Backup diário automático (`pg_dump`, horário configurável) **sem desligar o sistema**, com retenção configurável (ex.: 30 cópias).
- Destino: uma pasta local e, opcionalmente, uma pasta sincronizada (Google Drive/OneDrive para desktop). Só o arquivo de backup vai para a nuvem, nunca a pasta viva do banco.
- Tela de backups (administrador): lista, **"Fazer backup agora"**, baixar e restaurar (com confirmação dupla e backup automático antes da restauração).
- Alerta no painel se o último backup tiver mais de 48 horas ou se houver falha.
- Reaproveita a lógica de `apps/desktop/src/backup.mjs`.

#### RF22 — LGPD · Alta · Fase 1 (junto com RF12) · ✅ entregue
- Registro do **consentimento** (data, finalidade, canal) no cadastro do cliente; marketing exige consentimento separado.
- **Exportação** dos dados de um cliente (JSON/PDF) a pedido do titular.
- **Exclusão/anonimização:** apaga os dados pessoais e mantém as vendas para fins legais, com o cliente anonimizado.
- Acesso aos dados de clientes registrado na auditoria. Uma política de privacidade editável aparece no cadastro.

#### RF32 — Recuperação de senha · Baixa · Fase 3
"Esqueci minha senha" com link por e-mail (validade de 30 minutos, uso único). Depende do envio de e-mail (RNF08). Até lá, continua valendo a redefinição pelo administrador, que já existe.

#### RF35 — Multi-loja · Baixa · Fase 3
Várias lojas na mesma instalação: estoque, caixas e configurações por loja; catálogo e clientes compartilhados (configurável); **transferência de mercadorias** entre lojas (saída em trânsito, depois entrada com conferência); relatórios por loja e consolidados; usuário com acesso a uma ou mais lojas.

> Muda o modelo de dados de quase todas as tabelas (`storeId`). Se a multi-loja estiver no horizonte, vale preparar o campo `storeId` já na Fase 1, com uma loja única.

---

## 4. Requisitos não funcionais novos

| ID | Requisito |
|---|---|
| RNF05 | **Compatibilidade de dados:** toda mudança de modelo vem com migration que preserva os dados existentes. Nenhum cliente perde histórico ao atualizar |
| RNF06 | **Offline:** clientes, formas de pagamento e promoções vigentes ficam no aparelho do caixa. Devolução, fiado e orçamento convertido exigem conexão |
| RNF07 | **Desempenho:** a busca de cliente e o cálculo de promoções no caixa mantêm o registro do item abaixo de 100 ms (RNF01) |
| RNF08 | **E-mail (quando adotado):** envio por SMTP configurado só no servidor (`.env`), nunca no código nem no repositório. Usado em RF32 e, opcionalmente, para enviar relatórios e alertas |
| RNF09 | **Auditoria:** devoluções, créditos, fiado, recebimentos, ajustes de inventário, importações, alterações de preço e acesso a dados de clientes são auditados |

### Notas da entrega (RF12, RF13, RF14 e RF22)

- **Atalho do caixa:** a tecla **Ins** identifica o cliente ou o CPF/CNPJ na nota (F11 e F12 são reservadas pelo navegador).
- **Formas de pagamento:** as oito primeiras formas ativas ganham os atalhos F1–F4 e F6–F9 no pagamento (F5 confirma). Vêm de fábrica: Dinheiro, PIX, Crédito, Débito, Vale-alimentação e Vale-refeição (ativas), além de Cheque e Outros (desativadas). O Crediário/Fiado entra com o RF23.
- **Troco:** sai sempre da gaveta. Só formas marcadas com "dá troco" (o dinheiro, por padrão) aceitam valor maior que o devido.
- **Migração:** os pagamentos já registrados foram convertidos para as novas formas, sem perda. Fechamentos antigos continuam legíveis.
- **Offline:** o caixa guarda no aparelho as formas de pagamento e os clientes ativos (nome, documento e telefone). Os dados dos clientes são apagados do aparelho no logout. O cadastro de cliente novo precisa de conexão; offline, dá para informar só o CPF/CNPJ na nota.
- **LGPD:** dados pessoais além do nome só com a autorização registrada (data e canal). Gerente e administrador exportam os dados (JSON) e apagam os dados pessoais a pedido do titular; as vendas continuam, sem identificar o cliente. A visualização de clientes **não** é auditada (só criação, alteração, exportação e anonimização), para não poluir a auditoria.

---

## 5. Plano de fases sugerido

| Fase | Conteúdo | Resultado para a loja |
|---|---|---|
| **1 — Implantação real** | RF12–RF22 | Cliente na venda, troca e devolução, formas de pagamento da loja, compras com nota e custo médio, catálogo importado por planilha, dados fiscais prontos e backup automático |
| **2 — Gestão** | RF23–RF31 | Fiado, contas a pagar e a receber, resultado do mês, orçamentos, promoções, inventário, validade e etiquetas |
| **3 — Expansão** | RF32–RF35 | Recuperação de senha por e-mail, comissão, grade de produtos e multi-loja |
| **Futuro** | Adaptador fiscal (NFC-e/SAT) e TEF | Emissão fiscal sobre os campos preparados em RF20 |

---

## 6. Pontos a decidir com o cliente

- [ ] **Devolução em dinheiro após o fechamento:** sai do caixa aberto no momento (proposto) ou de um caixa "administrativo"?
- [ ] **Prazo máximo** para troca e devolução, e se o vale-troca vence.
- [ ] **Fiado:** cobra juros e multa? Qual o limite de crédito padrão?
- [ ] **Promoções:** quando duas regras valem ao mesmo tempo, aplica a melhor para o cliente (proposto) ou a de maior prioridade?
- [ ] **Multi-loja** está nos planos? Se sim, preparar `storeId` já na Fase 1.
- [ ] Quem será o **contador de referência** para validar os campos fiscais (RF20)?
