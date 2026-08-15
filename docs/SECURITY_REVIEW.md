# Revisão de segurança

Data: 14 de agosto de 2026

## Controles implementados

- negação padrão na raiz do Realtime Database e fallback final de negação no Storage;
- isolamento por `workshopId`, membership ativa e RBAC em Rules e Cloud Functions;
- operações privilegiadas exclusivamente no Admin SDK, com App Check obrigatório;
- onboarding protegido por lease e autocorreção de custom claims em reexecução;
- numeração de OS transacional, idempotência de comandos e lease para alterações concorrentes;
- valores monetários inteiros em centavos;
- token público de 256 bits, persistência apenas do SHA-256, expiração, revogação e claims limitadas a uma OS;
- sessão pública em instância Firebase separada e com persistência apenas em memória;
- projeção pública materializada sem UIDs, notas internas ou campos administrativos;
- Storage restrito por tenant, papel, ordem, MIME, tamanho e metadata;
- mídia exibida por Blob autenticado, sem URL permanente com download token;
- CSP, bloqueio de framing, `nosniff`, política de referência e de permissões;
- ausência de service account, private key, segredo administrativo, mocks e armazenamento principal no navegador.

## Testes executados

- 11 testes unitários/estáticos aprovados;
- 7 testes de Rules aprovados no Emulator Suite: leitura própria, isolamento de tenant, acesso anônimo, criação e schema de cliente, vínculo de veículo, claim pública por OS e Storage/MIME/tenant;
- todos os módulos JavaScript passaram por `node --check`;
- lockfile com 647 entradas aprovado pela verificação de políticas da cadeia de suprimentos do pnpm.

## Auditoria de dependências

Não há alerta alto ou crítico. O front-end/CLI possui dois alertas moderados transitivos (`uuid` e `@opentelemetry/core`), ambos vindos do `firebase-tools`, que é dependência apenas de desenvolvimento. As Functions possuem um alerta moderado transitivo em `uuid@9.0.1`, trazido pelo SDK oficial `firebase-admin` por meio de `gaxios`. O código do Oficlaro não usa as rotinas v3/v5/v6 ou o argumento de buffer relacionado ao alerta. Foi mantida a árvore suportada pelo SDK oficial, em vez de forçar uma atualização major incompatível; revisar quando o Firebase atualizar essa dependência.

## Condições obrigatórias antes de dados reais

1. substituir as regras temporárias exibidas no console por `database.rules.json` e `storage.rules`;
2. ativar Blaze, Authentication e Storage;
3. registrar o app Web e configurar a site key do reCAPTCHA Enterprise em `runtime-config.js`;
4. executar o E2E com duas oficinas distintas no projeto real;
5. ativar alertas de cobrança e acompanhar métricas do App Check;
6. revisar logs e permissões após o primeiro deploy.

Enquanto essas condições não forem cumpridas, o ambiente Firebase atual não deve receber dados reais.
