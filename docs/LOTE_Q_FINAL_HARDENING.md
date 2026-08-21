# Lote Q — Final Hardening & Release QA

## Objetivo

Fechar o hardening final sem alterar layout, estilos, componentes visuais ou regras financeiras.

## 1. Supabase Least Privilege

A migration `20260821_lote_q_least_privilege.sql` remove de `authenticated` os privilégios de:

- `TRUNCATE`;
- `TRIGGER`;
- `REFERENCES`;

nas tabelas `public.profiles` e `public.app_state`.

Os privilégios DML necessários permanecem disponíveis e o RLS continua ativo.

## 2. Auth QA

A camada `lib/auth.js` centraliza as operações de:

- signup;
- login;
- recuperação de senha;
- leitura de sessão;
- listener de mudanças de autenticação;
- `PASSWORD_RECOVERY`;
- atualização de senha;
- logout.

`tests/unit/auth.test.js` cobre esses fluxos e valida a normalização do e-mail e a senha mínima de 8 caracteres.

## 3. MFA

MFA permanece **opcional** neste release. O aplicativo não exige AAL2 para acesso e não altera a experiência visual com uma etapa adicional de MFA.

Isso não impede o uso de MFA configurado na conta/projeto Supabase por mecanismos externos ao fluxo obrigatório do aplicativo.

## 4. Release hardening

- CI mantém testes, lint, build, lockfile e audit.
- `main` deve ser protegida no GitHub com PR obrigatório e checks de CI obrigatórios.
- A documentação registra Next.js 16.x e o build atual observado em produção.
- A migration de least privilege é versionada no repositório.
- O histórico de migrations é mantido sem reescrever migrations já aplicadas.

## Layout

Nenhuma alteração de layout, estilo ou identidade visual faz parte deste lote.
