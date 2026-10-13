import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de senhas e PINs com Argon2id (algoritmo recomendado pela OWASP).
 * Nunca armazenamos senhas em texto puro.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashSecret = (plain: string) => hash(plain, ARGON2_OPTIONS);

export async function verifySecret(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/** Hash fictício usado para igualar o tempo de resposta quando o usuário não existe. */
let dummyHash: Promise<string> | undefined;
export async function simulateVerification(plain: string) {
  dummyHash ??= hashSecret('usuario-inexistente');
  await verifySecret(await dummyHash, plain);
}

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
export const PASSWORD_RULE_MESSAGE = 'A senha deve ter de 8 a 72 caracteres, com letras e números';

export const PIN_RULE = /^\d{4,6}$/;
export const PIN_RULE_MESSAGE = 'O PIN deve ter de 4 a 6 números';
