/**
 * CPF/CNPJ e telefone no navegador — mesma regra de apps/api/src/common/document.ts
 * (o teste de paridade da API garante que as duas validações concordam).
 */

/** CPF (11) ou CNPJ (14) válido pelos dígitos verificadores — mesma regra da API. */
export function isValidDocument(value: string): boolean {
  const d = value.replace(/\D/g, '');
  const check = (digits: number[], weights: number[]) => {
    const rest = digits.reduce((acc, n, i) => acc + n * weights[i], 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const n = [...d].map(Number);
  if (d.length === 11 && !/^(\d)\1{10}$/.test(d)) {
    return check(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]) === n[9] && check(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === n[10];
  }
  if (d.length === 14 && !/^(\d)\1{13}$/.test(d)) {
    return (
      check(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n[12] &&
      check(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n[13]
    );
  }
  return false;
}

/** 52998224725 → 529.982.247-25 · 11222333000181 → 11.222.333/0001-81 */
export function formatDocument(value: string | null | undefined): string {
  if (!value) return '';
  const d = value.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

/** 71999990000 → (71) 99999-0000 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const d = value.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return value;
}
