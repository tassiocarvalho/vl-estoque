import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { seedInitialData } from './initial-data';

/**
 * Quando INITIAL_ADMIN_PASSWORD estiver definido (app desktop), cria os dados iniciais
 * na primeira inicialização — dispensa rodar o seed manualmente.
 */
@Injectable()
class InitialDataService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InitialDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!password) return;

    const { adminCreated, categoriesCreated } = await seedInitialData(this.prisma, password);
    if (adminCreated) this.logger.log('Usuário "admin" criado com a senha inicial');
    if (categoriesCreated) this.logger.log('Categorias padrão criadas');
  }
}

@Module({ providers: [InitialDataService] })
export class SetupModule {}
