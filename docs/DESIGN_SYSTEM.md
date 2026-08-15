# Design system

## Direção

SaaS primeiro, automotivo apenas no contexto. A marca usa azul profundo para confiança, superfícies claras e estados semânticos consistentes. Tokens ficam em `public/css/variables.css`.

## Componentes

| Componente | Variantes | Estados | Acessibilidade |
|---|---|---|---|
| Botão | primary, secondary, danger | hover, active, disabled, loading | elemento `button`, foco visível, alvo 44 px |
| Campo | input, select, textarea | focus, invalid, disabled | `label` explícito e mensagem textual |
| Badge | info, success, warning, danger, violet | somente leitura | texto nunca depende apenas de cor |
| Card | header, body, footer | padrão | hierarquia semântica interna |
| Tabela | responsiva com overflow | hover | cabeçalhos `th`, dados textuais |
| Toast | info, success, error | entrada/saída | região `aria-live` e `role=alert` em erro |
| Modal | confirmação e destrutivo | open/close | `dialog`, Escape nativo, foco gerenciado pelo navegador |
| Empty state | com/sem CTA | padrão | mensagem e ação descritivas |

## Regras de uso

- Não criar cores, espaçamentos ou sombras fora dos tokens sem justificar.
- A ação principal por contexto usa `btn-primary`; ações destrutivas nunca usam azul.
- Conteúdo do usuário entra via `textContent`, nunca em template HTML.
- Respeitar `prefers-reduced-motion`.

