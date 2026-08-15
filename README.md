# Oficlaro

MVP multi-tenant para oficinas mecânicas com foco em transparência: a equipe registra o atendimento e o cliente acompanha status, diagnóstico, mídia e orçamento por um link seguro.

## O que já funciona no código

- cadastro, login, logout, recuperação e verificação de e-mail;
- onboarding atômico da oficina com usuário `OWNER` e custom claims;
- CRUD inicial de clientes e veículos, busca prefixada e arquivamento;
- criação de OS com contador transacional `OS-000001`, índices e auditoria;
- transições de status validadas, timeline pública/interna e atualização em tempo real;
- diagnóstico com separação entre descrição pública e notas internas;
- upload real para Storage com progresso, MIME, tamanho e metadata validados;
- orçamento em centavos, itens, desconto, versionamento e decisão individual;
- link público com 256 bits aleatórios, SHA-256 persistido, expiração e revogação;
- visão pública materializada sem campos internos;
- registro manual real de pagamentos e agregados mensais do dashboard;
- Security Rules RTDB/Storage com negação padrão e isolamento de tenant;
- Functions protegidas por Auth, RBAC e App Check;
- testes unitários, estáticos e testes de Rules para o Emulator Suite.

Não há dados mockados, APIs falsas, `alert()`, armazenamento principal em navegador ou chaves administrativas no front-end.

## Requisitos

- Node.js 22+
- Firebase CLI
- projeto Firebase `oficlaro-a632c`
- plano Blaze para Cloud Functions
- app Web registrado
- Authentication, Realtime Database, Storage, Hosting e App Check

## Instalação

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --dir functions install --frozen-lockfile
```

O projeto inclui lockfiles do pnpm. `npm install` também funciona, mas criará um lockfile diferente.

## Configuração

Siga [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) na ordem. Em Hosting, o app obtém a configuração pública em `/__/firebase/init.json`. Para uso local:

```bash
copy public\js\config\firebase-config.local.example.js public\js\config\firebase-config.local.js
```

Preencha somente os valores públicos do app Web. Nunca adicione service accounts, private keys ou tokens ao repositório.

Depois, registre a chave pública do reCAPTCHA Enterprise em `public/js/config/runtime-config.js`. O debug token do App Check não deve existir em produção.

## Execução local

Defina `useEmulators: true` em `public/js/config/runtime-config.js` e execute:

```bash
npm run serve
```

A interface abre em `http://127.0.0.1:5000` e a Emulator UI em `http://127.0.0.1:4000`.

## Testes

```bash
npm test
npm run test:rules
```

O plano completo está em [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## Deploy seguro

Faça primeiro backup do banco. Depois:

```bash
firebase login
firebase use oficlaro-a632c
firebase deploy --only database,storage
firebase deploy --only functions,hosting
```

Não use o sistema com dados reais enquanto o console mostrar regras temporárias do tipo `now < ...`.

## Estrutura

```text
public/                 HTML, CSS e módulos ES do navegador
  css/                  tokens, componentes, layout e responsividade
  js/                   Firebase, Auth, dados, UI e controladores de página
functions/
  src/domain.js         regras puras de negócio
  src/index.js          operações privilegiadas e projeção pública
tests/                  unitários, estáticos e integração de Rules
docs/                   arquitetura, design system, setup e testes
database.rules.json     autorização e validação do RTDB
storage.rules           regras de mídia
firebase.json           Hosting, Functions, emuladores e headers
.firebaserc             projeto Firebase alvo
```

## RBAC

- `OWNER`: acesso administrativo e financeiro completo.
- `MANAGER`: operação, clientes, veículos, OS e relatórios.
- `MECHANIC`: diagnóstico, mídia e status operacional.
- `ATTENDANT`: clientes, veículos, abertura de OS e compartilhamento.
- `FINANCIAL`: leitura financeira e registro de pagamentos.
- `CUSTOMER`: claim temporária; acesso somente à visão pública de uma OS.

As verificações reais acontecem nas Rules e nas Functions, não apenas na interface.

## Documentação técnica

- [Arquitetura e árvore de dados](docs/ARCHITECTURE.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Configuração Firebase](docs/FIREBASE_SETUP.md)
- [Estratégia de testes](docs/TEST_PLAN.md)
- [Auditoria de acessibilidade](docs/ACCESSIBILITY_AUDIT.md)
- [Revisão de segurança](docs/SECURITY_REVIEW.md)

## Limites conscientes do MVP

Chat, CRM avançado, estoque, assinatura recorrente, WhatsApp, gateways de pagamento, relatórios exportáveis e IA não aparecem como disponíveis. A estrutura de dados permite evoluí-los depois de validar o fluxo central com oficinas reais.
