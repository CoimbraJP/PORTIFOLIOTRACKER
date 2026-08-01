/**
 * A frase que libera a exclusão total.
 *
 * Mora fora do arquivo da Server Action porque um módulo `'use server'` só pode
 * exportar funções assíncronas — tudo ali vira endpoint, e uma constante não
 * tem como virar. Exportá-la de lá quebra o build.
 *
 * Aqui, formulário e ação leem a MESMA fonte. Duplicar a string nos dois lados
 * seria pior do que o erro de build: um dia alguém mudaria um e não o outro, e
 * o botão nunca mais liberaria.
 */
export const WIPE_PHRASE = 'APAGAR TUDO'
