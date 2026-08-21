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
  - cache versionado;
  - não intercepta métodos diferentes de GET;
  - não intercepta `/api/`;
  - só armazena respostas HTTP bem-sucedidas;
  - mantém fallback offline para a navegação;
  - remove caches antigos pertencentes ao próprio aplicativo.
- `components/AuthGate.jsx`
  - utiliza a logo quadrada existente na área que antes exibia as iniciais;
  - mantém as mesmas dimensões externas.

## Segurança

As chaves `NEXT_PUBLIC_SUPABASE_*` são públicas por definição e não substituem uma `service_role`. A proteção real dos dados permanece no Supabase/RLS.

Não foi adicionada CSP neste lote porque o aplicativo utiliza estilos inline e uma CSP estrita exigiria revisão específica de scripts e estilos.

## Checklist

- [x] Manifest PWA presente
- [x] Ícones 192x192 e 512x512 presentes
- [x] Service Worker registrado
- [x] Cache offline versionado
- [x] Cache não intercepta `/api/`
- [x] Headers básicos de segurança
- [x] `X-Powered-By` desativado
- [x] Autenticação via Supabase
- [x] Dados vinculados à sessão
- [x] RLS como camada de autorização
- [x] `package-lock.json` versionado
- [x] Layout preservado

## Nota de manutenção

As versões atuais do projeto são documentadas no `README.md`. A infraestrutura de CI foi posteriormente atualizada para Node.js 24 e Actions atuais; consultar `docs/LOTE_M_INFRA_CI.md`.

## Validação

```bash
npm run lint
npm test
npm run build
```
