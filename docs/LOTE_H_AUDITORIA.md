# Lote H — PWA + Segurança + Auditoria Final

## Objetivo

Finalizar a camada de instalação/offline (PWA), reforçar headers de segurança e registrar o checklist final sem alterar o layout da aplicação.

## Alterações

- `next.config.js`
  - desativa o header `X-Powered-By`;
  - adiciona `X-Content-Type-Options: nosniff`;
  - adiciona `X-Frame-Options: DENY`;
  - adiciona `Referrer-Policy: strict-origin-when-cross-origin`;
  - adiciona `Permissions-Policy` restritiva;
  - mantém `sw.js` sem cache HTTP.
- `public/sw.js`
  - incrementa a versão do cache para invalidar o worker anterior;
  - não intercepta métodos diferentes de GET;
  - não intercepta `/api/`;
  - só armazena respostas HTTP bem-sucedidas;
  - mantém fallback offline para a navegação;
  - remove caches de versões anteriores na ativação.
- `components/AuthGate.jsx`
  - usa a logo quadrada existente na área que antes exibia as iniciais;
  - mantém as mesmas dimensões externas, sem alteração de layout.

## Segurança

As chaves `NEXT_PUBLIC_SUPABASE_*` são públicas por definição e não substituem uma `service_role`. A proteção real dos dados permanece no Supabase/RLS.

Não foi adicionada CSP neste lote porque o aplicativo usa estilos inline e a aplicação de uma CSP estrita exigiria uma revisão específica de todos os scripts/estilos; não é seguro introduzi-la automaticamente sem alterar comportamento.

## Checklist de auditoria

- [x] PWA manifest presente
- [x] ícones 192x192 e 512x512 presentes
- [x] Service Worker registrado
- [x] cache offline versionado
- [x] cache não intercepta `/api/`
- [x] headers básicos de segurança
- [x] `X-Powered-By` desativado
- [x] autenticação via Supabase
- [x] dados vinculados à sessão
- [x] RLS mantido como camada de autorização
- [x] `package-lock.json` versionado
- [x] layout preservado

## Validação recomendada antes do deploy

```bash
npm install
npm test
npm run build
```

Depois do deploy, validar no Safari/iPhone:

1. login;
2. carregamento do dashboard;
3. criação/edição de lançamento;
4. funcionamento offline;
5. retorno da conexão e sincronização;
6. logout/login;
7. instalação em Tela de Início.
