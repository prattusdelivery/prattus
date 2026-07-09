// Remove o acesso de um funcionário ao restaurante (o vínculo, não a conta dele em si)
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { vinculoId, restauranteId, tokenDono } = req.body || {};
    if (!vinculoId || !restauranteId || !tokenDono) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada' });
    }

    const svcHeaders = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenDono}` }
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida.' });
    const userData = await userResp.json();

    const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=user_id`, { headers: svcHeaders });
    const restData = await restResp.json();
    if (!restData?.[0] || restData[0].user_id !== userData.id) {
      return res.status(403).json({ error: 'Só o dono do restaurante pode remover funcionários.' });
    }

    await fetch(`${SUPABASE_URL}/rest/v1/usuarios_restaurante?id=eq.${vinculoId}&restaurante_id=eq.${restauranteId}`, {
      method: 'DELETE',
      headers: svcHeaders
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
