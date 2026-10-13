import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { errorMessage, http } from '@/lib/api';
import type { Profile } from '@/lib/types';
import { useAuth } from './AuthProvider';
import { changePasswordSchema, type ChangePasswordData } from './password-schemas';

export function ChangePasswordForm({ onDone, submitLabel = 'Salvar nova senha' }: { onDone?: () => void; submitLabel?: string }) {
  const { setUser } = useAuth();
  const { register, handleSubmit, formState, reset } = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
  });
  const { errors } = formState;

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      const profile = await http.post<Profile>('/auth/change-password', { currentPassword, newPassword });
      setUser(profile);
      reset();
      toast.success('Senha alterada com sucesso');
      onDone?.();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Senha atual" error={errors.currentPassword?.message}>
        {(id) => <Input id={id} type="password" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...register('currentPassword')} />}
      </Field>
      <Field label="Nova senha" error={errors.newPassword?.message} hint="Mínimo de 8 caracteres, com letras e números.">
        {(id) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...register('newPassword')} />}
      </Field>
      <Field label="Confirme a nova senha" error={errors.confirmPassword?.message}>
        {(id) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register('confirmPassword')} />}
      </Field>
      <Button type="submit" loading={formState.isSubmitting} className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  );
}
