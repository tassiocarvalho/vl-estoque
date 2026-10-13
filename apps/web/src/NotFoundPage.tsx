import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Página não encontrada</h1>
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
        Voltar ao início
      </Link>
    </div>
  );
}
