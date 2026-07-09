// Registra a nota (1 a 5) que o cliente deu pro pedido, só depois de entregue.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { pedidoId, nota } = req.body || {};
    const notaNum = parseInt(nota);
    if (!pedidoId || !notaNum || notaNum < 1 || notaNum > 5) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    // Confere se o pedido existe e ainda não foi avaliado
    const buscaResp = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&select=avaliacao,criado_em`, { headers });
    const buscaData = await buscaResp.json();
    const pedido = Array.isArray(buscaData) ? buscaData[0] : null;

    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (pedido.avaliacao) return res.status(400).json({ error: 'Esse pedido já foi avaliado.' });

    await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ avaliacao: notaNum })
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
