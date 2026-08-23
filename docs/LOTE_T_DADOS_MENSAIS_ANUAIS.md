# Lote T — Dados Mensais, Dados Anuais e Contas a Pagar

## Escopo
- Navegação inferior: `Estatística` → `Dados Mensais`; `Anual` → `Dados Anuais`.
- Dados Anuais ampliados para 12 meses, mantendo gráficos de barras verticais.
- Receita, despesas, lucro, impostos (DAS/INSS/IRRF), pró-labore, INSS, IRRF, distribuição de lucros, margem líquida, média mensal, melhor/pior mês, evolução mês a mês e Receita × Despesa × Lucro.
- Impostos possuem detalhamento por clique na barra.
- Botão `Gerar Relatório (PDF)` usa a impressão nativa do navegador para permitir `Salvar como PDF`, sem adicionar dependência externa.
- Início recebe `Contas a Pagar` com as obrigações do mês anterior: DAS, DARF (INSS + IRRF) e Contabilidade, com vencimentos no mês selecionado.
- Distribuição de Lucro é um tipo próprio de lançamento e não é contabilizada como despesa nem reduz o resultado mensal.
- Saldo Atual não acumula meses anteriores: Receita - Despesas do mês.

## Compatibilidade
Lançamentos antigos continuam válidos. O novo tipo `distribuicao` é aceito pelo normalizador de backup e pelo motor financeiro.
