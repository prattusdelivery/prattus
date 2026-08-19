// Exclui o cadastro de um cliente a pedido dele mesmo — direito da LGPD.
// Protegido por senha (a mesma senha de fidelidade) pra impedir que qualquer um
// peça a exclusão do cadastro de outra pessoa só sabendo o telefone dela.
// Antes de apagar, desliga o cliente dos pedidos antigos (sem apagar os pedidos em si),
// assim relatórios, faturamento e uso de cupons continuam intactos.
import crypto from 'crypto';

const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

function senhaConfere(senha, senhaHashArmazenada) {
  const [salt, hashOriginal] = (senhaHashArmazenada || '').split(':');
  if (!salt || !hashOriginal) return false;
  const hashTentativa = crypto.scryptSync(senha, salt, 32).toString('hex');
  return hashTentativa === hashOriginal;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { restauranteId, telefone, senha } = req.body || {};
    if (!restauranteId || !telefone) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    const buscaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?restaurante_id=eq.${restauranteId}&telefone=eq.${encodeURIComponent(telefone)}&select=id,senha_hash`,
      { headers }
    );
    const buscaData = await buscaResp.json();
    const cliente = Array.isArray(buscaData) && buscaData[0] ? buscaData[0] : null;

    if (!cliente) {
      return res.status(200).json({ ok: true, encontrado: false });
    }

    if (!cliente.senha_hash) {
      return res.status(400).json({
        error: 'Por segurança, você precisa criar uma senha de fidelidade antes de excluir seus dados. Vá em "Consultar meus pontos" no cardápio e crie uma senha primeiro, depois volte aqui.'
      });
    }

    if (!senha) {
      return res.status(200).json({ ok: false, precisaSenha: true });
    }
    if (!senhaConfere(String(senha), cliente.senha_hash)) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    // Desliga o cliente dos pedidos antigos (sem apagar os pedidos em si — total, itens,
    // cupom usado e pontos resgatados continuam intactos nos relatórios do restaurante)
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos?cliente_id=eq.${cliente.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ cliente_id: null })
    });

    // Agora sim, apaga o cadastro do cliente de vez
    await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${cliente.id}`, {
      method: 'DELETE', headers
    });

    return res.status(200).json({ ok: true, encontrado: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
