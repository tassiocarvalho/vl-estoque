/**
 * Importação de produtos por planilha (CSV do Excel) — domínio puro.
 * Cada linha chega como { coluna: texto }; aqui viram dados validados ou uma lista de erros da linha.
 * O mesmo layout serve para exportar o catálogo e reimportar com preços reajustados.
 */

export const UNITS = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'CX', 'PCT', 'DZ'] as const;
export type ImportUnit = (typeof UNITS)[number];

/** Colunas da planilha, na ordem do modelo. */
export const IMPORT_COLUMNS = [
  { key: 'nome', label: 'Nome do produto', example: 'Arroz Tipo 1 5kg' },
  { key: 'sku', label: 'Código interno (SKU)', example: 'ARROZ-T1-5KG' },
  { key: 'codigo_barras', label: 'Código de barras (EAN)', example: '7891234567895' },
  { key: 'categoria', label: 'Categoria', example: 'Mercearia' },
  { key: 'subcategoria', label: 'Subcategoria (opcional)', example: 'Grãos' },
  { key: 'unidade', label: 'Unidade (UN, KG, L, CX...)', example: 'UN' },
  { key: 'preco_venda', label: 'Preço de venda', example: '27,90' },
  { key: 'custo', label: 'Custo', example: '21,50' },
  { key: 'estoque_inicial', label: 'Estoque inicial (só produtos novos)', example: '40' },
  { key: 'reposicao', label: 'Controla reposição (sim/não)', example: 'sim' },
  { key: 'consumo_medio', label: 'Consumo médio por dia', example: '3' },
  { key: 'consumo_maximo', label: 'Consumo máximo por dia', example: '5' },
  { key: 'prazo_entrega', label: 'Prazo de entrega (dias)', example: '4' },
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number]['key'];

export interface ImportedProduct {
  name?: string;
  sku: string;
  barcode?: string | null;
  category?: string;
  subcategory?: string | null;
  unit?: ImportUnit;
  salePrice?: number;
  costPrice?: number;
  initialStock?: number;
  replenishmentEnabled?: boolean;
  avgDailyConsumption?: number;
  maxDailyConsumption?: number;
  leadTimeDays?: number;
}

/** Cabeçalho da planilha → chave da coluna (sem acento, minúsculo, aceita o rótulo ou a chave). */
export function normalizeHeader(header: string): ImportColumn | null {
  const plain = header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const aliases: Record<string, ImportColumn> = {
    nome: 'nome', nome_do_produto: 'nome', produto: 'nome', descricao: 'nome',
    sku: 'sku', codigo: 'sku', codigo_interno: 'sku',
    codigo_barras: 'codigo_barras', codigo_de_barras: 'codigo_barras', ean: 'codigo_barras', gtin: 'codigo_barras',
    categoria: 'categoria', subcategoria: 'subcategoria',
    unidade: 'unidade', un: 'unidade',
    preco_venda: 'preco_venda', preco_de_venda: 'preco_venda', preco: 'preco_venda',
    custo: 'custo', preco_de_custo: 'custo', custo_medio: 'custo',
    estoque_inicial: 'estoque_inicial', estoque: 'estoque_inicial',
    reposicao: 'reposicao', controla_reposicao: 'reposicao',
    consumo_medio: 'consumo_medio', consumo_medio_por_dia: 'consumo_medio',
    consumo_maximo: 'consumo_maximo', consumo_maximo_por_dia: 'consumo_maximo',
    prazo_entrega: 'prazo_entrega', prazo_de_entrega: 'prazo_entrega',
  };
  return aliases[plain] ?? null;
}

/** "1.234,56", "1234.56", "R$ 12,5" → número. Vazio → undefined. Inválido → NaN. */
export function parseBrNumber(text: string | undefined): number | undefined {
  const value = (text ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!value) return undefined;
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

function parseBoolean(text: string | undefined): boolean | undefined | null {
  const value = (text ?? '').trim().toLowerCase();
  if (!value) return undefined;
  if (['sim', 's', 'yes', 'y', 'true', '1', 'x'].includes(value)) return true;
  if (['nao', 'não', 'n', 'no', 'false', '0'].includes(value)) return false;
  return null;
}

const decimals = (value: number) => (String(value).split('.')[1] ?? '').length;

/**
 * Valida uma linha. `requireAll`: produto novo (nome, categoria e unidade obrigatórios).
 * Na atualização, célula vazia mantém o valor atual.
 */
export function parseImportRow(raw: Partial<Record<ImportColumn, string>>, requireAll: boolean) {
  const errors: string[] = [];
  const cell = (key: ImportColumn) => (raw[key] ?? '').trim();
  const product: ImportedProduct = { sku: cell('sku').toUpperCase() };

  if (!product.sku) errors.push('Informe o SKU (código interno)');
  else if (!/^[A-Z0-9._-]{1,40}$/.test(product.sku)) errors.push('SKU: use até 40 letras, números, ponto, hífen ou _');

  const name = cell('nome');
  if (name) {
    if (name.length < 2 || name.length > 120) errors.push('Nome: de 2 a 120 caracteres');
    product.name = name;
  } else if (requireAll) errors.push('Informe o nome');

  const barcode = cell('codigo_barras').replace(/\s/g, '');
  if (barcode) {
    // O Excel costuma mostrar o EAN como 7,89123E+12: avisa em vez de gravar errado.
    if (!/^\d{8,14}$/.test(barcode)) errors.push('Código de barras: de 8 a 14 números (formate a coluna como texto no Excel)');
    product.barcode = barcode;
  }

  const category = cell('categoria');
  if (category) {
    product.category = category;
    product.subcategory = cell('subcategoria') || null;
  } else if (requireAll) errors.push('Informe a categoria');

  const unit = cell('unidade').toUpperCase();
  if (unit) {
    if ((UNITS as readonly string[]).includes(unit)) product.unit = unit as ImportUnit;
    else errors.push(`Unidade "${cell('unidade')}" inválida (use ${UNITS.join(', ')})`);
  } else if (requireAll) errors.push('Informe a unidade');

  const money = (key: ImportColumn, label: string, field: 'salePrice' | 'costPrice') => {
    const value = parseBrNumber(cell(key));
    if (value === undefined) return;
    if (Number.isNaN(value) || value < 0 || value > 1_000_000) errors.push(`${label} inválido`);
    else if (decimals(value) > (field === 'costPrice' ? 4 : 2)) errors.push(`${label}: no máximo ${field === 'costPrice' ? 4 : 2} casas decimais`);
    else product[field] = value;
  };
  money('preco_venda', 'Preço de venda', 'salePrice');
  money('custo', 'Custo', 'costPrice');

  const quantity = (key: ImportColumn, label: string, field: 'initialStock' | 'avgDailyConsumption' | 'maxDailyConsumption') => {
    const value = parseBrNumber(cell(key));
    if (value === undefined) return;
    if (Number.isNaN(value) || value < 0 || value > 1_000_000 || decimals(value) > 3) errors.push(`${label} inválido`);
    else product[field] = value;
  };
  quantity('estoque_inicial', 'Estoque inicial', 'initialStock');
  quantity('consumo_medio', 'Consumo médio', 'avgDailyConsumption');
  quantity('consumo_maximo', 'Consumo máximo', 'maxDailyConsumption');

  const lead = parseBrNumber(cell('prazo_entrega'));
  if (lead !== undefined) {
    if (!Number.isInteger(lead) || lead < 0 || lead > 365) errors.push('Prazo de entrega: dias inteiros, de 0 a 365');
    else product.leadTimeDays = lead;
  }

  const replenishment = parseBoolean(cell('reposicao'));
  if (replenishment === null) errors.push('Reposição: use "sim" ou "não"');
  else if (replenishment !== undefined) product.replenishmentEnabled = replenishment;

  if (
    product.avgDailyConsumption !== undefined &&
    product.maxDailyConsumption !== undefined &&
    product.maxDailyConsumption < product.avgDailyConsumption
  ) {
    errors.push('O consumo máximo não pode ser menor que o médio');
  }
  return { product, errors };
}
