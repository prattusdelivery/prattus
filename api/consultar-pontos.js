// Devolve os pontos de um cliente, protegido por senha — impede que qualquer um veja/resgate pontos de outra pessoa.
import crypto from 'crypto';

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

    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?restaurante_id=eq.${restauranteId}&telefone=eq.${encodeURIComponent(telefone)}&select=id,pontos,senha_hash`,
      { headers }
    );
    const data = await resp.json();
    const cliente = Array.isArray(data) && data[0] ? data[0] : null;

    if (!cliente) {
      // Ninguém com esse telefone ainda — nada pra proteger
      return res.status(200).json({ pontos: 0 });
    }

    if (!cliente.senha_hash) {
      // Primeira vez: precisa criar uma senha antes de ver os pontos
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
      return res.status(200).json({ pontos: cliente.pontos || 0 });
    }

    // Já tem senha cadastrada: precisa bater
    if (!senha) {
      return res.status(200).json({ precisaSenha: true });
    }
    if (!senhaConfere(String(senha), cliente.senha_hash)) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    return res.status(200).json({ pontos: cliente.pontos || 0 });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
