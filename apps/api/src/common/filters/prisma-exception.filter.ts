import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

const UNIQUE_FIELD_MESSAGES: Record<string, string> = {
  sku: 'Já existe um produto com este SKU (verifique também a lixeira)',
  barcode: 'Já existe um produto com este código de barras (verifique também a lixeira)',
  username: 'Já existe um usuário com esse login',
};

/** Traduz erros conhecidos do banco em respostas amigáveis, sem vazar detalhes internos. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, message] = this.translate(error);
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(error.message, error.stack);
    response.status(status).json({ statusCode: status, message });
  }

  private translate(error: Prisma.PrismaClientKnownRequestError): [number, string] {
    switch (error.code) {
      case 'P2002': {
        const fields = ([] as string[]).concat((error.meta?.target as string[] | string) ?? []);
        const field = fields.find((f) => UNIQUE_FIELD_MESSAGES[f]);
        return [HttpStatus.CONFLICT, field ? UNIQUE_FIELD_MESSAGES[field] : 'Registro duplicado'];
      }
      case 'P2025':
        return [HttpStatus.NOT_FOUND, 'Registro não encontrado'];
      case 'P2003':
        return [HttpStatus.CONFLICT, 'Registro em uso por outros dados'];
      default:
        return [HttpStatus.INTERNAL_SERVER_ERROR, 'Erro interno. Tente novamente.'];
    }
  }
}
