# FASE 5 — Refatoração, performance, CSP e documentação

## Objetivos

- Reduzir a concentração de código em `components/App.jsx` sem alterar o layout.
- Separar componentes visuais e abas em módulos independentes.
- Otimizar a imagem quadrada mantendo o mesmo caminho público.
- Adicionar Content Security Policy compatível com a aplicação.
- Atualizar referências de versões na documentação.

## Refatoração

`components/App.jsx` foi reduzido de aproximadamente 104 KB para aproximadamente 64 KB.

Foram extraídos:

```text
components/
├── App.jsx
├── AppUI.jsx
├── appShared.js
├── Dashboard/
│   ├── HomeTab.jsx
│   ├── FinanceTab.jsx
│   ├── StatisticsTab.jsx
│   └── AnnualTab.jsx
├── Reports/
│   └── ReportButton.jsx
└── Transactions/
    └── TransactionCard.jsx
```

A extração preserva a estrutura JSX e os estilos inline existentes; não foi feita alteração deliberada de layout.

## Imagem

`public/assets/logo-square.png` manteve o mesmo caminho e dimensões, mas foi otimizada por quantização para reduzir o peso do download.

## CSP

`next.config.js` agora envia `Content-Security-Policy` com:

- `default-src 'self'`
- scripts/styles necessários ao aplicativo
- conexão explícita ao Supabase do projeto
- suporte ao Service Worker
- bloqueio de objetos/plugins
- `frame-ancestors 'none'`
- `form-action 'self'`

A política foi mantida compatível com os estilos inline existentes para não alterar a interface.

## Documentação

As versões documentadas foram alinhadas com o projeto atual:

- Next.js 16.3.3
- Recharts 3.10.1
- Supabase JS 2.112.4
- ESLint 9.39.4
- Vitest 3.2.7

## Validação

Após o upload, executar o CI completo antes do deploy. Em seguida, validar a produção na Vercel e o funcionamento visual das telas principais.
