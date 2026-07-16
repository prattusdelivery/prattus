// Devolve detalhes protegidos de uma loja, ou ativa/desativa/estende teste — só se quem chamar for o Super Admin de verdade.
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
    const { acao, restauranteId, tokenAdmin, dias } = req.body || {};
    if (!acao || !restauranteId || !tokenAdmin) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenAdmin}` }
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida' });
    const userData = await userResp.json();
    if (userData.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Só o Super Admin pode fazer isso.' });

    if (acao === 'detalhes') {
      const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=user_id`, { headers: svcHeaders });
      const restData = await restResp.json();
      const dono = Array.isArray(restData) ? restData[0] : null;
      if (!dono) return res.status(404).json({ error: 'Restaurante não encontrado' });

      const privResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurante_privado?restaurante_id=eq.${restauranteId}&select=cpf_cnpj`, { headers: svcHeaders });
      const privData = await privResp.json();
      const cpfCnpj = Array.isArray(privData) && privData[0] ? privData[0].cpf_cnpj : null;

      let email = null;
      if (dono.user_id) {
        const authResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${dono.user_id}`, { headers: svcHeaders });
        if (authResp.ok) {
          const authData = await authResp.json();
          email = authData.email || null;
        }
      }
      return res.status(200).json({ ok: true, email, cpfCnpj });
    }

    if (acao === 'ativar' || acao === 'desativar') {
      await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
        method: 'PATCH',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ plano_ativo: acao === 'ativar' })
      });
      return res.status(200).json({ ok: true });
    }

    if (acao === 'estender_teste') {
      const diasNum = parseInt(dias) || 7;
      const buscaResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=trial_extra_dias`, { headers: svcHeaders });
      const buscaData = await buscaResp.json();
      const atual = Array.isArray(buscaData) && buscaData[0] ? (buscaData[0].trial_extra_dias || 0) : 0;
      await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
        method: 'PATCH',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ trial_extra_dias: atual + diasNum })
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação desconhecida' });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
