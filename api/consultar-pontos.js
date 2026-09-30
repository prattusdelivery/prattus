// Devolve os pontos de um cliente, protegido por senha — impede que qualquer um veja/resgate pontos de outra pessoa.
// Também devolve a chave Pix de UM restaurante específico (pra montar o QR code no checkout),
// o acompanhamento de UM pedido específico (pro cliente ver o status sem estar logado),
// e a nota média de avaliação de um restaurante — sem expor as tabelas inteiras (pedidos,
// restaurante_privado) pra consulta livre do navegador.
import crypto from 'crypto';
import { reportarErro } from './_sentry.js';

const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

function hashSenha(senha) {
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

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
  if (!process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Chave de serviço não configurada' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
  };

  try {
    const { acao, restauranteId, telefone, senha, pedidoId } = req.body || {};

    if (acao === 'buscar_pix') {
      if (!restauranteId) return res.status(400).json({ error: 'restauranteId é obrigatório' });
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/restaurante_privado?restaurante_id=eq.${restauranteId}&select=chave_pix`,
        { headers }
      );
      const data = await resp.json();
      const chave = Array.isArray(data) && data[0] ? data[0].chave_pix : null;
      return res.status(200).json({ chavePix: chave || null });
    }

    if (acao === 'acompanhar_pedido') {
      if (!pedidoId) return res.status(400).json({ error: 'pedidoId é obrigatório' });
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&select=id,status,saiu_entrega_em,criado_em,total,avaliacao,pedido_itens(nome,quantidade,preco,observacao)`,
        { headers }
      );
      const data = await resp.json();
      const pedido = Array.isArray(data) && data[0] ? data[0] : null;
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
      return res.status(200).json({ pedido });
    }

    if (acao === 'media_avaliacoes') {
      if (!restauranteId) return res.status(400).json({ error: 'restauranteId é obrigatório' });
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/pedidos?restaurante_id=eq.${restauranteId}&avaliacao=not.is.null&select=avaliacao`,
        { headers }
      );
      const data = await resp.json();
      const avals = Array.isArray(data) ? data : [];
      if (avals.length === 0) return res.status(200).json({ media: null, quantidade: 0 });
      const media = avals.reduce((s, p) => s + p.avaliacao, 0) / avals.length;
      return res.status(200).json({ media, quantidade: avals.length });
    }

    if (!restauranteId || !telefone) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?restaurante_id=eq.${restauranteId}&telefone=eq.${encodeURIComponent(telefone)}&select=id,saldo_cashback,senha_hash`,
      { headers }
    );
    const data = await resp.json();
    const cliente = Array.isArray(data) && data[0] ? data[0] : null;

    if (!cliente) {
      // Ninguém com esse telefone ainda — nada pra proteger
      return res.status(200).json({ saldoCashback: 0 });
    }

    if (!cliente.senha_hash) {
      // Primeira vez: precisa criar uma senha antes de ver o saldo
      if (!senha) {
        return res.status(200).json({ precisaCriarSenha: true });
      }
      if (String(senha).length < 4) {
        return res.status(400).json({ error: 'A senha precisa ter pelo menos 4 números.' });
      }
      const novoHash = hashSenha(String(senha));
      await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${cliente.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ senha_hash: novoHash })
      });
      const saldoAtualizado = await creditarCashbackPendente(cliente.id, cliente.saldo_cashback || 0, headers);
      return res.status(200).json({ saldoCashback: saldoAtualizado });
    }

    // Já tem senha cadastrada: precisa bater
    if (!senha) {
      return res.status(200).json({ precisaSenha: true });
    }
    if (!senhaConfere(String(senha), cliente.senha_hash)) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    const saldoAtualizado = await creditarCashbackPendente(cliente.id, cliente.saldo_cashback || 0, headers);
    return res.status(200).json({ saldoCashback: saldoAtualizado });
  } catch (e) {
    await reportarErro(e, 'consultar-pontos');
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}

// Credita cashback de pedidos com 24h+ de idade que ainda não foram creditados,
// e devolve o saldo já atualizado.
async function creditarCashbackPendente(clienteId, saldoAtual, headers) {
  const ontemLimite = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos?cliente_id=eq.${clienteId}&cashback_creditado=eq.false&criado_em=lte.${ontemLimite}&cashback_a_creditar=not.is.null&select=id,cashback_a_creditar`,
    { headers }
  );
  const pendentes = await resp.json();
  if (!Array.isArray(pendentes) || pendentes.length === 0) return saldoAtual;

  const somaPendente = pendentes.reduce((s, p) => s + parseFloat(p.cashback_a_creditar || 0), 0);
  const novoSaldo = parseFloat(saldoAtual || 0) + somaPendente;

  await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ saldo_cashback: novoSaldo })
  });

  const idsPendentes = pendentes.map(p => p.id).join(',');
  await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=in.(${idsPendentes})`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ cashback_creditado: true })
  });

  return novoSaldo;
}
