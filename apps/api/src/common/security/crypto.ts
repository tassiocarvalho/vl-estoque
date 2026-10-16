import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../../config/env';

/**
 * Criptografia de segredos guardados no banco (ex.: senha do e-mail de envio), com AES-256-GCM.
 * A chave é derivada do JWT_SECRET: sem o arquivo de configuração do servidor, o valor não é legível.
 */
const key = Buffer.from(hkdfSync('sha256', env.JWT_SECRET, 'vl-estoque', 'settings-encryption', 32));

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** Devolve undefined se o valor não puder ser lido (ex.: backup restaurado em outra instalação). */
export function decryptSecret(encoded: string | undefined): string | undefined {
  const [version, iv, tag, data] = encoded?.split(':') ?? [];
  if (version !== 'v1' || !iv || !tag || !data) return undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}
