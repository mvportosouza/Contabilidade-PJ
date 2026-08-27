/**
 * Valores de pró-labore de referência para os PAs de 2026.
 *
 * Os valores inicialmente informados pela contabilidade são usados como
 * referência. Quando a diferença para o cálculo automático do aplicativo
 * é pequena e foi expressamente aceita pelo proprietário, prevalece o valor
 * calculado pelo motor tributário.
 *
 * Um override manual salvo em pj_plm sempre tem prioridade sobre estes
 * valores. Os valores servem como referência inicial e entram no cálculo
 * do Fator R para os meses informados.
 */
export const ACCOUNTING_PL_BY_MONTH = Object.freeze({
  "2026-04": 1621.00,
  "2026-05": 4233.24,
  "2026-06": 5883.61,
  "2026-07": 6266.40,
});


const LEGACY_ACCOUNTING_PL_BY_MONTH = Object.freeze({
  "2026-04": 1621.00,
  "2026-05": 4233.24,
  "2026-06": 5908.26,
  "2026-07": 6266.40,
});

/**
 * Migra apenas o conjunto original semeado pelo aplicativo.
 *
 * Se o usuário tiver alterado qualquer um dos quatro valores, não fazemos
 * inferência sobre intenção e preservamos os dados existentes.
 */
export function reconcileLegacyAccountingPL(plMap) {
  const current = { ...(plMap || {}) };
  const legacyKeys = Object.keys(LEGACY_ACCOUNTING_PL_BY_MONTH);

  const matchesLegacySeed = legacyKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(current, key)
    && Number(current[key]) === LEGACY_ACCOUNTING_PL_BY_MONTH[key]
  ));

  if (!matchesLegacySeed) return current;

  return {
    ...current,
    "2026-06": ACCOUNTING_PL_BY_MONTH["2026-06"],
  };
}
