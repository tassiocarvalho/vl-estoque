import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, LoadingState } from '@/components/ui/Display';
import { Field, Input } from '@/components/ui/Form';
import { errorMessage, http } from '@/lib/api';
import type { CompanyInfo, LegalInfo } from '@/lib/types';
import { useLegal } from '../legal/api';

/** Dados da empresa (controladora) e do encarregado, exibidos no Termo de Uso e Política de Privacidade. */
export function CompanySettingsCard() {
  const queryClient = useQueryClient();
  const { data } = useLegal();
  const [form, setForm] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    if (data) setForm(data.company);
  }, [data]);

  const save = useMutation({
    mutationFn: (company: CompanyInfo) => http.put<CompanyInfo>('/settings/company', company),
    onSuccess: (company) => {
      queryClient.setQueryData<LegalInfo>(['legal'], (old) => (old ? { ...old, company } : old));
      toast.success('Dados da empresa salvos');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!form) {
    return (
      <Card>
        <LoadingState />
      </Card>
    );
  }

  const field = (key: keyof CompanyInfo) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }),
  });

  return (
    <Card>
      <CardHeader
        title="Empresa e privacidade (LGPD)"
        description="Aparecem no Termo de Uso e Política de Privacidade que os usuários aceitam."
      />
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(form);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Razão social / nome" className="sm:col-span-2">
            {(id) => <Input id={id} maxLength={120} {...field('name')} />}
          </Field>
          <Field label="CNPJ">
            {(id) => <Input id={id} maxLength={20} placeholder="00.000.000/0000-00" {...field('cnpj')} />}
          </Field>
        </div>
        <Field label="Endereço (cidade/UF)">
          {(id) => <Input id={id} maxLength={200} {...field('address')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Encarregado de dados (DPO)" hint="Pessoa que atende os pedidos dos titulares (art. 41).">
            {(id) => <Input id={id} maxLength={80} {...field('dpoName')} />}
          </Field>
          <Field label="E-mail do encarregado">
            {(id) => <Input id={id} type="email" autoCapitalize="none" maxLength={120} {...field('dpoEmail')} />}
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" icon={<Save className="size-4" />} loading={save.isPending}>
            Salvar
          </Button>
          <Link to="/termos" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            Ver o termo
          </Link>
        </div>
      </form>
    </Card>
  );
}
