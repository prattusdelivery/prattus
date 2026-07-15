// Devolve dados protegidos (e-mail do dono, CPF/CNPJ) só pro Super Admin, verificando o token de quem chama.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';
const ADMIN_EMAIL = 'alessandro.reval@hotmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { restauranteId, tokenAdmin } = req.body || {};
    if (!restauranteId || !tokenAdmin) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada' });
    }

    const svcHeaders = {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    // Confirma que quem está chamando é o Super Admin de verdade
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenAdmin}` }
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida' });
    const userData = await userResp.json();
    if (userData.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Só o Super Admin acessa esses dados.' });

    // Busca o restaurante pra saber o user_id do dono
    const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=user_id`, { headers: svcHeaders });
    const restData = await restResp.json();
    const dono = Array.isArray(restData) ? restData[0] : null;
    if (!dono) return res.status(404).json({ error: 'Restaurante não encontrado' });

    // Busca CPF/CNPJ protegido
    const privResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurante_privado?restaurante_id=eq.${restauranteId}&select=cpf_cnpj`, { headers: svcHeaders });
    const privData = await privResp.json();
    const cpfCnpj = Array.isArray(privData) && privData[0] ? privData[0].cpf_cnpj : null;

    // Busca e-mail do dono via API de administração de usuários
    let email = null;
    if (dono.user_id) {
      const authResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${dono.user_id}`, { headers: svcHeaders });
      if (authResp.ok) {
        const authData = await authResp.json();
        email = authData.email || null;
      }
    }

    return res.status(200).json({ ok: true, email, cpfCnpj });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
