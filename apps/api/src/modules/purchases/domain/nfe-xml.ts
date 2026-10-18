/**
 * Leitura do XML da NF-e do fornecedor (modelo 55, versões 3.10 e 4.00) — domínio puro.
 *
 * O XML da nota é regular (sem DTD nem CDATA na prática), então um leitor pequeno resolve
 * sem dependências: monta a árvore de elementos e extrai cabeçalho, emitente, itens, totais e parcelas.
 */

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export class NfeXmlError extends Error {}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });

/** Nome sem o prefixo de namespace ("nfe:det" → "det"). */
const localName = (name: string) => name.slice(name.indexOf(':') + 1);

/** Monta a árvore de elementos do XML. */
export function parseXml(xml: string): XmlNode {
  const source = xml
    .replace(/^\uFEFF/, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, data: string) => data.replace(/&/g, '&amp;').replace(/</g, '&lt;'));

  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const tag = /<(\/?)([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(source))) {
    const [, closing, rawName, rawAttrs, selfClosing, text] = match;
    const current = stack[stack.length - 1];
    if (text !== undefined) {
      if (text.trim()) current.text += decode(text);
      continue;
    }
    const name = localName(rawName);
    if (closing) {
      if (stack.length > 1 && current.name === name) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [, key, double, single] of (rawAttrs ?? '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[localName(key)] = decode(double ?? single ?? '');
    }
    const node: XmlNode = { name, attrs, children: [], text: '' };
    current.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

const child = (node: XmlNode | undefined, name: string) => node?.children.find((c) => c.name === name);
const childrenNamed = (node: XmlNode | undefined, name: string) => node?.children.filter((c) => c.name === name) ?? [];

/** Primeiro elemento com o nome, em qualquer profundidade. */
export function findNode(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const c of node.children) {
    if (c.name === name) return c;
    const found = findNode(c, name);
    if (found) return found;
  }
  return undefined;
}

const textOf = (node: XmlNode | undefined, name: string) => child(node, name)?.text.trim() || undefined;
const numberOf = (node: XmlNode | undefined, name: string) => {
  const value = textOf(node, name);
  if (value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

export interface NfeItem {
  /** Número do item na nota. */
  index: number;
  code: string;
  /** EAN/GTIN (nulo quando a nota traz "SEM GTIN"). */
  barcode: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  /** Valor bruto do item (quantidade × valor unitário). */
  total: number;
}

export interface NfeInstallment {
  number: string;
  dueDate: string;
  amount: number;
}

export interface NfeData {
  accessKey: string | null;
  number: string | null;
  series: string | null;
  /** Data de emissão (aaaa-mm-dd). */
  issueDate: string | null;
  supplier: { document: string | null; name: string; tradeName: string | null; phone: string | null; email: string | null };
  items: NfeItem[];
  productsTotal: number;
  freight: number;
  discount: number;
  /** Seguro, outras despesas, IPI e ICMS-ST: tudo o que soma no total da nota além dos produtos e do frete. */
  otherCosts: number;
  total: number;
  installments: NfeInstallment[];
}

const validBarcode = (value: string | undefined) => (value && /^\d{8,14}$/.test(value) ? value : null);

/** Extrai os dados da NF-e. Lança NfeXmlError se o arquivo não for uma NF-e. */
export function parseNfe(xml: string): NfeData {
  let tree: XmlNode;
  try {
    tree = parseXml(xml);
  } catch {
    throw new NfeXmlError('Arquivo XML inválido');
  }
  const infNFe = findNode(tree, 'infNFe');
  if (!infNFe) throw new NfeXmlError('O arquivo não é o XML de uma NF-e (não tem o grupo infNFe)');

  const ide = child(infNFe, 'ide');
  const emit = child(infNFe, 'emit');
  const totals = child(child(infNFe, 'total'), 'ICMSTot');

  const idKey = infNFe.attrs.Id?.replace(/^NFe/i, '');
  const protKey = findNode(tree, 'chNFe')?.text.trim();
  const accessKey = [idKey, protKey].find((key) => key && /^\d{44}$/.test(key)) ?? null;

  const items = childrenNamed(infNFe, 'det').map((det, position): NfeItem => {
    const prod = child(det, 'prod');
    const quantity = numberOf(prod, 'qCom');
    const total = numberOf(prod, 'vProd');
    return {
      index: Number(det.attrs.nItem) || position + 1,
      code: textOf(prod, 'cProd') ?? '',
      barcode: validBarcode(textOf(prod, 'cEAN')) ?? validBarcode(textOf(prod, 'cEANTrib')),
      description: textOf(prod, 'xProd') ?? `Item ${position + 1}`,
      unit: (textOf(prod, 'uCom') ?? 'UN').toUpperCase(),
      quantity: round(quantity, 3),
      unitCost: round(numberOf(prod, 'vUnCom') || (quantity ? total / quantity : 0), 4),
      total: round(total, 2),
    };
  });
  if (items.length === 0) throw new NfeXmlError('A nota não tem itens');

  const productsTotal = round(numberOf(totals, 'vProd') || items.reduce((sum, i) => sum + i.total, 0), 2);
  const freight = round(numberOf(totals, 'vFrete'), 2);
  const discount = round(numberOf(totals, 'vDesc'), 2);
  const total = round(numberOf(totals, 'vNF') || productsTotal + freight - discount, 2);
  const otherCosts = Math.max(round(total - productsTotal - freight + discount, 2), 0);

  const issued = textOf(ide, 'dhEmi') ?? textOf(ide, 'dEmi');
  const address = child(emit, 'enderEmit');

  return {
    accessKey,
    number: textOf(ide, 'nNF') ?? null,
    series: textOf(ide, 'serie') ?? null,
    issueDate: issued ? issued.slice(0, 10) : null,
    supplier: {
      document: textOf(emit, 'CNPJ') ?? textOf(emit, 'CPF') ?? null,
      name: textOf(emit, 'xNome') ?? 'Fornecedor sem nome',
      tradeName: textOf(emit, 'xFant') ?? null,
      phone: textOf(address, 'fone') ?? null,
      email: textOf(emit, 'email') ?? null,
    },
    items,
    productsTotal,
    freight,
    discount,
    otherCosts,
    total,
    installments: childrenNamed(child(infNFe, 'cobr'), 'dup').map((dup, index) => ({
      number: textOf(dup, 'nDup') ?? String(index + 1).padStart(3, '0'),
      dueDate: (textOf(dup, 'dVenc') ?? '').slice(0, 10),
      amount: round(numberOf(dup, 'vDup'), 2),
    })).filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.dueDate) && i.amount > 0),
  };
}
