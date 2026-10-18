-- Formas de pagamento de fábrica do pós-venda (separadas da migração anterior: o PostgreSQL só aceita
-- usar um valor novo de enum depois que a transação que o criou termina).

-- Cheque e Outros vão para o fim da lista (os atalhos F1–F9 ficam com as formas mais usadas).
UPDATE "payment_methods" SET "position" = "position" + 2 WHERE "code" IN ('CHECK', 'OTHER');

INSERT INTO "payment_methods" ("id", "code", "name", "kind", "active", "allowsChange", "requiresCustomer", "position", "updatedAt")
SELECT gen_random_uuid(), 'STORE_CREDIT', 'Vale-troca / crédito', 'STORE_CREDIT', true, false, false, 7, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "payment_methods" WHERE "code" = 'STORE_CREDIT');

INSERT INTO "payment_methods" ("id", "code", "name", "kind", "active", "allowsChange", "requiresCustomer", "position", "updatedAt")
SELECT gen_random_uuid(), 'ON_ACCOUNT', 'Fiado / crediário', 'ON_ACCOUNT', true, false, true, 8, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "payment_methods" WHERE "code" = 'ON_ACCOUNT');
