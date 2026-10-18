import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge, Card, CardHeader, LoadingState } from '@/components/ui/Display';
import { Field, Input, Select } from '@/components/ui/Form';
import { errorMessage, http } from '@/lib/api';
import type { MailSettings } from '@/lib/types';

const PRESETS = {
  gmail: { label: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true },
  outlook: { label: 'Outlook / Hotmail', host: 'smtp-mail.outlook.com', port: 587, secure: false },
  other: { label: 'Outro provedor', host: '', port: 465, secure: true },
} as const;
type Preset = keyof typeof PRESETS;

const presetOf = (host: string): Preset =>
  host === PRESETS.gmail.host ? 'gmail' : host === PRESETS.outlook.host ? 'outlook' : host ? 'other' : 'gmail';

interface FormState {
  preset: Preset;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
}

/** Conta de e-mail que envia os códigos de "Esqueci minha senha". */
export function MailSettingsCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings', 'mail'], queryFn: () => http.get<MailSettings>('/settings/mail') });
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!data) return;
    const preset = presetOf(data.host);
    setForm({
      preset,
      host: data.host || PRESETS[preset].host,
      port: data.host ? data.port : PRESETS[preset].port,
      secure: data.host ? data.secure : PRESETS[preset].secure,
      user: data.user,
      password: '',
      fromName: data.fromName,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: ({ preset: _preset, password, ...rest }: FormState) =>
      http.put<MailSettings>('/settings/mail', { ...rest, ...(password && { password }) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings', 'mail'], updated);
      toast.success('E-mail de envio salvo');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const test = useMutation({
    mutationFn: () => http.post('/settings/mail/test'),
    onSuccess: () => toast.success('E-mail de teste enviado! Confira a sua caixa de entrada.'),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoading || !form || !data) {
    return (
      <Card>
        <LoadingState />
      </Card>
    );
  }

  const update = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const choosePreset = (preset: Preset) => {
    const { host, port, secure } = PRESETS[preset];
    update({ preset, host: preset === 'other' ? form.host : host, port, secure });
  };

  return (
    <Card>
      <CardHeader
        title="Recuperação de senha por e-mail"
        description="Conta que envia o código quando alguém clica em “Esqueci minha senha”."
        actions={
          data.configured ? (
            <Badge tone="green">
              <CheckCircle2 className="size-3" /> Ativa
            </Badge>
          ) : (
            <Badge tone="amber">Não configurada</Badge>
          )
        }
      />
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(form);
        }}
      >
        {form.preset === 'gmail' && (
          <div className="rounded-lg bg-brand-50/70 p-3 text-xs leading-relaxed text-slate-600">
            <p className="mb-1 font-semibold text-slate-800">Como usar uma conta Gmail</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Ative a <b>Verificação em duas etapas</b> na Conta Google (myaccount.google.com → Segurança).</li>
              <li>
                Em <b>Senhas de app</b> (myaccount.google.com/apppasswords), crie uma senha com o nome do sistema (ex.: “Caixa da loja”).
              </li>
              <li>Cole abaixo os 16 caracteres gerados. Não use a senha normal do Gmail.</li>
            </ol>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provedor">
            {(id) => (
              <Select id={id} value={form.preset} onChange={(e) => choosePreset(e.target.value as Preset)}>
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Nome do remetente">
            {(id) => <Input id={id} value={form.fromName} maxLength={60} onChange={(e) => update({ fromName: e.target.value })} />}
          </Field>
        </div>

        {form.preset === 'other' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Servidor SMTP" className="sm:col-span-2">
              {(id) => <Input id={id} value={form.host} placeholder="smtp.exemplo.com" onChange={(e) => update({ host: e.target.value })} />}
            </Field>
            <Field label="Porta" hint={form.secure ? 'SSL/TLS' : 'STARTTLS'}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  value={form.port}
                  onChange={(e) => {
                    const port = Number(e.target.value);
                    update({ port, secure: port === 465 });
                  }}
                />
              )}
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail da conta">
            {(id) => (
              <Input id={id} type="email" autoCapitalize="none" spellCheck={false} value={form.user} placeholder="mercadinho@gmail.com" onChange={(e) => update({ user: e.target.value })} />
            )}
          </Field>
          <Field
            label={form.preset === 'gmail' ? 'Senha de app' : 'Senha'}
            hint={data.hasPassword ? 'Em branco, mantém a senha já salva.' : 'Guardada criptografada.'}
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                value={form.password}
                placeholder={data.hasPassword ? '••••••••••••' : ''}
                onChange={(e) => update({ password: e.target.value })}
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" icon={<Mail className="size-4" />} loading={save.isPending}>
            Salvar
          </Button>
          <Button
            type="button"
            variant="outline"
            icon={<Send className="size-4" />}
            disabled={!data.configured}
            loading={test.isPending}
            onClick={() => test.mutate()}
          >
            Enviar e-mail de teste
          </Button>
        </div>
        <p className="text-xs text-slate-500">O teste é enviado para o e-mail cadastrado em “Meu perfil”.</p>
      </form>
    </Card>
  );
}
