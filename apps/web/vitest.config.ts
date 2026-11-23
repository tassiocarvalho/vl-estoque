import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Configuração própria dos testes: não carrega os plugins do app (PWA, Tailwind).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
