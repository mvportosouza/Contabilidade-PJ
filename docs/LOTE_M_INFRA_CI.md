# Lote M — Infraestrutura / CI

## Objetivo

Atualizar e estabilizar a infraestrutura de CI, dependências e execução dos workflows sem alterar o layout da aplicação.

## Estado documentado

- GitHub Actions utiliza `actions/checkout@v5`.
- GitHub Actions utiliza `actions/setup-node@v5`.
- Os workflows utilizam Node.js 24.
- O CI executa lint, testes, build e verificação do lockfile.
- O workflow de reparo de dependências executa testes, build e `npm audit --audit-level=high` antes de sincronizar o lockfile.
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
npm audit --audit-level=high
```

## Princípio de segurança

O CI deve falhar diante de vulnerabilidades de severidade alta ou superior. Não se deve mascarar falhas de auditoria apenas para obter um workflow verde.

## Layout

Nenhuma alteração visual ou estrutural de interface faz parte deste lote.
