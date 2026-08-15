# Auditoria de acessibilidade

Data: 14 de agosto de 2026  
Referência: WCAG 2.1 AA

## Resultado

Nenhum bloqueio crítico foi encontrado na revisão visual e estrutural da tela de autenticação. O layout foi verificado em desktop, 375 px e 320 px. Em 320 px, a largura renderizada e a largura rolável permaneceram em 320 px, sem rolagem horizontal.

## Evidências verificadas

- documento em `pt-BR`, títulos de página e `meta viewport` em todas as 11 páginas;
- link de salto para o conteúdo, regiões principais e mensagens com `role="alert"` ou `role="status"`;
- labels associados a campos, tipos de entrada apropriados e botões nativos;
- foco visível definido globalmente e fechamento do menu por `Escape`;
- alvos interativos entre 44 px e 48 px na autenticação móvel;
- conteúdo textual inserido com `textContent` quando vem do banco;
- interface responsiva sem ocultar ações essenciais.

## Contraste sobre branco

| Token | Razão |
|---|---:|
| Texto principal | 17,75:1 |
| Texto secundário | 4,97:1 |
| Primário | 5,99:1 |
| Erro | 6,57:1 |
| Sucesso | 5,41:1 |
| Aviso | 5,43:1 |

O vermelho de erro foi escurecido de `#d92d20` para `#b42318` durante a revisão.

## Validação manual ainda necessária

Após o deploy e a configuração real do Firebase, executar o fluxo completo apenas por teclado, zoom de 200% e leitura com NVDA ou VoiceOver. A automação disponível não conseguiu confirmar de forma confiável o avanço do foco por `Tab`, portanto essa parte não é declarada como concluída.
