# Lote O — PWA + CI/QA Final

## Objetivo

Consolidar o PWA sem alterar o layout e garantir que o pipeline valide lint, testes e build.

## PWA

O Service Worker:

- mantém o HTML raiz (`/`) como shell offline;
- cacheia os assets públicos necessários;
- cacheia os assets imutáveis de `/_next/static/`;
- não cacheia `/api/` nem chamadas externas/Supabase;
- utiliza cache versionado;
- remove somente caches antigos pertencentes ao próprio aplicativo;
- utiliza rede primeiro para navegação, com fallback para o shell cacheado;
- utiliza cache-first para assets de build, permitindo reabrir o PWA após fechar o app e perder a conexão.

Os dados financeiros continuam sob responsabilidade do cache por usuário em `localStorage` + fila de sincronização existente em `lib/storage.js`. O Service Worker não armazena dados financeiros.

## CI

O workflow `.github/workflows/tests.yml` executa:

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run build`
5. `npm ci --ignore-scripts --dry-run`

O job de auditoria de dependências permanece separado.

## QA automatizado

Foram adicionados:

- `tests/unit/storage-offline.test.js`: valida o comportamento de persistência offline, fechamento/reabertura e sincronização posterior;
- `tests/unit/pwa.test.js`: valida a política de cache, versionamento, shell offline e manifesto.

## Validação

O pipeline de CI deve permanecer verde em lint, testes, build e auditoria.

## Sem alteração de layout

Nenhuma alteração de layout, estilos, componentes visuais ou textos da interface foi feita pelo Lote O.
