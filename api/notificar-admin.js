// Envia uma notificação push genérica pro(s) aparelho(s) do Super Admin.
import webpush from 'web-push';

const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { titulo, corpo } = req.body || {};
    if (!titulo) {
      return res.status(400).json({ error: 'titulo é obrigatório' });
    }
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Configuração de notificação incompleta' });
    }

    webpush.setVapidDetails('mailto:contato@servidelivery.com.br', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

    const headers = {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    const inscResp = await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?select=id,subscription`, { headers });
    const inscricoes = await inscResp.json();

    const payload = JSON.stringify({ titulo, corpo: corpo || '', url: '/prattus.html' });

    let enviados = 0;
    for (const insc of (Array.isArray(inscricoes) ? inscricoes : [])) {
      try {
        await webpush.sendNotification(insc.subscription, payload);
        enviados++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?id=eq.${insc.id}`, { method: 'DELETE', headers }).catch(() => {});
        }
      }
    }

    return res.status(200).json({ ok: true, enviados });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
