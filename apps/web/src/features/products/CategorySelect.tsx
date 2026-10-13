import { forwardRef, type SelectHTMLAttributes } from 'react';
import { Select } from '@/components/ui/Form';
import { useCategories } from './api';

/** Seletor de categoria agrupado: Categoria › Subcategorias. */
export const CategorySelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }
>(({ placeholder = 'Selecione...', ...props }, ref) => {
  const { data: categories = [] } = useCategories();

  return (
    <Select ref={ref} {...props}>
      <option value="">{placeholder}</option>
      {categories.map((category) => (
        <optgroup key={category.id} label={category.name}>
          <option value={category.id}>{category.name} (geral)</option>
          {category.children.map((child) => (
            <option key={child.id} value={child.id}>
              {child.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
});
CategorySelect.displayName = 'CategorySelect';
