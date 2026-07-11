// Busca (ou cria) o cliente pelo telefone e atualiza fidelidade (gasto total, pedidos, pontos).
// Roda no servidor com a chave de serviço, pra nunca expor dados de clientes publicamente.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { restauranteId, nome, telefone, totalPedido, pontosResgatados, fidelidadeAtiva, dataNascimento } = req.body || {};
    if (!restauranteId || !telefone || totalPedido == null) {
      return res.status(400).json({ error: 'Dados incompletos (restauranteId, telefone e totalPedido são obrigatórios)' });
    }

    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada no servidor' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    // 1. Busca cliente existente pelo telefone (dentro do mesmo restaurante)
    const buscaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?restaurante_id=eq.${restauranteId}&telefone=eq.${encodeURIComponent(telefone)}&select=*`,
      { headers }
    );
    const buscaData = await buscaResp.json();
    const existente = Array.isArray(buscaData) ? buscaData[0] : null;

    let clienteId;

    if (existente) {
      clienteId = existente.id;
      const pontosGanhos = fidelidadeAtiva === false ? 0 : Math.floor(totalPedido);
      const pontosNovos = Math.max(0, (existente.pontos || 0) + pontosGanhos - (parseInt(pontosResgatados) || 0));
      await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          nome: nome || existente.nome,
          total_gasto: parseFloat(existente.total_gasto || 0) + parseFloat(totalPedido),
          total_pedidos: (existente.total_pedidos || 0) + 1,
          pontos: pontosNovos,
          data_nascimento: existente.data_nascimento || dataNascimento || null
        })
      });
    } else {
      const pontosGanhos = fidelidadeAtiva === false ? 0 : Math.floor(totalPedido);
      const criaResp = await fetch(`${SUPABASE_URL}/rest/v1/clientes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          restaurante_id: restauranteId, nome, telefone,
          total_gasto: totalPedido, total_pedidos: 1, pontos: pontosGanhos,
          data_nascimento: dataNascimento || null
        })
      });
      const criaData = await criaResp.json();
      clienteId = Array.isArray(criaData) ? criaData[0]?.id : null;
    }

    return res.status(200).json({ ok: true, clienteId });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
