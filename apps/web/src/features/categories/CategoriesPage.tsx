import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CornerDownRight, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui/Display';
import { Field, Input } from '@/components/ui/Form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { errorMessage, http } from '@/lib/api';
import { useCategories } from '../products/api';

type Editor =
  | { mode: 'create'; parentId?: string; parentName?: string }
  | { mode: 'rename'; id: string; name: string };

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useCategories();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  const save = useMutation({
    mutationFn: (editorState: Editor) =>
      editorState.mode === 'create'
        ? http.post('/categories', { name, parentId: editorState.parentId })
        : http.patch(`/categories/${editorState.id}`, { name }),
    onSuccess: () => {
      void refresh();
      toast.success('Categoria salva');
      setEditor(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => http.delete(`/categories/${id}`),
    onSuccess: () => {
      void refresh();
      toast.success('Categoria removida');
      setRemoving(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const open = (state: Editor) => {
    setName(state.mode === 'rename' ? state.name : '');
    setEditor(state);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editor && name.trim().length >= 2) save.mutate(editor);
  };

  const title =
    editor?.mode === 'rename' ? 'Renomear' : editor?.parentId ? `Nova subcategoria em "${editor.parentName}"` : 'Nova categoria';

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Organize o catálogo em categorias e subcategorias — elas aparecem nos filtros e relatórios."
        actions={
          <Button icon={<FolderPlus className="size-4" />} onClick={() => open({ mode: 'create' })}>
            Nova categoria
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Não foi possível carregar as categorias" onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState title="Nenhuma categoria" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((category) => (
            <Card key={category.id} className="flex flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{category.name}</p>
                  <p className="text-xs text-slate-500">
                    {category.children.length} subcategoria(s) · {category._count.products} produto(s) direto(s)
                  </p>
                </div>
                <div className="flex">
                  <IconButton label="Renomear" onClick={() => open({ mode: 'rename', id: category.id, name: category.name })}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label="Remover" className="hover:text-red-600" onClick={() => setRemoving(category)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>
              <ul className="flex-1 divide-y divide-slate-50 py-1">
                {category.children.map((child) => (
                  <li key={child.id} className="group flex items-center justify-between gap-2 px-4 py-1.5 text-sm">
                    <span className="flex items-center gap-2 text-slate-700">
                      <CornerDownRight className="size-3.5 text-slate-300" />
                      {child.name}
                      <span className="text-xs text-slate-400">({child._count.products})</span>
                    </span>
                    <span className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton label="Renomear" className="size-7" onClick={() => open({ mode: 'rename', id: child.id, name: child.name })}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton label="Remover" className="size-7 hover:text-red-600" onClick={() => setRemoving(child)}>
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => open({ mode: 'create', parentId: category.id, parentName: category.name })}
                className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50/50"
              >
                <Plus className="size-4" /> Adicionar subcategoria
              </button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={title}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditor(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="category-form" loading={save.isPending} disabled={name.trim().length < 2}>
              Salvar
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={submit}>
          <Field label="Nome">{(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remover categoria?"
        confirmLabel="Remover"
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        description={`"${removing?.name}" será removida. Só é possível remover categorias sem produtos e sem subcategorias.`}
      />
    </>
  );
}
