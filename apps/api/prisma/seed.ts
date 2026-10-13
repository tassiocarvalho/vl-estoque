/**
 * Dados iniciais: usuário administrador e categorias padrão de mercadinho/panificadora.
 * Pode ser executado várias vezes — só cria o que ainda não existe.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedInitialData } from '../src/modules/setup/initial-data';

const prisma = new PrismaClient();

async function main() {
  const password = process.env.ADMIN_INITIAL_PASSWORD ?? '';
  const { adminCreated, categoriesCreated } = await seedInitialData(prisma, password);

  if (adminCreated) {
    console.log('\n┌──────────────────────────────────────────────────────────');
    console.log('│ Usuário administrador criado');
    console.log('│   usuário: admin');
    console.log(`│   senha:   ${password}`);
    console.log('│ (você deverá trocar a senha no primeiro acesso)');
    console.log('└──────────────────────────────────────────────────────────\n');
  } else {
    console.log('✔ Usuários já existem — administrador inicial não foi recriado.');
  }
  if (categoriesCreated) console.log('✔ Categorias padrão criadas.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
