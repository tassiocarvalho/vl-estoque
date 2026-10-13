/**
 * V&L Estoque — aplicativo desktop (Electron).
 *
 * Ao abrir: liga o PostgreSQL embutido → aplica as migrations → sobe a API (que também
 * entrega as telas) → mostra o sistema numa janela própria, sem barra de endereço.
 * Ao fechar a janela, desliga tudo de forma limpa.
 */
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './database.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** Instalado: api/ e web/ ficam ao lado da pasta do app. Em desenvolvimento: apps/api e apps/web. */
const root = existsSync(join(here, '..', 'api')) ? join(here, '..') : join(here, '..', '..');
const API_ENTRY = join(root, 'api', 'dist', 'main.js');
const PRISMA_SCHEMA = join(root, 'api', 'prisma', 'schema.prisma');
const PRISMA_CLI = join(dirname(require.resolve('prisma/package.json')), 'build', 'index.js');

// Portas próprias do app desktop (não conflitam com o ambiente de desenvolvimento).
const API_PORT = 3030;
const DB_PORT = 5434;
const APP_URL = `http://localhost:${API_PORT}`;

const dataRoot = join(process.env.LOCALAPPDATA ?? app.getPath('userData'), 'VLEstoque');
const configPath = join(dataRoot, 'config.json');
const logsDir = join(dataRoot, 'logs');
mkdirSync(logsDir, { recursive: true });
const log = createWriteStream(join(logsDir, 'app.log'), { flags: 'a' });
const writeLog = (message) => log.write(`[${new Date().toISOString()}] ${message}\n`);

let splash = null;
let mainWindow = null;
let apiProcess = null;
let database = null;
let cleanedUp = false;

// ─── Configuração (segredos gerados na primeira execução) ─────────────────────

const secret = (bytes) => randomBytes(bytes).toString('base64url');

function loadConfig() {
  if (existsSync(configPath)) return JSON.parse(readFileSync(configPath, 'utf8'));
  const config = {
    dbPassword: secret(18),
    jwtSecret: secret(48),
    pdvApiKey: secret(32),
    adminPassword: `Adm-${secret(6)}`,
    adminPasswordShown: false,
  };
  saveConfig(config);
  return config;
}

function saveConfig(config) {
  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
}

// ─── Processos auxiliares (rodam com o Node embutido no Electron) ────────────

function runNode(script, args, env) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: dataRoot,
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => log.write(chunk));
  child.stderr.on('data', (chunk) => log.write(chunk));
  return child;
}

const runToEnd = (script, args, env) =>
  new Promise((resolve, reject) => {
    const child = runNode(script, args, env);
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${args[0]} terminou com código ${code}`))));
  });

async function waitForApi(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (apiProcess?.exitCode != null) throw new Error('A API encerrou durante a inicialização');
    try {
      await fetch(`${APP_URL}/api/settings`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('A API não respondeu a tempo');
}

// ─── Inicialização ───────────────────────────────────────────────────────────

function setStatus(text) {
  writeLog(text);
  splash?.webContents
    .executeJavaScript(`document.getElementById('status').textContent = ${JSON.stringify(text)}`)
    .catch(() => {});
}

async function startServices(config) {
  const databaseUrl = `postgresql://vl_estoque:${encodeURIComponent(config.dbPassword)}@127.0.0.1:${DB_PORT}/vl_estoque?schema=public`;

  setStatus('Iniciando o banco de dados...');
  database = await createDatabase({
    dataDir: join(dataRoot, 'pgdata'),
    port: DB_PORT,
    user: 'vl_estoque',
    password: config.dbPassword,
    database: 'vl_estoque',
    logFile: join(logsDir, 'postgres.log'),
  });
  await database.start();

  setStatus('Atualizando o banco de dados...');
  await runToEnd(PRISMA_CLI, ['migrate', 'deploy', '--schema', PRISMA_SCHEMA], {
    DATABASE_URL: databaseUrl,
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
    CHECKPOINT_DISABLE: '1',
  });

  setStatus('Iniciando o sistema...');
  apiProcess = runNode(API_ENTRY, [], {
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: config.jwtSecret,
    PDV_API_KEY: config.pdvApiKey,
    INITIAL_ADMIN_PASSWORD: config.adminPassword,
    PORT: String(API_PORT),
    HOST: '0.0.0.0', // permite acesso de outros aparelhos da rede (celular do estoque)
    WEB_ORIGIN: APP_URL,
    COOKIE_SECURE: 'false',
  });
  await waitForApi();
}

function createSplash() {
  splash = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: '#134337',
    icon: join(here, 'icon.png'),
  });
  splash.loadFile(join(here, 'splash.html'));
  splash.once('ready-to-show', () => splash?.show());
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 380,
    show: false,
    title: 'V&L Estoque',
    backgroundColor: '#f6f7f9',
    icon: join(here, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  // Links externos abrem no navegador; a janela do app só navega dentro do próprio sistema.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(APP_URL)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL)) event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    splash?.destroy();
    splash = null;
  });
  mainWindow.on('closed', () => (mainWindow = null));
  return mainWindow.loadURL(APP_URL);
}

async function showFirstRunInfo(config) {
  if (config.adminPasswordShown) return;
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Bem-vindo ao V&L Estoque',
    message: 'Sistema instalado com sucesso!',
    detail:
      `Acesse com:\n\n   Usuário: admin\n   Senha provisória: ${config.adminPassword}\n\n` +
      'Anote esta senha — no primeiro acesso o sistema pedirá para você criar uma senha pessoal.\n\n' +
      `Ela também fica guardada em:\n${configPath}`,
    buttons: ['Entendi'],
  });
  saveConfig({ ...config, adminPasswordShown: true });
}

async function boot() {
  Menu.setApplicationMenu(null);
  createSplash();
  try {
    const config = loadConfig();
    await startServices(config);
    await createMainWindow();
    await showFirstRunInfo(config);
  } catch (error) {
    writeLog(`ERRO: ${error?.stack ?? error}`);
    splash?.destroy();
    dialog.showErrorBox(
      'Não foi possível iniciar o V&L Estoque',
      `${error?.message ?? error}\n\nDetalhes no arquivo de log:\n${join(logsDir, 'app.log')}`,
    );
    app.quit();
  }
}

// ─── Encerramento ────────────────────────────────────────────────────────────

async function cleanup() {
  writeLog('Encerrando...');
  if (apiProcess && apiProcess.exitCode == null) apiProcess.kill();
  try {
    await database?.stop();
  } catch (error) {
    writeLog(`Falha ao desligar o banco: ${error}`);
  }
  writeLog('Encerrado.');
}

// Uma única instância: abrir o atalho de novo só traz a janela para frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(boot);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (cleanedUp) return;
    event.preventDefault();
    cleanup().finally(() => {
      cleanedUp = true;
      app.quit();
    });
  });
}
