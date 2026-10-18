import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { errorMessage, http } from '@/lib/api';
import type { Profile } from '@/lib/types';
import { TermsModal } from '../legal/TermsModal';
import { useAuth } from './AuthProvider';
import { firstAccessSchema, type FirstAccessData } from './password-schemas';

/**
 * Primeiro acesso: cria a senha pessoal sem pedir a senha provisória, o PIN (se ainda não houver),
 * o e-mail de recuperação (obrigatório para administradores) e a ciência do termo de uso.
 */
export function FirstAccessForm({ onDone }: { onDone?: () => void }) {
  const { user, setUser } = useAuth();
  const [termsOpen, setTermsOpen] = useState(false);
  const withPin = !user?.hasPin;
  const withEmail = !user?.email;
  const emailRequired = user?.role === 'ADMIN' && withEmail;
  const withTerms = !user?.termsAccepted;
  const schema = useMemo(
    () => firstAccessSchema({ withPin, withEmail, emailRequired, withTerms }),
    [withPin, withEmail, emailRequired, withTerms],
  );
  const { register, handleSubmit, formState } = useForm<FirstAccessData>({ resolver: zodResolver(schema) });
  const { errors } = formState;

  const onSubmit = handleSubmit(async ({ newPassword, pin, email, acceptTerms }) => {
    try {
      const profile = await http.post<Profile>('/auth/change-password', {
        newPassword,
        ...(withPin && { pin }),
        ...(withEmail && email && { email }),
        ...(withTerms && { acceptTerms }),
      });
      setUser(profile);
      toast.success(withPin ? 'Senha e PIN salvos' : 'Senha salva');
      onDone?.();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Nova senha" error={errors.newPassword?.message} hint="Mínimo de 8 caracteres, com letras e números.">
        {(id) => <Input id={id} type="password" autoComplete="new-password" autoFocus aria-invalid={!!errors.newPassword} {...register('newPassword')} />}
      </Field>
      <Field label="Confirme a nova senha" error={errors.confirmPassword?.message}>
        {(id) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register('confirmPassword')} />}
      </Field>

      {withPin && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">
            Crie também o seu <strong className="font-medium text-slate-700">PIN</strong>: um código de 4 a 6 números pedido
            para confirmar operações como vendas, entradas e exclusões.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="PIN" error={errors.pin?.message}>
              {(id) => <Input id={id} type="password" inputMode="numeric" maxLength={6} autoComplete="off" aria-invalid={!!errors.pin} {...register('pin')} />}
            </Field>
            <Field label="Confirme o PIN" error={errors.confirmPin?.message}>
              {(id) => <Input id={id} type="password" inputMode="numeric" maxLength={6} autoComplete="off" aria-invalid={!!errors.confirmPin} {...register('confirmPin')} />}
            </Field>
          </div>
        </div>
      )}

      {withEmail && (
        <div className="border-t border-slate-100 pt-4">
          <Field
            label={emailRequired ? 'E-mail para recuperar a senha' : 'E-mail para recuperar a senha (opcional)'}
            error={errors.email?.message}
            hint="Usado somente para enviar um código se você esquecer a senha."
          >
            {(id) => <Input id={id} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.email} {...register('email')} />}
          </Field>
        </div>
      )}

      {withTerms && (
        <div className="border-t border-slate-100 pt-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-700" {...register('acceptTerms')} />
            <span>
              Li e concordo com o{' '}
              <button type="button" onClick={() => setTermsOpen(true)} className="inline text-left font-medium text-brand-700 underline hover:text-brand-800">
                Termo de Uso e a Política de Privacidade
              </button>
              , que explicam como os meus dados são tratados.
            </span>
          </label>
          {errors.acceptTerms && <p className="mt-1.5 text-xs text-red-600">{errors.acceptTerms.message}</p>}
          <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
        </div>
      )}

      <Button type="submit" loading={formState.isSubmitting} className="w-full">
        Salvar e continuar
      </Button>
    </form>
  );
}
