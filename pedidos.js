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
    const mesa = prompt('Código livre! Qual o número da mesa?');
    if (!mesa || !mesa.trim()) return;
    const { error: erroAbrir } = await db.from('codigos_comanda').update({
      status: 'em_uso', mesa: mesa.trim(), aberta_em: new Date().toISOString()
    }).eq('id', comandaId);
    if (erroAbrir) { alert('Erro ao abrir a comanda. Tente de novo.'); return; }
    codigo.mesa = mesa.trim();

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
  }

  comandaAtual = { id: codigo.id, mesa: codigo.mesa, historicoId };
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

  document.getElementById('pub-rest-nome').textContent = `Mesa ${codigo.mesa}`;
  document.getElementById('pub-rest-sub').textContent = '📋 Comanda do garçom';
  const infoBar = document.getElementById('pub-info-bar');
  if (infoBar) infoBar.innerHTML = `
    <button onclick="sairModoComanda()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;">← Voltar pro painel</button>
    <button onclick="abrirFechamentoComanda()" style="background:var(--laranja);border:none;color:#fff;padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;font-weight:600;">💰 Fechar conta</button>
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
  if (rankingWrap) rankingWrap.innerHTML = '';

  mostrarTela('cliente');
  atualizarCarrinho();
  toast(`Comanda aberta — Mesa ${codigo.mesa}`, 'ok');
}

async function finalizarComanda() {
  if (carrinho.length === 0) { toast('Adicione itens antes de enviar.', 'erro'); return; }

  const sub = carrinho.reduce((s,i) => s + parseFloat(i.preco) * i.qtd, 0);
  const obsGeral = document.getElementById('ped-obs')?.value || '';
  const direto = !!restauranteAtual.comanda_direto_cozinha;

  const dadosPedido = {
    restaurante_id: restauranteAtual.id,
    status: direto ? 'preparando' : 'novo',
    endereco: `Mesa ${comandaAtual.mesa}`,
    bairro: 'Salão',
    frete: 0, subtotal: sub, total: sub,
    codigo_comanda_id: comandaAtual.id,
    observacao: `Comanda — Mesa ${comandaAtual.mesa}${obsGeral ? '\nObs: '+obsGeral : ''}`
  };
  if (direto) dadosPedido.aceito_em = new Date().toISOString();

  const { data: pedido, error } = await db.from('pedidos').insert(dadosPedido).select().single();

  if (error || !pedido) { toast('Erro ao enviar pedido. Tente de novo.', 'erro'); return; }

  const { error: erroItens } = await db.from('pedido_itens').insert(carrinho.map(i => ({
    pedido_id: pedido.id, item_id: i.resgate ? null : i.id, nome: i.nome,
    preco: i.preco, quantidade: i.qtd, observacao: i.obs || null
  })));
  if (erroItens) console.error('Erro ao salvar itens da comanda:', erroItens);

  carrinho = [];
  atualizarCarrinho();
  fecharModal('modal-carrinho');
  if (document.getElementById('ped-obs')) document.getElementById('ped-obs').value = '';
  if (direto) imprimirComandaPorId(pedido.id);
  toast(direto ? `Pedido enviado direto pra cozinha — Mesa ${comandaAtual.mesa}! 🍽️` : `Pedido enviado pra cozinha — Mesa ${comandaAtual.mesa}! 🍽️`, 'ok');
}

function sairModoComanda() {
  modoComandaAtivo = false;
  comandaAtual = null;
  carrinho = [];
  const url = new URL(window.location.href);
  url.searchParams.delete('comanda');
  window.history.replaceState({}, '', url.pathname);
  mostrarTela('painel');
  irPara(meuPapel === 'dono' ? 'dashboard' : 'pedidos');
}

async function abrirFechamentoComanda() {
  if (!comandaAtual) return;
  document.getElementById('fechar-comanda-mesa').textContent = `Mesa ${comandaAtual.mesa}`;
  document.getElementById('fechar-comanda-lista').innerHTML = 'Carregando...';
  document.getElementById('fechar-comanda-total').textContent = 'R$ 0,00';
  abrirModal('modal-fechar-comanda');

  const { data: codigo } = await db.from('codigos_comanda').select('aberta_em').eq('id', comandaAtual.id).single();
  const abertaEm = codigo?.aberta_em;

  const { data: pedidos } = await db.from('pedidos')
    .select('id,total,criado_em,pedido_itens(nome,quantidade,preco)')
    .eq('codigo_comanda_id', comandaAtual.id)
    .gte('criado_em', abertaEm)
    .order('criado_em');

  const lista = document.getElementById('fechar-comanda-lista');
  if (!pedidos || pedidos.length === 0) {
    lista.innerHTML = '<div class="empty"><div class="empty-txt">Nenhum pedido registrado ainda nessa visita.</div></div>';
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
}

async function confirmarFechamentoComanda() {
  if (!comandaAtual) return;
  if (!confirm('Confirma o pagamento e libera essa mesa pra um novo cliente?')) return;

  // Calcula o total de novo (mesma lógica da tela de fechamento) pra guardar no histórico
  const { data: codigoAtual } = await db.from('codigos_comanda').select('aberta_em').eq('id', comandaAtual.id).single();
  const { data: pedidosFechando } = await db.from('pedidos').select('total')
    .eq('codigo_comanda_id', comandaAtual.id).gte('criado_em', codigoAtual?.aberta_em || '1970-01-01');
  const totalFechamento = (pedidosFechando||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);

  if (comandaAtual.historicoId) {
    await db.from('comandas_historico').update({
      fechada_em: new Date().toISOString(), total: totalFechamento
    }).eq('id', comandaAtual.historicoId);
  }

  const { error } = await db.from('codigos_comanda').update({
    status: 'livre', mesa: null, aberta_em: null
  }).eq('id', comandaAtual.id);

  if (error) { toast('Erro ao liberar a mesa. Tente de novo.', 'erro'); return; }

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

  const { data: pedHoje } = await db.from('pedidos').select('total').eq('restaurante_id', rid).in('status', ['preparando','entrega','entregue']).gte('criado_em', inicioDoDiaLocal());
  const { data: pedMes } = await db.from('pedidos').select('total').eq('restaurante_id', rid).in('status', ['preparando','entrega','entregue']).gte('criado_em', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
  const { data: comandaHoje } = await db.from('comandas_historico').select('id').eq('restaurante_id', rid).gte('aberta_em', inicioDoDiaLocal());
  const { data: comandaMes } = await db.from('comandas_historico').select('id').eq('restaurante_id', rid).gte('aberta_em', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
  const { data: comandaFatHoje } = await db.from('comandas_historico').select('total').eq('restaurante_id', rid).not('fechada_em', 'is', null).gte('fechada_em', inicioDoDiaLocal());
  const { data: comandaFatMes } = await db.from('comandas_historico').select('total').eq('restaurante_id', rid).not('fechada_em', 'is', null).gte('fechada_em', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
  const { data: clientes } = await db.from('clientes').select('id').eq('restaurante_id', rid);
  const { data: pedidosDelivery } = await db.from('pedidos').select('*,clientes(nome),pedido_itens(nome,quantidade,preco)').eq('restaurante_id', rid).is('codigo_comanda_id', null).order('criado_em', {ascending:false}).limit(5);
  const { data: pedidosComanda } = await db.from('pedidos').select('*,clientes(nome),pedido_itens(nome,quantidade,preco)').eq('restaurante_id', rid).not('codigo_comanda_id', 'is', null).order('criado_em', {ascending:false}).limit(5);

  const fatHoje = (pedHoje||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);
  const fatMes = (pedMes||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);
  const fatComandaHoje = (comandaFatHoje||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);
  const fatComandaMes = (comandaFatMes||[]).reduce((s,p) => s + parseFloat(p.total||0), 0);
  const ticketMedio = pedHoje && pedHoje.length ? (fatHoje / pedHoje.length) : 0;

  document.getElementById('conteudo').innerHTML = `
    <div class="metricas">
      <div class="metrica"><div class="metrica-label">Pedidos hoje</div><div class="metrica-val">${(pedHoje||[]).length}</div></div>
      <div class="metrica"><div class="metrica-label">Faturamento hoje</div><div class="metrica-val laranja">R$ ${fatHoje.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica"><div class="metrica-label">Ticket médio</div><div class="metrica-val">R$ ${ticketMedio.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica"><div class="metrica-label">Faturamento do mês</div><div class="metrica-val">R$ ${fatMes.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica">
        <div class="metrica-label">Clientes</div>
        <div class="metrica-val">${(clientes||[]).length}</div>
        <button class="btn-sm" style="margin-top:6px;" onclick="resetarFormCliente();abrirModal('modal-cadastro-cliente')">+ Cadastrar cliente</button>
      </div>
    </div>
    <div class="metricas">
      <div class="metrica"><div class="metrica-label">🍽️ Comandas hoje</div><div class="metrica-val">${(comandaHoje||[]).length}</div></div>
      <div class="metrica"><div class="metrica-label">🍽️ Faturamento comandas hoje</div><div class="metrica-val laranja">R$ ${fatComandaHoje.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica"><div class="metrica-label">🍽️ Comandas no mês</div><div class="metrica-val">${(comandaMes||[]).length}</div></div>
      <div class="metrica"><div class="metrica-label">🍽️ Faturamento comandas no mês</div><div class="metrica-val">R$ ${fatComandaMes.toFixed(2).replace('.',',')}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
    <div class="card">
      <div class="card-titulo">Últimos pedidos</div>
      ${(pedidosDelivery||[]).length === 0 ? '<div class="empty"><div class="empty-ico">🛵</div><div class="empty-txt">Nenhum pedido ainda</div></div>' :
        (pedidosDelivery||[]).map(p => `
          <div class="pedido-card">
            <div class="pedido-info">
              <div class="pedido-num">#${p.id.slice(-4).toUpperCase()} — ${esc(p.observacao?.split('Nome:')[1]?.split('\n')[0]?.trim() || p.clientes?.nome || 'Cliente')}</div>
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
    const itensTxt = (p.pedido_itens||[]).map(i => `${i.quantidade}x ${esc(i.nome)}${i.observacao?' ('+esc(i.observacao)+')':''}`).join(' · ');
    const mesaMatch = (p.observacao||'').match(/Mesa\s+(\S+)/);
    return `
      <div class="kanban-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <div class="pedido-num">#${p.id.slice(-4).toUpperCase()}</div>
          <div class="pedido-val">R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</div>
        </div>
        ${mesaMatch ? `<div style="display:inline-block;background:var(--laranja);color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px;">🍽️ Mesa ${esc(mesaMatch[1])}</div>` : ''}
        ${p.status === 'preparando' && p.aceito_em ? `<div style="display:inline-block;background:#FFF3E0;color:#B26A00;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px;margin-left:4px;">⏱️ ${tempoDecorridoTexto(p.aceito_em)} em preparo</div>` : ''}
        <div class="pedido-cliente" style="margin-bottom:8px;">${esc(p.endereco)} — ${esc(p.bairro)}</div>
        <div style="font-size:12px;color:var(--texto-muted);margin-bottom:10px;">${itensTxt}</div>
        ${p.observacao ? `<div style="font-size:11px;color:var(--laranja);margin-bottom:10px;">${esc(p.observacao).replace(/\n/g,' · ')}</div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${montaBotoesStatus(p, telefone)}
          <button class="btn-sm" onclick="imprimirComandaPorId('${p.id}')" title="Imprimir comanda">🖨️</button>
        </div>
      </div>
    `;
  }

  document.getElementById('conteudo').innerHTML = `
    <div style="font-size:14px;color:var(--texto-muted);margin-bottom:16px;">${lista.length} pedido(s) no total</div>
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
  await autoFinalizarEntregasAntigas();
  if (!restauranteAtual) return;
  const { data: pedidos } = await db.from('pedidos')
    .select('*,pedido_itens(nome,quantidade,preco,observacao)')
    .eq('restaurante_id', restauranteAtual.id)
    .order('criado_em', {ascending: false});

  const ehComanda = p => !!p.codigo_comanda_id || (p.observacao||'').includes('Modo: Consumir no local');
  const lista = (pedidos || []).filter(ehComanda);
  const novos = lista.filter(p => p.status === 'novo');
  const preparando = lista.filter(p => p.status === 'preparando');
  const finalizados = lista.filter(p => p.status === 'entrega' || p.status === 'entregue');

  function montaCard(p) {
    const telefone = extrairTelefone(p);
    const itensTxt = (p.pedido_itens||[]).map(i => `${i.quantidade}x ${esc(i.nome)}${i.observacao?' ('+esc(i.observacao)+')':''}`).join(' · ');
    const mesaMatch = (p.observacao||'').match(/Mesa\s+(\S+)/);
    return `
      <div class="kanban-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <div class="pedido-num">#${p.id.slice(-4).toUpperCase()}</div>
          <div class="pedido-val">R$ ${parseFloat(p.total).toFixed(2).replace('.',',')}</div>
        </div>
        ${mesaMatch ? `<div style="display:inline-block;background:var(--laranja);color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px;">🍽️ Mesa ${esc(mesaMatch[1])}</div>` : ''}
        ${p.status === 'preparando' && p.aceito_em ? `<div style="display:inline-block;background:#FFF3E0;color:#B26A00;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px;margin-left:4px;">⏱️ ${tempoDecorridoTexto(p.aceito_em)} em preparo</div>` : ''}
        <div class="pedido-cliente" style="margin-bottom:8px;">${esc(p.endereco)} — ${esc(p.bairro)}</div>
        <div style="font-size:12px;color:var(--texto-muted);margin-bottom:10px;">${itensTxt}</div>
        ${p.observacao ? `<div style="font-size:11px;color:var(--laranja);margin-bottom:10px;">${esc(p.observacao).replace(/\n/g,' · ')}</div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${montaBotoesStatus(p, telefone)}
          <button class="btn-sm" onclick="imprimirComandaPorId('${p.id}')" title="Imprimir comanda">🖨️</button>
        </div>
      </div>
    `;
  }

  const { data: mesasAbertas } = await db.from('codigos_comanda')
    .select('*').eq('restaurante_id', restauranteAtual.id).eq('status', 'em_uso').order('aberta_em');

  const mesasComTotal = (mesasAbertas||[]).map(m => {
    const pedidosDaMesa = lista.filter(p => p.codigo_comanda_id === m.id && dataDoBanco(p.criado_em) >= dataDoBanco(m.aberta_em));
    const total = pedidosDaMesa.reduce((s,p) => s + parseFloat(p.total||0), 0);
    return { ...m, total, qtdPedidos: pedidosDaMesa.length };
  });

  document.getElementById('conteudo').innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-titulo">🔍 Fechar conta pelo código de barras</div>
      <div style="font-size:12px;color:var(--texto-muted);margin-bottom:10px;">Passe o leitor no código de barras da comanda (ou digite o número e aperte Enter).</div>
      <input type="text" id="busca-codigo-barras" placeholder="Escaneie ou digite o código de 6 dígitos" style="font-size:16px;letter-spacing:2px;" onkeypress="if(event.key==='Enter')buscarComandaPorCodigo()" autocomplete="off">
    </div>
    ${mesasComTotal.length > 0 ? `
    <div class="card" style="margin-bottom:20px;background:var(--laranja-light);border:1.5px dashed var(--laranja);">
      <div class="card-titulo">🍽️ Mesas abertas agora</div>
      ${mesasComTotal.map(m => `
        <div class="frete-row">
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Mesa ${esc(m.mesa)}</div>
            <div style="font-size:12px;color:var(--texto-muted);">${m.qtdPedidos} pedido(s) · aberta desde ${dataDoBanco(m.aberta_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--laranja);margin-right:12px;">R$ ${m.total.toFixed(2).replace('.',',')}</div>
          <a href="?comanda=${m.id}" class="btn-sm" style="text-decoration:none;">Ver / Fechar conta</a>
        </div>
      `).join('')}
    </div>
    ` : ''}
    <div style="font-size:14px;color:var(--texto-muted);margin-bottom:16px;">${lista.length} comanda(s) no total</div>
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

function extrairTelefone(p) {
  const match = (p.observacao||'').match(/Telefone:\s*([^\n]+)/);
  return match ? match[1].trim() : null;
}

function imprimirComandaPorId(id) {
  const pedido = pedidosCache.find(p => p.id === id);
  if (!pedido) { toast('Pedido não encontrado pra imprimir.', 'erro'); return; }
  imprimirComanda(pedido);
}

function imprimirComanda(p) {
  const obs = p.observacao || '';
  const nome = (obs.match(/Nome:\s*([^\n]+)/) || [])[1]?.trim() || 'Cliente';
  const telefone = (obs.match(/Telefone:\s*([^\n]+)/) || [])[1]?.trim() || '';
  const modo = (obs.match(/Modo:\s*([^\n]+)/) || [])[1]?.trim() || '';
  const pagamento = (obs.match(/Pagamento:\s*([^\n]+)/) || [])[1]?.trim() || '';
  const obsGeral = (obs.match(/Obs:\s*([^\n]+)/) || [])[1]?.trim() || '';

  const itensHtml = (p.pedido_itens||[]).map(i => `
    <div class="cp-item">${i.quantidade}x ${esc(i.nome)}${i.observacao ? `<br>&nbsp;&nbsp;Obs: ${esc(i.observacao)}` : ''}</div>
  `).join('');

  document.getElementById('comanda-print').innerHTML = `
    <h2>${esc(restauranteAtual?.nome) || 'Pedido'}</h2>
    <div style="text-align:center;">Pedido #${p.id.slice(-4).toUpperCase()}</div>
    <div style="text-align:center;">${dataDoBanco(p.criado_em).toLocaleString('pt-BR')}</div>
    <div class="cp-linha"></div>
    <div><strong>${esc(modo)}</strong></div>
    <div>Cliente: ${esc(nome)}</div>
    ${telefone ? `<div>Tel: ${esc(telefone)}</div>` : ''}
    ${p.endereco ? `<div>End: ${esc(p.endereco)}</div>` : ''}
    ${p.bairro ? `<div>Bairro: ${esc(p.bairro)}</div>` : ''}
    <div class="cp-linha"></div>
    ${itensHtml}
    <div class="cp-linha"></div>
    <div>Pagamento: ${esc(pagamento)}</div>
    ${obsGeral ? `<div>Obs geral: ${esc(obsGeral)}</div>` : ''}
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
      const msg = modelo.replace(/%cliente%/g, nomeCliente).replace(/%pedido%/g, numPedido);
      const fone = telefone.replace(/\D/g, '');
      window.open(`https://wa.me/${fone}?text=${encodeURIComponent(msg)}`, 'wa_servidelivery');
    }
  }

  if (novoStatus === 'preparando') {
    imprimirComandaPorId(id);
  }

  if (paginaAtual === 'pedidos') renderPedidos(); else if (paginaAtual === 'comandas') renderComandas();
}

async function mudarStatus(id, status) {
  await db.from('pedidos').update({ status }).eq('id', id);
  toast('Status atualizado!', 'ok');
  if (paginaAtual === 'pedidos') renderPedidos(); else if (paginaAtual === 'comandas') renderComandas();
}
