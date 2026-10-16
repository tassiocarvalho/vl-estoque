import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useBranding } from '../branding/BrandingProvider';
import { useAuth } from './AuthProvider';

const schema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário'),
  password: z.string().min(1, 'Informe a senha'),
});

type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const { user, login, loginWithPin } = useAuth();
  const { branding, logo } = useBranding();
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>();

  const { register, handleSubmit, formState, resetField } = useForm<FormData>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(undefined);
    try {
      const profile = mode === 'pin' ? await loginWithPin(username, password) : await login(username, password);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(profile.mustChangePassword ? '/trocar-senha' : from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-brand-700/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <img src={logo} alt="" className="size-11 rounded-xl bg-white/10 object-contain" />
          <div>
            <p className="font-semibold">{branding.name}</p>
            {branding.tagline && <p className="text-sm text-white/65">{branding.tagline}</p>}
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">Caixa rápido, estoque em dia e tudo registrado.</h1>
          <p className="mt-4 text-white/75">
            Frente de caixa pelo teclado, vendas mesmo sem internet, alertas de reposição e relatórios de vendas.
          </p>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-white/60">
          <ShieldCheck className="size-4" /> Acesso protegido e registrado em auditoria
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src={logo} alt="" className="size-10 rounded-xl object-contain" />
            <p className="font-semibold">{branding.name}</p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Entrar</h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'pin' ? 'Entrada rápida no caixa com o seu usuário e PIN.' : 'Use o usuário e a senha fornecidos pelo administrador.'}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
            {(['password', 'pin'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={mode === option}
                onClick={() => {
                  setMode(option);
                  setError(undefined);
                  resetField('password');
                }}
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  mode === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {option === 'pin' ? <KeyRound className="size-4" /> : <LogIn className="size-4" />}
                {option === 'pin' ? 'PIN rápido' : 'Senha'}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
            <Field label="Usuário" error={formState.errors.username?.message}>
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={!!formState.errors.username}
                  {...register('username')}
                />
              )}
            </Field>
            <Field label={mode === 'pin' ? 'PIN' : 'Senha'} error={formState.errors.password?.message}>
              {(id) => (
                <div className="relative">
                  <Input
                    id={id}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'pin' ? 'off' : 'current-password'}
                    inputMode={mode === 'pin' ? 'numeric' : undefined}
                    maxLength={mode === 'pin' ? 6 : undefined}
                    className="pr-10"
                    aria-invalid={!!formState.errors.password}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              )}
            </Field>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} icon={<LogIn className="size-4" />}>
              Entrar
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
