# Lote S — Sugestões de UI e correções

## Alterações

1. Pró-labore: abril/2026 a julho/2026 usam como referência os valores informados pela contabilidade; overrides manuais continuam tendo prioridade.
2. O texto do pró-labore passa a indicar `Fator R: X% · conforme contabilidade`.
3. Configurações recebeu `Excluir Todos os Dados` e `Excluir Conta`.
4. O item inferior `Favoritos` foi removido e substituído por `Mais`.
5. `Mais` abre a visão de Tributação.
6. A home mostra um resumo compacto `Obrigações do mês` com `DAS + INSS + IRRF + contabilidade` e link `Ver Tributação`; os detalhes tributários continuam disponíveis no modal.

## Exclusão de dados

`Excluir Todos os Dados` remove a linha do usuário em `public.app_state` e limpa o cache local. A conta de autenticação permanece.

`Excluir Conta` usa a Edge Function `delete-account`, que valida o bearer token e chama `auth.admin.deleteUser`. As tabelas `profiles` e `app_state` possuem `ON DELETE CASCADE`, portanto os dados associados são removidos com a conta.

## Deploy adicional necessário

A Edge Function precisa ser publicada no projeto Supabase antes de `Excluir Conta` funcionar em produção. A chave `SUPABASE_SERVICE_ROLE_KEY` permanece somente no ambiente da Edge Function; ela nunca deve ser colocada no frontend/Vercel.
