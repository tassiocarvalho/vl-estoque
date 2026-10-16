import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { errorMessage, http } from '@/lib/api';
import type { CashMovement, CashSession, PaperSize, Sale, SystemSettings } from '@/lib/types';
import { useBranding } from '../branding/BrandingProvider';
import { cashMovementDocument, cashReportDocument, quoteDocument, saleDocument, type PrintDocument, type QuoteData } from './document';
import { printHtml, renderHtml } from './render-html';
import { downloadPdf } from './render-pdf';

export const SETTINGS_QUERY_KEY = ['settings'];

export const useSystemSettings = () =>
  useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => http.get<SystemSettings>('/settings'),
    staleTime: 60_000,
  });

/**
 * Impressão dos comprovantes:
 *  - impressora de rede configurada → ESC/POS direto pela API (rápido, sem janela);
 *  - senão (ou se a rede falhar) → impressão pelo navegador no papel configurado (80 mm, 58 mm ou A4).
 * Qualquer documento também pode ser baixado em PDF.
 */
export function usePrinter() {
  const { data: settings } = useSystemSettings();
  const { branding } = useBranding();
  const printer = settings?.printer;
  const paper: PaperSize = printer?.paper ?? '80mm';
  const network = printer?.connection === 'network' && Boolean(printer.host);

  const browserPrint = useCallback((doc: PrintDocument, format: PaperSize = paper) => printHtml(renderHtml(doc, format)), [paper]);

  /** Tenta a impressora de rede; se falhar, avisa e imprime pelo navegador. */
  const viaNetwork = useCallback(
    async (path: string, body: unknown, fallback: PrintDocument) => {
      try {
        await http.post(path, body, { silent: true });
      } catch (error) {
        toast.error('Impressora de rede indisponível — imprimindo pelo navegador', { description: errorMessage(error) });
        await browserPrint(fallback);
      }
    },
    [browserPrint],
  );

  const printSale = useCallback(
    async (sale: Sale, options: { copy?: boolean } = {}) => {
      const doc = saleDocument(sale, branding, { copy: options.copy, logo: branding.logo });
      // Venda offline ainda não está no servidor: só o navegador consegue imprimir.
      if (network && sale.number > 0) return viaNetwork(`/printing/sales/${sale.id}`, { copy: options.copy }, doc);
      await browserPrint(doc);
      if (options.copy && sale.number > 0) void http.post(`/sales/${sale.id}/reprint`).catch(() => undefined);
    },
    [branding, network, viaNetwork, browserPrint],
  );

  const printCashReport = useCallback(
    (session: CashSession) => {
      const doc = cashReportDocument(session, branding, branding.logo);
      return network ? viaNetwork(`/printing/cash-sessions/${session.id}`, {}, doc) : browserPrint(doc);
    },
    [branding, network, viaNetwork, browserPrint],
  );

  const printCashMovement = useCallback(
    (movement: CashMovement & { terminal: string }) => {
      const doc = cashMovementDocument(movement, branding, branding.logo);
      return network ? viaNetwork(`/printing/cash-movements/${movement.id}`, {}, doc) : browserPrint(doc);
    },
    [branding, network, viaNetwork, browserPrint],
  );

  /** Orçamento sai em A4 (layout de pedido/orçamento). */
  const printQuote = useCallback((quote: QuoteData) => browserPrint(quoteDocument(quote, branding, branding.logo), 'A4'), [branding, browserPrint]);

  const pdf = useMemo(
    () => ({
      sale: (sale: Sale, format: PaperSize = 'A4') => downloadPdf(saleDocument(sale, branding, { logo: branding.logo }), format),
      quote: (quote: QuoteData) => downloadPdf(quoteDocument(quote, branding, branding.logo), 'A4'),
      cashReport: (session: CashSession) => downloadPdf(cashReportDocument(session, branding, branding.logo), 'A4'),
    }),
    [branding],
  );

  return {
    settings,
    autoPrint: printer?.autoPrint ?? false,
    paper,
    network,
    printSale,
    printCashReport,
    printCashMovement,
    printQuote,
    pdf,
    /** Abre a gaveta (só com impressora de rede; nas USB a gaveta abre pelo driver ao imprimir). */
    openDrawer: () => http.post('/printing/drawer'),
  };
}
