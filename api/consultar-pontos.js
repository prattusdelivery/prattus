// Devolve os pontos de um cliente, protegido por senha — impede que qualquer um veja/resgate pontos de outra pessoa.
// Também devolve a chave Pix de UM restaurante específico (pra montar o QR code no checkout),
// o acompanhamento de UM pedido específico (pro cliente ver o status sem estar logado),
// e a nota média de avaliação de um restaurante — sem expor as tabelas inteiras (pedidos,
// restaurante_privado) pra consulta livre do navegador.
// Também cuida do PIX ONLINE (Mercado Pago): conectar a conta do restaurante, gerar o QR Code,
// conferir o pagamento e só então criar o pedido de verdade no painel (ações mp_conectar,
// mp_desconectar, pix_criar, pix_status e o aviso automático do Mercado Pago em ?mp=1).
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
    // Aviso automático do Mercado Pago ("o pagamento mudou") — chega por ?mp=1&r=<restaurante>
    if (req.query && req.query.mp) {
      return await tratarAvisoMP(req, res, headers);
    }

    const { acao, restauranteId, telefone, senha, pedidoId } = req.body || {};

    if (acao === 'mp_conectar' || acao === 'mp_desconectar') {
      return await mpConectar(req, res, headers, acao);
    }
    if (acao === 'pix_criar' || acao === 'pagamento_criar') {
      return await pixCriar(req, res, headers);
    }
    if (acao === 'pix_status') {
      return await pixStatus(req, res, headers);
    }

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


// =====================================================================
// PIX ONLINE — MERCADO PAGO (cada restaurante usa a PRÓPRIA conta; o dinheiro cai direto nela)
// =====================================================================
const MP_API = 'https://api.mercadopago.com';
const SITE = 'https://www.servidelivery.com.br';

function arredonda(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

async function mpChamar(caminho, token, opcoes = {}) {
  const resp = await fetch(MP_API + caminho, {
    ...opcoes,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
  });
  let data = null;
  try { data = await resp.json(); } catch (e) {}
  return { ok: resp.ok, status: resp.status, data };
}

async function tokenDoRestaurante(restauranteId, headers) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/restaurante_mp?restaurante_id=eq.${restauranteId}&select=access_token`, { headers });
  const d = await r.json();
  return Array.isArray(d) && d[0] ? d[0].access_token : null;
}

// Só o dono do restaurante pode conectar/desconectar a conta do Mercado Pago
async function mpConectar(req, res, headers, acao) {
  const { restauranteId, tokenDono, accessToken } = req.body || {};
  if (!restauranteId || !tokenDono) return res.status(400).json({ error: 'Dados incompletos' });

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenDono}` }
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida. Entre de novo no painel e tente outra vez.' });
  const user = await userResp.json();
  const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=user_id`, { headers });
  const rest = await restResp.json();
  if (!rest?.[0] || rest[0].user_id !== user.id) {
    return res.status(403).json({ error: 'Só o dono do restaurante pode mexer no pagamento online.' });
  }

  if (acao === 'mp_desconectar') {
    await fetch(`${SUPABASE_URL}/rest/v1/restaurante_mp?restaurante_id=eq.${restauranteId}`, { method: 'DELETE', headers });
    await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
      method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ pix_online_ativo: false })
    });
    return res.status(200).json({ ok: true });
  }

  const token = String(accessToken || '').trim();
  if (token.length < 20 || /\s/.test(token)) {
    return res.status(400).json({ error: 'Esse código parece incompleto. Copie o "Access Token" inteiro do Mercado Pago.' });
  }
  // Confere se o código funciona de verdade, perguntando ao Mercado Pago quem é o dono dele
  const conta = await mpChamar('/users/me', token);
  if (!conta.ok) {
    return res.status(400).json({ error: 'O Mercado Pago não aceitou esse código. Confira se copiou o "Access Token" de produção.' });
  }

  const salvou = await fetch(`${SUPABASE_URL}/rest/v1/restaurante_mp?on_conflict=restaurante_id`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ restaurante_id: restauranteId, access_token: token, atualizado_em: new Date().toISOString() })
  });
  if (!salvou.ok) return res.status(500).json({ error: 'Não consegui salvar. Tente de novo.' });
  const ligou = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
    method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ pix_online_ativo: true })
  });
  if (!ligou.ok) return res.status(500).json({ error: 'Conectou, mas não consegui ligar o pagamento online. Tente de novo.' });
  return res.status(200).json({ ok: true, conta: conta.data?.nickname || conta.data?.first_name || 'Mercado Pago' });
}

// Cliente escolheu "Pix online": confere o pedido, guarda como PENDENTE (ainda não aparece no painel)
// e pede ao Mercado Pago o QR Code. O pedido de verdade só nasce quando o pagamento for aprovado.
async function pixCriar(req, res, headers) {
  const { restauranteId, pedido, itens, cliente, metodo: metodoPedido } = req.body || {};
  const metodo = metodoPedido === 'cartao' ? 'cartao' : 'pix';
  if (!restauranteId || !pedido || !Array.isArray(itens) || itens.length === 0 || !cliente?.nome || !cliente?.telefone) {
    return res.status(400).json({ error: 'Dados do pedido incompletos.' });
  }
  if (itens.length > 80) return res.status(400).json({ error: 'Pedido grande demais.' });

  const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=id,nome,slug,pix_online_ativo,pausado_manual`, { headers });
  const rest = (await restResp.json())?.[0];
  if (!rest || !rest.pix_online_ativo) return res.status(400).json({ error: 'Este restaurante não está com pagamento online ligado.' });
  if (rest.pausado_manual) return res.status(400).json({ error: 'O restaurante pausou os pedidos agora. Tente mais tarde.' });
  const token = await tokenDoRestaurante(restauranteId, headers);
  if (!token) return res.status(400).json({ error: 'Pagamento online indisponível. Escolha outra forma de pagamento.' });

  // Confere os números do pedido
  let sub = 0;
  for (const it of itens) {
    const q = Number(it.quantidade), pr = Number(it.preco);
    if (!Number.isInteger(q) || q < 1 || q > 99 || !isFinite(pr) || pr < 0) {
      return res.status(400).json({ error: 'Item inválido no pedido.' });
    }
    sub += pr * q;
  }
  sub = arredonda(sub);
  const frete = arredonda(Math.max(0, Number(pedido.frete) || 0));
  const desconto = arredonda(Math.max(0, Number(pedido.desconto) || 0));
  const cashbackUsado = arredonda(Math.max(0, Number(pedido.cashback_usado) || 0));
  const total = arredonda(Math.max(0, sub + frete - desconto - cashbackUsado));
  if (Math.abs(total - Number(pedido.total)) > 0.011) {
    return res.status(400).json({ error: 'Os valores do pedido não batem. Atualize a página e tente de novo.' });
  }
  if (total < 1) return res.status(400).json({ error: 'Pedido abaixo de R$ 1,00 não pode ser pago por Pix online.' });

  // Os itens precisam ser mesmo desse restaurante
  const idsItens = [...new Set(itens.map(i => i.item_id).filter(Boolean))];
  if (idsItens.some(id => !/^[0-9a-f-]{36}$/i.test(String(id)))) return res.status(400).json({ error: 'Item inválido no pedido.' });
  if (idsItens.length) {
    const rI = await fetch(`${SUPABASE_URL}/rest/v1/itens?restaurante_id=eq.${restauranteId}&id=in.(${idsItens.join(',')})&select=id`, { headers });
    const dI = await rI.json();
    if (!Array.isArray(dI) || dI.length !== idsItens.length) return res.status(400).json({ error: 'Um item do pedido não existe mais. Atualize o cardápio.' });
  }

  // Se vai usar cashback, o saldo tem que existir
  if (cashbackUsado > 0) {
    const rC = await fetch(`${SUPABASE_URL}/rest/v1/clientes?restaurante_id=eq.${restauranteId}&telefone=eq.${encodeURIComponent(cliente.telefone)}&select=saldo_cashback`, { headers });
    const dC = await rC.json();
    if (!dC?.[0] || parseFloat(dC[0].saldo_cashback || 0) + 0.001 < cashbackUsado) {
      return res.status(400).json({ error: 'Seu saldo de cashback não é suficiente. Atualize a página.' });
    }
  }

  const id = crypto.randomUUID();
  const payload = {
    metodo,
    pedido: {
      endereco: String(pedido.endereco || ''), bairro: String(pedido.bairro || ''),
      frete, subtotal: sub, total, cashback_usado: cashbackUsado, observacao: String(pedido.observacao || '').slice(0, 2000)
    },
    itens: itens.map(i => ({
      item_id: i.item_id || null, nome: String(i.nome || '').slice(0, 200),
      preco: Number(i.preco), quantidade: Number(i.quantidade), observacao: i.observacao ? String(i.observacao).slice(0, 500) : null
    })),
    cliente: { nome: String(cliente.nome).slice(0, 120), telefone: String(cliente.telefone).slice(0, 30), dataNascimento: cliente.dataNascimento || null }
  };

  const ins = await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes`, {
    method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ id, restaurante_id: restauranteId, total, payload, status: 'pendente' })
  });
  if (!ins.ok) return res.status(500).json({ error: 'Não consegui iniciar o pagamento. Tente de novo.' });

  if (metodo === 'cartao') {
    if (!rest.slug) {
      await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${id}`, { method: 'DELETE', headers });
      return res.status(400).json({ error: 'Pagamento por cartão indisponível nesta loja.' });
    }
    const volta = `${SITE}/${rest.slug}?mp_retorno=${id}`;
    const venceCartao = new Date(Date.now() + 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00');
    const pref = await mpChamar('/checkout/preferences', token, {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id, title: `Pedido - ${rest.nome}`.slice(0, 120), quantity: 1, currency_id: 'BRL', unit_price: total }],
        external_reference: id,
        notification_url: `${SITE}/api/consultar-pontos?mp=1&r=${restauranteId}`,
        back_urls: { success: volta, failure: volta, pending: volta },
        auto_return: 'approved',
        // Só cartão de crédito, em 1x (Pix tem a opção própria; maquininha é "pagar na entrega")
        payment_methods: {
          excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }, { id: 'debit_card' }, { id: 'prepaid_card' }],
          installments: 1
        },
        statement_descriptor: 'SERVIDELIVERY',
        expires: true, expiration_date_to: venceCartao
      })
    });
    if (!pref.ok || !pref.data?.init_point) {
      await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${id}`, { method: 'DELETE', headers });
      await reportarErro(new Error('Mercado Pago recusou criar checkout: ' + JSON.stringify(pref.data || {}).slice(0, 400)), 'cartao-criar');
      return res.status(502).json({ error: 'O pagamento por cartão não pôde ser aberto agora. Tente de novo ou escolha outra forma.', detalhe: String(pref.data?.message || pref.data?.error || '') + ' ' + JSON.stringify(pref.data?.cause || []).slice(0, 300) });
    }
    return res.status(200).json({ ok: true, pendenteId: id, total, urlPagamento: pref.data.init_point });
  }

  const expira = new Date(Date.now() + 30 * 60 * 1000);
  const expiraMP = new Date(expira.getTime() - 3 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00');
  const partes = payload.cliente.nome.trim().split(/\s+/);
  const mp = await mpChamar('/v1/payments', token, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': id },
    body: JSON.stringify({
      transaction_amount: total,
      description: `Pedido - ${rest.nome}`.slice(0, 200),
      payment_method_id: 'pix',
      external_reference: id,
      notification_url: `${SITE}/api/consultar-pontos?mp=1&r=${restauranteId}`,
      date_of_expiration: expiraMP,
      payer: { email: `cliente+${id.slice(0, 8)}@servidelivery.com.br`, first_name: partes[0], last_name: partes.slice(1).join(' ') || partes[0] }
    })
  });
  const dadosPix = mp.data?.point_of_interaction?.transaction_data;
  if (!mp.ok || !dadosPix?.qr_code) {
    await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${id}`, { method: 'DELETE', headers });
    await reportarErro(new Error('Mercado Pago recusou criar Pix: ' + JSON.stringify(mp.data || {}).slice(0, 400)), 'pix-criar');
    return res.status(502).json({ error: 'O Pix não pôde ser gerado agora. Tente de novo ou escolha outra forma de pagamento.' });
  }
  await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${id}`, {
    method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ mp_payment_id: String(mp.data.id) })
  });
  return res.status(200).json({
    ok: true, pendenteId: id, total,
    qrCode: dadosPix.qr_code, qrCodeBase64: dadosPix.qr_code_base64 || null,
    expiraEm: expira.toISOString()
  });
}

// A tela do cliente pergunta de tempos em tempos: "já pagou?". A resposta vem do próprio Mercado Pago.
async function pixStatus(req, res, headers) {
  const { pendenteId } = req.body || {};
  if (!pendenteId || !/^[0-9a-f-]{36}$/i.test(String(pendenteId))) return res.status(400).json({ error: 'pendenteId inválido' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${pendenteId}&select=*`, { headers });
  const pend = (await r.json())?.[0];
  if (!pend) return res.status(404).json({ error: 'Pagamento não encontrado' });
  if (pend.status === 'pago') return res.status(200).json({ status: 'pago', pedidoId: pend.id });
  if (pend.status === 'expirado') return res.status(200).json({ status: 'expirado' });
  // Pagamento esquecido há mais de 90 minutos: encerra
  if (Date.now() - new Date(pend.criado_em).getTime() > 90 * 60 * 1000) {
    await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${pend.id}&status=eq.pendente`, {
      method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'expirado' })
    });
    return res.status(200).json({ status: 'expirado' });
  }

  const token = await tokenDoRestaurante(pend.restaurante_id, headers);
  if (!token) return res.status(200).json({ status: 'pendente' });
  let dadosPag = null;
  if (pend.mp_payment_id) {
    const mp = await mpChamar(`/v1/payments/${pend.mp_payment_id}`, token);
    if (!mp.ok) return res.status(200).json({ status: 'pendente' });
    dadosPag = mp.data;
  } else {
    // Cartão (Checkout Pro): ainda não sabemos o número do pagamento, então procuramos pelo nosso código
    const busca = await mpChamar(`/v1/payments/search?external_reference=${pend.id}&sort=date_created&criteria=desc`, token);
    const lista = busca.data?.results || [];
    dadosPag = lista.find(x => x.status === 'approved') || lista[0] || null;
    if (!dadosPag) return res.status(200).json({ status: 'pendente' });
  }
  const resultado = await conferirEConfirmar(pend, dadosPag, headers);
  return res.status(200).json({ status: resultado, pedidoId: resultado === 'pago' ? pend.id : undefined });
}

// O Mercado Pago avisa que algo mudou num pagamento (mesmo se o cliente fechou a tela)
async function tratarAvisoMP(req, res, headers) {
  try {
    const restauranteId = String(req.query.r || '');
    const idPag = (req.body && req.body.data && req.body.data.id) || req.query['data.id'] || req.query.id;
    const tipo = (req.body && req.body.type) || req.query.type || req.query.topic;
    if (!/^[0-9a-f-]{36}$/i.test(restauranteId) || !idPag || (tipo && tipo !== 'payment')) {
      return res.status(200).json({ ok: true });
    }
    const token = await tokenDoRestaurante(restauranteId, headers);
    if (!token) return res.status(200).json({ ok: true });
    // Não confiamos no aviso: perguntamos o pagamento ao Mercado Pago com a chave do restaurante
    const mp = await mpChamar(`/v1/payments/${encodeURIComponent(idPag)}`, token);
    if (!mp.ok || !mp.data?.external_reference) return res.status(200).json({ ok: true });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${mp.data.external_reference}&restaurante_id=eq.${restauranteId}&select=*`, { headers });
    const pend = (await r.json())?.[0];
    if (pend && pend.status === 'pendente') await conferirEConfirmar(pend, mp.data, headers);
    return res.status(200).json({ ok: true });
  } catch (e) {
    await reportarErro(e, 'mp-aviso');
    return res.status(200).json({ ok: true });
  }
}

async function conferirEConfirmar(pend, pagamento, headers) {
  if (pagamento.status === 'approved') {
    const valorOk = Math.abs(Number(pagamento.transaction_amount) - Number(pend.total)) < 0.011;
    if (pagamento.external_reference !== pend.id || !valorOk) {
      await reportarErro(new Error(`Pix aprovado não bate com o pedido ${pend.id}`), 'pix-confere');
      return 'pendente';
    }
    await criarPedidoPago(pend, headers);
    return 'pago';
  }
  if (pend.payload?.metodo === 'cartao' && ['cancelled', 'rejected'].includes(pagamento.status)) {
    return 'pendente'; // pode tentar outro cartão; se não pagar, expira sozinho depois de 90 min
  }
  if (['cancelled', 'rejected', 'expired'].includes(pagamento.status) ||
      (pagamento.date_of_expiration && new Date(pagamento.date_of_expiration) < new Date(Date.now() - 60 * 1000) && pagamento.status === 'pending')) {
    await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${pend.id}&status=eq.pendente`, {
      method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'expirado' })
    });
    return 'expirado';
  }
  return 'pendente';
}

// Pagamento aprovado: cria cliente/pedido/itens de verdade. A "reserva" (status processando)
// garante que, mesmo com o aviso e a tela chegando juntos, o pedido nasce uma vez só.
async function criarPedidoPago(pend, headers) {
  const reserva = await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${pend.id}&status=eq.pendente`, {
    method: 'PATCH', headers: { ...headers, 'Prefer': 'return=representation' }, body: JSON.stringify({ status: 'processando' })
  });
  const reservado = await reserva.json();
  if (!Array.isArray(reservado) || reservado.length === 0) return; // outro já está cuidando / já foi

  try {
    const { pedido, itens, cliente } = pend.payload;
    const rId = pend.restaurante_id;

    const rRest = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${rId}&select=cashback_percentual`, { headers });
    const pct = parseFloat((await rRest.json())?.[0]?.cashback_percentual || 0);

    // Cliente (mesma regra do registrar-cliente)
    const rC = await fetch(`${SUPABASE_URL}/rest/v1/clientes?restaurante_id=eq.${rId}&telefone=eq.${encodeURIComponent(cliente.telefone)}&select=*`, { headers });
    const existente = (await rC.json())?.[0];
    let clienteId;
    if (existente) {
      clienteId = existente.id;
      await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}`, {
        method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          nome: cliente.nome || existente.nome,
          total_gasto: parseFloat(existente.total_gasto || 0) + Number(pend.total),
          total_pedidos: (existente.total_pedidos || 0) + 1,
          saldo_cashback: Math.max(0, parseFloat(existente.saldo_cashback || 0) - (pedido.cashback_usado || 0)),
          data_nascimento: existente.data_nascimento || cliente.dataNascimento || null
        })
      });
    } else {
      const novo = await fetch(`${SUPABASE_URL}/rest/v1/clientes`, {
        method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ restaurante_id: rId, nome: cliente.nome, telefone: cliente.telefone, total_gasto: Number(pend.total), total_pedidos: 1, saldo_cashback: 0, data_nascimento: cliente.dataNascimento || null })
      });
      const dNovo = await novo.json();
      clienteId = Array.isArray(dNovo) ? dNovo[0]?.id : null;
    }

    const cashbackACreditar = pct > 0 ? arredonda(Number(pend.total) * (pct / 100)) : null;
    const insPed = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
      method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        id: pend.id, restaurante_id: rId, cliente_id: clienteId, status: 'novo',
        endereco: pedido.endereco, bairro: pedido.bairro, frete: pedido.frete, subtotal: pedido.subtotal, total: pedido.total,
        cashback_usado: pedido.cashback_usado, cashback_a_creditar: cashbackACreditar, cashback_creditado: false,
        observacao: pedido.observacao
      })
    });
    if (!insPed.ok) throw new Error('Falha ao criar pedido pago: ' + (await insPed.text()).slice(0, 300));

    const insIt = await fetch(`${SUPABASE_URL}/rest/v1/pedido_itens`, {
      method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(itens.map(i => ({ pedido_id: pend.id, item_id: i.item_id, nome: i.nome, preco: i.preco, quantidade: i.quantidade, observacao: i.observacao })))
    });
    if (!insIt.ok) throw new Error('Falha ao criar itens do pedido pago: ' + (await insIt.text()).slice(0, 300));

    await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${pend.id}`, {
      method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'pago', pago_em: new Date().toISOString() })
    });

    // Avisa o restaurante (push), igual aos pedidos normais
    fetch(`${SITE}/api/notificar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'pedido', restauranteId: rId, titulo: (pend.payload?.metodo === 'cartao' ? '🛵 Novo pedido PAGO no cartão!' : '🛵 Novo pedido PAGO no Pix!'),
        corpo: `Pedido #${pend.id.slice(-6).toUpperCase()} — R$ ${Number(pend.total).toFixed(2).replace('.', ',')} (já pago)`
      })
    }).catch(() => {});
  } catch (e) {
    // Deu erro no meio: desfaz o que sobrou e devolve pra "pendente" pra tentar de novo no próximo aviso
    await fetch(`${SUPABASE_URL}/rest/v1/pedido_itens?pedido_id=eq.${pend.id}`, { method: 'DELETE', headers }).catch(() => {});
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pend.id}`, { method: 'DELETE', headers }).catch(() => {});
    await fetch(`${SUPABASE_URL}/rest/v1/pagamentos_pendentes?id=eq.${pend.id}`, {
      method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'pendente' })
    }).catch(() => {});
    await reportarErro(e, 'pix-criar-pedido-pago');
    throw e;
  }
}
