// ===== MÓDULO PEDIDOS E COMANDAS =====
// Extraído de prattus.html pra deixar o arquivo principal menor. Pedidos e Comandas
// compartilham muita lógica (mesmo card, mesmos botões de status), por isso vieram juntos.
// Usa as mesmas variáveis globais do arquivo principal (db, restauranteAtual, esc, toast,
// abrirModal, fecharModal, comandaAtual, modoComandaAtivo, paginaAtual).

// ===== MODO COMANDA (garçom) =====
async function carregarModoComanda(comandaId) {
  const { data: codigo, error } = await db.from('codigos_comanda').select('*').eq('id', comandaId).maybeSingle();
  if (error || !codigo) {
    alert('Código de comanda não encontrado ou inválido.');
    return;
  }
  if (codigo.restaurante_id !== restauranteAtual.id) {
    alert('Esse código de comanda não pertence a esse restaurante.');
    return;
  }

  let historicoId = null;
  if (codigo.status !== 'em_uso') {
    // Comanda nova. Aqui (e só aqui) dá pra "Pular" o número da mesa — serve pro restaurante
    // por peso: a atendente da balança lança o prato e o garçom informa a mesa depois.
    const resp = await perguntarMesaComanda({ titulo: 'Código livre! Qual o número da mesa?', podePular: true });
    if (!resp) return;
    const mesaNova = resp.pular ? null : resp.mesa;
    const abertaEm = new Date().toISOString();
    const { error: erroAbrir } = await db.from('codigos_comanda').update({
      status: 'em_uso', mesa: mesaNova, aberta_em: abertaEm
    }).eq('id', comandaId);
    if (erroAbrir) { alert('Erro ao abrir a comanda. Tente de novo.'); return; }
    codigo.mesa = mesaNova;
    codigo.aberta_em = abertaEm;

    // Guarda um registro permanente dessa abertura — sobrevive mesmo depois da mesa fechar,
    // pra contar corretamente quantas comandas foram abertas por dia/mês
    const { data: historico } = await db.from('comandas_historico').insert({
      restaurante_id: restauranteAtual.id, codigo_comanda_id: codigo.id, mesa: codigo.mesa
    }).select().single();
    historicoId = historico?.id || null;
  } else {
    // Mesa já estava aberta (garçom voltou pra adicionar mais itens) — reaproveita o
    // registro de histórico já criado, não cria um novo
    const { data: historicoExistente } = await db.from('comandas_historico')
      .select('id').eq('codigo_comanda_id', codigo.id).is('fechada_em', null)
      .order('aberta_em', {ascending: false}).limit(1).maybeSingle();
    historicoId = historicoExistente?.id || null;

    // Comanda aberta SEM mesa (veio da balança): a pergunta da mesa abre sempre, sem "Pular",
    // até alguém informar. Exceções: se ainda não tem nenhum pedido (ainda está na balança),
    // pode pular de novo; e o gerente/caixa pode seguir sem mesa só pra fechar a conta.
    if (!codigo.mesa) {
      let semPedidos = true;
      try {
        const { count } = await db.from('pedidos').select('id', { count: 'exact', head: true })
          .eq('codigo_comanda_id', codigo.id).gte('criado_em', codigo.aberta_em || '1970-01-01');
        semPedidos = (count || 0) === 0;
      } catch (e) {}
      const resp = await perguntarMesaComanda({
        titulo: 'Essa comanda ainda está sem mesa. Qual o número da mesa?',
        podePular: semPedidos,
        podeSeguirSemMesa: !semPedidos && meuPapel !== 'garcom'
      });
      if (!resp) return;
      if (resp.mesa) {
        const ok = await informarMesaDaComanda(codigo, resp.mesa, historicoId);
        if (!ok) return;
        codigo.mesa = resp.mesa;
      }
    }
  }

  comandaAtual = { id: codigo.id, mesa: codigo.mesa, historicoId, abertaEm: codigo.aberta_em || null, totalFechamento: null };
  modoComandaAtivo = true;
  carrinho = [];

  const [{ data: rest }, { data: itens }, { data: cats }, { data: etiquetasData }] = await Promise.all([
    db.from('restaurantes').select('*').eq('id', restauranteAtual.id).single(),
    db.from('itens').select('*').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('nome'),
    db.from('categorias').select('*').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('ordem'),
    db.from('etiquetas').select('*').eq('restaurante_id', restauranteAtual.id)
  ]);

  restPublico = rest;
  todosItensPublico = itens || [];
  categorias = cats || [];
  etiquetasCache = etiquetasData || [];

  document.getElementById('pub-rest-nome').textContent = textoMesa(codigo.mesa);
  document.getElementById('pub-rest-sub').textContent = '📋 Comanda do garçom';
  const infoBar = document.getElementById('pub-info-bar');
  if (infoBar) infoBar.innerHTML = `
    <button onclick="sairModoComanda()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;">← Voltar pro painel</button>
  `;
  const fechado = document.getElementById('pub-fechado');
  if (fechado) fechado.style.display = 'none';
  const rodapePriv = document.getElementById('pub-rodape-privacidade');
  if (rodapePriv) rodapePriv.style.display = 'none';

  const catsEl = document.getElementById('pub-cats');
  catsEl.innerHTML = `<div class="pub-cat ativo" onclick="filtrarCat('todas',this)">Todos</div>` +
    (cats||[]).map(c => `<div class="pub-cat" onclick="filtrarCat('${c.id}',this)">${esc(c.nome)}</div>`).join('');
  renderItensPublico(itens||[]);

  const rankingWrap = document.getElementById('pub-ranking-wrap');
  if (rankingWrap) {
    if (meuPapel === 'garcom') {
      // Garçom / atendente da balança: botões do prato por peso e do Livre
      const precoLivre = parseFloat(rest?.comanda_livre_preco) || 0;
      rankingWrap.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px;">
          <button onclick="adicionarPratoPorPeso()" style="flex:1;min-width:140px;background:var(--laranja);color:#fff;border:none;border-radius:12px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;">⚖️ Prato por peso</button>
          <button onclick="adicionarPratoLivre()" style="flex:1;min-width:140px;background:#0F6E56;color:#fff;border:none;border-radius:12px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;">♾️ Livre${precoLivre ? ' — R$ ' + precoLivre.toFixed(2).replace('.', ',') : ''}</button>
        </div>`;
    } else {
      // Caixa / dono: botão grande pra fechar a conta
      rankingWrap.innerHTML = `
        <div style="padding:10px 16px;">
          <button onclick="abrirFechamentoComanda()" style="width:100%;background:#0F6E56;color:#fff;border:none;border-radius:14px;padding:18px;font-size:19px;font-weight:800;cursor:pointer;letter-spacing:.3px;box-shadow:0 3px 10px rgba(0,0,0,.2);">💰 FECHAR CONTA</button>
        </div>`;
    }
  }

  mostrarTela('cliente');
  atualizarCarrinho();
  toast(`Comanda aberta — ${textoMesa(codigo.mesa)}`, 'ok');
}

// ===== COMANDA SEM MESA / PRATO POR PESO / LIVRE =====
function textoMesa(mesa) {
  return mesa ? `Mesa ${mesa}` : 'Sem mesa';
}

// Janelinha que pergunta o número da mesa. Devolve: {mesa:'12'}, {pular:true}, {semMesa:true} ou null (cancelou).
function perguntarMesaComanda({ titulo, podePular, podeSeguirSemMesa }) {
  return new Promise(resolve => {
    const fundo = document.createElement('div');
    fundo.className = 'modal-overlay aberto';
    fundo.style.zIndex = '9999';
    fundo.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <div class="modal-titulo" style="margin-bottom:14px;">${esc(titulo)}</div>
        <input type="text" id="mesa-comanda-input" name="mesa_comanda_numero" placeholder="Número da mesa" autocomplete="off" style="width:100%;font-size:20px;text-align:center;padding:12px;margin-bottom:14px;">
        <button id="mesa-comanda-ok" style="width:100%;background:var(--laranja);color:#fff;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:8px;">✅ Confirmar mesa</button>
        ${podePular ? `<button id="mesa-comanda-pular" style="width:100%;background:#fff;color:var(--laranja);border:2px solid var(--laranja);border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px;">⏭️ Pular (a mesa será informada depois)</button>` : ''}
        ${podeSeguirSemMesa ? `<button id="mesa-comanda-sem" style="width:100%;background:#fff;color:#444;border:1px solid #ccc;border-radius:10px;padding:12px;font-size:14px;cursor:pointer;margin-bottom:8px;">Seguir sem mesa (só pra fechar a conta)</button>` : ''}
        <button id="mesa-comanda-cancela" style="width:100%;background:none;color:#888;border:none;padding:10px;font-size:13px;cursor:pointer;">Cancelar</button>
      </div>`;
    document.body.appendChild(fundo);
    window.__aguardandoUsuario = true;
    const campo = fundo.querySelector('#mesa-comanda-input');
    setTimeout(() => campo.focus(), 50);
    const fechar = (valor) => { window.__aguardandoUsuario = false; fundo.remove(); resolve(valor); };
    const confirmar = () => {
      const m = campo.value.trim();
      if (!m) { campo.style.border = '2px solid #C00000'; campo.focus(); return; }
      fechar({ mesa: m });
    };
    fundo.querySelector('#mesa-comanda-ok').onclick = confirmar;
    campo.addEventListener('keydown', e => { if (e.key === 'Enter') confirmar(); });
    fundo.querySelector('#mesa-comanda-pular')?.addEventListener('click', () => fechar({ pular: true }));
    fundo.querySelector('#mesa-comanda-sem')?.addEventListener('click', () => fechar({ semMesa: true }));
    fundo.querySelector('#mesa-comanda-cancela').onclick = () => fechar(null);
  });
}

// Garçom informou a mesa de uma comanda que estava sem mesa: atualiza a comanda, o histórico e os pedidos já lançados
async function informarMesaDaComanda(codigo, mesa, historicoId) {
  const { error } = await db.from('codigos_comanda').update({ mesa }).eq('id', codigo.id);
  if (error) { alert('Erro ao salvar a mesa. Tente de novo.'); return false; }
  try {
    if (historicoId) await db.from('comandas_historico').update({ mesa }).eq('id', historicoId);
    const { data: peds } = await db.from('pedidos').select('id,observacao')
      .eq('codigo_comanda_id', codigo.id).gte('criado_em', codigo.aberta_em || '1970-01-01');
    for (const p of (peds || [])) {
      await db.from('pedidos').update({
        endereco: `Mesa ${mesa}`,
        observacao: (p.observacao || '').replace('Comanda — Sem mesa', `Comanda — Mesa ${mesa}`)
      }).eq('id', p.id);
    }
  } catch (e) { console.error('Erro ao atualizar pedidos com a mesa:', e); }
  return true;
}

function lerValorEmReais(texto) {
  let s = String(texto || '').replace(/[^\d,.]/g, '');
  s = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s; // "11,89" ou "1.234,50" ou "11.89"
  const v = parseFloat(s);
  return (isFinite(v) && v > 0 && v < 10000) ? Math.round(v * 100) / 100 : null;
}

function adicionarPratoPorPeso() {
  const txt = prompt('Qual o valor do prato? (ex: 11,89)');
  if (txt === null) return;
  const valor = lerValorEmReais(txt);
  if (!valor) { toast('Valor inválido. Digite assim: 11,89', 'erro'); return; }
  carrinho.push({ id: 'especial-peso-' + Date.now(), especial: true, nome: 'Prato por peso', preco: valor, qtd: 1, obs: '' });
  atualizarCarrinho();
  toast(`Prato por peso — R$ ${valor.toFixed(2).replace('.', ',')} adicionado!`);
}

function adicionarPratoLivre() {
  let valor = parseFloat(restPublico?.comanda_livre_preco) || 0;
  if (!valor) {
    const txt = prompt('Qual o valor do prato Livre? (ex: 20,00)\nDica: fixe esse valor em Configurações.');
    if (txt === null) return;
    valor = lerValorEmReais(txt);
    if (!valor) { toast('Valor inválido. Digite assim: 20,00', 'erro'); return; }
  }
  carrinho.push({ id: 'especial-livre-' + Date.now(), especial: true, nome: 'Prato Livre', preco: valor, qtd: 1, obs: '' });
  atualizarCarrinho();
  toast(`Prato Livre — R$ ${valor.toFixed(2).replace('.', ',')} adicionado!`);
}

var comandaEmAndamento = false;
async function finalizarComanda() {
  if (comandaEmAndamento) return;
  comandaEmAndamento = true;
  const btnEnvio = document.getElementById('btn-finalizar-pedido');
  const textoOriginalBtn = btnEnvio ? btnEnvio.textContent : '';
  if (btnEnvio) { btnEnvio.disabled = true; btnEnvio.textContent = 'Enviando...'; }
  try {
    await finalizarComandaInterno();
  } finally {
    comandaEmAndamento = false;
    if (btnEnvio) { btnEnvio.disabled = false; btnEnvio.textContent = textoOriginalBtn; }
  }
}

async function finalizarComandaInterno(jaConfirmado) {
  if (carrinho.length === 0) { toast('Adicione itens antes de enviar.', 'erro'); return; }

  const sub = carrinho.reduce((s,i) => s + parseFloat(i.preco) * i.qtd, 0);
  const obsGeral = document.getElementById('ped-obs')?.value || '';

  // Só prato por peso / Livre = não precisa ir pra cozinha: já entra como finalizado
  const soEspeciais = carrinho.every(i => i.especial);

  const dadosPedido = {
    restaurante_id: restauranteAtual.id,
    status: soEspeciais ? 'entregue' : (jaConfirmado ? 'preparando' : 'novo'),
    endereco: textoMesa(comandaAtual.mesa),
    bairro: 'Salão',
    frete: 0, subtotal: sub, total: sub,
    codigo_comanda_id: comandaAtual.id,
    observacao: `Comanda — ${textoMesa(comandaAtual.mesa)}${obsGeral ? '\nObs: '+obsGeral : ''}`
  };
  if (jaConfirmado || soEspeciais) dadosPedido.aceito_em = new Date().toISOString();

  const { data: pedido, error } = await db.from('pedidos').insert(dadosPedido).select().single();

  if (error || !pedido) { toast('Erro ao enviar pedido. Tente de novo.', 'erro'); return; }

  const { error: erroItens } = await db.from('pedido_itens').insert(carrinho.map(i => ({
    pedido_id: pedido.id, item_id: (i.resgate || i.especial) ? null : i.id, nome: i.nome,
    preco: i.preco, quantidade: i.qtd, observacao: [i.variacao, i.obs].filter(Boolean).join(' · ') || null
  })));
  if (erroItens) console.error('Erro ao salvar itens da comanda:', erroItens);

  carrinho = [];
  atualizarCarrinho();
  fecharModal('modal-carrinho');
  if (document.getElementById('ped-obs')) document.getElementById('ped-obs').value = '';
  toast(soEspeciais ? `Prato lançado na comanda — ${textoMesa(comandaAtual.mesa)}! ✅` : `Pedido enviado pra cozinha — ${textoMesa(comandaAtual.mesa)}! 🍽️`, 'ok');
}

function sairModoComanda() {
  modoComandaAtivo = false;
  comandaAtual = null;
  carrinho = [];
  const url = new URL(window.location.href);
  url.searchParams.delete('comanda');
  window.history.replaceState({}, '', url.pathname);
  mostrarTela('painel');
  irPara(paginaInicialDoPapel());
}

async function abrirFechamentoComanda() {
  if (meuPapel === 'garcom') { toast('Só o gerente/caixa fecha a conta.', 'erro'); return; }
  if (!comandaAtual) return;

  // Se tiver item ainda no carrinho (adicionado mas não enviado), manda pra mesa
  // automaticamente antes de mostrar o resumo — evita item "esquecido" e cobrado errado.
  if (carrinho.length > 0) {
    toast('Enviando itens pendentes pra mesa antes de fechar...', 'ok');
    await finalizarComandaInterno(true);
  }

  document.getElementById('fechar-comanda-mesa').textContent = textoMesa(comandaAtual.mesa);
  document.getElementById('fechar-comanda-lista').innerHTML = 'Carregando...';
  document.getElementById('fechar-comanda-total').textContent = 'R$ 0,00';
  abrirModal('modal-fechar-comanda');

  const comTimeout = (promessa) => Promise.race([
    promessa,
    new Promise((_, rej) => setTimeout(() => rej(new Error('demorou_demais')), 15000))
  ]);

  let codigo, pedidos;
  try {
    if (comandaAtual.abertaEm) {
      codigo = { aberta_em: comandaAtual.abertaEm };
    } else {
      const r1 = await comTimeout(db.from('codigos_comanda').select('aberta_em').eq('id', comandaAtual.id).single());
      codigo = r1.data;
      comandaAtual.abertaEm = codigo?.aberta_em || null;
    }
    const r2 = await comTimeout(db.from('pedidos')
      .select('id,total,criado_em,pedido_itens(nome,quantidade,preco)')
      .eq('codigo_comanda_id', comandaAtual.id)
      .gte('criado_em', codigo?.aberta_em)
      .order('criado_em'));
    pedidos = r2.data;
  } catch (e) {
    document.getElementById('fechar-comanda-lista').innerHTML = '<div class="empty"><div class="empty-txt">Demorou demais pra carregar. Feche essa janela e tente de novo — se continuar acontecendo, avise o suporte.</div></div>';
    return;
  }

  const lista = document.getElementById('fechar-comanda-lista');
  if (!pedidos || pedidos.length === 0) {
    lista.innerHTML = '<div class="empty"><div class="empty-txt">Nenhum pedido registrado ainda nessa visita.</div></div>';
    comandaAtual.totalFechamento = 0;
    return;
  }

  const itensAgrupados = {};
  let total = 0;
  pedidos.forEach(p => {
    total += parseFloat(p.total || 0);
    (p.pedido_itens || []).forEach(i => {
      if (!itensAgrupados[i.nome]) itensAgrupados[i.nome] = { qtd: 0, preco: parseFloat(i.preco) };
      itensAgrupados[i.nome].qtd += i.quantidade;
    });
  });

  lista.innerHTML = Object.entries(itensAgrupados).map(([nome, info]) => `
    <div class="frete-row">
      <span>${info.qtd}x ${esc(nome)}</span>
      <span style="font-weight:600;">R$ ${(info.preco * info.qtd).toFixed(2).replace('.',',')}</span>
    </div>
  `).join('');
  document.getElementById('fechar-comanda-total').textContent = 'R$ ' + total.toFixed(2).replace('.',',');
  comandaAtual.totalFechamento = total;
}

async function confirmarFechamentoComanda(btn) {
  if (meuPapel === 'garcom') { toast('Só o gerente/caixa fecha a conta.', 'erro'); return; }
  if (!comandaAtual) return;
  if (btn && btn.disabled) return;
  if (!confirm('Confirma o pagamento e libera essa mesa pra um novo cliente?')) return;
  const textoBtn = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Fechando a conta...'; }
  const reabilita = () => { if (btn) { btn.disabled = false; btn.textContent = textoBtn; } };

  // Total já calculado na tela de fechamento; só recalcula se por algum motivo não tiver
  let totalFechamento = comandaAtual.totalFechamento;
  if (totalFechamento === null || totalFechamento === undefined) {
    const { data: pedidosFechando } = await db.from('pedidos').select('total')
      .eq('codigo_comanda_id', comandaAtual.id).gte('criado_em', comandaAtual.abertaEm || '1970-01-01');
    totalFechamento = (pedidosFechando||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);
  }

  // Histórico e liberação da mesa ao mesmo tempo (mais rápido)
  const [, resLiberar] = await Promise.all([
    comandaAtual.historicoId
      ? db.from('comandas_historico').update({ fechada_em: new Date().toISOString(), total: totalFechamento }).eq('id', comandaAtual.historicoId)
      : Promise.resolve(),
    db.from('codigos_comanda').update({ status: 'livre', mesa: null, aberta_em: null }).eq('id', comandaAtual.id)
  ]);

  if (resLiberar && resLiberar.error) { toast('Erro ao liberar a mesa. Tente de novo.', 'erro'); reabilita(); return; }

  reabilita();
  fecharModal('modal-fechar-comanda');
  toast('Conta fechada e mesa liberada!', 'ok');
  sairModoComanda();
}


async function autoFinalizarEntregasAntigas() {
  if (!restauranteAtual) return;
  const limite = new Date(Date.now() - 30*60*1000).toISOString();
  await db.from('pedidos').update({ status: 'entregue' })
    .eq('restaurante_id', restauranteAtual.id).eq('status', 'entrega').lt('saiu_entrega_em', limite);
}

async function renderDashboard() {
  await autoFinalizarEntregasAntigas();
  if (!restauranteAtual) return;
  const rid = restauranteAtual.id;

  // Todas as buscas ao mesmo tempo (antes eram uma de cada vez e a tela demorava)
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const okStatus = ['preparando','entrega','entregue'];
  const [
    { data: pedHoje }, { data: pedMes }, { data: comandaHoje }, { data: comandaMes },
    { data: comandaFatHoje }, { data: comandaFatMes }, { data: clientes },
    { data: pedidosDelivery }, { data: pedidosComanda }
  ] = await Promise.all([
    db.from('pedidos').select('total').eq('restaurante_id', rid).in('status', okStatus).is('codigo_comanda_id', null).gte('criado_em', inicioDoDiaLocal()),
    db.from('pedidos').select('total').eq('restaurante_id', rid).in('status', okStatus).is('codigo_comanda_id', null).gte('criado_em', inicioMes),
    db.from('pedidos').select('id').eq('restaurante_id', rid).in('status', okStatus).not('codigo_comanda_id', 'is', null).gte('criado_em', inicioDoDiaLocal()),
    db.from('pedidos').select('id').eq('restaurante_id', rid).in('status', okStatus).not('codigo_comanda_id', 'is', null).gte('criado_em', inicioMes),
    db.from('pedidos').select('total').eq('restaurante_id', rid).in('status', okStatus).not('codigo_comanda_id', 'is', null).gte('criado_em', inicioDoDiaLocal()),
    db.from('pedidos').select('total').eq('restaurante_id', rid).in('status', okStatus).not('codigo_comanda_id', 'is', null).gte('criado_em', inicioMes),
    db.from('clientes').select('id').eq('restaurante_id', rid),
    db.from('pedidos').select('*,clientes(nome),pedido_itens(nome,quantidade,preco)').eq('restaurante_id', rid).is('codigo_comanda_id', null).order('criado_em', {ascending:false}).limit(5),
    db.from('pedidos').select('*,clientes(nome),pedido_itens(nome,quantidade,preco)').eq('restaurante_id', rid).not('codigo_comanda_id', 'is', null).order('criado_em', {ascending:false}).limit(5)
  ]);

  const fatHoje = (pedHoje||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);
  const fatMes = (pedMes||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);
  const fatComandaHoje = (comandaFatHoje||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);
  const fatComandaMes = (comandaFatMes||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);
  const ticketMedio = pedHoje && pedHoje.length ? (fatHoje / pedHoje.length) : 0;
  const ticketMedioComanda = comandaHoje && comandaHoje.length ? (fatComandaHoje / comandaHoje.length) : 0;
  const fatTotalHoje = fatHoje + fatComandaHoje;
  const fatTotalMes = fatMes + fatComandaMes;

  document.getElementById('conteudo').innerHTML = `
    <div style="font-size:13px;font-weight:700;color:var(--texto-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">🛵 Delivery</div>
    <div class="metricas">
      <div class="metrica"><div class="metrica-label">Pedidos hoje</div><div class="metrica-val">${(pedHoje||[]).length}</div></div>
      <div class="metrica"><div class="metrica-label">Faturamento hoje</div><div class="metrica-val laranja">R$ ${fatHoje.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica"><div class="metrica-label">Ticket médio</div><div class="metrica-val">R$ ${ticketMedio.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica"><div class="metrica-label">Faturamento do mês</div><div class="metrica-val">R$ ${fatMes.toFixed(2).replace('.',',')}</div></div>
    </div>

    <div style="font-size:13px;font-weight:700;color:var(--texto-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">🍽️ Comandas</div>
    <div class="metricas">
      <div class="metrica"><div class="metrica-label">Comandas hoje</div><div class="metrica-val">${(comandaHoje||[]).length}</div></div>
      <div class="metrica"><div class="metrica-label">Faturamento comandas hoje</div><div class="metrica-val laranja">R$ ${fatComandaHoje.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica"><div class="metrica-label">Ticket médio comandas</div><div class="metrica-val">R$ ${ticketMedioComanda.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica"><div class="metrica-label">Faturamento comandas no mês</div><div class="metrica-val">R$ ${fatComandaMes.toFixed(2).replace('.',',')}</div></div>
    </div>

    <div style="font-size:13px;font-weight:700;color:var(--texto-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">💰 Total geral (delivery + comandas)</div>
    <div class="metricas">
      <div class="metrica"><div class="metrica-label">Faturamento total hoje</div><div class="metrica-val laranja">R$ ${fatTotalHoje.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica"><div class="metrica-label">Faturamento total do mês</div><div class="metrica-val laranja">R$ ${fatTotalMes.toFixed(2).replace('.',',')}</div></div>
    </div>

    <div style="font-size:13px;font-weight:700;color:var(--texto-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">👥 Clientes</div>
    <div class="metricas" style="margin-bottom:24px;">
      <div class="metrica">
        <div class="metrica-label">Clientes cadastrados</div>
        <div class="metrica-val">${(clientes||[]).length}</div>
        <button class="btn-sm" style="margin-top:6px;" onclick="resetarFormCliente();abrirModal('modal-cadastro-cliente')">+ Cadastrar cliente</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
    <div class="card">
      <div class="card-titulo">Últimos pedidos</div>
      ${(pedidosDelivery||[]).length === 0 ? '<div class="empty"><div class="empty-ico">🛵</div><div class="empty-txt">Nenhum pedido ainda</div></div>' :
        (pedidosDelivery||[]).map(p => `
          <div class="pedido-card">
            <div class="pedido-info">
              <div class="pedido-num">#${p.id.slice(-4).toUpperCase()} — ${esc(p.observacao?.split('Nome:')[1]?.split('\n')[0]?.trim() || p.clientes?.nome || 'Cliente')}${(p.observacao||'').includes('JÁ PAGO') ? ' <span style="background:#0F6E56;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;">✅ PAGO ' + ((p.observacao||'').includes('Cartão online') ? 'NO CARTÃO' : 'NO PIX') + '</span>' : badgeNaoPago(p)}${badgeRetirada(p)}${textoAgendamento(p) ? ' <span style="background:#FFD60A;color:#C00000;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;border:1px solid #C00000;">⏰ AGENDADO ' + esc(textoAgendamento(p)) + '</span>' : ''}</div>
              <div class="pedido-cliente">${esc(p.bairro)} · ${dataDoBanco(p.criado_em).toLocaleString('pt-BR')}</div>
            </div>
            <div class="pedido-val">R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</div>
            <span class="badge badge-${p.status === 'novo' ? 'novo' : p.status === 'preparando' ? 'prep' : p.status === 'entrega' ? 'entrega' : 'entregue'}">${p.status}</span>
          </div>
        `).join('')
      }
    </div>
    <div class="card">
      <div class="card-titulo">🍽️ Últimas comandas</div>
      ${(pedidosComanda||[]).length === 0 ? '<div class="empty"><div class="empty-ico">🍽️</div><div class="empty-txt">Nenhuma comanda ainda</div></div>' :
        (pedidosComanda||[]).map(p => {
          const mesaMatch = (p.observacao||'').match(/Mesa\s+(\S+)/);
          return `
          <div class="pedido-card">
            <div class="pedido-info">
              <div class="pedido-num">#${p.id.slice(-4).toUpperCase()}${mesaMatch ? ' — Mesa '+esc(mesaMatch[1]) : ''}</div>
              <div class="pedido-cliente">${dataDoBanco(p.criado_em).toLocaleString('pt-BR')}</div>
            </div>
            <div class="pedido-val">R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</div>
            <span class="badge badge-${p.status === 'novo' ? 'novo' : p.status === 'preparando' ? 'prep' : p.status === 'entrega' ? 'entrega' : 'entregue'}">${(p.status === 'entrega' || p.status === 'entregue') ? 'Finalizado' : p.status}</span>
          </div>
        `}).join('')
      }
    </div>
    </div>
  `;
}

// ===== PEDIDOS =====
async function buscarComandaPorCodigo() {
  if (meuPapel === 'garcom') { toast('Só o gerente/caixa fecha a conta.', 'erro'); return; }
  const campo = document.getElementById('busca-codigo-barras');
  const codigo = campo.value.trim();
  if (!codigo) return;

  const { data, error } = await db.from('codigos_comanda').select('id,status')
    .eq('restaurante_id', restauranteAtual.id).eq('codigo_curto', codigo).maybeSingle();

  if (error || !data) {
    toast('Nenhuma comanda encontrada com esse código.', 'erro');
    campo.value = '';
    return;
  }
  window.location.href = `?comanda=${data.id}`;
}

async function renderPedidos() {
  await autoFinalizarEntregasAntigas();
  if (!restauranteAtual) return;
  const { data: pedidos } = await db.from('pedidos')
    .select('*,pedido_itens(nome,quantidade,preco,observacao)')
    .eq('restaurante_id', restauranteAtual.id)
    .order('criado_em', {ascending: false});

  const ehComanda = p => !!p.codigo_comanda_id || (p.observacao||'').includes('Modo: Consumir no local');
  const lista = (pedidos || []).filter(p => !ehComanda(p));
  pedidosCache = lista;
  const novos = lista.filter(p => p.status === 'novo');
  const preparando = lista.filter(p => p.status === 'preparando');
  const finalizados = lista.filter(p => p.status === 'entrega' || p.status === 'entregue');

  function montaCard(p) {
    const telefone = extrairTelefone(p);
    const itensTxt = (p.pedido_itens||[]).map(i => `${i.quantidade}x ${esc(i.nome)}${i.observacao?' ('+esc(i.observacao)+')':''}`).join('<br>');
    const mesaMatch = (p.observacao||'').match(/Mesa\s+(\S+)/);
    return `
      <div class="kanban-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <div class="pedido-num">#${p.id.slice(-4).toUpperCase()}</div>
          <div class="pedido-val">R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</div>
        </div>
        ${faixaAgendado(p)}
        ${faixaRetirada(p)}
        ${faixaPagamento(p)}
        ${mesaMatch ? `<div style="display:inline-block;background:var(--laranja);color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px;">🍽️ Mesa ${esc(mesaMatch[1])}</div>` : ''}
        ${p.status === 'preparando' && p.aceito_em ? `<div style="display:inline-block;background:#FFF3E0;color:#B26A00;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px;margin-left:4px;">⏱️ ${tempoDecorridoTexto(p.aceito_em)} em preparo</div>` : ''}
        <div class="pedido-cliente" style="margin-bottom:8px;">${[p.endereco, p.bairro].filter(x => x && String(x).trim()).map(esc).join(' — ')}</div>
        <div style="font-size:12px;color:var(--texto-muted);margin-bottom:10px;">${itensTxt}</div>
        ${obsFormatada(p)}
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${montaBotoesStatus(p, telefone)}
          <button class="btn-sm" onclick="imprimirComandaPorId('${p.id}')" title="Imprimir comanda">🖨️</button>
        </div>
      </div>
    `;
  }

  document.getElementById('conteudo').innerHTML = `
    <div style="font-size:14px;color:var(--texto-muted);margin-bottom:16px;">${lista.length} pedido(s) no total</div>
    ${blocoAgendadosHoje(lista)}
    <div class="kanban">
      <div class="kanban-col col-novo">
        <div class="kanban-col-titulo"><span class="kanban-dot novo"></span>Novos pedidos <span class="kanban-count">${novos.length}</span></div>
        ${novos.length === 0 ? '<div class="kanban-empty">Nenhum pedido novo</div>' : novos.map(montaCard).join('')}
      </div>
      <div class="kanban-col col-prep">
        <div class="kanban-col-titulo"><span class="kanban-dot prep"></span>Em preparo <span class="kanban-count">${preparando.length}</span></div>
        ${preparando.length === 0 ? '<div class="kanban-empty">Nenhum pedido em preparo</div>' : preparando.map(montaCard).join('')}
      </div>
      <div class="kanban-col col-entrega">
        <div class="kanban-col-titulo"><span class="kanban-dot entrega"></span>A caminho / Finalizado <span class="kanban-count">${finalizados.length}</span></div>
        ${finalizados.length === 0 ? '<div class="kanban-empty">Nenhum pedido finalizado</div>' : finalizados.slice(0,3).map(montaCard).join('')}
        ${finalizados.length > 3 ? `<div style="text-align:center;font-size:11px;color:var(--texto-muted);padding:8px 0;">Mostrando os 3 mais recentes de ${finalizados.length}</div>` : ''}
      </div>
    </div>
  `;
}

async function renderComandas() {
  if (!restauranteAtual) return;
  // Só os últimos 3 dias (o resto fica no Histórico) — antes trazia TODOS os pedidos e ficava lento
  const desde = new Date(Date.now() - 3*24*3600*1000).toISOString();
  const [{ data: pedidos }, { data: mesasAbertas }] = await Promise.all([
    db.from('pedidos')
      .select('*,pedido_itens(nome,quantidade,preco,observacao)')
      .eq('restaurante_id', restauranteAtual.id)
      .gte('criado_em', desde)
      .order('criado_em', {ascending: false})
      .limit(400),
    db.from('codigos_comanda')
      .select('*').eq('restaurante_id', restauranteAtual.id).eq('status', 'em_uso').order('aberta_em'),
    autoFinalizarEntregasAntigas()
  ]);

  const ehComanda = p => !!p.codigo_comanda_id || (p.observacao||'').includes('Modo: Consumir no local');
  const lista = (pedidos || []).filter(ehComanda);
  pedidosCache = lista;
  const novos = lista.filter(p => p.status === 'novo');
  const preparando = lista.filter(p => p.status === 'preparando');
  const finalizados = lista.filter(p => p.status === 'entrega' || p.status === 'entregue');

  function montaCard(p) {
    const telefone = extrairTelefone(p);
    const itensTxt = (p.pedido_itens||[]).map(i => `${i.quantidade}x ${esc(i.nome)}${i.observacao?' ('+esc(i.observacao)+')':''}`).join('<br>');
    const mesaMatch = (p.observacao||'').match(/Mesa\s+(\S+)/);
    return `
      <div class="kanban-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <div class="pedido-num">#${p.id.slice(-4).toUpperCase()}</div>
          <div class="pedido-val">R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</div>
        </div>
        ${faixaAgendado(p)}
        ${faixaRetirada(p)}
        ${faixaPagamento(p)}
        ${mesaMatch ? `<div style="display:inline-block;background:var(--laranja);color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px;">🍽️ Mesa ${esc(mesaMatch[1])}</div>` : ''}
        ${p.status === 'preparando' && p.aceito_em ? `<div style="display:inline-block;background:#FFF3E0;color:#B26A00;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px;margin-left:4px;">⏱️ ${tempoDecorridoTexto(p.aceito_em)} em preparo</div>` : ''}
        <div class="pedido-cliente" style="margin-bottom:8px;">${[p.endereco, p.bairro].filter(x => x && String(x).trim()).map(esc).join(' — ')}</div>
        <div style="font-size:12px;color:var(--texto-muted);margin-bottom:10px;">${itensTxt}</div>
        ${obsFormatada(p)}
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${montaBotoesStatus(p, telefone)}
          <button class="btn-sm" onclick="imprimirComandaPorId('${p.id}')" title="Imprimir comanda">🖨️</button>
        </div>
      </div>
    `;
  }

  const mesasComTotal = (mesasAbertas||[]).map(m => {
    const pedidosDaMesa = lista.filter(p => p.codigo_comanda_id === m.id && dataDoBanco(p.criado_em) >= dataDoBanco(m.aberta_em));
    const total = pedidosDaMesa.reduce((s,p) => s + parseFloat(p.total||0), 0);
    return { ...m, total, qtdPedidos: pedidosDaMesa.length };
  });

  document.getElementById('conteudo').innerHTML = `
    ${meuPapel !== 'garcom' ? '' : `<div class="card" style="margin-bottom:20px;text-align:center;">
      <button onclick="abrirLeitorQr()" style="width:100%;background:var(--laranja);color:#fff;border:none;border-radius:12px;padding:16px;font-size:17px;font-weight:700;cursor:pointer;">📷 Ler QR Code da comanda</button>
      <div style="font-size:12px;color:var(--texto-muted);margin-top:8px;">Aponte a câmera do celular para o QR Code do cartão da comanda.</div>
    </div>`}
    ${meuPapel === 'garcom' ? '' : `<div class="card" style="margin-bottom:20px;">
      <div class="card-titulo">🔍 Fechar conta pelo código de barras</div>
      <div style="font-size:12px;color:var(--texto-muted);margin-bottom:10px;">Passe o leitor no código de barras da comanda (ou digite o número e aperte Enter).</div>
      <input type="text" id="busca-codigo-barras" name="leitor_comanda_numero" inputmode="numeric" placeholder="Escaneie ou digite os 6 números" style="font-size:16px;letter-spacing:2px;" onkeypress="if(event.key==='Enter')buscarComandaPorCodigo()" autocomplete="off" autocorrect="off" spellcheck="false">
    </div>`}
    ${mesasComTotal.length > 0 ? `
    <div class="card" style="margin-bottom:20px;background:var(--laranja-light);border:1.5px dashed var(--laranja);">
      <div class="card-titulo">🍽️ Mesas abertas agora</div>
      ${mesasComTotal.map(m => `
        <div class="frete-row">
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">${m.mesa ? 'Mesa ' + esc(m.mesa) : '⚖️ Sem mesa (aguardando garçom)'}</div>
            <div style="font-size:12px;color:var(--texto-muted);">${m.qtdPedidos} pedido(s) · aberta desde ${dataDoBanco(m.aberta_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--laranja);margin-right:12px;">R$ ${m.total.toFixed(2).replace('.',',')}</div>
          <a href="?comanda=${m.id}" class="btn-sm" style="text-decoration:none;">${meuPapel === 'garcom' ? 'Lançar itens' : 'Ver / Fechar conta'}</a>
        </div>
      `).join('')}
    </div>
    ` : ''}
    ${meuPapel === 'garcom' ? (mesasComTotal.length === 0 ? '<div class="empty"><div class="empty-ico">🍽️</div><div class="empty-txt">Nenhuma mesa aberta no momento. Escaneie o QR de uma mesa pra começar.</div></div>' : '') : `
    <div style="font-size:14px;color:var(--texto-muted);margin-bottom:16px;">${lista.length} comanda(s) nos últimos 3 dias</div>
    <div class="kanban">
      <div class="kanban-col col-novo">
        <div class="kanban-col-titulo"><span class="kanban-dot novo"></span>Aguardando Confirmação <span class="kanban-count">${novos.length}</span></div>
        ${novos.length === 0 ? '<div class="kanban-empty">Nenhum pedido novo</div>' : novos.map(montaCard).join('')}
      </div>
      <div class="kanban-col col-prep">
        <div class="kanban-col-titulo"><span class="kanban-dot prep"></span>Em preparo <span class="kanban-count">${preparando.length}</span></div>
        ${preparando.length === 0 ? '<div class="kanban-empty">Nenhum pedido em preparo</div>' : preparando.map(montaCard).join('')}
      </div>
      <div class="kanban-col col-entrega">
        <div class="kanban-col-titulo"><span class="kanban-dot entrega"></span>Pronto/Servido <span class="kanban-count">${finalizados.length}</span></div>
        ${finalizados.length === 0 ? '<div class="kanban-empty">Nenhum pedido finalizado</div>' : finalizados.slice(0,3).map(montaCard).join('')}
        ${finalizados.length > 3 ? `<div style="text-align:center;font-size:11px;color:var(--texto-muted);padding:8px 0;">Mostrando os 3 mais recentes de ${finalizados.length}</div>` : ''}
      </div>
    </div>
    `}
  `;
  document.getElementById('busca-codigo-barras')?.focus();
}

async function renderAvaliacoes() {
  if (!restauranteAtual) return;
  const { data: pedidos } = await db.from('pedidos')
    .select('id,criado_em,total,avaliacao,observacao,pedido_itens(nome)')
    .eq('restaurante_id', restauranteAtual.id)
    .not('avaliacao', 'is', null)
    .order('criado_em', {ascending: false});

  const media = (pedidos||[]).length ? ((pedidos||[]).reduce((s,p)=>s+p.avaliacao,0) / (pedidos||[]).length) : 0;
  const ruins = (pedidos||[]).filter(p => p.avaliacao <= 2);

  document.getElementById('conteudo').innerHTML = `
    <div class="metricas" style="margin-bottom:24px;">
      <div class="metrica"><div class="metrica-label">Nota média</div><div class="metrica-val laranja">${media.toFixed(1)} ⭐</div></div>
      <div class="metrica"><div class="metrica-label">Total de avaliações</div><div class="metrica-val">${(pedidos||[]).length}</div></div>
      <div class="metrica"><div class="metrica-label">Avaliações ruins (1-2⭐)</div><div class="metrica-val" style="color:${ruins.length>0?'#C0392B':'inherit'};">${ruins.length}</div></div>
    </div>

    <div class="card">
      <div class="card-titulo">Todas as avaliações</div>
      ${(pedidos||[]).length === 0 ? '<div class="empty"><div class="empty-ico">⭐</div><div class="empty-txt">Nenhuma avaliação recebida ainda</div></div>' :
        (pedidos||[]).map(p => {
          const ruim = p.avaliacao <= 2;
          const telefone = extrairTelefone(p);
          const itensTxt = (p.pedido_itens||[]).map(i => esc(i.nome)).join(', ');
          return `
          <div class="frete-row" style="${ruim?'background:#FBE9E7;border-radius:8px;padding:10px;margin-bottom:6px;':''}">
            <div style="flex:1;">
              <div style="font-size:15px;">${'⭐'.repeat(p.avaliacao)}${'☆'.repeat(5-p.avaliacao)}</div>
              <div style="font-size:12px;color:var(--texto-muted);margin-top:2px;">#${p.id.slice(-4).toUpperCase()} · ${dataDoBanco(p.criado_em).toLocaleDateString('pt-BR')} · R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</div>
              ${itensTxt ? `<div style="font-size:12px;color:var(--texto-muted);margin-top:2px;">${itensTxt}</div>` : ''}
            </div>
            ${ruim && telefone ? `<button class="btn-sm" onclick="window.open('https://wa.me/${telefone.replace(/\D/g,'')}?text=${encodeURIComponent('Olá! Vimos que sua última experiência não foi das melhores. Podemos conversar sobre o que houve?')}','wa_servidelivery')">💬 Entrar em contato</button>` : ''}
          </div>
        `;
        }).join('')
      }
    </div>
  `;
}

// ===== AGENDADOS PARA HOJE: lista no topo de Pedidos, com botão pra confirmar com o cliente no WhatsApp =====
function dataDoAgendamento(p) {
  const t = textoAgendamento(p);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+às\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const ano = m[3] ? parseInt(m[3]) : new Date().getFullYear();
  return { dia: parseInt(m[1]), mes: parseInt(m[2]), ano, hora: m[4].padStart(2,'0') + ':' + m[5] };
}
function blocoAgendadosHoje(lista) {
  const h = new Date();
  const ativos = (lista || []).filter(p => p.status === 'novo' || p.status === 'preparando');
  const comData = ativos.map(p => ({ p, ag: dataDoAgendamento(p) })).filter(x => x.ag);
  const hoje = comData.filter(x => x.ag.dia === h.getDate() && x.ag.mes === h.getMonth() + 1 && x.ag.ano === h.getFullYear())
    .sort((a, b) => a.ag.hora.localeCompare(b.ag.hora));
  const outros = comData.length - hoje.length;
  if (!hoje.length && !outros) return '';
  const linhas = hoje.map(({ p, ag }) => {
    const nome = ((p.observacao || '').match(/Nome:\s*([^\n]+)/) || [])[1]?.trim() || 'Cliente';
    const pago = (p.observacao || '').includes('JÁ PAGO');
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid #E0B400;border-radius:8px;padding:8px 10px;margin-top:6px;">
      <b style="font-size:15px;color:#C00000;">⏰ ${ag.hora}</b>
      <span style="font-size:13px;font-weight:700;">#${p.id.slice(-4).toUpperCase()}</span>
      <span style="font-size:13px;">${esc(nome)} · ${tipoAgendamento(p) === 'ENTREGA' ? 'Entrega' : 'Retirada'} · R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</span>
      <span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:10px;color:#fff;background:${pago ? '#0F6E56' : '#B42318'};">${pago ? '✅ PAGO' : 'NÃO PAGO'}</span>
      ${meuPapel === 'garcom' ? '' : `<button class="btn-sm" style="margin-left:auto;background:#25D366;color:#fff;border:none;font-weight:700;" onclick="confirmarAgendadoWhats('${p.id}')">💬 Confirmar com o cliente</button>`}
    </div>`;
  }).join('');
  return `<div style="background:#FFF7CC;border:2px solid #E0B400;border-radius:10px;padding:12px 14px;margin-bottom:16px;">
    <div style="font-size:14px;font-weight:800;color:#7A5A00;">📅 Agendados para hoje (${hoje.length})</div>
    ${hoje.length ? linhas : '<div style="font-size:12px;color:#7A5A00;margin-top:4px;">Nenhum pedido agendado para hoje.</div>'}
    ${outros > 0 ? `<div style="font-size:12px;color:#7A5A00;margin-top:8px;">Mais ${outros} pedido(s) agendado(s) para outros dias (aparecem nos cartões abaixo).</div>` : ''}
  </div>`;
}
function confirmarAgendadoWhats(id) {
  const p = pedidosCache.find(x => x.id === id);
  if (!p) { toast('Pedido não encontrado.', 'erro'); return; }
  const ag = dataDoAgendamento(p);
  let fone = (extrairTelefone(p) || '').replace(/\D/g, '');
  if (!fone) { toast('Esse pedido não tem telefone do cliente.', 'erro'); return; }
  if (fone.length <= 11) fone = '55' + fone;
  const nome = ((p.observacao || '').match(/Nome:\s*([^\n]+)/) || [])[1]?.trim() || '';
  const tipo = tipoAgendamento(p) === 'ENTREGA' ? 'a entrega' : 'a retirada';
  const msg = `Olá${nome ? ', ' + nome : ''}! Aqui é do ${restauranteAtual?.nome || 'restaurante'}. Seu pedido #${p.id.slice(-4).toUpperCase()} está agendado para hoje às ${ag ? ag.hora : ''} (${tipo}). Está tudo certo? Responda SIM para a gente confirmar e preparar o seu pedido. 😊`;
  window.open(`https://wa.me/${fone}?text=${encodeURIComponent(msg)}`, 'wa_servidelivery');
}

function extrairTelefone(p) {
  const match = (p.observacao||'').match(/Telefone:\s*([^\n]+)/);
  return match ? match[1].trim() : null;
}

// ===== Pedido de comanda (mesa) ou de delivery? =====
function ehComandaPedido(p) {
  return !!p.codigo_comanda_id || (p.observacao || '').includes('Modo: Consumir no local');
}

// ===== Ajustes por aparelho: aceitar sozinho e imprimir sozinho (delivery e comanda separados) =====
function ajusteAparelho(chave, padrao) {
  try {
    const v = localStorage.getItem(chave + '_' + restauranteAtual.id);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch (e) {}
  return padrao;
}
// Só comandas (mesas) podem ser aceitas sozinhas. Delivery o dono aceita sempre (várias formas de pagamento).
function aceitarAutoPara(ehCom) { return ehCom ? ajusteAparelho('aceitar_auto_comanda', false) : false; }
function imprimirAutoPara(ehCom) {
  // delivery usa a chave antiga (imprimir_auto); comanda usa a sua e, se nunca mexeram, segue a do delivery
  const delivery = ajusteAparelho('imprimir_auto', true);
  return ehCom ? ajusteAparelho('imprimir_auto_comanda', delivery) : delivery;
}

// Texto "Seu pedido" que vai pro cliente no WhatsApp quando o dono aceita (itens, frete e total)
function blocoItensWhats(ped) {
  const din = v => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');
  const itens = ped.pedido_itens || [];
  const sub = itens.reduce((s, i) => s + (parseFloat(i.preco) || 0) * (i.quantidade || 1), 0);
  const frete = parseFloat(ped.frete) || 0;
  const total = parseFloat(ped.total) || 0;
  const ehDelivery = /Modo:\s*Delivery/i.test(ped.observacao || '');
  const linhas = ['*Seu pedido:*'];
  itens.forEach(i => linhas.push(`${i.quantidade}x ${i.nome}${i.observacao ? ' (' + i.observacao + ')' : ''} — ${din((parseFloat(i.preco) || 0) * (i.quantidade || 1))}`));
  if (ehDelivery || frete > 0) linhas.push(`Frete: ${frete > 0 ? din(frete) : 'Grátis'}`);
  const desc = sub + frete - total;
  if (desc > 0.009) linhas.push(`Desconto: - ${din(desc)}`);
  linhas.push(`*Total: ${din(total)}*`);
  return linhas.join('\n');
}

// Aceita sozinho os pedidos novos (só no aparelho que ligou a chave) e imprime se estiver ligado
var autoAceitando = false;
async function autoAceitarPedidos() {
  if (!restauranteAtual || meuPapel === 'garcom' || autoAceitando) return;
  const aD = aceitarAutoPara(false), aC = aceitarAutoPara(true);
  if (!aD && !aC) return;
  autoAceitando = true;
  try {
    const { data } = await db.from('pedidos')
      .select('*,pedido_itens(nome,quantidade,preco,observacao)')
      .eq('restaurante_id', restauranteAtual.id).eq('status', 'novo').order('criado_em');
    for (const p of data || []) {
      const com = ehComandaPedido(p);
      if (com ? !aC : !aD) continue;
      // Pix manual (cliente manda comprovante) precisa de conferência: fica esperando o dono
      if (!com) { const d = dadosPagamento(p); if (d && d.pixManual) continue; }
      // "Reserva" o pedido: só segue se ele ainda estava novo (evita aceitar/imprimir duas vezes)
      const { data: ok } = await db.from('pedidos')
        .update({ status: 'preparando', aceito_em: new Date().toISOString() })
        .eq('id', p.id).eq('status', 'novo').select('id');
      if (!ok || !ok.length) continue;
      p.status = 'preparando';
      pedidosCache = [p, ...(pedidosCache || []).filter(x => x.id !== p.id)];
      toast(`✅ Pedido #${p.id.slice(-4).toUpperCase()} aceito automaticamente`, 'ok');
      if (imprimirAutoPara(com)) imprimirComanda(p);
    }
  } catch (e) {
    console.error('autoAceitarPedidos', e);
  } finally {
    autoAceitando = false;
  }
}

function imprimirComandaPorId(id) {
  const pedido = pedidosCache.find(p => p.id === id);
  if (!pedido) { toast('Pedido não encontrado pra imprimir.', 'erro'); return; }
  imprimirComanda(pedido);
}

// Pedido agendado: devolve "dd/mm às hh:mm" (ou '' se o pedido não for agendado)
function textoAgendamento(p) {
  let m = String(p.observacao || '').match(/Agendado para:\s*(\S+)\s+às\s+(\d{1,2}:\d{2})/);
  if (!m) m = String(p.endereco || '').match(/Retirada no local\s+—\s+(\S+)\s+às\s+(\d{1,2}:\d{2})/);
  if (!m) return '';
  let d = m[1];
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) d = `${iso[3]}/${iso[2]}/${iso[1]}`;
  return `${d} às ${m[2]}`;
}
function tipoAgendamento(p) {
  return /Modo:\s*Delivery/i.test(p.observacao || '') ? 'ENTREGA' : 'RETIRADA';
}
// Informa com clareza se o pedido JÁ FOI PAGO ou se o dono precisa COBRAR (dinheiro/maquininha)
function dadosPagamento(p) {
  const obs = p.observacao || '';
  if (obs.includes('JÁ PAGO')) return { pago: true, online: obs.includes('Cartão online') ? 'NO CARTÃO' : 'NO PIX' };
  if (/Mesa\s+\S+/.test(obs) || p.codigo_comanda_id) return null; // comanda: paga ao fechar a mesa
  const forma = (obs.match(/Pagamento:\s*([^\n(]+)/) || [])[1]?.trim();
  if (!forma) return null;
  const quando = /Modo:\s*Retirar/i.test(obs) ? 'NA RETIRADA' : (/Modo:\s*Consumir/i.test(obs) ? 'NO LOCAL' : 'NA ENTREGA');
  const trocoPara = parseFloat((obs.match(/troco para R\$\s*([\d.,]+)/i) || [])[1]?.replace(',', '.'));
  const total = parseFloat(p.total) || 0;
  const dinheiro = /dinheiro/i.test(forma);
  const pixManual = /^pix$/i.test(forma); // Pix direto na chave do restaurante: precisa conferir o comprovante
  return { pago: false, forma, quando, dinheiro, pixManual, trocoPara: isNaN(trocoPara) ? null : trocoPara, total };
}

function faixaPagamento(p) {
  const d = dadosPagamento(p);
  if (!d) return '';
  if (d.pago) return `<div style="background:#0F6E56;color:#fff;font-size:13px;font-weight:800;padding:7px 10px;border-radius:8px;margin-bottom:8px;text-align:center;letter-spacing:.3px;">✅ PAGO ${d.online} — não cobrar do cliente</div>`;
  const reais = v => 'R$ ' + v.toFixed(2).replace('.', ',');
  if (d.pixManual) return `<div style="background:#C2410C;color:#fff;padding:8px 10px;border-radius:8px;margin-bottom:8px;text-align:center;"><div style="font-size:13px;font-weight:900;letter-spacing:.3px;">📲 PIX MANUAL — CONFERIR O COMPROVANTE antes de liberar</div><div style="font-size:12px;font-weight:700;margin-top:3px;">Valor esperado: ${reais(d.total)}</div></div>`;
  let linha = d.dinheiro ? `💵 NÃO PAGO — COBRAR EM DINHEIRO ${d.quando}` : `💳 NÃO PAGO — COBRAR NA MAQUININHA (${esc(d.forma)}) ${d.quando}`;
  let extra = `Cobrar ${reais(d.total)}`;
  if (d.dinheiro) extra += d.trocoPara ? ` · Cliente paga com ${reais(d.trocoPara)} · Levar troco de ${reais(Math.max(0, d.trocoPara - d.total))}` : ' · Sem troco';
  return `<div style="background:#B42318;color:#fff;padding:8px 10px;border-radius:8px;margin-bottom:8px;text-align:center;"><div style="font-size:13px;font-weight:900;letter-spacing:.3px;">${linha}</div><div style="font-size:12px;font-weight:700;margin-top:3px;">${extra}</div></div>`;
}

function badgeNaoPago(p) {
  const d = dadosPagamento(p);
  if (!d || d.pago) return '';
  return ` <span style="background:${d.pixManual ? '#C2410C' : '#B42318'};color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;">${d.pixManual ? '📲 CONFERIR PIX' : (d.dinheiro ? '💵 NÃO PAGO' : '💳 NÃO PAGO')}</span>`;
}

// Faixa azul para retirada no local (quando NÃO é agendada; a agendada já tem a faixa amarela)
function ehRetirada(p) {
  return /Modo:\s*Retirar/i.test(p.observacao || '') && !p.codigo_comanda_id;
}
function faixaRetirada(p) {
  if (!ehRetirada(p) || textoAgendamento(p)) return '';
  return `<div style="background:#1D4ED8;color:#fff;font-size:13px;font-weight:800;padding:7px 10px;border-radius:8px;margin-bottom:8px;text-align:center;letter-spacing:.3px;">🏃 RETIRADA NO LOCAL — o cliente vem buscar</div>`;
}
function badgeRetirada(p) {
  if (!ehRetirada(p)) return '';
  return ' <span style="background:#1D4ED8;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;">🏃 RETIRADA</span>';
}

function faixaAgendado(p) {
  const t = textoAgendamento(p);
  if (!t) return '';
  return `<div style="background:#FFD60A;color:#C00000;font-size:14px;font-weight:900;padding:8px 10px;border-radius:8px;margin-bottom:8px;text-align:center;border:2px solid #C00000;letter-spacing:.3px;">⏰ ${tipoAgendamento(p)} AGENDADA PARA ${esc(t)}</div>`;
}

function imprimirComanda(p) {
  const printCardapio = document.getElementById('print-cardapio');
  if (printCardapio) printCardapio.innerHTML = '';

  const obs = p.observacao || '';
  const nome = (obs.match(/Nome:\s*([^\n]+)/) || [])[1]?.trim() || 'Cliente';
  const telefone = (obs.match(/Telefone:\s*([^\n]+)/) || [])[1]?.trim() || '';
  const modo = (obs.match(/Modo:\s*([^\n]+)/) || [])[1]?.trim() || '';
  const pagamento = (obs.match(/Pagamento:\s*([^\n]+)/) || [])[1]?.trim() || '';
  const obsGeral = (obs.match(/Obs:\s*([^\n]+)/) || [])[1]?.trim() || '';

  const itensHtml = (p.pedido_itens||[]).map(i => `
    <div class="cp-item">${i.quantidade}x ${esc(i.nome)}${i.observacao ? `<br>&nbsp;&nbsp;Obs: ${esc(i.observacao)}` : ''}</div>
  `).join('');

  let tamLetra = 'normal';
  try {
    tamLetra = localStorage.getItem('imprimir_tam_' + restauranteAtual.id) || 'normal';
  } catch (e) {}
  document.getElementById('comanda-print').className =
    (tamLetra === 'gigante' ? 'cp-gg' : tamLetra === 'extra' ? 'cp-xg' : (tamLetra === 'grande' ? 'cp-g' : ''));

  // Comanda (mesa): o número da mesa vai grande no topo, em negrito
  const ehCom = ehComandaPedido(p);
  const mesa = ehCom ? ((obs.match(/Mesa\s+(\S+)/) || [])[1] || (String(p.endereco || '').match(/Mesa\s+(\S+)/) || [])[1] || '') : '';
  const ehDelivery = /Modo:\s*Delivery/i.test(obs);
  const frete = parseFloat(p.frete) || 0;
  const linhaFrete = ehDelivery ? `<div class="cp-info">Frete: ${frete > 0 ? 'R$ ' + frete.toFixed(2).replace('.', ',') : 'Grátis'}</div>` : '';

  document.getElementById('comanda-print').innerHTML = `
    ${mesa ? `<div class="cp-mesa">MESA ${esc(mesa)}</div>` : ''}
    <h2>${esc(restauranteAtual?.nome) || 'Pedido'}</h2>
    <div style="text-align:center;">Pedido #${p.id.slice(-4).toUpperCase()}</div>
    <div style="text-align:center;">${dataDoBanco(p.criado_em).toLocaleString('pt-BR')}</div>
    <div class="cp-linha"></div>
    <div class="cp-info">${esc(modo || (ehCom ? 'Comanda' : ''))}</div>
    ${ehCom && nome === 'Cliente' ? '' : `<div class="cp-info">Cliente: ${esc(nome)}</div>`}
    ${telefone ? `<div class="cp-info">Tel: ${esc(telefone)}</div>` : ''}
    ${textoAgendamento(p) ? `<div style="text-align:center;font-weight:900;font-size:16px;border:2px solid #000;padding:4px;margin:4px 0;">*** ${tipoAgendamento(p)} AGENDADA PARA ${esc(textoAgendamento(p))} ***</div>` : ''}
    ${p.endereco ? `<div class="cp-info">End: ${esc(p.endereco)}</div>` : ''}
    ${p.bairro ? `<div class="cp-info">Bairro: ${esc(p.bairro)}</div>` : ''}
    <div class="cp-linha"></div>
    ${itensHtml}
    <div class="cp-linha"></div>
    <div class="cp-info">Pagamento: ${esc(pagamento)}</div>
    ${obsGeral ? `<div class="cp-item">Obs geral: ${esc(obsGeral)}</div>` : ''}
    ${linhaFrete}
    <div class="cp-total">TOTAL: R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</div>
  `;
  window.print();
}

function tempoDecorridoTexto(dataIso) {
  if (!dataIso) return null;
  const min = Math.floor((Date.now() - new Date(dataIso).getTime()) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? m+'min' : ''}`;
}

function montaBotoesStatus(p, telefone) {
  if (meuPapel === 'garcom') return '';
  const nomeMatch = (p.observacao||'').match(/Nome:\s*([^\n]+)/);
  const nomeCliente = nomeMatch ? nomeMatch[1].trim() : 'Cliente';
  const ehComanda = !!p.codigo_comanda_id;

  if (p.status === 'novo') {
    return `
      <button class="btn-sm" style="background:var(--verde);color:#fff;border:none;" onclick="avancarStatus('${p.id}','preparando','${nomeCliente.replace(/'/g,"")}','${telefone||''}','${p.id.slice(-4).toUpperCase()}')">${ehComanda ? 'Enviar para Cozinha' : 'Aceitar pedido'}</button>
      <button class="btn-sm perigo" onclick="mudarStatus('${p.id}','cancelado')">Recusar</button>
    `;
  }
  if (p.status === 'preparando') {
    return `<button class="btn-sm" style="background:var(--laranja);color:#fff;border:none;" onclick="avancarStatus('${p.id}','entrega','${nomeCliente.replace(/'/g,"")}','${telefone||''}','${p.id.slice(-4).toUpperCase()}')">${ehComanda ? 'Pronto para Servir' : 'Pedido pronto, saiu p/ entrega'}</button>`;
  }
  if (ehComanda) {
    return `<button class="btn-sm" disabled style="background:#ccc;color:#fff;border:none;cursor:default;">Servido</button>`;
  }
  if (p.status === 'entrega') {
    return `<button class="btn-sm" style="background:var(--texto);color:#fff;border:none;" onclick="mudarStatus('${p.id}','entregue')">Marcar como entregue</button>`;
  }
  return `<span class="badge badge-entregue">Entregue</span>`;
}

async function avancarStatus(id, novoStatus, nomeCliente, telefone, numPedido) {
  const dadosUpdate = { status: novoStatus };
  if (novoStatus === 'preparando') dadosUpdate.aceito_em = new Date().toISOString();
  if (novoStatus === 'entrega') dadosUpdate.saiu_entrega_em = new Date().toISOString();
  await db.from('pedidos').update(dadosUpdate).eq('id', id);
  toast('Status atualizado!', 'ok');

  const avisosConfig = restauranteAtual?.avisos_whatsapp || {};
  const chaveConfigAviso = novoStatus === 'entregue' ? 'entrega' : novoStatus;
  const configAviso = avisosConfig[chaveConfigAviso];
  // Compatibilidade: formato antigo era só true/false; o novo é {ativo, texto}
  const avisoAtivo = typeof configAviso === 'object' && configAviso !== null ? configAviso.ativo !== false : configAviso !== false;
  const textoCustom = typeof configAviso === 'object' && configAviso !== null ? configAviso.texto : null;

  if (telefone && avisoAtivo) {
    const padroes = {
      preparando: `Olá %cliente%! Seu pedido #%pedido% foi confirmado e já está sendo preparado.`,
      entrega: `Seu pedido #%pedido% está pronto e saiu para entrega! Chegará em breve.`,
      entregue: `Seu pedido #%pedido% está pronto e saiu para entrega! Chegará em breve.`
    };
    const modelo = textoCustom || padroes[novoStatus];
    if (modelo) {
      // Link para o cliente acompanhar o pedido (sempre vai junto, exceto ao marcar como entregue)
      // O link precisa ter o endereço da loja (/slug). Só com "/" ele caía no site institucional.
      const linkAcomp = `${window.location.origin}/${restauranteAtual?.slug || 'painel'}?acompanhar=${id}`;
      const pedAceito = (pedidosCache || []).find(x => x.id === id);
      const blocoItens = pedAceito ? blocoItensWhats(pedAceito) : '';
      let msg = modelo.replace(/%cliente%/g, nomeCliente).replace(/%pedido%/g, numPedido).replace(/%link%/g, linkAcomp).replace(/%itens%/g, blocoItens);
      // Ao aceitar, o cliente recebe também o que comprou (itens, valor de cada um, frete e total)
      if (novoStatus === 'preparando' && blocoItens && !modelo.includes('%itens%')) {
        msg += `\n\n${blocoItens}`;
      }
      if (novoStatus !== 'entregue' && !modelo.includes('%link%')) {
        msg += `\n\nAcompanhe seu pedido: ${linkAcomp}`;
      }
      const fone = telefone.replace(/\D/g, '');
      window.open(`https://wa.me/${fone}?text=${encodeURIComponent(msg)}`, 'wa_servidelivery');
    }
  }

  if (novoStatus === 'preparando') {
    const pedParaImprimir = (pedidosCache || []).find(x => x.id === id);
    if (imprimirAutoPara(pedParaImprimir ? ehComandaPedido(pedParaImprimir) : false)) imprimirComandaPorId(id);
  }

  if (paginaAtual === 'pedidos') renderPedidos(); else if (paginaAtual === 'comandas') renderComandas();
}

async function mudarStatus(id, status) {
  await db.from('pedidos').update({ status }).eq('id', id);
  toast('Status atualizado!', 'ok');
  if (paginaAtual === 'pedidos') renderPedidos(); else if (paginaAtual === 'comandas') renderComandas();
}


// Observação do pedido: texto preto; só o "Agendado para" fica destacado (vermelho, negrito, maior, marca-texto amarelo)
function obsFormatada(p) {
  if (!p.observacao) return '';
  const partes = String(p.observacao).split('\n').filter(l => !/^Agendado para:/i.test(l)).map(l => esc(l));
  return `<div style="font-size:12px;color:#000;margin-bottom:10px;line-height:1.7;">${partes.join(' · ')}</div>`;
}


// ===== LEITOR DE QR CODE DENTRO DO SISTEMA (câmera do celular) =====
var leitorQr = { stream: null, ativo: false, fundo: null };

function fecharLeitorQr() {
  leitorQr.ativo = false;
  if (leitorQr.stream) { leitorQr.stream.getTracks().forEach(t => t.stop()); leitorQr.stream = null; }
  if (leitorQr.fundo) { leitorQr.fundo.remove(); leitorQr.fundo = null; }
}

function carregarJsQr() {
  return new Promise((resolve, reject) => {
    if (window.jsQR) return resolve();
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    sc.onload = () => resolve();
    sc.onerror = () => reject(new Error('jsqr'));
    document.head.appendChild(sc);
  });
}

// Descobre o id da comanda a partir do que o QR/código de barras trouxe
async function comandaIdDoTexto(texto) {
  const t = String(texto || '').trim();
  const mLink = t.match(/[?&]comanda=([0-9a-fA-F-]{36})/);
  if (mLink) return mLink[1];
  if (/^[0-9a-fA-F-]{36}$/.test(t)) return t;
  if (/^\d{6}$/.test(t)) {
    const { data } = await db.from('codigos_comanda').select('id')
      .eq('restaurante_id', restauranteAtual.id).eq('codigo_curto', t).maybeSingle();
    return data?.id || null;
  }
  return null;
}

async function abrirLeitorQr() {
  if (leitorQr.ativo) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Este aparelho não deixa abrir a câmera aqui. Use a câmera normal do celular.', 'erro');
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    toast('Não consegui abrir a câmera. Toque em "Permitir" quando o celular perguntar.', 'erro');
    return;
  }
  leitorQr.stream = stream;
  leitorQr.ativo = true;

  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;';
  fundo.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;color:#fff;">
      <div style="font-size:16px;font-weight:700;">📷 Aponte para o QR Code</div>
      <button id="qr-fechar" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:8px 16px;border-radius:20px;font-size:14px;cursor:pointer;">✖ Fechar</button>
    </div>
    <div style="flex:1;position:relative;overflow:hidden;">
      <video id="qr-video" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;"></video>
      <div style="position:absolute;top:50%;left:50%;width:240px;height:240px;transform:translate(-50%,-50%);border:3px solid #fff;border-radius:16px;box-shadow:0 0 0 2000px rgba(0,0,0,0.45);"></div>
    </div>
    <div id="qr-aviso" style="color:#fff;text-align:center;padding:14px;font-size:14px;">Procurando o QR Code...</div>`;
  document.body.appendChild(fundo);
  leitorQr.fundo = fundo;
  fundo.querySelector('#qr-fechar').onclick = fecharLeitorQr;

  const video = fundo.querySelector('#qr-video');
  video.srcObject = stream;
  try { await video.play(); } catch (e) {}

  let detector = null;
  if ('BarcodeDetector' in window) {
    try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
  }
  if (!detector) {
    try { await carregarJsQr(); } catch (e) {
      fecharLeitorQr();
      toast('Não consegui preparar o leitor. Tente de novo ou use a câmera normal do celular.', 'erro');
      return;
    }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let lendo = false;

  async function tentarLer() {
    if (!leitorQr.ativo) return;
    if (!lendo && video.readyState >= 2 && video.videoWidth) {
      lendo = true;
      try {
        let texto = null;
        if (detector) {
          const achados = await detector.detect(video);
          if (achados.length) texto = achados[0].rawValue;
        } else {
          const w = Math.min(video.videoWidth, 640);
          const h = Math.round(video.videoHeight * (w / video.videoWidth));
          canvas.width = w; canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const r = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
          if (r) texto = r.data;
        }
        if (texto) {
          const id = await comandaIdDoTexto(texto);
          if (id) {
            fecharLeitorQr();
            await carregarModoComanda(id);
            return;
          }
          const aviso = document.getElementById('qr-aviso');
          if (aviso) aviso.textContent = 'Esse QR Code não é de uma comanda. Tente outro.';
        }
      } catch (e) {}
      lendo = false;
    }
    setTimeout(tentarLer, 250);
  }
  tentarLer();
}
