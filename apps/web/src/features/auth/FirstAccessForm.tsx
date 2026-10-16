import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { errorMessage, http } from '@/lib/api';
import type { Profile } from '@/lib/types';
import { useAuth } from './AuthProvider';
import { firstAccessSchema, type FirstAccessData } from './password-schemas';

/** Primeiro acesso: cria a senha pessoal (e o PIN, se ainda não houver) sem pedir a senha provisória. */
export function FirstAccessForm({ onDone }: { onDone?: () => void }) {
  const { user, setUser } = useAuth();
  const withPin = !user?.hasPin;
  const schema = useMemo(() => firstAccessSchema(withPin), [withPin]);
  const { register, handleSubmit, formState } = useForm<FirstAccessData>({ resolver: zodResolver(schema) });
  const { errors } = formState;

  const onSubmit = handleSubmit(async ({ newPassword, pin }) => {
    try {
      const profile = await http.post<Profile>('/auth/change-password', { newPassword, ...(withPin && { pin }) });
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

      <Button type="submit" loading={formState.isSubmitting} className="w-full">
        Salvar e continuar
      </Button>
    </form>
  );
}
