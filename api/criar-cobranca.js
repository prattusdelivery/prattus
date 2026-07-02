// Cria (ou reaproveita) um cliente na Asaas e gera uma assinatura recorrente,
// devolvendo o link de pagamento (checkoutUrl) pro restaurante pagar.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { restauranteId, nome, email, plano } = req.body || {};

    if (!restauranteId || !nome || !email || !plano) {
      return res.status(400).json({ error: 'Dados incompletos (restauranteId, nome, email, plano são obrigatórios)' });
    }

    const valor = plano === 'anual' ? 369.00 : 36.90;
    const ciclo = plano === 'anual' ? 'YEARLY' : 'MONTHLY';

    const ASAAS_KEY = process.env.ASAAS_API_KEY;
    const ASAAS_BASE = 'https://api.asaas.com/v3';

    if (!ASAAS_KEY) {
      return res.status(500).json({ error: 'Chave da Asaas não configurada no servidor' });
    }

    // 1. Cria o cliente na Asaas (se já existir com esse e-mail, a Asaas retorna o mesmo)
    const custResp = await fetch(`${ASAAS_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_KEY },
      body: JSON.stringify({ name: nome, email, externalReference: restauranteId })
    });
    const custData = await custResp.json();
    if (!custResp.ok) {
      return res.status(500).json({ error: 'Erro ao criar cliente na Asaas', detalhe: custData });
    }
    const customerId = custData.id;

    // 2. Cria a assinatura recorrente (mensal ou anual)
    const hoje = new Date().toISOString().split('T')[0];
    const subResp = await fetch(`${ASAAS_BASE}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_KEY },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'UNDEFINED', // cliente escolhe Pix, boleto ou cartão na hora de pagar
        value: valor,
        nextDueDate: hoje,
        cycle: ciclo,
        description: 'Assinatura Prattus - ' + nome,
        externalReference: restauranteId
      })
    });
    const subData = await subResp.json();
    if (!subResp.ok) {
      return res.status(500).json({ error: 'Erro ao criar assinatura na Asaas', detalhe: subData });
    }

    // 3. Busca a primeira cobrança gerada pra pegar o link de pagamento
    const paysResp = await fetch(`${ASAAS_BASE}/payments?subscription=${subData.id}`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const paysData = await paysResp.json();
    const checkoutUrl = paysData?.data?.[0]?.invoiceUrl || null;

    if (!checkoutUrl) {
      return res.status(500).json({ error: 'Assinatura criada, mas não foi possível obter o link de pagamento' });
    }

    return res.status(200).json({ ok: true, checkoutUrl, subscriptionId: subData.id });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
