/**
 * Datas sem horário (vencimentos, pagamentos) — sempre no formato aaaa-mm-dd.
 * As colunas DATE do banco são gravadas como meia-noite UTC; "hoje" é o dia no fuso do computador da loja.
 */

/** Dia local de uma data/hora (aaaa-mm-dd). */
export const localDay = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export const todayIso = () => localDay(new Date());

/** aaaa-mm-dd → Date para gravar/comparar em coluna DATE. */
export const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Date de coluna DATE → aaaa-mm-dd. */
export const isoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export const addDays = (iso: string, days: number) => isoDate(new Date(dateOnly(iso).getTime() + days * 86_400_000))!;
