import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card, LoadingState } from '@/components/ui/Display';
import { Field, Input } from '@/components/ui/Form';
import { errorMessage, http } from '@/lib/api';
import { passwordRule } from './password-schemas';

const requestSchema = z.object({ identifier: z.string().trim().min(1, 'Informe o seu usuário ou e-mail') });

const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, 'O código tem 6 números'),
    newPassword: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, { path: ['confirmPassword'], message: 'As senhas não conferem' });

/** Pede o código por e-mail e define uma nova senha com ele. */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState<string>();
  const options = useQuery({
    queryKey: ['auth', 'recovery'],
    queryFn: () => http.get<{ email: boolean }>('/auth/recovery'),
  });

  const request = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema) });
  const reset = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  const sendCode = request.handleSubmit(async ({ identifier: value }) => {
    try {
      await http.post('/auth/forgot-password', { identifier: value });
      setIdentifier(value);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  const resend = async () => {
    try {
      await http.post('/auth/forgot-password', { identifier });
      toast.success('Se houver e-mail cadastrado, um novo código foi enviado');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const savePassword = reset.handleSubmit(async ({ code, newPassword }) => {
    try {
      await http.post('/auth/reset-password', { identifier, code, newPassword });
      toast.success('Senha redefinida! Entre com a nova senha.');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Voltar para o login
        </Link>
        <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          {identifier ? <MailCheck className="size-6" /> : <KeyRound className="size-6" />}
        </span>

        {options.isLoading ? (
          <LoadingState />
        ) : !options.data?.email ? (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Esqueceu a senha?</h1>
            <p className="mt-2 text-sm text-slate-600">
              A recuperação por e-mail ainda não foi configurada neste sistema. Peça a um <b>administrador</b> para
              redefinir a sua senha em <b>Usuários → Redefinir senha</b>.
            </p>
            <p className="mt-3 text-sm text-slate-500">
              Administradores podem ativar a recuperação por e-mail em <b>Configurações</b>.
            </p>
          </>
        ) : !identifier ? (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Esqueceu a senha?</h1>
            <p className="mt-1 mb-6 text-sm text-slate-500">
              Informe o seu usuário ou e-mail. Se houver um e-mail cadastrado, enviaremos um código de 6 números.
            </p>
            <form key="request" onSubmit={sendCode} className="space-y-4" noValidate>
              <Field label="Usuário ou e-mail" error={request.formState.errors.identifier?.message}>
                {(id) => (
                  <Input id={id} autoFocus autoCapitalize="none" spellCheck={false} {...request.register('identifier')} />
                )}
              </Field>
              <Button type="submit" className="w-full" loading={request.formState.isSubmitting}>
                Enviar código
              </Button>
            </form>
            <p className="mt-4 text-xs text-slate-500">
              Não tem e-mail cadastrado? Peça a um administrador para redefinir a sua senha.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Confira o seu e-mail</h1>
            <p className="mt-1 mb-6 text-sm text-slate-500">
              Se <b>{identifier}</b> tiver um e-mail cadastrado, você vai receber um código válido por 15 minutos. Veja também
              a caixa de spam.
            </p>
            <form key="reset" onSubmit={savePassword} className="space-y-4" noValidate>
              <Field label="Código recebido" error={reset.formState.errors.code?.message}>
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="text-center text-lg tracking-[0.5em]"
                    {...reset.register('code')}
                  />
                )}
              </Field>
              <Field label="Nova senha" error={reset.formState.errors.newPassword?.message} hint="Mínimo de 8 caracteres, com letras e números.">
                {(id) => <Input id={id} type="password" autoComplete="new-password" {...reset.register('newPassword')} />}
              </Field>
              <Field label="Confirme a nova senha" error={reset.formState.errors.confirmPassword?.message}>
                {(id) => <Input id={id} type="password" autoComplete="new-password" {...reset.register('confirmPassword')} />}
              </Field>
              <Button type="submit" className="w-full" loading={reset.formState.isSubmitting}>
                Salvar nova senha
              </Button>
            </form>
            <div className="mt-4 flex justify-between text-sm">
              <button onClick={() => setIdentifier(undefined)} className="text-slate-500 hover:text-slate-800">
                Trocar usuário
              </button>
              <button onClick={() => void resend()} className="font-medium text-brand-700 hover:text-brand-800">
                Reenviar código
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
