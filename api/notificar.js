// Envia notificação push — tanto de novo pedido/avaliação (pro restaurante) quanto administrativa (pro Super Admin).
import webpush from 'web-push';

const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Configuração de notificação incompleta no servidor' });
  }

  try {
    const { tipo, restauranteId, titulo, corpo } = req.body || {};
    if (!titulo) return res.status(400).json({ error: 'titulo é obrigatório' });

    webpush.setVapidDetails('mailto:contato@servidelivery.com.br', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

    const headers = {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    let inscricoes = [];
    if (tipo === 'admin') {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?select=id,subscription`, { headers });
      inscricoes = await resp.json();
    } else {
      if (!restauranteId) return res.status(400).json({ error: 'restauranteId é obrigatório' });
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?restaurante_id=eq.${restauranteId}&select=id,subscription`, { headers });
      inscricoes = await resp.json();
    }

    if (!Array.isArray(inscricoes) || inscricoes.length === 0) {
      return res.status(200).json({ ok: true, enviados: 0, aviso: 'Nenhum aparelho inscrito' });
    }

    const payload = JSON.stringify({ titulo, corpo: corpo || '', url: '/prattus.html' });
    const tabela = tipo === 'admin' ? 'admin_push_subscriptions' : 'push_subscriptions';

    let enviados = 0;
    for (const insc of inscricoes) {
      try {
        await webpush.sendNotification(insc.subscription, payload);
        enviados++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${insc.id}`, { method: 'DELETE', headers }).catch(() => {});
        }
      }
    }

    return res.status(200).json({ ok: true, enviados });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
