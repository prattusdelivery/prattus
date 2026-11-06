// Tabela de preços do ServiDelivery (a ÚNICA que manda na cobrança). Quem decide o valor é o servidor, nunca o navegador.
// Painel Simples (Básico) e Completo. Anual = 10 mensalidades (2 meses grátis), terminando em ,90.
export const TABELA_PRECOS = {
  simples:  { mensal: 39.90, anual: 399.90 },
  completo: { mensal: 49.90, anual: 499.90 }
};

// rest = linha da tabela restaurantes (precisa de plano_painel e preco_mensal_travado)
// preco_mensal_travado: lojas antigas que continuam com o preço combinado (ex.: 39.90), seja qual for o painel
export function calcularPreco(rest, plano) {
  const painel = rest && rest.plano_painel === 'simples' ? 'simples' : 'completo';
  let mensal = TABELA_PRECOS[painel].mensal;
  let anual = TABELA_PRECOS[painel].anual;
  const travado = parseFloat(rest && rest.preco_mensal_travado);
  if (travado > 0) {
    mensal = Math.round(travado * 100) / 100;
    anual = Math.floor(travado * 10 + 1e-6) + 0.90;
  }
  return { painel, travado: travado > 0, mensal, anual, valor: plano === 'anual' ? anual : mensal };
}
