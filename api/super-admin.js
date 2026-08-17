// Devolve detalhes protegidos de uma loja, ou ativa/desativa/estende teste — só se quem chamar for o Super Admin de verdade.
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
    const { acao, restauranteId, tokenAdmin, dias, planoTipo } = req.body || {};
    const acoesSemRestauranteId = ['exportar_dados', 'criar_restaurante'];
    if (!acao || !tokenAdmin || (!acoesSemRestauranteId.includes(acao) && !restauranteId)) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenAdmin}` }
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida' });
    const userData = await userResp.json();
    if (userData.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Só o Super Admin pode fazer isso.' });

    if (acao === 'exportar_dados') {
      // Busca todos os restaurantes + user_id
      const todosResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?select=id,user_id`, { headers: svcHeaders });
      const todos = await todosResp.json();

      // Busca todos os CPF/CNPJ protegidos de uma vez
      const privResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurante_privado?select=restaurante_id,cpf_cnpj`, { headers: svcHeaders });
      const privDataArr = await privResp.json();
      const cpfPorRestaurante = {};
      (Array.isArray(privDataArr) ? privDataArr : []).forEach(p => { cpfPorRestaurante[p.restaurante_id] = p.cpf_cnpj; });

      // Busca e-mail de cada dono (a Admin API não tem endpoint em lote, então faz um por um)
      const resultado = {};
      for (const r of (Array.isArray(todos) ? todos : [])) {
        let email = null;
        if (r.user_id) {
          try {
            const authResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${r.user_id}`, { headers: svcHeaders });
            if (authResp.ok) {
              const authData = await authResp.json();
              email = authData.email || null;
            }
          } catch (e) {}
        }
        resultado[r.id] = { email, cpfCnpj: cpfPorRestaurante[r.id] || null };
      }

      return res.status(200).json({ ok: true, dados: resultado });
    }

    if (acao === 'detalhes') {
      const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=user_id`, { headers: svcHeaders });
      const restData = await restResp.json();
      const dono = Array.isArray(restData) ? restData[0] : null;
      if (!dono) return res.status(404).json({ error: 'Restaurante não encontrado' });

      const privResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurante_privado?restaurante_id=eq.${restauranteId}&select=cpf_cnpj`, { headers: svcHeaders });
      const privData = await privResp.json();
      const cpfCnpj = Array.isArray(privData) && privData[0] ? privData[0].cpf_cnpj : null;

      let email = null;
      if (dono.user_id) {
        const authResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${dono.user_id}`, { headers: svcHeaders });
        if (authResp.ok) {
          const authData = await authResp.json();
          email = authData.email || null;
        }
      }
      return res.status(200).json({ ok: true, email, cpfCnpj });
    }

    if (acao === 'ativar' || acao === 'desativar') {
      const patchBody = { plano_ativo: acao === 'ativar' };
      if (acao === 'ativar' && planoTipo) patchBody.plano_tipo = planoTipo;
      await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
        method: 'PATCH',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify(patchBody)
      });
      return res.status(200).json({ ok: true });
    }

    if (acao === 'estender_teste') {
      const diasNum = Number.isFinite(parseInt(dias)) ? parseInt(dias) : 7;
      const buscaResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=trial_extra_dias`, { headers: svcHeaders });
      const buscaData = await buscaResp.json();
      const atual = Array.isArray(buscaData) && buscaData[0] ? (buscaData[0].trial_extra_dias || 0) : 0;
      await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
        method: 'PATCH',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ trial_extra_dias: atual + diasNum })
      });
      return res.status(200).json({ ok: true });
    }

    if (acao === 'criar_restaurante') {
      const { nome, restNome, whatsapp, cpfCnpj, email, senha, slug } = req.body || {};
      if (!nome || !restNome || !whatsapp || !cpfCnpj || !email || !senha || !slug) {
        return res.status(400).json({ error: 'Preencha todos os campos.' });
      }
      if (senha.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

      const cpfCnpjLimpo = String(cpfCnpj).replace(/\D/g, '');
      const whatsappLimpo = String(whatsapp).replace(/\D/g, '');

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
      } catch (e) {}

      fetch('https://servidelivery.com.br/api/notificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'boas_vindas', nomeRestaurante: restNome, email })
      }).catch(() => {});

      return res.status(200).json({ ok: true, slug, restauranteId: novoRest.id });
    }

    return res.status(400).json({ error: 'Ação desconhecida' });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
