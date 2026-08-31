# LOTE 05 — Fiscal 2026: Alta Renda / IRPF

## Objetivo

Adicionar ao módulo **Dados Anuais** uma visão gerencial da tributação mínima de altas rendas para o ano-calendário de 2026.

## Consolidação

O cálculo consolida:

- pró-labore;
- distribuições de lucros/dividendos;
- lucros anteriores a 2026 enquadrados na regra de transição;
- INSS do pró-labore;
- IRRF PF;
- IRRF PJ das distribuições;
- outros rendimentos PF informados manualmente.

A receita da PJ **não é tratada como renda da pessoa física**. Ela permanece fora desta consolidação, salvo quando efetivamente registrada como rendimento da PF (por exemplo, pró-labore ou distribuição).

## Tributação mínima

Para 2026, o motor considera o regime criado pela Lei nº 15.270/2025:

- enquadramento quando a soma anual de rendimentos supera R$ 600.000;
- alíquota mínima progressiva de 0% a 10%;
- 10% para base relevante de R$ 1.200.000 ou mais;
- cálculo da diferença após considerar o IRPF regular estimado e o IRRF exclusivo compensável informado.

Lucros/dividendos da transição legal são mantidos no total anual, mas excluídos da base mínima quando atendem aos requisitos legais cadastrados no LOTE 04.

## Outros rendimentos PF

O usuário pode informar um valor anual agregado, descrição, IRRF informativo, IRRF exclusivo compensável e indicar se o rendimento deve integrar a base de altas rendas e/ou a base tributável do ajuste anual.

## Aviso obrigatório

O módulo exibe:

> Este cálculo é uma estimativa gerencial e não substitui o cálculo oficial do IRPF.

## Escopo

A funcionalidade é gerencial e não pretende substituir a DIRPF oficial, nem contemplar automaticamente todas as classes de rendimentos, deduções, ganhos de capital, atividade rural, aplicações no exterior, dependentes ou situações especiais do contribuinte.
