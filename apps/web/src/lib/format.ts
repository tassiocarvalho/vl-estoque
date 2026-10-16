import { UNIT_SHORT } from './labels';
import type { Unit } from './types';

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimalFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatNumber = (value: number) => numberFormat.format(value);

/** R$ 1.234,56 */
export const formatMoney = (value: number) => moneyFormat.format(value);

/** 1.234,56 (sem o símbolo da moeda) */
export const formatDecimal = (value: number) => decimalFormat.format(value);

/**
 * Lê um valor digitado no padrão brasileiro: "1.234,56", "1234,5", "12.5" ou "R$ 10".
 * Devolve NaN se não for um número.
 */
export function parseMoney(text: string): number {
  let clean = text.replace(/[^\d,.-]/g, '');
  if (clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
  if (clean === '' || clean === '-') return Number.NaN;
  return Math.round(Number(clean) * 100) / 100;
}

/** Lê uma quantidade (até 3 casas): "0,755" ou "2". */
export function parseQuantity(text: string): number {
  const clean = text.replace(/[^\d,.]/g, '').replace(',', '.');
  if (clean === '') return Number.NaN;
  return Math.round(Number(clean) * 1000) / 1000;
}

export const formatQuantity = (value: number, unit: Unit) => `${numberFormat.format(value)} ${UNIT_SHORT[unit]}`;

export const formatDate = (value: string | Date) => dateFormat.format(new Date(value));

export const formatDateTime = (value: string | Date) => dateTimeFormat.format(new Date(value));

/** Data no formato do campo <input type="date"> (yyyy-mm-dd), no fuso local. */
export function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** UUID v4 — funciona mesmo fora de HTTPS (onde crypto.randomUUID não existe). */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Gera e baixa um arquivo CSV (abre corretamente no Excel em português). */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const text = typeof value === 'number' ? numberFormat.format(value).replace(/\./g, '') : value;
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escape).join(';')).join('\r\n');
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
