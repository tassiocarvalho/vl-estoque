import { STATUS_LABELS } from '@/lib/labels';
import type { StockStatus } from '@/lib/types';
import { Badge } from './ui/Display';

const TONE = { OUT_OF_STOCK: 'red', CRITICAL: 'orange', REORDER: 'amber', OK: 'green' } as const;

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <Badge tone={TONE[status]} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
