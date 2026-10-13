/**
 * PostgreSQL embutido para uso local — dispensa instalar o PostgreSQL no Windows.
 * Os binários vêm do pacote npm "embedded-postgres"; o servidor é controlado pelo pg_ctl
 * (início e desligamento limpos, sem risco de corromper os dados).
 *
 *   node scripts/database.mjs serve          → garante o banco no ar e acompanha (Ctrl+C desliga)
 *   node scripts/database.mjs run <comando>  → garante o banco no ar, executa o comando e desliga
 *   node scripts/database.mjs stop           → desliga o banco
 *
 * Usa os dados de conexão do DATABASE_URL (arquivo .env).
 */
import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { arch, homedir, platform } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const [mode = 'serve', ...command] = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error('[banco] DATABASE_URL não definido. Rode "npm run setup" na raiz do projeto.');
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const database = url.pathname.replace(/^\//, '');
const dataDir = process.env.DB_DATA_DIR || join(process.env.LOCALAPPDATA ?? homedir(), 'vl-estoque', 'pgdata');
const logFile = join(dataDir, '..', 'postgres.log');

const platformPackage = `@embedded-postgres/${platform() === 'win32' ? 'windows' : platform()}-${arch()}`;
const { pg_ctl: pgCtl } = await import(platformPackage);

const cluster = new EmbeddedPostgres({ databaseDir: dataDir, user, password, port, persistent: true, onLog: () => {} });

/**
 * Executa o pg_ctl e espera apenas ele terminar (evento "exit"): o servidor que ele inicia
 * continua rodando em segundo plano e não pode prender o processo do Node.
 */
const pgCtlRun = (...args) =>
  new Promise((resolve, reject) => {
    const child = spawn(pgCtl, ['-D', dataDir, ...args], { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pg_ctl ${args[0]} falhou (código ${code})`))));
  });

async function isRunning() {
  try {
    await pgCtlRun('status');
    return true;
  } catch {
    return false;
  }
}

async function start() {
  const firstRun = !existsSync(join(dataDir, 'PG_VERSION'));
  if (firstRun) {
    console.log(`[banco] criando banco de dados em ${dataDir}`);
    mkdirSync(join(dataDir, '..'), { recursive: true });
    await cluster.initialise();
  }

  if (await isRunning()) {
    console.log(`[banco] PostgreSQL já está rodando na porta ${port}`);
    return false;
  }

  // Escuta apenas em 127.0.0.1: o banco não fica exposto na rede.
  await pgCtlRun('start', '-w', '-t', '60', '-l', logFile, '-o', `-p ${port} -c listen_addresses=127.0.0.1`);
  if (firstRun) await createDatabase();
  console.log(`[banco] PostgreSQL rodando em 127.0.0.1:${port}`);
  return true;
}

/** Cria o banco da aplicação (conexão explícita em 127.0.0.1, onde o servidor escuta). */
async function createDatabase() {
  const client = new pg.Client({ host: '127.0.0.1', port, user, password, database: 'postgres' });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
  } finally {
    await client.end();
  }
}

async function stop() {
  if (!(await isRunning())) return;
  await pgCtlRun('stop', '-m', 'fast', '-w');
  console.log('[banco] PostgreSQL desligado');
}

const runCommand = (args) =>
  new Promise((resolve) => {
    const child = spawn(args.join(' '), { stdio: 'inherit', shell: true });
    child.on('exit', (code) => resolve(code ?? 1));
  });

async function main() {
  if (mode === 'stop') return stop();

  let startedHere = false;
  try {
    startedHere = await start();
  } catch (error) {
    await stop().catch(() => undefined); // não deixa um servidor pela metade rodando
    throw error;
  }

  if (mode === 'run') {
    const code = await runCommand(command);
    if (startedHere) await stop();
    process.exit(code);
  }

  // serve: fica acompanhando; Ctrl+C desliga o banco de forma limpa.
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await stop().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGBREAK', shutdown);
  setInterval(() => {}, 1 << 30);
}

main().catch((error) => {
  console.error('[banco] falha:', error?.message ?? error);
  console.error(`[banco] veja o log em ${logFile}`);
  process.exit(1);
});
