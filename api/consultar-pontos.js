// Devolve só a quantidade de pontos de um cliente (por telefone), sem expor mais nada da tabela.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { restauranteId, telefone } = req.body || {};
    if (!restauranteId || !telefone) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada' });
    }

    const headers = {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?restaurante_id=eq.${restauranteId}&telefone=eq.${encodeURIComponent(telefone)}&select=pontos`,
      { headers }
    );
    const data = await resp.json();
    const pontos = Array.isArray(data) && data[0] ? (data[0].pontos || 0) : 0;

    return res.status(200).json({ pontos });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
