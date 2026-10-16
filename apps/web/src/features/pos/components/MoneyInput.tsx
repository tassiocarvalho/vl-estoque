import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Campo de valor em reais: aceita "12,50", "1.234,56" ou "12.5". */
export const MoneyInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  ({ className, onChange, ...props }, ref) => (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-slate-400">R$</span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          e.target.value = e.target.value.replace(/[^\d.,]/g, '');
          onChange?.(e);
        }}
        className={cn(
          'h-12 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-10 text-right text-xl font-semibold text-slate-900 tabular-nums shadow-sm transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 focus:outline-none aria-[invalid=true]:border-red-400',
          className,
        )}
        {...props}
      />
    </div>
  ),
);
MoneyInput.displayName = 'MoneyInput';
