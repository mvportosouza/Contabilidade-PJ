# Fase 1 — Correção e conciliação tributária (27/08/2026)

## 1. Fator R no primeiro mês

A auditoria corrigiu uma inconsistência real no motor. A Resolução CGSN nº 140/2018, art. 26, § 6º, e o Manual do PGDAS-D determinam que, no mês de início de atividades, quando FSPA e RPA são maiores que zero, o Fator R é calculado por **FSPA / RPA**. A folha não deve ser comparada com o RBT12 anualizado nesse primeiro PA.

Por isso, para abril/2026:

- Receita do PA (RPA): R$ 3.500,00
- Pró-labore/FSPA: R$ 1.621,00
- Fator R: 1.621 / 3.500 = **46,31%**
- Resultado: **Anexo III**

O motor agora aplica essa regra tanto no cálculo do PA atual quanto na reconstrução histórica usada para estimar a CPP dos períodos seguintes. Também foi adicionada regressão específica para impedir que o primeiro PA volte a usar a RBT12 anualizada.

## 2. Conciliação do pró-labore de junho

O cálculo automático do aplicativo para junho/2026 é:

(3.500,00 + 17.408,00 + 21.012,90) × 28%
− (1.621,00 + 4.233,24)
= **R$ 5.883,61**

A contabilidade havia informado **R$ 5.908,26**.

Diferença:

- R$ 24,65
- 0,42% do valor contábil informado

Como a diferença é pequena e foi expressamente autorizada pelo proprietário do aplicativo, o valor calculado pelo motor (**R$ 5.883,61**) passa a ser o valor de referência do aplicativo para junho/2026.

## 3. Migração segura

Usuários que ainda possuem exatamente o conjunto legado de valores semeados pelo aplicativo:

- abril: R$ 1.621,00
- maio: R$ 4.233,24
- junho: R$ 5.908,26
- julho: R$ 6.266,40

terão somente junho reconciliado para R$ 5.883,61.

Se houver qualquer outro valor/override no conjunto, a migração não altera os dados existentes.

## 4. Regressões adicionadas

Foram adicionados testes para:

1. Fator R no primeiro PA usando FSPA/RPA sem anualização da folha.
2. Primeiro PA sem pró-labore.
3. Valor de pró-labore de junho calculado pelo motor.
4. Registro da diferença imaterial entre o cálculo e o valor contábil original.
5. Migração do conjunto legado para o valor conciliado.
6. Preservação de overrides diferentes do conjunto legado.

## 5. Layout

Nenhum componente visual, CSS, estrutura de tela ou comportamento de layout foi alterado nesta fase.
