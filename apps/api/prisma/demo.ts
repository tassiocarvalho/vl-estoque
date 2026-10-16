/**
 * Dados de DEMONSTRAÇÃO: produtos típicos de mercadinho/panificadora com 30 dias de movimentação.
 * Só roda com o banco sem produtos. Para começar do zero depois, exclua os produtos ou recrie o banco.
 *
 *   npm run db:demo
 */
import 'dotenv/config';
import { MovementType, Prisma, PrismaClient, PurchaseRequestStatus, Role, Unit } from '@prisma/client';
import { calculateIndicators, suggestOrderQuantity } from '../src/modules/products/domain/replenishment';

const prisma = new PrismaClient();
const DAYS = 30;

interface DemoProduct {
  name: string;
  sku: string;
  barcode?: string;
  category: [string, string];
  unit: Unit;
  avg: number;
  max: number;
  lead: number;
  /** Preço de venda (R$). O custo de demonstração é 65% do preço. */
  price: number;
  /** Fator do estoque final em relação ao ponto de pedido (define a situação no painel). */
  target: number;
}

const PRODUCTS: DemoProduct[] = [
  { name: 'Pão Francês', sku: 'PAO-FRANCES', price: 16.9, category: ['Padaria', 'Pães'], unit: 'KG', avg: 18, max: 25, lead: 1, target: 2.2 },
  { name: 'Pão de Forma Tradicional 500g', sku: 'PAO-FORMA-500', price: 8.49, barcode: '7896002301428', category: ['Padaria', 'Pães'], unit: 'UN', avg: 8, max: 12, lead: 2, target: 0.8 },
  { name: 'Bolo de Chocolate (fatia)', sku: 'BOLO-CHOC-FT', price: 6.5, category: ['Padaria', 'Bolos e Doces'], unit: 'UN', avg: 15, max: 22, lead: 1, target: 1.6 },
  { name: 'Coxinha de Frango', sku: 'SALG-COXINHA', price: 5.0, category: ['Padaria', 'Salgados'], unit: 'UN', avg: 30, max: 45, lead: 1, target: 0 },
  { name: 'Farinha de Trigo Especial 5kg', sku: 'FAR-TRIGO-5KG', price: 24.9, barcode: '7896079900016', category: ['Padaria', 'Insumos de Panificação'], unit: 'PCT', avg: 4, max: 6, lead: 5, target: 0.35 },
  { name: 'Fermento Biológico Seco 125g', sku: 'FERM-BIO-125', price: 9.9, barcode: '7891080123456', category: ['Padaria', 'Insumos de Panificação'], unit: 'UN', avg: 2, max: 3, lead: 7, target: 2.5 },
  { name: 'Arroz Branco Tipo 1 5kg', sku: 'ARROZ-T1-5KG', price: 27.9, barcode: '7896006711117', category: ['Mercearia', 'Grãos e Cereais'], unit: 'PCT', avg: 6, max: 10, lead: 4, target: 1.9 },
  { name: 'Feijão Carioca 1kg', sku: 'FEIJAO-CAR-1KG', price: 8.99, barcode: '7896006751014', category: ['Mercearia', 'Grãos e Cereais'], unit: 'PCT', avg: 9, max: 14, lead: 4, target: 0.95 },
  { name: 'Macarrão Espaguete 500g', sku: 'MAC-ESPAG-500', price: 4.79, barcode: '7896022200015', category: ['Mercearia', 'Massas'], unit: 'PCT', avg: 7, max: 11, lead: 5, target: 2.4 },
  { name: 'Açúcar Refinado 1kg', sku: 'ACUCAR-REF-1KG', price: 4.99, barcode: '7896215300102', category: ['Mercearia', 'Açúcar e Café'], unit: 'PCT', avg: 10, max: 15, lead: 4, target: 1.5 },
  { name: 'Café Torrado e Moído 500g', sku: 'CAFE-500', price: 18.9, barcode: '7896005800157', category: ['Mercearia', 'Açúcar e Café'], unit: 'PCT', avg: 6, max: 9, lead: 5, target: 0.3 },
  { name: 'Óleo de Soja 900ml', sku: 'OLEO-SOJA-900', price: 7.49, barcode: '7891107101621', category: ['Mercearia', 'Temperos e Condimentos'], unit: 'UN', avg: 7, max: 10, lead: 4, target: 2 },
  { name: 'Leite Integral UHT 1L', sku: 'LEITE-INT-1L', price: 5.29, barcode: '7896259410133', category: ['Frios e Laticínios', 'Leites'], unit: 'UN', avg: 24, max: 36, lead: 2, target: 1.3 },
  { name: 'Queijo Mussarela Fatiado', sku: 'QJ-MUSSARELA', price: 49.9, category: ['Frios e Laticínios', 'Queijos'], unit: 'KG', avg: 2.5, max: 4, lead: 3, target: 0.7 },
  { name: 'Presunto Cozido Fatiado', sku: 'PRESUNTO-COZ', price: 34.9, category: ['Frios e Laticínios', 'Embutidos'], unit: 'KG', avg: 2, max: 3, lead: 3, target: 1.8 },
  { name: 'Refrigerante Cola 2L', sku: 'REFRI-COLA-2L', price: 10.99, barcode: '7894900011517', category: ['Bebidas', 'Refrigerantes'], unit: 'UN', avg: 12, max: 20, lead: 3, target: 1.7 },
  { name: 'Água Mineral sem Gás 500ml', sku: 'AGUA-500', price: 2.5, barcode: '7896065200014', category: ['Bebidas', 'Águas'], unit: 'UN', avg: 20, max: 35, lead: 3, target: 3 },
  { name: 'Suco de Uva Integral 1L', sku: 'SUCO-UVA-1L', price: 16.9, barcode: '7896051130011', category: ['Bebidas', 'Sucos'], unit: 'UN', avg: 1, max: 2, lead: 6, target: 4 },
  { name: 'Detergente Líquido 500ml', sku: 'DETERG-500', price: 2.79, barcode: '7891022100235', category: ['Limpeza', 'Casa'], unit: 'UN', avg: 5, max: 8, lead: 6, target: 1.4 },
  { name: 'Sabão em Pó 1kg', sku: 'SABAO-PO-1KG', price: 13.9, barcode: '7891150025240', category: ['Limpeza', 'Roupas'], unit: 'CX', avg: 3, max: 5, lead: 6, target: 0 },
  { name: 'Creme Dental 90g', sku: 'CREME-DENT-90', price: 4.49, barcode: '7891528038810', category: ['Higiene Pessoal', 'Higiene Bucal'], unit: 'UN', avg: 3, max: 5, lead: 7, target: 2.1 },
  { name: 'Banana Prata', sku: 'BANANA-PRATA', price: 6.99, category: ['Hortifrúti', 'Frutas'], unit: 'KG', avg: 6, max: 9, lead: 1, target: 1.2 },
];

/** Gerador pseudoaleatório com semente fixa: a demonstração sai sempre igual. */
let seed = 42;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};
const round = (value: number, unit: Unit) =>
  unit === 'KG' ? Math.round(value * 1000) / 1000 : Math.max(Math.round(value), 1);

async function main() {
  if ((await prisma.product.count()) > 0) {
    console.log('O banco já tem produtos — dados de demonstração não foram criados.');
    return;
  }
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN }, orderBy: { createdAt: 'asc' } });
  const categories = await prisma.category.findMany({ include: { parent: true } });
  const findCategory = ([parent, child]: [string, string]) =>
    categories.find((c) => c.name === child && c.parent?.name === parent)?.id ??
    categories.find((c) => c.name === parent && !c.parentId)!.id;

  const start = new Date();
  start.setDate(start.getDate() - DAYS);
  start.setHours(7, 0, 0, 0);

  for (const demo of PRODUCTS) {
    const profile = { avgDailyConsumption: demo.avg, maxDailyConsumption: demo.max, leadTimeDays: demo.lead };
    const indicators = calculateIndicators(profile);
    const movements: Prisma.StockMovementCreateManyInput[] = [];
    let stock = 0;

    const now = Date.now();
    const push = (type: MovementType, quantity: number, when: Date, note?: string) => {
      const at = when.getTime() > now ? new Date(now - 5 * 60_000) : when; // nunca no futuro
      stock = Math.round((stock + (type.startsWith('IN') ? quantity : -quantity)) * 1000) / 1000;
      movements.push({ productId: '', type, quantity, balanceAfter: stock, occurredAt: at, userId: admin?.id, note });
    };

    push(MovementType.IN_ADJUSTMENT, round(indicators.reorderPoint * 2 + demo.avg * 5, demo.unit), new Date(start), 'Estoque inicial');

    for (let day = 1; day <= DAYS; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      // Reposição quando abaixo do ponto de pedido (exceto nos últimos dias, para mostrar alertas).
      if (stock <= indicators.reorderPoint && day < DAYS - demo.lead) {
        push(MovementType.IN_PURCHASE, round(demo.avg * (demo.lead + 8), demo.unit), new Date(date.setHours(8)), 'NF de reposição');
      }
      const sales = Math.min(round(demo.avg * (0.6 + random() * 0.8), demo.unit), stock);
      if (sales > 0) push(MovementType.OUT_SALE, sales, new Date(date.setHours(10 + Math.floor(random() * 9))));
      if (random() < 0.06 && stock > 2) push(MovementType.OUT_LOSS, round(1, demo.unit), new Date(date.setHours(19)), 'Avaria/vencimento');
    }

    // Ajuste final para a situação desejada no painel.
    const wanted = round(indicators.reorderPoint * demo.target, demo.unit) * (demo.target === 0 ? 0 : 1);
    const diff = Math.round((wanted - stock) * 1000) / 1000;
    if (diff !== 0) {
      push(diff > 0 ? MovementType.IN_PURCHASE : MovementType.OUT_SALE, Math.abs(diff), new Date(Date.now() - 60 * 60_000));
    }

    const product = await prisma.product.create({
      data: {
        name: demo.name,
        sku: demo.sku,
        barcode: demo.barcode,
        categoryId: findCategory(demo.category),
        unit: demo.unit,
        ...profile,
        ...indicators,
        currentStock: stock,
        salePrice: demo.price,
        costPrice: Math.round(demo.price * 65) / 100,
      },
    });
    await prisma.stockMovement.createMany({ data: movements.map((m) => ({ ...m, productId: product.id })) });

    if (stock <= indicators.reorderPoint) {
      await prisma.purchaseRequest.create({
        data: {
          productId: product.id,
          status: demo.target === 0 ? PurchaseRequestStatus.ORDERED : PurchaseRequestStatus.PENDING,
          suggestedQuantity: suggestOrderQuantity(stock, profile, 7),
          stockAtRequest: stock,
          reorderPoint: indicators.reorderPoint,
          note: 'Gerada automaticamente: estoque atingiu o ponto de pedido',
        },
      });
    }
  }
  console.log(`✔ ${PRODUCTS.length} produtos de demonstração criados com ${DAYS} dias de movimentação.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
