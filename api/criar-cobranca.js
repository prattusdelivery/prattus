import { reportarErro } from './_sentry.js';
// Cria (ou reaproveita) um cliente na Asaas e gera uma assinatura recorrente,
// devolvendo o link de pagamento (checkoutUrl) pro restaurante pagar.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido', versao: 'cartao-v2' });
  }

  try {
    const { restauranteId, nome, email, plano, cpfCnpj, metodo } = req.body || {};

    if (!restauranteId || !nome || !email || !plano || !cpfCnpj) {
      return res.status(400).json({ error: 'Dados incompletos (restauranteId, nome, email, cpfCnpj e plano são obrigatórios)' });
    }

    // Teste sem efeito: mostra por qual caminho o pedido passaria (não cria nada na Asaas)
    if (req.body && req.body.teste === 'seco') {
      return res.status(200).json({ teste: true, caminho: metodo === 'cartao' ? 'cartao' : (metodo === 'pix' ? 'pix' : 'bloqueado'), metodoRecebido: metodo || null });
    }

    // Trava de segurança: o pedido precisa dizer se é cartão ou Pix/boleto. Sem isso, não cria nada
    // (evita gerar boleto sem o cliente escolher boleto).
    if (metodo !== 'cartao' && metodo !== 'pix') {
      return res.status(400).json({ error: 'Página desatualizada. Aperte Ctrl + F5 e tente de novo.', metodoRecebido: metodo || null });
    }

    const valor = plano === 'anual' ? 399.90 : 39.90;
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
      body: JSON.stringify({ name: nome, email, cpfCnpj, externalReference: restauranteId })
    });
    const custData = await custResp.json();
    if (!custResp.ok) {
      return res.status(500).json({ error: 'Erro ao criar cliente na Asaas', detalhe: custData });
    }
    const customerId = custData.id;

    // Garante que o CPF/CNPJ está salvo no cliente, mesmo se ele já existia antes (ex: e-mail repetido)
    if (custData.cpfCnpj !== cpfCnpj) {
      const updResp = await fetch(`${ASAAS_BASE}/customers/${customerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_KEY },
        body: JSON.stringify({ cpfCnpj })
      });
      if (!updResp.ok) {
        const updData = await updResp.json();
        return res.status(500).json({ error: 'Erro ao atualizar CPF/CNPJ do cliente na Asaas', detalhe: updData });
      }
    }

    // 1.5. CARTÃO AUTOMÁTICO: página de pagamento do próprio Asaas (Checkout com assinatura).
    //      O restaurante digita o cartão 1 vez lá; o Asaas cobra sozinho todo mês/ano.
    //      Os dados do cartão nunca passam pelo nosso servidor.
    if (metodo === 'cartao') {
      const SITE = 'https://www.servidelivery.com.br';
      // primeira cobrança: daqui a 2 minutos (horário de Brasília), formato "AAAA-MM-DD HH:mm:ss"
      const base = new Date(Date.now() + 2 * 60 * 1000 - 3 * 60 * 60 * 1000);
      const nextDueDate = base.toISOString().replace('T', ' ').slice(0, 19);
      const corpoBase = {
        billingTypes: ['CREDIT_CARD'],
        chargeTypes: ['RECURRENT'],
        minutesToExpire: 120,
        externalReference: restauranteId,
        callback: {
          successUrl: SITE + '/painel?assinatura=ok',
          cancelUrl: SITE + '/painel?assinatura=cancelada',
          expiredUrl: SITE + '/painel?assinatura=expirada'
        },
        items: [{
          name: plano === 'anual' ? 'ServiDelivery - plano anual' : 'ServiDelivery - plano mensal',
          description: 'Assinatura ServiDelivery - ' + nome,
          quantity: 1,
          value: valor
        }],
        subscription: { cycle: ciclo, nextDueDate }
      };
      const tentar = async (extra) => {
        const r = await fetch(`${ASAAS_BASE}/checkouts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_KEY },
          body: JSON.stringify({ ...corpoBase, ...extra })
        });
        let d = {}; try { d = await r.json(); } catch (e) {}
        return { r, d };
      };
      // 1ª tentativa: cliente já criado; se o Asaas não aceitar, 2ª tentativa com os dados do cliente no corpo
      let { r: chkResp, d: chkData } = await tentar({ customer: customerId });
      if (!chkResp.ok) {
        ({ r: chkResp, d: chkData } = await tentar({ customerData: { name: nome, email, cpfCnpj } }));
      }
      if (!chkResp.ok) {
        await reportarErro(new Error('Asaas checkout: ' + JSON.stringify(chkData).slice(0, 500)), 'criar-cobranca-checkout');
        const motivo = (chkData && Array.isArray(chkData.errors) ? chkData.errors.map(e => e.description || e.code).join(' | ') : '') || ('status ' + chkResp.status);
      return res.status(500).json({ error: 'O Asaas não aceitou criar o pagamento no cartão: ' + motivo, detalhe: chkData });
      }
      const checkoutUrl = chkData.link || chkData.url || (chkData.id ? `https://asaas.com/checkoutSession/show?id=${chkData.id}` : null);
      if (!checkoutUrl) {
        return res.status(500).json({ error: 'Pagamento criado, mas não foi possível obter o link.', detalhe: chkData });
      }
      if (process.env.SUPABASE_SERVICE_KEY) {
        await fetch(`https://qdyhmtccahlqscvrckpx.supabase.co/rest/v1/restaurantes?id=eq.${restauranteId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ plano_tipo: plano })
        }).catch(() => {});
      }
      return res.status(200).json({ ok: true, checkoutUrl, checkoutId: chkData.id });
    }

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
        description: 'Assinatura ServiDelivery - ' + nome,
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

    // 4. Guarda no restaurante qual plano ele escolheu (mensal/anual), pra calcular o MRR certinho depois
    const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';
    if (process.env.SUPABASE_SERVICE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ plano_tipo: plano })
      }).catch(() => {}); // não trava o fluxo de pagamento se isso falhar
    }

    return res.status(200).json({ ok: true, checkoutUrl, subscriptionId: subData.id });
  } catch (e) {
    await reportarErro(e, 'criar-cobranca');
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
