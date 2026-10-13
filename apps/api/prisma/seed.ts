/**
 * Dados iniciais: usuário administrador e categorias padrão de mercadinho/panificadora.
 * Pode ser executado várias vezes — só cria o que ainda não existe.
 */
import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashSecret } from '../src/common/security/password';

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES: Record<string, string[]> = {
  Padaria: ['Pães', 'Bolos e Doces', 'Salgados', 'Insumos de Panificação'],
  Mercearia: ['Grãos e Cereais', 'Massas', 'Enlatados e Conservas', 'Temperos e Condimentos', 'Açúcar e Café'],
  Bebidas: ['Refrigerantes', 'Sucos', 'Águas', 'Bebidas Alcoólicas'],
  'Frios e Laticínios': ['Leites', 'Queijos', 'Embutidos', 'Iogurtes'],
  Hortifrúti: ['Frutas', 'Verduras e Legumes'],
  Limpeza: ['Roupas', 'Casa'],
  'Higiene Pessoal': ['Banho', 'Higiene Bucal'],
};

async function seedAdmin() {
  if ((await prisma.user.count()) > 0) {
    console.log('✔ Usuários já existem — administrador inicial não foi recriado.');
    return;
  }
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Defina ADMIN_INITIAL_PASSWORD (mín. 8 caracteres) no arquivo .env');
  }

  await prisma.user.create({
    data: {
      name: 'Administrador',
      username: 'admin',
      role: Role.ADMIN,
      passwordHash: await hashSecret(password),
      mustChangePassword: true,
    },
  });
  console.log('\n┌──────────────────────────────────────────────────────────');
  console.log('│ Usuário administrador criado');
  console.log('│   usuário: admin');
  console.log(`│   senha:   ${password}`);
  console.log('│ (você deverá trocar a senha no primeiro acesso)');
  console.log('└──────────────────────────────────────────────────────────\n');
}

async function seedCategories() {
  if ((await prisma.category.count()) > 0) return;

  for (const [name, children] of Object.entries(DEFAULT_CATEGORIES)) {
    await prisma.category.create({
      data: { name, children: { create: children.map((child) => ({ name: child })) } },
    });
  }
  console.log('✔ Categorias padrão criadas.');
}

async function main() {
  await seedAdmin();
  await seedCategories();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
