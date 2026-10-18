import { KeyRound, Lock, MoreHorizontal, Pencil, Plus, Power, RectangleEllipsis, UserX } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/Display';
import { Field, Input } from '@/components/ui/Form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/labels';
import type { UserAccount } from '@/lib/types';
import { useAuth } from '../auth/AuthProvider';
import { passwordRule, pinRule } from '../auth/password-schemas';
import { useAnonymizeUser, useResetCredential, useSaveUser, useUsers } from './api';
import { UserFormModal } from './UserFormModal';

const ROLE_TONE = { ADMIN: 'violet', MANAGER: 'amber', STOCKIST: 'blue', CASHIER: 'neutral' } as const;

function RowMenu({ items }: { items: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        aria-label="Ações"
        aria-expanded={open}
      >
        <MoreHorizontal className="size-5" />
      </button>
      {open && (
        <ul className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <li key={item.label}>
              <button
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 ${item.danger ? 'text-red-600' : 'text-slate-700'}`}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResetCredentialModal({
  target,
  onClose,
}: {
  target: { user: UserAccount; kind: 'password' | 'pin' } | null;
  onClose: () => void;
}) {
  const reset = useResetCredential();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const isPassword = target?.kind === 'password';

  useEffect(() => {
    setValue('');
    setError(undefined);
  }, [target]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!target) return;
    const check = (isPassword ? passwordRule : pinRule).safeParse(value);
    if (!check.success) return setError(check.error.issues[0].message);
    try {
      await reset.mutateAsync({ id: target.user.id, kind: target.kind, value });
      toast.success(isPassword ? 'Senha provisória definida. O usuário deverá trocá-la no próximo acesso.' : 'PIN redefinido');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      size="sm"
      title={isPassword ? 'Redefinir senha' : 'Redefinir PIN'}
      description={target?.user.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="reset-form" loading={reset.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="reset-form" onSubmit={submit}>
        <Field
          label={isPassword ? 'Nova senha provisória' : 'Novo PIN'}
          error={error}
          hint={isPassword ? 'O usuário será desconectado e deverá criar uma nova senha.' : '4 a 6 números'}
        >
          {(id) => (
            <Input
              id={id}
              autoComplete="off"
              inputMode={isPassword ? 'text' : 'numeric'}
              maxLength={isPassword ? 72 : 6}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={Boolean(error)}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const { data, isLoading, isError, refetch } = useUsers();
  const save = useSaveUser();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [resetTarget, setResetTarget] = useState<{ user: UserAccount; kind: 'password' | 'pin' } | null>(null);
  const [anonymizeTarget, setAnonymizeTarget] = useState<UserAccount | null>(null);
  const anonymize = useAnonymizeUser();

  const confirmAnonymize = async () => {
    if (!anonymizeTarget) return;
    try {
      await anonymize.mutateAsync(anonymizeTarget.id);
      toast.success('Dados pessoais anonimizados');
      setAnonymizeTarget(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const openForm = (user: UserAccount | null) => {
    setEditing(user);
    setFormOpen(true);
  };

  const toggleActive = async (user: UserAccount) => {
    try {
      await save.mutateAsync({ id: user.id, data: { active: !user.active } });
      toast.success(user.active ? `${user.name} foi desativado e desconectado` : `${user.name} foi reativado`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Cada funcionário tem seu próprio login — tudo o que ele faz fica registrado."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
            Novo usuário
          </Button>
        }
      />

      <Card className="overflow-visible">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="Não foi possível carregar os usuários" onRetry={refetch} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="Nenhum usuário" />
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Perfil</th>
                <th className="hidden md:table-cell">Situação</th>
                <th className="hidden lg:table-cell">Último acesso</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {data.map((user) => (
                <tr key={user.id} className={user.active ? undefined : '[&>td:not(:last-child)]:opacity-60'}>
                  <td>
                    <p className="font-medium text-slate-900">
                      {user.name} {user.id === me?.id && <span className="text-xs font-normal text-slate-400">(você)</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      @{user.username}
                      {user.email && <span className="hidden sm:inline"> · {user.email}</span>}
                    </p>
                  </td>
                  <td>
                    <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                  </td>
                  <td className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {user.anonymized ? (
                        <Badge>Anonimizado</Badge>
                      ) : user.active ? (
                        <Badge tone="green" dot>Ativo</Badge>
                      ) : (
                        <Badge dot>Inativo</Badge>
                      )}
                      {user.role === 'ADMIN' && !user.email && !user.anonymized && <Badge tone="amber">Sem e-mail</Badge>}
                      {user.locked && (
                        <Badge tone="red">
                          <Lock className="size-3" /> Bloqueado
                        </Badge>
                      )}
                      {user.mustChangePassword && user.active && <Badge tone="amber">Senha provisória</Badge>}
                      {!user.hasPin && !user.anonymized && <Badge>Sem PIN</Badge>}
                    </div>
                  </td>
                  <td className="hidden text-slate-600 lg:table-cell">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca'}</td>
                  <td className="text-right">
                    {!user.anonymized && <RowMenu
                      items={[
                        { label: 'Editar', icon: <Pencil className="size-4" />, onClick: () => openForm(user) },
                        { label: 'Redefinir senha', icon: <KeyRound className="size-4" />, onClick: () => setResetTarget({ user, kind: 'password' }) },
                        { label: 'Redefinir PIN', icon: <RectangleEllipsis className="size-4" />, onClick: () => setResetTarget({ user, kind: 'pin' }) },
                        ...(user.id !== me?.id
                          ? [{ label: user.active ? 'Desativar' : 'Reativar', icon: <Power className="size-4" />, onClick: () => toggleActive(user), danger: user.active }]
                          : []),
                        ...(!user.active
                          ? [{ label: 'Anonimizar dados (LGPD)', icon: <UserX className="size-4" />, onClick: () => setAnonymizeTarget(user), danger: true }]
                          : []),
                      ]}
                    />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* key: recria o formulário ao trocar entre "novo" e "editar" (regras de validação diferentes) */}
      <UserFormModal key={editing?.id ?? 'new'} open={formOpen} user={editing} onClose={() => setFormOpen(false)} />
      <ResetCredentialModal target={resetTarget} onClose={() => setResetTarget(null)} />
      <ConfirmDialog
        open={Boolean(anonymizeTarget)}
        onClose={() => setAnonymizeTarget(null)}
        onConfirm={confirmAnonymize}
        loading={anonymize.isPending}
        title="Anonimizar dados pessoais?"
        description={`Nome, login, e-mail, senha, PIN e endereços IP de ${anonymizeTarget?.name ?? ''} serão apagados de forma definitiva. As movimentações continuam no histórico, sem identificar a pessoa. Não é possível desfazer.`}
        confirmLabel="Anonimizar"
      />
    </>
  );
}
