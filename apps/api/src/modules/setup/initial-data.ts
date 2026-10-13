import { PrismaClient, Role } from '@prisma/client';
import { hashSecret } from '../../common/security/password';

export const DEFAULT_CATEGORIES: Record<string, string[]> = {
  Padaria: ['Pães', 'Bolos e Doces', 'Salgados', 'Insumos de Panificação'],
  Mercearia: ['Grãos e Cereais', 'Massas', 'Enlatados e Conservas', 'Temperos e Condimentos', 'Açúcar e Café'],
  Bebidas: ['Refrigerantes', 'Sucos', 'Águas', 'Bebidas Alcoólicas'],
  'Frios e Laticínios': ['Leites', 'Queijos', 'Embutidos', 'Iogurtes'],
  Hortifrúti: ['Frutas', 'Verduras e Legumes'],
  Limpeza: ['Roupas', 'Casa'],
  'Higiene Pessoal': ['Banho', 'Higiene Bucal'],
};

/**
 * Dados iniciais: usuário "admin" (senha provisória) e categorias padrão.
 * Idempotente — só cria o que ainda não existe. Usado pelo seed e pelo app desktop.
 */
export async function seedInitialData(prisma: PrismaClient, adminPassword: string) {
  let adminCreated = false;

  if ((await prisma.user.count()) === 0) {
    if (adminPassword.length < 8) throw new Error('A senha inicial do admin precisa ter pelo menos 8 caracteres');
    await prisma.user.create({
      data: {
        name: 'Administrador',
        username: 'admin',
        role: Role.ADMIN,
        passwordHash: await hashSecret(adminPassword),
        mustChangePassword: true,
      },
    });
    adminCreated = true;
  }

  let categoriesCreated = false;
  if ((await prisma.category.count()) === 0) {
    for (const [name, children] of Object.entries(DEFAULT_CATEGORIES)) {
      await prisma.category.create({
        data: { name, children: { create: children.map((child) => ({ name: child })) } },
      });
    }
    categoriesCreated = true;
  }

  return { adminCreated, categoriesCreated };
}
