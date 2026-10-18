import { describe, expect, it } from 'vitest';
import { NfeXmlError, parseNfe, parseXml } from './nfe-xml';

const KEY = '35261011222333000181550010000123451000123458';

const NFE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${KEY}" versao="4.00">
      <ide><cUF>35</cUF><serie>1</serie><nNF>12345</nNF><dhEmi>2026-10-15T09:30:00-03:00</dhEmi></ide>
      <emit>
        <CNPJ>11222333000181</CNPJ>
        <xNome>Distribuidora Bom Pre&#231;o Ltda &amp; Cia</xNome>
        <xFant>Bom Preço</xFant>
        <enderEmit><xLgr>Rua A</xLgr><fone>7133334444</fone></enderEmit>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>A-100</cProd><cEAN>7891234567895</cEAN><xProd>ARROZ TIPO 1 5KG</xProd>
          <uCom>FD</uCom><qCom>2.0000</qCom><vUnCom>120.5000000000</vUnCom><vProd>241.00</vProd>
          <cEANTrib>7891234567895</cEANTrib>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>B-7</cProd><cEAN>SEM GTIN</cEAN><xProd>Feijão carioca 1kg</xProd>
          <uCom>un</uCom><qCom>10</qCom><vUnCom>8</vUnCom><vProd>80.00</vProd>
        </prod>
      </det>
      <total><ICMSTot><vProd>321.00</vProd><vFrete>15.00</vFrete><vDesc>6.00</vDesc><vOutro>2.00</vOutro><vIPI>3.00</vIPI><vNF>335.00</vNF></ICMSTot></total>
      <cobr>
        <dup><nDup>001</nDup><dVenc>2026-11-14</dVenc><vDup>167.50</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-12-14</dVenc><vDup>167.50</vDup></dup>
      </cobr>
    </infNFe>
  </NFe>
  <protNFe><infProt><chNFe>${KEY}</chNFe></infProt></protNFe>
</nfeProc>`;

describe('leitura do XML da NF-e', () => {
  it('extrai cabeçalho, emitente, itens, totais e parcelas', () => {
    const nfe = parseNfe(NFE);
    expect(nfe.accessKey).toBe(KEY);
    expect(nfe).toMatchObject({ number: '12345', series: '1', issueDate: '2026-10-15' });
    expect(nfe.supplier).toEqual({
      document: '11222333000181',
      name: 'Distribuidora Bom Preço Ltda & Cia',
      tradeName: 'Bom Preço',
      phone: '7133334444',
      email: null,
    });
    expect(nfe.items).toEqual([
      { index: 1, code: 'A-100', barcode: '7891234567895', description: 'ARROZ TIPO 1 5KG', unit: 'FD', quantity: 2, unitCost: 120.5, total: 241 },
      { index: 2, code: 'B-7', barcode: null, description: 'Feijão carioca 1kg', unit: 'UN', quantity: 10, unitCost: 8, total: 80 },
    ]);
    // IPI e outras despesas somam no total da nota: entram como "outras despesas" no custo.
    expect(nfe).toMatchObject({ productsTotal: 321, freight: 15, discount: 6, otherCosts: 5, total: 335 });
    expect(nfe.installments).toEqual([
      { number: '001', dueDate: '2026-11-14', amount: 167.5 },
      { number: '002', dueDate: '2026-12-14', amount: 167.5 },
    ]);
  });

  it('aceita prefixo de namespace e atributos com aspas simples', () => {
    const tree = parseXml(`<a:root x='1'><a:item y="2"/><a:item>texto &lt;ok&gt;</a:item></a:root>`);
    const root = tree.children[0];
    expect(root.name).toBe('root');
    expect(root.attrs).toEqual({ x: '1' });
    expect(root.children.map((c) => [c.name, c.text, c.attrs])).toEqual([
      ['item', '', { y: '2' }],
      ['item', 'texto <ok>', {}],
    ]);
  });

  it('recusa arquivo que não é NF-e', () => {
    expect(() => parseNfe('<pedido><item/></pedido>')).toThrow(NfeXmlError);
  });
});
