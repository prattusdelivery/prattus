// Recebe o aviso automático da Asaas quando um pagamento é confirmado
// e libera o restaurante correspondente no Supabase (plano_ativo = true).
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    // Confere se o aviso realmente veio da Asaas (token combinado nas duas pontas)
    const tokenRecebido = req.headers['asaas-access-token'];
    if (!tokenRecebido || tokenRecebido !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const evento = req.body || {};
    const tipo = evento.event;
    const pagamento = evento.payment;

    const eventosQueLiberam = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];

    if (eventosQueLiberam.includes(tipo) && pagamento?.externalReference) {
      const restauranteId = pagamento.externalReference;

      const resp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ plano_ativo: true })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return res.status(500).json({ error: 'Erro ao atualizar restaurante no Supabase', detalhe: errText });
      }
    }

    // Eventos de cancelamento/atraso podem, futuramente, desativar o plano de volta.
    // Por ora só tratamos a liberação (confirmação de pagamento).

    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
