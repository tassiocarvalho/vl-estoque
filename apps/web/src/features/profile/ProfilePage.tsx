import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, KeyRound, Mail, ShieldCheck, UserCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/Display';
import { Field, Input } from '@/components/ui/Form';
import { errorMessage, http } from '@/lib/api';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/labels';
import type { Profile } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { ChangePasswordForm } from '../auth/ChangePasswordForm';
import { pinRule } from '../auth/password-schemas';

function PinForm({ hasPin }: { hasPin: boolean }) {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const check = pinRule.safeParse(pin);
    if (!check.success) return setError(check.error.issues[0].message);
    if (pin !== confirm) return setError('Os PINs não conferem');
    setError(undefined);
    setSaving(true);
    try {
      await http.post('/auth/pin', { currentPassword, pin });
      toast.success('PIN salvo');
      setCurrentPassword('');
      setPin('');
      setConfirm('');
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 6);

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-500">
        O PIN é pedido para confirmar operações sensíveis (como excluir produtos ou movimentar o estoque). Não compartilhe com ninguém.
      </p>
      <Field label="Senha atual">
        {(id) => <Input id={id} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={hasPin ? 'Novo PIN' : 'PIN'} error={error}>
          {(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(digitsOnly(e.target.value))} />}
        </Field>
        <Field label="Confirme o PIN">
          {(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="off" value={confirm} onChange={(e) => setConfirm(digitsOnly(e.target.value))} />}
        </Field>
      </div>
      <Button type="submit" loading={saving} disabled={!currentPassword || pin.length < 4}>
        {hasPin ? 'Alterar PIN' : 'Criar PIN'}
      </Button>
    </form>
  );
}

/** E-mail de recuperação de senha (o próprio usuário corrige; LGPD art. 18, III). */
function EmailForm({ email, required }: { email: string | null; required: boolean }) {
  const { setUser } = useAuth();
  const [value, setValue] = useState(email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (required && !value.trim()) return setError('Administradores precisam de um e-mail');
    if (!currentPassword) return setError('Confirme com a sua senha atual');
    setSaving(true);
    try {
      setUser(await http.patch<Profile>('/auth/profile', { email: value.trim(), currentPassword }));
      setCurrentPassword('');
      toast.success('E-mail salvo');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={required ? 'E-mail' : 'E-mail (opcional)'}>
          {(id) => <Input id={id} type="email" autoCapitalize="none" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
        <Field label="Senha atual">
          {(id) => <Input id={id} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />}
        </Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" variant="outline" loading={saving}>
        Salvar e-mail
      </Button>
    </form>
  );
}

/** Direitos do titular (LGPD, art. 18): acesso, portabilidade e informações sobre o tratamento. */
function PrivacyCard() {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const data = await http.get<unknown>('/auth/my-data');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: 'meus-dados-vl-estoque.json' });
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Privacidade (LGPD)" description="Seus direitos como titular dos dados pessoais." />
      <div className="space-y-4 p-5 text-sm text-slate-600">
        <p>
          Baixe uma cópia de todos os dados pessoais que o sistema guarda sobre você: cadastro, registros de auditoria e
          operações registradas com o seu usuário.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" icon={<Download className="size-4" />} loading={downloading} onClick={download}>
            Baixar meus dados
          </Button>
          <Link to="/termos" className="inline-flex items-center gap-1.5 self-center font-medium text-brand-700 hover:text-brand-800">
            <ShieldCheck className="size-4" /> Termo de Uso e Política de Privacidade
          </Link>
        </div>
        <p className="text-xs text-slate-500">
          Para pedir correção de nome, anonimização ou eliminação dos seus dados, fale com um administrador ou com o
          encarregado indicado no termo.
        </p>
      </div>
    </Card>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Meu perfil" description="Seus dados de acesso, senha, PIN, e-mail e privacidade." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit p-6 text-center">
          <UserCircle className="mx-auto size-16 text-brand-600" />
          <p className="mt-3 text-lg font-semibold text-slate-900">{user.name}</p>
          <p className="text-sm text-slate-500">@{user.username}</p>
          {user.email && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
              <Mail className="size-3.5" /> {user.email}
            </p>
          )}
          <div className="mt-3">
            <Badge tone="violet">{ROLE_LABELS[user.role]}</Badge>
          </div>
          <p className="mt-3 text-xs text-slate-500">{ROLE_DESCRIPTIONS[user.role]}</p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs">
            {user.hasPin ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="size-4" /> PIN cadastrado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <KeyRound className="size-4" /> Cadastre seu PIN
              </span>
            )}
          </p>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="PIN de confirmação" />
            <div className="p-5">
              <PinForm hasPin={user.hasPin} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Alterar senha" description="Ao trocar a senha, as sessões abertas em outros dispositivos são encerradas." />
            <div className="p-5">
              <ChangePasswordForm />
            </div>
          </Card>
          <Card>
            <CardHeader
              title="E-mail para recuperar a senha"
              description="Se você esquecer a senha, um código é enviado para este e-mail. Ele não é usado para mais nada."
            />
            <div className="p-5">
              <EmailForm email={user.email} required={user.role === 'ADMIN'} />
            </div>
          </Card>
          <PrivacyCard />
        </div>
      </div>
    </>
  );
}
