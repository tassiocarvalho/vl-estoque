/**
 * Gera o Manual de Uso em PDF a partir de docs/manual/manual.html, usando o Microsoft Edge
 * (ou o Google Chrome) instalado no computador.
 *
 *   npm run manual
 *
 * O PDF vai para apps/web/public/manual-de-uso.pdf: é servido pelo sistema e entra no instalador.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'docs', 'manual', 'manual.html');
const output = join(root, 'apps', 'web', 'public', 'manual-de-uso.pdf');

const browsers = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = browsers.find((path) => existsSync(path));
if (!browser) throw new Error('Instale o Microsoft Edge ou o Google Chrome para gerar o PDF.');

// Perfil temporário: não interfere no navegador que estiver aberto.
const profile = mkdtempSync(join(tmpdir(), 'vl-manual-'));
try {
  execFileSync(browser, [
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--user-data-dir=${profile}`,
    `--print-to-pdf=${output}`,
    pathToFileURL(source).href,
  ], { stdio: 'ignore' });
} finally {
  rmSync(profile, { recursive: true, force: true });
}

console.log(`Manual gerado: ${output} (${Math.round(statSync(output).size / 1024)} KB)`);
