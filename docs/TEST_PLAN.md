# Estratégia de testes

## Pirâmide

- Unitários: regras de domínio, normalização, dinheiro em centavos e transições.
- Integração: RTDB/Storage Rules no Emulator Suite, isolamento de tenant e validação de schema.
- E2E: fluxo real no Hosting/emuladores em desktop e celular.

## Casos prioritários

| Área | Tipo | Casos |
|---|---|---|
| Auth | E2E | cadastro, login inválido, recuperação, logout, rota privada |
| Multi-tenancy | Integração | A acessa A; A tenta B; não autenticado tenta ler |
| Clientes/veículos | Integração/E2E | criar, buscar, arquivar, impedir veículo órfão |
| OS | Unitário/E2E | contador concorrente, status permitido, status inválido, timeline |
| Diagnóstico/mídia | Integração | MIME/tamanho, tenant incorreto, notas internas ausentes da visão pública |
| Orçamento | Unitário/E2E | centavos, desconto, versão, decisão total/parcial, dupla decisão |
| Link público | Integração/E2E | válido, inválido, expirado, revogado, tentativa de trocar orderId |
| Pagamento | Unitário/E2E | valor positivo, soma, status parcial/pago, idempotência |
| Acessibilidade | Automático/manual | teclado, foco, labels, contraste, zoom 200% |

## Comandos

```bash
npm test
npm run test:rules
firebase emulators:start
```

## Critério de liberação

Todos os testes unitários e de Rules verdes; nenhuma leitura entre tenants; fluxo completo executado no emulador; zero erro de console; revisão em 320 px, 768 px e desktop; App Check em modo monitorado antes da aplicação obrigatória.

## Última execução local

- unitários e estáticos: 11/11 aprovados;
- Realtime Database e Storage Rules no Emulator Suite: 7/7 aprovados;
- sintaxe JavaScript: aprovada em todos os arquivos;
- responsividade visual: aprovada em desktop, 375 px e 320 px;
- E2E autenticado no projeto real: pendente de Blaze, App Check e sessão Firebase com permissão de deploy.
