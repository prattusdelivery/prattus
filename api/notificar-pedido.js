// Envia notificação push pro(s) aparelho(s) do restaurante quando cai um pedido novo
import webpush from 'web-push';

const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { restauranteId, titulo, corpo } = req.body || {};
    if (!restauranteId) {
      return res.status(400).json({ error: 'restauranteId é obrigatório' });
    }
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Configuração de notificação incompleta no servidor' });
    }

    webpush.setVapidDetails(
      'mailto:contato@servidelivery.com.br',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const headers = {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    const buscaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?restaurante_id=eq.${restauranteId}&select=id,subscription`,
      { headers }
    );
    const inscricoes = await buscaResp.json();

    if (!Array.isArray(inscricoes) || inscricoes.length === 0) {
      return res.status(200).json({ ok: true, enviados: 0, aviso: 'Nenhum aparelho inscrito pra este restaurante' });
    }

    const payload = JSON.stringify({
      titulo: titulo || '🛵 Novo pedido!',
      corpo: corpo || 'Você recebeu um novo pedido no ServiDelivery.',
      url: '/prattus.html'
    });

    let enviados = 0;
    for (const insc of inscricoes) {
      try {
        await webpush.sendNotification(insc.subscription, payload);
        enviados++;
      } catch (err) {
        // Se a inscrição expirou ou foi removida do navegador, apaga ela do banco
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${insc.id}`, {
            method: 'DELETE',
            headers
          }).catch(() => {});
        }
      }
    }

    return res.status(200).json({ ok: true, enviados });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
