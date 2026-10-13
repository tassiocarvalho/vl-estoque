import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/labels';
import type { Role, UserAccount } from '@/lib/types';
import { passwordRule, pinRule } from '../auth/password-schemas';
import { useSaveUser } from './api';

const ROLES: Role[] = ['CASHIER', 'STOCKIST', 'ADMIN'];

const baseSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(80),
  role: z.enum(['ADMIN', 'STOCKIST', 'CASHIER']),
});
const createSchema = baseSchema.extend({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, '3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _'),
  password: passwordRule,
  pin: z.union([z.literal(''), pinRule]),
});

type FormData = z.infer<typeof createSchema>;

export function UserFormModal({ open, user, onClose }: { open: boolean; user: UserAccount | null; onClose: () => void }) {
  const editing = Boolean(user);
  const save = useSaveUser();
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormData>({
    resolver: zodResolver(editing ? (baseSchema as unknown as typeof createSchema) : createSchema),
  });
  const { errors } = formState;
  const role = watch('role');

  useEffect(() => {
    if (open) {
      reset(
        user
          ? { name: user.name, role: user.role, username: user.username, password: '', pin: '' }
          : { name: '', role: 'CASHIER', username: '', password: '', pin: '' },
      );
    }
  }, [open, user, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (user) {
        await save.mutateAsync({ id: user.id, data: { name: values.name, role: values.role } });
        toast.success('Usuário atualizado');
      } else {
        await save.mutateAsync({ data: { ...values, pin: values.pin || undefined } });
        toast.success('Usuário criado', { description: `Passe a senha provisória para ${values.name}. Ela deverá ser trocada no primeiro acesso.` });
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar usuário' : 'Novo usuário'}
      description={editing ? `Login: ${user?.username}` : 'Crie o acesso de um funcionário (caixa, estoquista ou administrador).'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" loading={formState.isSubmitting}>
            {editing ? 'Salvar' : 'Criar usuário'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nome completo" error={errors.name?.message}>
          {(id) => <Input id={id} autoFocus aria-invalid={!!errors.name} {...register('name')} />}
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Perfil de acesso</p>
          <div className="grid gap-2" role="radiogroup">
            {ROLES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={role === option}
                onClick={() => setValue('role', option, { shouldDirty: true })}
                className={cn(
                  'rounded-lg border px-4 py-3 text-left transition',
                  role === option ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <span className="block text-sm font-semibold text-slate-900">{ROLE_LABELS[option]}</span>
                <span className="block text-xs text-slate-500">{ROLE_DESCRIPTIONS[option]}</span>
              </button>
            ))}
          </div>
        </div>

        {!editing && (
          <>
            <Field label="Login (usuário)" error={errors.username?.message} hint="Ex.: maria.silva">
              {(id) => <Input id={id} autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.username} {...register('username')} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Senha provisória" error={errors.password?.message} hint="8+ caracteres, letras e números">
                {(id) => <Input id={id} type="text" autoComplete="off" aria-invalid={!!errors.password} {...register('password')} />}
              </Field>
              <Field label="PIN (opcional)" error={errors.pin?.message} hint="4 a 6 números">
                {(id) => <Input id={id} inputMode="numeric" maxLength={6} autoComplete="off" aria-invalid={!!errors.pin} {...register('pin')} />}
              </Field>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
