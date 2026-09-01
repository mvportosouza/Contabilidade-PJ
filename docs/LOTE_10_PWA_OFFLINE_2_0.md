# LOTE 10 — PWA / OFFLINE 2.0

## Objetivo

Formalizar a resiliência offline sem alterar a interface visual.

## Implementação

### Service Worker

A versão do cache foi avançada para `contabilidade-pj-v13`.

No `activate`, caches antigos do aplicativo são eliminados antes de o novo worker assumir o controle.

Fluxo:

`deploy novo → novo SW → activate → caches antigos eliminados → clients.claim()`

O Service Worker:

- não cacheia `/api/`;
- não cacheia respostas do Supabase;
- mantém o app shell para reabertura offline;
- usa network-first para navegação;
- usa cache-first para assets `_next/static`;
- trata falhas de quota/armazenamento como não fatais;
- permite `CLEAR_CACHES` e `SKIP_WAITING` para recuperação operacional;
- usa `skipWaiting` + `clients.claim` para atualização coordenada entre abas.

## Estado local

O armazenamento da aplicação já possui versionamento de envelope (`STORAGE_VERSION`) e migração de chaves legadas.

Regra de segurança:

`estado local pendente → fila de sincronização → servidor`

O estado local pendente não deve ser substituído silenciosamente por uma cópia remota.

## Certificação operacional

A certificação final deve ser feita no ambiente publicado, porque cache, Service Worker, quota e comportamento de múltiplas abas dependem do navegador real.

### Teste 1 — atualização do SW

1. Abrir a produção online.
2. Confirmar que `/sw.js` está registrado.
3. Publicar um novo build.
4. Fechar/reabrir a aplicação.
5. Confirmar que o novo Service Worker assume o controle.
6. Confirmar que o cache `contabilidade-pj-v12` (ou anterior) foi removido e somente o cache da versão atual permanece.

### Teste 2 — cache corrompido

1. Abrir DevTools → Application → Cache Storage.
2. Corromper/remover uma entrada do cache.
3. Colocar o navegador offline.
4. Reabrir a aplicação.
5. Confirmar que o app shell continua abrindo quando disponível.
6. Voltar online e confirmar recuperação automática.

### Teste 3 — armazenamento cheio

O código de escrita do cache captura falhas de quota/storage e trata cache como camada de resiliência.

Critério: falha de cache não pode impedir salvar/usar a aplicação.

### Teste 4 — offline prolongado

1. Abrir a aplicação online e confirmar dados locais.
2. Ficar offline por período prolongado.
3. Reabrir o PWA.
4. Editar dados.
5. Confirmar que as alterações permanecem no dispositivo.
6. Voltar online.
7. Confirmar sincronização da fila.

### Teste 5 — múltiplas abas

1. Abrir duas abas do PWA.
2. Colocar o dispositivo offline.
3. Confirmar que ambas continuam operacionais.
4. Publicar nova versão.
5. Reabrir/ativar a nova versão.
6. Confirmar que as abas passam a usar o novo Service Worker sem manter cache antigo.

### Resultado esperado

O offline é considerado certificado somente depois dos testes reais acima passarem no navegador/dispositivo alvo.

## Não implementado deliberadamente

Não foi feita migração de `localStorage` para IndexedDB/Web Crypto neste lote.

Motivo: o armazenamento atual já possui versionamento, migração e fila de sincronização; uma migração adicional teria custo e risco sem benefício proporcional demonstrado para este aplicativo.
