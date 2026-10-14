/**
 * Backup do banco para uma pasta sincronizada com a nuvem (Google Drive para computador).
 *
 * Cada backup é um JSON compactado com todas as tabelas: um arquivo por dia (sobrescrito ao longo
 * do dia), mantendo os últimos 30 dias. A restauração insere os dados no esquema atual, então um
 * backup de uma versão anterior do sistema também pode ser restaurado numa versão mais nova.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import pg from 'pg';

export const BACKUP_FOLDER_NAME = 'VL Estoque - Backups';
const FILE_PATTERN = /^vl-estoque-(\d{4}-\d{2}-\d{2})\.json\.gz$/;
const KEEP_DAYS = 30;
const FORMAT_VERSION = 1;

/** Procura a pasta do Google Drive para computador ("G:\Meu Drive", ou espelhada na pasta do usuário). */
export function findGoogleDrive() {
  const candidates = [];
  for (const letter of 'GHIJKLMNOPQRSTUVWXYZDEF') {
    candidates.push(`${letter}:\\Meu Drive`, `${letter}:\\My Drive`);
  }
  candidates.push(join(homedir(), 'Meu Drive'), join(homedir(), 'My Drive'), join(homedir(), 'Google Drive'));
  return candidates.find((path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Backups da pasta, do mais recente para o mais antigo. */
export function listBackups(dir) {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => FILE_PATTERN.test(name))
    .map((name) => {
      const path = join(dir, name);
      return { path, name, modifiedAt: statSync(path).mtime };
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

// Datas e horários lidos como o texto exato do banco: convertê-los para Date do JavaScript
// aplicaria o fuso local e deslocaria os horários na restauração.
const RAW_TYPES = new Set([pg.types.builtins.DATE, pg.types.builtins.TIMESTAMP, pg.types.builtins.TIMESTAMPTZ]);
const types = { getTypeParser: (oid, format) => (RAW_TYPES.has(oid) ? (value) => value : pg.types.getTypeParser(oid, format)) };

export function createBackupService({ connection, log }) {
  const withClient = async (fn) => {
    const client = new pg.Client({ ...connection, types });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  };

  /** Tabelas do sistema (sem a tabela interna de migrations do Prisma) e suas colunas. */
  async function describeTables(client) {
    const { rows } = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name, ordinal_position`);
    const tables = new Map();
    for (const row of rows) {
      if (!tables.has(row.table_name)) tables.set(row.table_name, []);
      tables.get(row.table_name).push({ name: row.column_name, json: /^jsonb?$/.test(row.data_type) });
    }
    return tables;
  }

  async function backup(dir) {
    const startedAt = Date.now();
    const data = await withClient(async (client) => {
      const tables = await describeTables(client);
      const result = {};
      // Leitura num único instantâneo consistente do banco.
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        for (const table of tables.keys()) {
          result[table] = (await client.query(`SELECT * FROM ${pg.escapeIdentifier(table)}`)).rows;
        }
      } finally {
        await client.query('COMMIT');
      }
      return result;
    });

    mkdirSync(dir, { recursive: true });
    const day = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
    const target = join(dir, `vl-estoque-${day}.json.gz`);
    const payload = { format: FORMAT_VERSION, app: 'vl-estoque', createdAt: new Date().toISOString(), tables: data };
    // Grava num temporário e renomeia: o Drive nunca sincroniza um arquivo pela metade.
    writeFileSync(`${target}.tmp`, gzipSync(JSON.stringify(payload)));
    renameSync(`${target}.tmp`, target);

    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const old of listBackups(dir)) {
      if (old.modifiedAt.getTime() < cutoff) unlinkSync(old.path);
    }
    const rows = Object.values(data).reduce((sum, list) => sum + list.length, 0);
    log(`Backup salvo em ${target} (${rows} registros, ${Date.now() - startedAt} ms)`);
    return target;
  }

  /** Substitui todos os dados pelos do backup. Roda numa transação: se algo falhar, nada muda. */
  async function restore(file) {
    const payload = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
    if (payload.app !== 'vl-estoque' || !payload.tables) throw new Error('Arquivo não é um backup do V&L Estoque');

    await withClient(async (client) => {
      const tables = await describeTables(client);
      await client.query('BEGIN');
      try {
        // Desliga as checagens de chave estrangeira durante a carga (a ordem das tabelas não importa).
        await client.query("SET LOCAL session_replication_role = 'replica'");
        await client.query(`TRUNCATE ${[...tables.keys()].map((t) => pg.escapeIdentifier(t)).join(', ')} CASCADE`);
        for (const [table, rows] of Object.entries(payload.tables)) {
          const columns = tables.get(table);
          if (!columns) continue; // tabela que não existe mais nesta versão
          for (const row of rows) {
            // Só as colunas que existem hoje; colunas novas ficam com o valor padrão.
            const present = columns.filter((c) => c.name in row);
            const values = present.map((c) => (c.json && row[c.name] !== null ? JSON.stringify(row[c.name]) : row[c.name]));
            await client.query(
              `INSERT INTO ${pg.escapeIdentifier(table)} (${present.map((c) => pg.escapeIdentifier(c.name)).join(', ')})
               VALUES (${present.map((_, i) => `$${i + 1}`).join(', ')})`,
              values,
            );
          }
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    log(`Backup restaurado: ${file} (criado em ${payload.createdAt})`);
    return payload.createdAt;
  }

  return { backup, restore };
}
