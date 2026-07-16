// Cria ou remove o acesso de um funcionário ao restaurante, só se quem chamar for o dono de verdade.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

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
    const { acao, restauranteId, tokenDono } = req.body || {};
    if (!acao || !restauranteId || !tokenDono) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // Confirma que quem está chamando é dono desse restaurante
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenDono}` }
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida. Faça login de novo e tente outra vez.' });
    const userData = await userResp.json();

    const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=user_id`, { headers: svcHeaders });
    const restData = await restResp.json();
    if (!restData?.[0] || restData[0].user_id !== userData.id) {
      return res.status(403).json({ error: 'Só o dono do restaurante pode gerenciar a equipe.' });
    }

    if (acao === 'criar') {
      const { nome, email, senha } = req.body || {};
      if (!nome || !email || !senha) return res.status(400).json({ error: 'Preencha nome, e-mail e senha do funcionário.' });
      if (senha.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

      const criaResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: svcHeaders,
        body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome, tipo: 'restaurante' } })
      });
      const criaData = await criaResp.json();
      if (!criaResp.ok) {
        const msg = criaData?.msg || criaData?.error_description || criaData?.message || 'Erro ao criar a conta (talvez esse e-mail já esteja em uso).';
        return res.status(400).json({ error: msg });
      }

      const vinculoResp = await fetch(`${SUPABASE_URL}/rest/v1/usuarios_restaurante`, {
        method: 'POST',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ restaurante_id: restauranteId, user_id: criaData.id, nome, papel: 'funcionario' })
      });
      if (!vinculoResp.ok) {
        const errText = await vinculoResp.text();
        return res.status(500).json({ error: 'Conta criada, mas houve erro ao vincular ao restaurante.', detalhe: errText });
      }
      return res.status(200).json({ ok: true });
    }

    if (acao === 'remover') {
      const { vinculoId } = req.body || {};
      if (!vinculoId) return res.status(400).json({ error: 'vinculoId é obrigatório' });
      await fetch(`${SUPABASE_URL}/rest/v1/usuarios_restaurante?id=eq.${vinculoId}&restaurante_id=eq.${restauranteId}`, {
        method: 'DELETE', headers: svcHeaders
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação desconhecida' });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
