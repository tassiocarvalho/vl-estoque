import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, ErrorState, LoadingState, PageHeader } from '@/components/ui/Display';
import { Field, Input, Switch } from '@/components/ui/Form';
import { errorMessage, http } from '@/lib/api';
import type { SystemSettings } from '@/lib/types';
import { CompanySettingsCard } from './CompanySettingsCard';
import { MailSettingsCard } from './MailSettingsCard';

const PIN_OPTIONS: { key: keyof SystemSettings['pinRequired']; label: string; description: string }[] = [
  { key: 'stockOut', label: 'Registrar saída', description: 'Vendas, perdas e ajustes de saída' },
  { key: 'stockIn', label: 'Registrar entrada', description: 'Recebimento de mercadoria e retornos' },
  { key: 'productWrite', label: 'Cadastrar ou editar produto', description: 'Inclui o estoque inicial' },
  { key: 'productDelete', label: 'Excluir produto', description: 'Enviar para a lixeira e excluir definitivamente' },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => http.get<SystemSettings>('/settings'),
  });
  const [form, setForm] = useState<SystemSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (settings: SystemSettings) => http.patch<SystemSettings>('/settings', settings),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      toast.success('Configurações salvas');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoading || (!form && !isError)) return <LoadingState />;
  if (isError || !form) return <ErrorState message="Não foi possível carregar as configurações" onRetry={refetch} />;

  const update = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => setForm({ ...form, [key]: value });
  const changed = JSON.stringify(form) !== JSON.stringify(data);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Regras do sistema que podem ser ajustadas sem reprogramação."
        actions={
          <Button icon={<Save className="size-4" />} disabled={!changed} loading={save.isPending} onClick={() => save.mutate(form)}>
            Salvar alterações
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Segurança: PIN" description="Quais operações exigem que o funcionário confirme com o próprio PIN" />
          <div className="space-y-5 p-5">
            {PIN_OPTIONS.map((option) => (
              <Switch
                key={option.key}
                label={option.label}
                description={option.description}
                checked={form.pinRequired[option.key]}
                onChange={(checked) => update('pinRequired', { ...form.pinRequired, [option.key]: checked })}
              />
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Reposição" />
            <div className="space-y-5 p-5">
              <Field
                label="Dias de cobertura do pedido sugerido"
                hint="Quantidade sugerida = estoque de segurança + consumo médio × (prazo de entrega + estes dias) − saldo atual."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={180}
                    value={form.orderCoverageDays}
                    onChange={(e) => update('orderCoverageDays', Number(e.target.value))}
                    className="w-32"
                  />
                )}
              </Field>
              <Switch
                label="Permitir estoque negativo"
                description="Se desligado, o sistema bloqueia saídas maiores que o saldo registrado."
                checked={form.allowNegativeStock}
                onChange={(checked) => update('allowNegativeStock', checked)}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Lixeira" />
            <div className="p-5">
              <Field label="Dias até a exclusão definitiva" hint="Produtos excluídos podem ser recuperados durante este prazo.">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={365}
                    value={form.trashRetentionDays}
                    onChange={(e) => update('trashRetentionDays', Number(e.target.value))}
                    className="w-32"
                  />
                )}
              </Field>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MailSettingsCard />
        <CompanySettingsCard />
      </div>
    </>
  );
}
