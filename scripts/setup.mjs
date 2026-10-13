/**
 * Configuração inicial do projeto:
 *  1. instala as dependências;
 *  2. cria o arquivo apps/api/.env com segredos aleatórios (nunca usamos senhas padrão);
 *  3. cria o banco de dados e aplica as migrations;
 *  4. cria o usuário administrador inicial.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'apps', 'api', '.env');
const examplePath = join(root, 'apps', 'api', '.env.example');

const run = (command) => execSync(command, { cwd: root, stdio: 'inherit' });
const secret = (bytes) => randomBytes(bytes).toString('base64url');

function createEnvFile() {
  if (existsSync(envPath)) {
    console.log('✔ apps/api/.env já existe — mantendo a configuração atual.');
    return;
  }

  const dbPassword = secret(18);
  const adminPassword = `Adm-${secret(9)}`;
  const content = readFileSync(examplePath, 'utf8')
    .replace('__DB_PASSWORD__', dbPassword)
    .replace('__JWT_SECRET__', secret(48))
    .replace('__PDV_API_KEY__', secret(32))
    .replace('__ADMIN_PASSWORD__', adminPassword);

  writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 });
  console.log('✔ apps/api/.env criado com segredos aleatórios.');
}

console.log('\n▶ Instalando dependências...\n');
run('npm install');

console.log('\n▶ Gerando configuração...\n');
createEnvFile();

console.log('\n▶ Preparando banco de dados...\n');
run('npm run db:deploy -w @vl/api');
run('npm run db:seed -w @vl/api');

console.log('\n✅ Tudo pronto! Rode "npm run dev" e acesse http://localhost:5173\n');
