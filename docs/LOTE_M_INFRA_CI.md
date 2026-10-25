# Lote M — Infraestrutura / CI

## Objetivo

Atualizar e estabilizar a infraestrutura de CI, dependências e execução dos workflows sem alterar o layout da aplicação.

## Estado documentado

- GitHub Actions utiliza `actions/checkout@v5`.
- GitHub Actions utiliza `actions/setup-node@v6.5.0`.
- Os workflows utilizam Node.js 24.
- O CI executa lint, testes, build e verificação do lockfile.
- O workflow manual de reparo executa `npm install` no runner temporário, exibe diferenças de `package.json`/`package-lock.json` e executa testes, build e auditoria via `.github/scripts/audit-dependencies.cjs`. Ele não grava alterações no repositório; qualquer alteração precisa ser revisada e aplicada manualmente.
- Dependências foram atualizadas para compatibilidade com a versão atual do projeto.
- Pull requests antigos do Dependabot foram tratados durante a estabilização da infraestrutura.

## CI principal

O workflow `.github/workflows/tests.yml` executa:

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run build`
5. `npm ci --ignore-scripts --dry-run`

O job separado de auditoria executa:

```bash
node .github/scripts/audit-dependencies.cjs
```

## Princípio de segurança

O CI deve falhar diante de vulnerabilidades de severidade alta ou superior. Não se deve mascarar falhas de auditoria apenas para obter um workflow verde.

## Layout

Nenhuma alteração visual ou estrutural de interface faz parte deste lote.
