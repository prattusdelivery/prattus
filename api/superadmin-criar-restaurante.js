// Permite que o Super Admin crie um restaurante novo direto pelo painel, sem o cliente precisar
// passar pela tela de cadastro sozinho. Só funciona se quem chamar for de fato o Super Admin.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';
const ADMIN_EMAIL = 'alessandro.reval@hotmail.com';

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
    const { tokenAdmin, nome, restNome, whatsapp, cpfCnpj, email, senha, slug } = req.body || {};
    if (!tokenAdmin) return res.status(401).json({ error: 'Sessão inválida.' });

    // Confirma que quem está chamando é de fato o Super Admin
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenAdmin}` }
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida. Faça login de novo e tente outra vez.' });
    const userData = await userResp.json();
    if (userData.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Só o Super Admin pode cadastrar restaurantes por aqui.' });
    }

    if (!nome || !restNome || !whatsapp || !cpfCnpj || !email || !senha || !slug) {
      return res.status(400).json({ error: 'Preencha todos os campos.' });
    }
    if (senha.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

    const cpfCnpjLimpo = String(cpfCnpj).replace(/\D/g, '');
    const whatsappLimpo = String(whatsapp).replace(/\D/g, '');

    // Cria a conta de login do dono desse restaurante
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

    // Cria o restaurante em si
    const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify({ nome: restNome, whatsapp: whatsappLimpo, user_id: criaData.id, slug })
    });
    const restData = await restResp.json();
    if (!restResp.ok || !restData?.[0]) {
      return res.status(500).json({ error: 'Conta criada, mas houve erro ao criar o restaurante.', detalhe: JSON.stringify(restData) });
    }
    const novoRest = restData[0];

    await fetch(`${SUPABASE_URL}/rest/v1/restaurante_privado`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ restaurante_id: novoRest.id, cpf_cnpj: cpfCnpjLimpo })
    });

    // Semeia um cardápio de exemplo, igual ao cadastro normal
    try {
      const catResp = await fetch(`${SUPABASE_URL}/rest/v1/categorias`, {
        method: 'POST',
        headers: { ...svcHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({ restaurante_id: novoRest.id, nome: 'Exemplos (edite ou apague)' })
      });
      const catData = await catResp.json();
      const cat = catData?.[0];
      if (cat) {
        await fetch(`${SUPABASE_URL}/rest/v1/itens`, {
          method: 'POST',
          headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify([
            { restaurante_id: novoRest.id, categoria_id: cat.id, nome: 'Exemplo de prato', descricao: 'Troque o nome, a descrição, o preço e a foto pelos do seu produto de verdade', preco: 25.00, opcoes: null },
            { restaurante_id: novoRest.id, categoria_id: cat.id, nome: 'Exemplo com tamanhos e adicionais', descricao: 'Este item mostra como funcionam as opções: escolha um tamanho (preço muda sozinho) e marque adicionais (somam ao preço)', preco: 15.00, opcoes: [
              { nome: 'Tamanho', tipo: 'unica_preco', opcoes: [{ nome: 'Pequeno', preco: 15 }, { nome: 'Grande', preco: 25 }] },
              { nome: 'Adicionais', tipo: 'multipla', opcoes: [{ nome: 'Extra 1', preco: 3 }, { nome: 'Extra 2', preco: 3 }] }
            ] },
            { restaurante_id: novoRest.id, categoria_id: cat.id, nome: 'Exemplo de bebida', descricao: 'Apague este item quando cadastrar suas bebidas de verdade', preco: 6.00, opcoes: null }
          ])
        });
      }
    } catch (e) {
      // Se der erro aqui, não trava o cadastro — o restaurante já foi criado normalmente
    }

    return res.status(200).json({ ok: true, slug, restauranteId: novoRest.id });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
