// Exclui o perfil de fidelidade de um cliente (nome, pontos, histórico) a pedido dele mesmo — direito da LGPD.
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

    // Confere se existe antes de apagar, pra avisar certinho
    const buscaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?restaurante_id=eq.${restauranteId}&telefone=eq.${encodeURIComponent(telefone)}&select=id`,
      { headers }
    );
    const buscaData = await buscaResp.json();
    const encontrado = Array.isArray(buscaData) && buscaData.length > 0;

    if (encontrado) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/clientes?restaurante_id=eq.${restauranteId}&telefone=eq.${encodeURIComponent(telefone)}`,
        { method: 'DELETE', headers }
      );
    }

    return res.status(200).json({ ok: true, encontrado });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
