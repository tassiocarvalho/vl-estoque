/**
 * PostgreSQL embutido do app desktop.
 * Os binários vêm do pacote "embedded-postgres"; o servidor é controlado pelo pg_ctl
 * (início e desligamento limpos, sem risco de corromper os dados).
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { dirname, join } from 'node:path';
import pg from 'pg';

const platformPackage = `@embedded-postgres/${platform() === 'win32' ? 'windows' : platform()}-${arch()}`;

export async function createDatabase({ dataDir, port, user, password, database, logFile }) {
  const { pg_ctl: pgCtl } = await import(platformPackage);
  const cluster = new EmbeddedPostgres({ databaseDir: dataDir, user, password, port, persistent: true, onLog: () => {} });

  /** Espera apenas o pg_ctl terminar: o servidor que ele inicia segue rodando em segundo plano. */
  const pgCtlRun = (...args) =>
    new Promise((resolve, reject) => {
      const child = spawn(pgCtl, ['-D', dataDir, ...args], { stdio: 'ignore', windowsHide: true });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`pg_ctl ${args[0]} falhou (código ${code})`)),
      );
    });

  const isRunning = () => pgCtlRun('status').then(() => true, () => false);

  async function createAppDatabase() {
    const client = new pg.Client({ host: '127.0.0.1', port, user, password, database: 'postgres' });
    await client.connect();
    try {
      await client.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
    } finally {
      await client.end();
    }
  }

  async function start() {
    const firstRun = !existsSync(join(dataDir, 'PG_VERSION'));
    if (firstRun) {
      mkdirSync(dirname(dataDir), { recursive: true });
      await cluster.initialise();
    }
    if (!(await isRunning())) {
      // Escuta só em 127.0.0.1: o banco não fica exposto na rede.
      await pgCtlRun('start', '-w', '-t', '60', '-l', logFile, '-o', `-p ${port} -c listen_addresses=127.0.0.1`);
    }
    if (firstRun) await createAppDatabase();
  }

  async function stop() {
    if (await isRunning()) await pgCtlRun('stop', '-m', 'fast', '-w');
  }

  return { start, stop };
}
