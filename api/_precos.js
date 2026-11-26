// Tabela de preços do ServiDelivery (a ÚNICA que manda na cobrança). Quem decide o valor é o servidor, nunca o navegador.
// PLANO ÚNICO: R$ 39,90/mês ou R$ 399,90/ano, com tudo incluído. Anual = 10 mensalidades (2 meses grátis), terminando em ,90.
// (a linha 'simples' fica só por compatibilidade e tem o mesmo preço)
export const TABELA_PRECOS = {
  simples:  { mensal: 39.90, anual: 399.90 },
  completo: { mensal: 39.90, anual: 399.90 }
};

export const ACRESCIMO_COMANDAS = { mensal: 10, anual: 100 };
// Por enquanto as Comandas NÃO têm cobrança extra (tudo a R$ 39,90). Para voltar a cobrar +R$ 10, troque para true.
export const COBRAR_COMANDAS = false;

// rest = linha da tabela restaurantes (precisa de plano_painel, preco_mensal_travado e comandas_ativas)
// preco_mensal_travado: lojas antigas que continuam com o preço combinado (ex.: 39.90), seja qual for o painel
export function calcularPreco(rest, plano) {
  const painel = rest && rest.plano_painel === 'simples' ? 'simples' : 'completo';
  let mensal = TABELA_PRECOS[painel].mensal;
  let anual = TABELA_PRECOS[painel].anual;
  // Comandas (mesas) são um extra: +R$ 10 por mês (R$ 49,90) ou +R$ 100 por ano (R$ 499,90). Lojas com preço travado não mudam.
  if (COBRAR_COMANDAS && rest && rest.comandas_ativas === true) { mensal = Math.round((mensal + ACRESCIMO_COMANDAS.mensal) * 100) / 100; anual = Math.round((anual + ACRESCIMO_COMANDAS.anual) * 100) / 100; }
  const travado = parseFloat(rest && rest.preco_mensal_travado);
  if (travado > 0) {
    mensal = Math.round(travado * 100) / 100;
    anual = Math.floor(travado * 10 + 1e-6) + 0.90;
  }
  return { painel, travado: travado > 0, mensal, anual, valor: plano === 'anual' ? anual : mensal };
}
