import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage, http } from '@/lib/api';
import { cn } from '@/lib/cn';
import { parseCsv, readCsvFile } from '@/lib/csv';
import { downloadCsv } from '@/lib/format';
import type { ImportResult } from '@/lib/types';

/** Colunas do modelo (mesmo layout da exportação). */
const TEMPLATE = [
  ['nome', 'sku', 'codigo_barras', 'categoria', 'subcategoria', 'unidade', 'preco_venda', 'custo', 'estoque_inicial', 'reposicao', 'consumo_medio', 'consumo_maximo', 'prazo_entrega'],
  ['Arroz Tipo 1 5kg', 'ARROZ-T1-5KG', '7891234567895', 'Mercearia', 'Grãos', 'PCT', '27,90', '21,50', '40', 'sim', '3', '5', '4'],
  ['Sacola plástica', 'SACOLA', '', 'Embalagens', '', 'UN', '0,10', '0,04', '500', 'não', '', '', ''],
];

export function downloadTemplate() {
  downloadCsv('modelo-importacao-produtos.csv', TEMPLATE);
}

/** Exporta o catálogo no layout da importação (para reajustar preços no Excel e reimportar). */
export async function exportCatalog() {
  const { columns, rows } = await http.get<{ columns: { key: string }[]; rows: Record<string, string | number>[] }>('/products/export');
  const keys = columns.map((c) => c.key);
  downloadCsv(`produtos-${new Date().toISOString().slice(0, 10)}.csv`, [keys, ...rows.map((row) => keys.map((k) => row[k] ?? ''))]);
}

/**
 * Importação por planilha (RF19): confere tudo antes de gravar, mostra os erros por linha
 * e grava tudo de uma vez (ou nada).
 */
export function ImportProductsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [mode, setMode] = useState<'create' | 'upsert'>('upsert');
  const [createCategories, setCreateCategories] = useState(true);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (selected: File | undefined) => {
    if (!selected) return;
    setPreview(null);
    try {
      if (selected.size > 4 * 1024 * 1024) throw new Error('Planilha grande demais (máximo de 4 MB)');
      const [headers, ...rows] = parseCsv(await readCsvFile(selected));
      if (!headers?.length || rows.length === 0) throw new Error('A planilha está vazia');
      setFile({ name: selected.name, headers, rows });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler a planilha');
    }
  };

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await http.post<ImportResult>('/products/import', { headers: file.headers, rows: file.rows, mode, createCategories, dryRun });
      setPreview(result);
      if (result.applied) {
        toast.success(`Importação concluída: ${result.summary.create} cadastrado(s) e ${result.summary.update} atualizado(s)`);
        for (const key of ['products', 'categories', 'dashboard', 'movements']) void queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const withErrors = preview?.rows.filter((r) => r.errors.length) ?? [];

  return (
    <Modal open={open} onClose={close} title="Importar produtos por planilha" size="lg">
      <div className="space-y-4 text-sm">
        {!preview?.applied && (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-slate-600">
              <li>
                Baixe o{' '}
                <button type="button" onClick={downloadTemplate} className="font-medium text-brand-700 hover:underline">
                  modelo da planilha
                </button>{' '}
                (ou exporte o catálogo atual) e preencha no Excel. Uma linha por produto.
              </li>
              <li>
                Salve como <b>CSV (separado por ponto e vírgula)</b>. Formate a coluna do código de barras como texto, para o Excel não estragar o número.
              </li>
              <li>Escolha o arquivo abaixo: o sistema confere tudo antes de gravar.</li>
            </ol>

            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 px-4 py-4 text-left hover:border-brand-400 hover:bg-brand-50/40"
            >
              <FileSpreadsheet className="size-8 shrink-0 text-brand-600" />
              <span>
                {file ? (
                  <>
                    <b className="text-slate-900">{file.name}</b>
                    <span className="block text-xs text-slate-500">
                      {file.rows.length} linha(s) · colunas: {file.headers.filter(Boolean).join(', ')}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-600">Escolher arquivo CSV</span>
                )}
              </span>
            </button>

            <div className="grid gap-3 rounded-xl bg-slate-50 p-4">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['upsert', 'Cadastrar e atualizar', 'Produto com SKU existente é atualizado (célula vazia mantém o valor).'],
                    ['create', 'Só cadastrar novos', 'SKU que já existe é apontado como erro.'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setMode(value);
                      setPreview(null);
                    }}
                    className={cn('flex-1 rounded-lg border px-3 py-2 text-left', mode === value ? 'border-brand-600 bg-white ring-1 ring-brand-600' : 'border-slate-200 bg-white')}
                  >
                    <span className="block font-medium text-slate-900">{label}</span>
                    <span className="block text-xs text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
              <Switch
                checked={createCategories}
                onChange={(value) => {
                  setCreateCategories(value);
                  setPreview(null);
                }}
                label="Criar as categorias que faltam"
                description="Desligado, categoria que não existe no sistema vira erro na linha."
              />
              <p className="text-xs text-slate-500">O estoque inicial só vale para produtos novos. Para corrigir o saldo de um produto existente, use um ajuste de estoque.</p>
            </div>
          </>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">{preview.summary.create} novo(s)</Badge>
              <Badge tone="blue">{preview.summary.update} atualização(ões)</Badge>
              <Badge tone={preview.summary.errors ? 'red' : 'neutral'}>{preview.summary.errors} com erro</Badge>
              {preview.summary.ignoredColumns.length > 0 && <Badge tone="amber">Colunas ignoradas: {preview.summary.ignoredColumns.join(', ')}</Badge>}
            </div>
            {preview.applied ? (
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <CheckCircle2 className="size-5" /> Planilha importada com sucesso.
              </p>
            ) : withErrors.length ? (
              <>
                <p className="text-slate-600">Corrija as linhas abaixo na planilha e escolha o arquivo de novo. Nada foi gravado.</p>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-red-200">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th className="w-16">Linha</th>
                        <th>Produto</th>
                        <th>Problemas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withErrors.map((row) => (
                        <tr key={row.line}>
                          <td className="tabular-nums">{row.line}</td>
                          <td>
                            <p className="font-medium text-slate-900">{row.name ?? '—'}</p>
                            <p className="text-xs text-slate-500">{row.sku || 'sem SKU'}</p>
                          </td>
                          <td className="text-red-700">
                            <ul className="list-disc pl-4">
                              {row.errors.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="font-medium text-emerald-700">Tudo certo: nenhuma linha com erro. Confirme para gravar.</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {preview?.applied ? (
            <>
              <Button variant="outline" onClick={reset}>
                Importar outra
              </Button>
              <Button onClick={close}>Concluir</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" icon={<Download className="size-4" />} onClick={downloadTemplate}>
                Modelo
              </Button>
              {preview && !withErrors.length ? (
                <Button icon={<Upload className="size-4" />} loading={busy} onClick={() => void send(false)}>
                  Importar {preview.summary.create + preview.summary.update} produto(s)
                </Button>
              ) : (
                <Button loading={busy} disabled={!file} onClick={() => void send(true)}>
                  Conferir planilha
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
