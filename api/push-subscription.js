// Salva ou remove inscrições de notificação push — tanto de restaurantes quanto do Super Admin.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';
const ADMIN_EMAIL = 'alessandro.reval@hotmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Chave de serviço não configurada' });
  }

  const svcHeaders = {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
  };

  try {
    const { acao, tipo, restauranteId, subscription, endpoint, tokenAdmin } = req.body || {};

    if (tipo === 'admin') {
      // Confirma que quem está chamando é o Super Admin de verdade
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenAdmin}` }
      });
      if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida' });
      const userData = await userResp.json();
      if (userData.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Só o Super Admin pode ativar isso.' });

      if (acao === 'salvar') {
        await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?on_conflict=endpoint`, {
          method: 'POST',
          headers: { ...svcHeaders, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
          body: JSON.stringify({ endpoint: subscription.endpoint, subscription })
        });
      } else if (acao === 'remover') {
        await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
          method: 'DELETE', headers: svcHeaders
        });
      }
      return res.status(200).json({ ok: true });
    }

    // tipo === 'restaurante' (padrão)
    if (acao === 'salvar') {
      if (!restauranteId || !subscription) return res.status(400).json({ error: 'Dados incompletos' });
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
        method: 'POST',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify({ restaurante_id: restauranteId, endpoint: subscription.endpoint, subscription })
      });
    } else if (acao === 'remover') {
      if (!endpoint) return res.status(400).json({ error: 'endpoint é obrigatório' });
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: 'DELETE', headers: svcHeaders
      });
    } else {
      return res.status(400).json({ error: 'Ação desconhecida' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
