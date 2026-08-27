# FASE 4 — QA E2E real

Objetivo: validar a aplicação em produção sem alterar layout ou comportamento visual.

Cenários cobertos pela suíte:
- Login
- Reset de senha (acessibilidade do fluxo)
- Offline
- Retorno online/sincronização
- Geração de PDF
- Proteção dos fluxos destrutivos de exclusão

## Execução

O workflow é manual (`workflow_dispatch`) para evitar operações destrutivas acidentais.

Secrets necessários:
- `E2E_EMAIL`
- `E2E_PASSWORD`

Nunca coloque credenciais no repositório.

## Exclusão de conta

A exclusão definitiva de conta deve ser validada manualmente com uma conta de QA descartável antes de automatizar qualquer chamada destrutiva.
