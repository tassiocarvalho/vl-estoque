import { z } from 'zod';

/** Mesmas regras da API (apps/api/src/common/security/password.ts). */
export const passwordRule = z
  .string()
  .min(8, 'Mínimo de 8 caracteres')
  .max(72, 'Máximo de 72 caracteres')
  .regex(/[A-Za-z]/, 'Inclua pelo menos uma letra')
  .regex(/\d/, 'Inclua pelo menos um número');

export const pinRule = z.string().regex(/^\d{4,6}$/, 'O PIN deve ter de 4 a 6 números');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'A nova senha deve ser diferente da atual',
  });

export type ChangePasswordData = z.infer<typeof changePasswordSchema>;

/** Primeiro acesso: senha nova, PIN (se ainda não houver), e-mail de recuperação e ciência do termo de uso. */
export const firstAccessSchema = (options: { withPin: boolean; withEmail: boolean; emailRequired: boolean; withTerms: boolean }) =>
  z
    .object({
      newPassword: passwordRule,
      confirmPassword: z.string(),
      pin: options.withPin ? pinRule : z.string().optional(),
      confirmPin: z.string().optional(),
      email: options.emailRequired
        ? z.string().trim().min(1, 'Informe o seu e-mail').email('E-mail inválido')
        : z.union([z.literal(''), z.string().trim().email('E-mail inválido')]).optional(),
      acceptTerms: options.withTerms
        ? z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar o termo para continuar' }) })
        : z.boolean().optional(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      path: ['confirmPassword'],
      message: 'As senhas não conferem',
    })
    .refine((data) => !options.withPin || data.pin === data.confirmPin, {
      path: ['confirmPin'],
      message: 'Os PINs não conferem',
    });

export type FirstAccessData = z.infer<ReturnType<typeof firstAccessSchema>>;
