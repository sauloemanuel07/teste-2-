# Arquitetura do Oficlaro

## Escopo e premissas

O MVP atende uma oficina por usuário autenticado, mas toda entidade já é particionada por `workshopId`. O Realtime Database permanece como banco principal. O sistema prioriza o fluxo comercial validável: conta, oficina, cliente, veículo, OS, timeline, diagnóstico, mídia, orçamento, decisão, pagamento e histórico.

Restrições relevantes:

- o banco atual está em `us-central1`, portanto as Functions usam a mesma região para reduzir latência;
- Functions, links públicos seguros e operações privilegiadas exigem plano Blaze;
- dados internos nunca são enviados ao cliente para depois serem ocultados por CSS;
- o histórico da OS é preservado e entidades operacionais são arquivadas, não apagadas casualmente.

## Componentes

```text
Navegador da oficina
  -> Firebase Auth (e-mail/senha)
  -> RTDB (consultas permitidas pelas Rules)
  -> Storage (upload com claim do workshop)
  -> Callable Functions (operações privilegiadas)

Callable Functions
  -> Admin SDK
  -> RTDB multipath updates, contadores e auditoria
  -> Auth custom claims
  -> materialização de publicOrderViews

Navegador do cliente
  -> troca token longo por sessão Auth limitada
  -> lê somente publicOrderViews/{workshopId}/{orderId}
  -> envia decisão de orçamento pela Function
```

## Fluxo do link público

1. `createShareLink` gera 256 bits aleatórios.
2. Só o SHA-256 é persistido em `shareLinksByHash`; o token puro é retornado uma única vez.
3. `exchangeShareToken` valida hash, expiração e revogação.
4. A Function emite custom token com `role=CUSTOMER`, `workshopId`, `orderId` e `shareId`.
5. As Rules permitem ler somente a visão pública daquela OS enquanto o link está ativo.
6. `revokeShareLink` invalida o link e a Rules interrompe leituras subsequentes.

## Árvore principal

```text
users/{uid}
workshops/{workshopId}
workshopUsers/{workshopId}/{uid}
workshopSettings/{workshopId}
customers/{workshopId}/{customerId}
vehicles/{workshopId}/{vehicleId}
workOrders/{workshopId}/{orderId}
workOrderEvents/{workshopId}/{orderId}/{eventId}
diagnoses/{workshopId}/{orderId}
estimates/{workshopId}/{orderId}/{version}
payments/{workshopId}/{orderId}/{paymentId}
maintenanceReminders/{workshopId}/{reminderId}
analytics/{workshopId}/monthly/{yyyy-mm}
auditLogs/{workshopId}/{auditId}
shareLinks/{workshopId}/{orderId}/{shareId}
shareLinksByHash/{sha256}
publicOrderViews/{workshopId}/{orderId}
counters/{workshopId}/...
```

## Decisões e trade-offs

- HTML/CSS/ES Modules sem framework mantém o MVP simples e compatível com Hosting. O SDK CDN modular evita etapa de build; se a equipe crescer, Vite deve ser introduzido para bundling e tree-shaking.
- Claims são usadas no Storage porque Storage Rules não consultam RTDB. A autorização de dados continua no RTDB e nas Functions; claims devem ser atualizadas em convites/troca de função.
- `publicOrderViews` duplica dados deliberadamente para impedir vazamento de notas internas. A Function é responsável pela consistência dessa projeção.
- Métricas usam incrementos em agregados mensais, evitando baixar a árvore inteira no dashboard.
- Orçamentos são append-only por versão. Decisões ficam separadas do conteúdo original.

## Evolução

Antes de múltiplas oficinas por usuário, adicionar seletor de tenant e emissão de claims na troca de oficina. Em escala maior, migrar busca textual para serviço dedicado, processar mídia assíncrona e mover analytics históricos para pipeline próprio, mantendo RTDB como fonte operacional.

