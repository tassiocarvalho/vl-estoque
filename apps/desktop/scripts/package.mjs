/**
 * Gera o instalador do Windows (VL-Estoque-Setup-<versão>.exe).
 *
 *   npm run dist -w @vl/desktop
 *   node scripts/package.mjs --skip-prepare   (reaproveita a pasta "stage" já montada)
 *
 * 1. compila a API e as telas;
 * 2. monta uma pasta "stage" só com o necessário para rodar (sem código-fonte nem ferramentas de desenvolvimento);
 * 3. instala as dependências de produção nessa pasta;
 * 4. empacota com o electron-builder (instalador NSIS).
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arch, build, Platform } from 'electron-builder';

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(desktopDir, '..', '..');
const apiDir = join(repoRoot, 'apps', 'api');
const webDir = join(repoRoot, 'apps', 'web');
const stageDir = join(desktopDir, '.stage');
const releaseDir = join(desktopDir, 'release');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const run = (command, cwd = repoRoot) => execSync(command, { cwd, stdio: 'inherit' });
const step = (message) => console.log(`\n▶ ${message}\n`);

const desktopPkg = readJson(join(desktopDir, 'package.json'));
const apiPkg = readJson(join(apiDir, 'package.json'));
const rootPkg = readJson(join(repoRoot, 'package.json'));

if (!process.argv.includes('--skip-prepare')) {
  step('Compilando API e telas');
  run('npm run build');

  step('Montando a pasta do aplicativo');
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  cpSync(join(desktopDir, 'src'), join(stageDir, 'desktop'), { recursive: true });
  cpSync(join(apiDir, 'dist'), join(stageDir, 'api', 'dist'), { recursive: true });
  cpSync(join(apiDir, 'prisma', 'schema.prisma'), join(stageDir, 'api', 'prisma', 'schema.prisma'));
  cpSync(join(apiDir, 'prisma', 'migrations'), join(stageDir, 'api', 'prisma', 'migrations'), { recursive: true });
  cpSync(join(webDir, 'dist'), join(stageDir, 'web', 'dist'), { recursive: true });

  // Dependências de produção: as da API + banco embutido + CLI do Prisma (aplica as migrations).
  const pick = (name) => apiPkg.dependencies[name] ?? apiPkg.devDependencies[name];
  writeFileSync(
    join(stageDir, 'package.json'),
    JSON.stringify(
      {
        name: 'vl-estoque',
        productName: 'VL Estoque',
        version: desktopPkg.version,
        description: desktopPkg.description,
        author: desktopPkg.author,
        main: 'desktop/main.mjs',
        dependencies: {
          ...apiPkg.dependencies,
          'embedded-postgres': pick('embedded-postgres'),
          pg: pick('pg'),
          prisma: pick('prisma'),
        },
        overrides: rootPkg.overrides,
        allowScripts: rootPkg.allowScripts,
      },
      null,
      2,
    ),
  );

  step('Instalando dependências de produção');
  run('npm install --omit=dev --no-fund --no-audit --no-package-lock', stageDir);
  run('npx prisma generate --schema api/prisma/schema.prisma', stageDir);
}

step('Gerando o instalador');
await build({
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  config: {
    appId: 'br.com.vl.estoque',
    productName: 'VL Estoque',
    copyright: `© ${new Date().getFullYear()} V&L Mercadinho e Panificadora`,
    electronVersion: desktopPkg.devDependencies.electron,
    directories: { app: stageDir, output: releaseDir, buildResources: join(desktopDir, 'build') },
    asar: false, // binários do PostgreSQL e do Prisma precisam ficar acessíveis no disco
    npmRebuild: false, // módulos nativos usam N-API (compatíveis com o Node do Electron)
    files: ['**/*'],
    // O electron-builder ignora pastas ocultas em node_modules; o cliente gerado do Prisma vive em .prisma/.
    afterPack: async ({ appOutDir }) => {
      cpSync(join(stageDir, 'node_modules', '.prisma'), join(appOutDir, 'resources', 'app', 'node_modules', '.prisma'), {
        recursive: true,
      });
    },
    win: { icon: join(desktopDir, 'build', 'icon.ico') },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'VL Estoque',
      uninstallDisplayName: 'VL Estoque',
      artifactName: 'VL-Estoque-Setup-${version}.${ext}',
      installerLanguages: ['pt_BR'],
      language: '1046',
      deleteAppDataOnUninstall: false, // os dados do estoque ficam preservados ao desinstalar
    },
  },
});

console.log(`\n✅ Instalador gerado em ${releaseDir}\n`);
