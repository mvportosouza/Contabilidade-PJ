# Lote K — Auth & Security

## Alterações
- Fluxo de recuperação de senha com `resetPasswordForEmail`.
- Fluxo de atualização de senha após `PASSWORD_RECOVERY`.
- Validação de senha mínima de 8 caracteres no cliente.
- Cliente Supabase sem URL/chave hardcoded como fallback.
- Variáveis de ambiente mantidas em `env.example`.

## Sem alteração de layout
O fluxo usa os mesmos estilos e dimensões existentes. Nenhuma alteração estrutural no Dashboard foi feita.

## Configuração necessária no Supabase Dashboard
1. Ativar **Leaked Password Protection** (recurso disponível em planos elegíveis).
2. Manter confirmação de e-mail habilitada.
3. Configurar a URL de produção como Site URL.
4. Adicionar a URL de produção à lista de Redirect URLs.
5. Recomenda-se MFA para a conta administrativa do Supabase/GitHub.

## Vercel
Garanta que existam em Production/Preview/Development conforme necessário:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

Não use `service_role` no frontend.
