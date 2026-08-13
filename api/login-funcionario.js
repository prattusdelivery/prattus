// Resolve o "usuário" de um funcionário pro e-mail interno usado por baixo dos panos no login.
// Não retorna nada além do e-mail — a senha continua sendo checada normalmente pelo Supabase Auth no passo seguinte, no navegador do usuário.
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
    const { usuario } = req.body || {};
    if (!usuario) return res.status(400).json({ error: 'Usuário é obrigatório' });

    const usuarioLimpo = String(usuario).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/usuarios_restaurante?usuario=eq.${encodeURIComponent(usuarioLimpo)}&select=restaurante_id`, { headers: svcHeaders });
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const emailInterno = `${usuarioLimpo}@${data[0].restaurante_id}.equipe.servidelivery.internal`;
    return res.status(200).json({ email: emailInterno });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
