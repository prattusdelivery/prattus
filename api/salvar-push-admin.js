// Guarda a inscrição de notificação push do Super Admin, confirmando que é ele mesmo.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';
const ADMIN_EMAIL = 'alessandro.reval@hotmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { subscription, tokenAdmin } = req.body || {};
    if (!subscription || !tokenAdmin) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada' });
    }

    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenAdmin}` }
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida' });
    const userData = await userResp.json();
    if (userData.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Só o Super Admin pode ativar isso.' });

    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal,resolution=merge-duplicates'
    };

    await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?on_conflict=endpoint`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ endpoint: subscription.endpoint, subscription })
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
