/**
 * V&L Estoque — aplicativo desktop (Electron).
 *
 * Ao abrir: liga o PostgreSQL embutido → aplica as migrations → sobe a API (que também
 * entrega as telas) → mostra o sistema numa janela própria, sem barra de endereço.
 * Faz backup no Google Drive ao abrir, a cada 4 horas e ao fechar; numa instalação nova,
 * oferece restaurar o backup mais recente. Ao fechar a janela, desliga tudo de forma limpa.
 */
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKUP_FOLDER_NAME, createBackupService, findGoogleDrive, listBackups } from './backup.mjs';
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
const localBackupDir = join(dataRoot, 'backups');
const BACKUP_INTERVAL_MS = 4 * 60 * 60 * 1000;
mkdirSync(logsDir, { recursive: true });
const log = createWriteStream(join(logsDir, 'app.log'), { flags: 'a' });
const writeLog = (message) => log.write(`[${new Date().toISOString()}] ${message}\n`);

let splash = null;
let mainWindow = null;
let apiProcess = null;
let database = null;
let backups = null;
let backupTimer = null;
let backupRunning = null;
let restoredFrom = null;
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

  const isNewDatabase = !existsSync(join(dataRoot, 'pgdata', 'PG_VERSION'));

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

  backups = createBackupService({
    connection: { host: '127.0.0.1', port: DB_PORT, user: 'vl_estoque', password: config.dbPassword, database: 'vl_estoque' },
    log: writeLog,
  });
  if (isNewDatabase) await offerRestore(config);

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

// ─── Backup no Google Drive ──────────────────────────────────────────────────

const formatDate = (date) => date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function cloudBackupDir(config) {
  if (config.backupDir) return config.backupDir;
  const drive = findGoogleDrive();
  return drive ? join(drive, BACKUP_FOLDER_NAME) : null;
}

/** Instalação nova (computador novo ou reinstalação): oferece trazer os dados do último backup. */
async function offerRestore(config) {
  const [latest] = [...listBackups(cloudBackupDir(config)), ...listBackups(localBackupDir)].sort(
    (a, b) => b.modifiedAt - a.modifiedAt,
  );
  if (!latest) return;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'V&L Estoque',
    message: 'Encontramos um backup dos seus dados',
    detail: `Backup de ${formatDate(latest.modifiedAt)}\n${latest.path}\n\nDeseja restaurar os produtos, movimentações e usuários?`,
    buttons: ['Restaurar dados', 'Começar do zero'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  setStatus('Restaurando o backup...');
  await backups.restore(latest.path);
  restoredFrom = latest.modifiedAt;
  // Os usuários vieram do backup: a senha provisória gerada nesta instalação não vale.
  config.adminPasswordShown = true;
  saveConfig(config);
}

/** Na primeira vez, encontra a pasta do Google Drive (ou pede uma pasta sincronizada). */
async function setupBackupFolder(config) {
  if (config.backupDir) return;
  const drive = findGoogleDrive();
  if (drive) {
    config.backupDir = join(drive, BACKUP_FOLDER_NAME);
    saveConfig(config);
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'V&L Estoque',
      message: 'Backup automático no Google Drive ativado',
      detail: `Os dados serão copiados ao abrir, a cada 4 horas e ao fechar o sistema, para:\n${config.backupDir}`,
      buttons: ['OK'],
    });
    return;
  }
  if (config.backupPromptDismissed) return;
  const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'V&L Estoque',
    message: 'Backup na nuvem ainda não configurado',
    detail:
      'Para não perder os dados se o computador der defeito, instale o “Google Drive para computador” ' +
      '(google.com/drive/download) e entre com a sua conta Google. O V&L Estoque encontra a pasta sozinho ' +
      'na próxima vez que abrir.\n\nSe preferir, escolha agora uma pasta que seja sincronizada com a nuvem.\n\n' +
      'Enquanto isso, os backups ficam só neste computador.',
    buttons: ['Escolher pasta...', 'Agora não'],
    defaultId: 1,
    cancelId: 1,
    checkboxLabel: 'Não perguntar novamente',
  });
  if (checkboxChecked) config.backupPromptDismissed = true;
  if (response === 0) {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Pasta sincronizada com a nuvem',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!canceled && filePaths[0]) config.backupDir = join(filePaths[0], BACKUP_FOLDER_NAME);
  }
  saveConfig(config);
}

/** Faz o backup na pasta da nuvem; se ela não estiver disponível (Drive fechado), neste computador. */
function runBackup(config) {
  if (!backups) return Promise.resolve();
  backupRunning ??= (async () => {
    const cloudDir = config.backupDir && existsSync(dirname(config.backupDir)) ? config.backupDir : null;
    if (config.backupDir && !cloudDir) writeLog(`Pasta da nuvem indisponível (${config.backupDir}); backup local`);
    try {
      await backups.backup(cloudDir ?? localBackupDir);
    } catch (error) {
      writeLog(`Falha no backup: ${error?.stack ?? error}`);
    }
  })().finally(() => (backupRunning = null));
  return backupRunning;
}

async function boot() {
  Menu.setApplicationMenu(null);
  createSplash();
  try {
    const config = loadConfig();
    await startServices(config);
    shutdownBackup = () => runBackup(config);
    await createMainWindow();
    await showFirstRunInfo(config);
    if (restoredFrom) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'V&L Estoque',
        message: 'Dados restaurados com sucesso!',
        detail: `Backup de ${formatDate(restoredFrom)}.\nEntre com os usuários e senhas de sempre.`,
        buttons: ['OK'],
      });
    }
    await setupBackupFolder(config);
    void runBackup(config);
    backupTimer = setInterval(() => void runBackup(config), BACKUP_INTERVAL_MS);
    app.on('before-quit', () => clearInterval(backupTimer));
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

let shutdownBackup = null;

async function cleanup() {
  writeLog('Encerrando...');
  await shutdownBackup?.(); // último backup antes de desligar o banco
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
