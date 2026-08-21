# Lote P — Documentation Cleanup

## Objetivo

Atualizar a documentação do projeto para refletir o estado atual do código e da infraestrutura, remover referências de versões antigas e registrar os lotes recentes.

## Versões atuais

Conforme `package.json`:

- Next.js `^16.2.12`
- React `^19.2.8`
- React DOM `^19.2.8`
- ESLint `^9.39.5`
- `eslint-config-next` `^16.2.12`
- Vitest `^3.2.7`

O CI utiliza Node.js 24.

## Limpeza realizada

- README atualizado de Next.js 14 / React 18 para Next.js 16 / React 19.
- Referências antigas de versões foram removidas do README.
- A documentação dos lotes H, K e O foi alinhada ao estado atual.
- Documentação dos lotes M e N foi adicionada para registrar as alterações de infraestrutura/CI e segurança do Supabase.
- README passou a apontar para a documentação dos lotes relevantes.
- A documentação mantém a regra de não alterar o layout da aplicação.

## Escopo

Este lote é exclusivamente documental.

Não altera:

- componentes visuais;
- estilos;
- layout;
- regras de negócio;
- dados do usuário;
- schema do banco;
- fluxo de autenticação;
- Service Worker;
- pipeline de CI.

## Critério de conclusão

O Lote P está concluído quando:

- [x] README reflete Next.js 16 / React 19.
- [x] Referências antigas de Next.js 14 / React 18 foram removidas do README.
- [x] Lotes H, K, M, N e O estão documentados.
- [x] README contém a estrutura de documentação dos lotes.
- [x] Nenhuma alteração de layout foi introduzida.
