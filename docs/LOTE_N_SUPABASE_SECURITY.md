# Lote N — Supabase Security Final

## Objetivo

Finalizar a camada de segurança do Supabase com:

- limpeza de políticas RLS duplicadas;
- padronização de `auth.uid()`;
- revisão das permissões da RPC `save_app_state`;
- revisão final dos fluxos de autenticação.

## RLS

A migration `20260821_100000_lote_n_security_final.sql`:

- remove políticas antigas/duplicadas conhecidas;
- recria uma política por operação nas tabelas `profiles` e `app_state`;
- restringe as políticas ao papel `authenticated`;
- utiliza `(select auth.uid())` para permitir caching por statement;
- mantém RLS habilitado.

## RPC

A migration:

- remove execução da RPC `save_app_state` para `anon`;
- concede execução para `authenticated`;
- define `search_path = public`.

## Auth

O fluxo de recuperação de senha foi finalizado no Lote K e a documentação correspondente foi atualizada.

### Leaked Password Protection

O recurso foi considerado na revisão de segurança, mas **não é marcado como ativo** porque a conta/projeto utiliza o plano gratuito no qual esse recurso não está disponível para ativação. Não foi criada nenhuma falsa configuração no frontend ou no banco para simular essa proteção.

## Layout

Nenhuma alteração de layout, estilos ou componentes visuais faz parte deste lote.
