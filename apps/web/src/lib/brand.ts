import type { StoreBranding, Theme } from './types';

/**
 * Marca padrão (white-label). Tudo aqui pode ser trocado em Configurações → Identidade da loja,
 * sem reprogramar: nome, logotipo, cor principal, tema e textos dos comprovantes.
 */
export const DEFAULT_BRANDING: StoreBranding = {
  name: 'SuaLojaAqui',
  tagline: 'Vendas e estoque',
  document: '',
  address: '',
  phone: '',
  primaryColor: '#0f766e',
  theme: 'system',
  logo: null,
  receiptHeader: '',
  receiptFooter: 'Obrigado pela preferência!',
};

export const DEFAULT_LOGO = '/icon.svg';

const THEME_KEY = 'pdv:theme';

/** Preferência de tema deste aparelho (sobrepõe o padrão da loja). */
export function readDeviceTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : null;
  } catch {
    return null;
  }
}

export function saveDeviceTheme(theme: Theme | null) {
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    /* armazenamento indisponível: vale só nesta sessão */
  }
}

export const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export const resolveTheme = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;

/** Aplica a cor e o tema na página: os tons da marca são derivados da cor principal no CSS. */
export function applyBranding(branding: StoreBranding, theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty('--brand', /^#[0-9a-f]{6}$/i.test(branding.primaryColor) ? branding.primaryColor : DEFAULT_BRANDING.primaryColor);
  const dark = resolveTheme(theme) === 'dark';
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.title = branding.name;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', branding.primaryColor);
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    icon.href = branding.logo ?? DEFAULT_LOGO;
    icon.type = branding.logo ? branding.logo.slice(5, branding.logo.indexOf(';')) : 'image/svg+xml';
  }
}
