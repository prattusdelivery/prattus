// Guarda a inscrição de notificação push (gerada pelo navegador do dono do restaurante)
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { restauranteId, subscription } = req.body || {};
    if (!restauranteId || !subscription) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal,resolution=merge-duplicates'
    };

    // upsert pelo endpoint da inscrição, pra não duplicar se o mesmo aparelho assinar de novo
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        restaurante_id: restauranteId,
        endpoint: subscription.endpoint,
        subscription
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(500).json({ error: 'Erro ao salvar inscrição', detalhe: errText });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
