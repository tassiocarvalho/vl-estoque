import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/Display';
import { useLegal } from './api';
import { TermsContent } from './TermsContent';

/** O termo completo num diálogo, para ler sem sair da tela (ex.: primeiro acesso). */
export function TermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useLegal();
  return (
    <Modal open={open} onClose={onClose} title="Termo de Uso e Política de Privacidade" size="lg">
      <div className="max-h-[65vh] overflow-y-auto pr-2">
        {data ? <TermsContent company={data.company} version={data.termsVersion} /> : <LoadingState />}
      </div>
    </Modal>
  );
}
