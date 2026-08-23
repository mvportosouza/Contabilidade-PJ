# Correções — Relatórios Mensais e Favoritos

Data: 23/08/2026

Alterações implementadas sem alterar o layout original:

1. Relatório PDF mensal
   - A primeira página agora segue o mesmo padrão de resumo completo do relatório anual.
   - Inclui receita, despesas, lucro, impostos pagos, pró-labore, INSS, IRRF, distribuição de lucros, margem, ticket médio e quantidades.
   - Inclui DAS, INSS, IRRF, Contabilidade e total das obrigações do mês.
   - Os valores de pró-labore e obrigações são os mesmos utilizados pelo aplicativo no mês selecionado.
   - Os gráficos da aba Dados Mensais continuam todos presentes no PDF: Receita por Especialidade, Receitas vs Despesas e Receita por Clínica.
   - Os lançamentos são ordenados pela data (mais recente primeiro).
   - A listagem de lançamentos foi paginada para garantir que nenhum registro seja omitido, mesmo em meses com muitos lançamentos.

2. Favoritos
   - Ao abrir Favoritos pela Engrenagem, a janela Configurações é fechada antes da abertura da janela Favoritos, eliminando a sobreposição de modais.
   - A edição/exclusão dos Favoritos e a ordenação alfabética foram preservadas.

Arquivos de código alterados:
- components/App.jsx
- lib/pdf.js
