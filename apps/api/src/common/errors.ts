import { HttpException, HttpStatus } from '@nestjs/common';

/** Códigos de erro que o front-end usa para reagir (ex.: abrir o pedido de PIN). */
export enum ErrorCode {
  PIN_REQUIRED = 'PIN_REQUIRED',
  PIN_INVALID = 'PIN_INVALID',
  PIN_NOT_SET = 'PIN_NOT_SET',
  PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  CONFLICT = 'CONFLICT',
  /** A ação exige um supervisor: o caixa abre o diálogo de autorização e repete a requisição. */
  AUTHORIZATION_REQUIRED = 'AUTHORIZATION_REQUIRED',
  /** Não há caixa aberto (ou o turno informado já foi fechado). */
  CASH_CLOSED = 'CASH_CLOSED',
}

export class AppException extends HttpException {
  constructor(status: HttpStatus, message: string, code?: ErrorCode, extra?: Record<string, unknown>) {
    super({ statusCode: status, message, code, ...extra }, status);
  }
}

export const notFound = (what: string) => new AppException(HttpStatus.NOT_FOUND, `${what} não encontrado(a)`);
export const conflict = (message: string) => new AppException(HttpStatus.CONFLICT, message, ErrorCode.CONFLICT);
export const badRequest = (message: string) => new AppException(HttpStatus.BAD_REQUEST, message);
