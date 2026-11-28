// ===== EDITAR COMANDA =====
// Botão "Editar comanda" no cartão de um pedido de mesa que ainda está "Aguardando confirmação".
// Deixa TIRAR um item ou AUMENTAR/DIMINUIR a quantidade. O total do pedido (e da mesa) acompanha.
// Regras:
//  • só dono e gerente (o garçom não vê);
//  • só enquanto o pedido está aguardando (antes de ir para a cozinha);
//  • pedido aguardando ainda NÃO saiu no papel (o papel sai quando ele vai para a cozinha), então dá para editar com segurança.
// Liberado para todas as lojas.



function editarComandaLiberado() {
  return !!restauranteAtual;
}

// Editar pedido DEPOIS de aceito ("Em preparo"), com "Adicionar item", e também em delivery/retirada que ainda NÃO foi pago.
// Liberado para todas as lojas.
function editarPedidoNovoAtivo() {
  return !!restauranteAtual;
}

function editarComandaPode(p) {
  try {
    if (!editarComandaLiberado()) return false;
    if (typeof meuPapel !== 'undefined' && meuPapel === 'garcom') return false;
    if (!p) return false;
    const itens = p.pedido_itens || [];
    if (!(itens.length > 0 && itens.every(i => i.id))) return false;
    if (editarPedidoNovoAtivo()) {
      if (p.status !== 'novo' && p.status !== 'preparando') return false;
      // Delivery/retirada: só se o cliente ainda NÃO pagou (nem online, nem Pix na chave). Comanda de mesa: paga ao fechar a mesa.
      if (!p.codigo_comanda_id) {
        const d = (typeof dadosPagamento === 'function') ? dadosPagamento(p) : null;
        if (!d || d.pago || d.pixManual) return false;
      }
      return true;
    }
    return p.status === 'novo' && !!p.codigo_comanda_id;
  } catch (e) { return false; }
}

var ecomEstado = null; // { id, itens:[{id,nome,preco,qtdOriginal,qtd,obs}], totalOriginal, subOriginal }

function ecomReais(v) { return 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ','); }

function editarComandaAbrir(pedidoId) {
  const p = (typeof pedidosCache !== 'undefined' ? pedidosCache : []).find(x => x.id === pedidoId);
  if (!p || !editarComandaPode(p)) { toast('Não dá mais para editar este pedido.', 'erro'); return; }
  ecomEstado = {
    id: p.id,
    status: p.status,
    ehComanda: !!p.codigo_comanda_id,
    totalOriginal: parseFloat(p.total) || 0,
    subOriginal: (p.subtotal === null || p.subtotal === undefined) ? null : parseFloat(p.subtotal),
    itens: (p.pedido_itens || []).map(i => ({
      id: i.id, nome: i.nome, preco: parseFloat(i.preco) || 0,
      qtdOriginal: parseInt(i.quantidade) || 1, qtd: parseInt(i.quantidade) || 1, obs: i.observacao || ''
    })),
    novos: [],
    mesa: ((p.observacao || '').match(/Mesa\s+(\S+)/) || [])[1] || ''
  };
  ecomDesenhar();
}

function ecomFechar() {
  const el = document.getElementById('ecom-fundo');
  if (el) el.remove();
  const pk = document.getElementById('ecom-picker');
  if (pk) pk.remove();
  window.ecomAdicionando = false;
  try { document.getElementById('modal-item-cliente').style.zIndex = ''; } catch (e) {}
  ecomEstado = null;
}

function ecomTotalNovo() {
  if (!ecomEstado) return 0;
  let delta = 0;
  ecomEstado.itens.forEach(i => { delta += i.preco * (i.qtdOriginal - i.qtd); });
  (ecomEstado.novos || []).forEach(n => { delta -= n.preco * n.qtd; });
  return Math.max(0, Math.round((ecomEstado.totalOriginal - delta) * 100) / 100);
}

function ecomDesenhar() {
  if (!ecomEstado) return;
  let fundo = document.getElementById('ecom-fundo');
  if (!fundo) {
    fundo = document.createElement('div');
    fundo.id = 'ecom-fundo';
    fundo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(fundo);
  }
  const itens = ecomEstado.itens;
  const novos = ecomEstado.novos || [];
  const sobram = itens.filter(i => i.qtd > 0).concat(novos);
  const mudou = itens.some(i => i.qtd !== i.qtdOriginal) || novos.length > 0;
  fundo.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:440px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3);">
      <div style="font-weight:800;font-size:17px;">✏️ Editar ${ecomEstado.ehComanda ? 'comanda' : 'pedido'}${ecomEstado.mesa ? ' — Mesa ' + esc(ecomEstado.mesa) : ''}</div>
      <div style="font-size:12px;color:var(--texto-muted);margin:4px 0 12px;line-height:1.5;">Use + e − para mudar a quantidade ou "Tirar" para tirar o item.</div>
      ${itens.map((i, n) => `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--creme-borda);${i.qtd === 0 ? 'opacity:.45;' : ''}">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;${i.qtd === 0 ? 'text-decoration:line-through;' : ''}">${i.qtd}x ${esc(i.nome)}</div>
            ${i.obs ? `<div style="font-size:12px;color:var(--texto-muted);">${esc(i.obs)}</div>` : ''}
            <div style="font-size:12px;color:var(--texto-muted);">${ecomReais(i.preco)} cada</div>
          </div>
          ${i.qtd > 0 ? `
            <button class="btn-sm" onclick="ecomMenos(${n})" ${i.qtd <= 1 ? 'disabled style="opacity:.4;"' : ''} title="Diminuir 1">−</button>
            <button class="btn-sm" onclick="ecomMais(${n})" ${i.qtd >= 99 ? 'disabled style="opacity:.4;"' : ''} title="Aumentar 1">+</button>
            <button class="btn-sm perigo" onclick="ecomTirar(${n})">Tirar</button>` : `
            <button class="btn-sm" onclick="ecomDesfazer(${n})">Desfazer</button>`}
        </div>`).join('')}
      ${novos.map((n, k) => `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--creme-borda);background:#F1F8F4;margin:0 -6px;padding-left:6px;padding-right:6px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;">${n.qtd}x ${esc(n.nome)} <span style="font-size:10px;background:#0F6E56;color:#fff;padding:2px 7px;border-radius:10px;font-weight:700;">NOVO</span></div>
            ${n.obs ? `<div style="font-size:12px;color:var(--texto-muted);">${esc(n.obs)}</div>` : ''}
            <div style="font-size:12px;color:var(--texto-muted);">${ecomReais(n.preco)} cada</div>
          </div>
          <button class="btn-sm" onclick="ecomNovoMenos(${k})" ${n.qtd <= 1 ? 'disabled style="opacity:.4;"' : ''} title="Diminuir 1">−</button>
          <button class="btn-sm" onclick="ecomNovoMais(${k})" ${n.qtd >= 99 ? 'disabled style="opacity:.4;"' : ''} title="Aumentar 1">+</button>
          <button class="btn-sm perigo" onclick="ecomNovoTirar(${k})">Tirar</button>
        </div>`).join('')}
      <button class="btn-sm" id="ecom-add" style="width:100%;padding:12px;margin:10px 0 4px;border:1.5px dashed #0F6E56;color:#0F6E56;background:#fff;font-weight:700;" onclick="ecomAbrirPicker()">➕ Adicionar item</button>
      <div style="display:flex;justify-content:space-between;align-items:center;border-top:2px solid var(--creme-borda);padding-top:12px;margin-top:4px;">
        <div style="font-weight:700;">Total do pedido</div>
        <div style="font-weight:800;font-size:17px;color:var(--laranja);">${ecomReais(ecomTotalNovo())}</div>
      </div>
      ${sobram.length === 0 ? (ecomEstado.status === 'novo'
        ? '<div style="font-size:12px;color:#c0392b;margin-top:8px;">Para tirar tudo, feche aqui e use o botão <b>Recusar</b>.</div>'
        : '<div style="font-size:12px;color:#c0392b;margin-top:8px;">Precisa ficar pelo menos 1 item no pedido. Toque em <b>Desfazer</b>.</div>') : ''}
      ${ecomEstado.status === 'preparando'
        ? '<div style="font-size:12px;color:#8F3010;background:#FFF3E0;border-radius:8px;padding:8px 10px;margin-top:10px;line-height:1.5;">⚠️ Este pedido já está em preparo. Ao salvar, vai imprimir de novo, com o aviso <b>PEDIDO ALTERADO</b>. Avise a cozinha para jogar fora o papel antigo.</div>'
        : '<div style="font-size:12px;color:#8F3010;background:#FFF3E0;border-radius:8px;padding:8px 10px;margin-top:10px;line-height:1.5;">⚠️ Se você já imprimiu este pedido, avise a cozinha da mudança.</div>'}
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn-sm" style="flex:1;padding:12px;" onclick="ecomFechar()">Cancelar</button>
        <button class="btn-sm" id="ecom-salvar" style="flex:1;padding:12px;background:var(--verde);color:#fff;border:none;${(!mudou || sobram.length === 0) ? 'opacity:.4;' : ''}" ${(!mudou || sobram.length === 0) ? 'disabled' : ''} onclick="ecomSalvar()">Salvar alterações</button>
      </div>
    </div>`;
}

function ecomMenos(n) { const i = ecomEstado && ecomEstado.itens[n]; if (i && i.qtd > 1) { i.qtd--; ecomDesenhar(); } }
function ecomMais(n) { const i = ecomEstado && ecomEstado.itens[n]; if (i && i.qtd < 99) { i.qtd++; ecomDesenhar(); } }
function ecomTirar(n) { const i = ecomEstado && ecomEstado.itens[n]; if (i) { i.qtd = 0; ecomDesenhar(); } }
function ecomNovoMenos(k) { const n = ecomEstado && ecomEstado.novos[k]; if (n && n.qtd > 1) { n.qtd--; ecomDesenhar(); } }
function ecomNovoMais(k) { const n = ecomEstado && ecomEstado.novos[k]; if (n && n.qtd < 99) { n.qtd++; ecomDesenhar(); } }
function ecomNovoTirar(k) { if (ecomEstado && ecomEstado.novos[k]) { ecomEstado.novos.splice(k, 1); ecomDesenhar(); } }

// Item novo escolhido (vem do seletor ou da janela de opções do cardápio)
function ecomReceberNovo(n) {
  if (!ecomEstado) return;
  const preco = parseFloat(n.preco) || 0;
  const obs = n.obs || '';
  const ja = ecomEstado.novos.find(x => x.item_id === n.item_id && x.obs === obs && x.preco === preco);
  if (ja) ja.qtd = Math.min(99, ja.qtd + (n.qtd || 1));
  else ecomEstado.novos.push({ item_id: n.item_id, nome: n.nome, preco: preco, qtd: n.qtd || 1, obs: obs });
  const pk = document.getElementById('ecom-picker');
  if (pk) pk.remove();
  window.ecomAdicionando = false;
  try { document.getElementById('modal-item-cliente').style.zIndex = ''; } catch (e) {}
  ecomDesenhar();
  toast(n.nome + ' adicionado.', 'ok');
}

var ecomCardapio = null; // { itens, cats } — carregado ao abrir o seletor

function ecomEsgotado(it) { return !!(it.esgotado_ate && new Date(it.esgotado_ate) > new Date()); }

async function ecomAbrirPicker() {
  if (!ecomEstado) return;
  window.ecomAdicionando = true;
  let pk = document.getElementById('ecom-picker');
  if (pk) pk.remove();
  pk = document.createElement('div');
  pk.id = 'ecom-picker';
  pk.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
  pk.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:440px;width:100%;max-height:90vh;display:flex;flex-direction:column;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3);">' +
    '<div style="font-weight:800;font-size:17px;margin-bottom:10px;">➕ Qual item adicionar?</div>' +
    '<input id="ecom-busca" type="search" placeholder="Digite para procurar" oninput="ecomFiltrarPicker()" style="width:100%;padding:12px;border:1.5px solid var(--creme-borda);border-radius:10px;font-size:15px;margin-bottom:10px;box-sizing:border-box;">' +
    '<div id="ecom-lista" style="overflow:auto;flex:1;min-height:120px;font-size:14px;color:var(--texto-muted);">Carregando o cardápio...</div>' +
    '<button class="btn-sm" style="width:100%;padding:12px;margin-top:12px;" onclick="ecomFecharPicker()">Voltar</button></div>';
  document.body.appendChild(pk);
  try {
    if (!ecomCardapio || ecomCardapio.rid !== restauranteAtual.id) {
      const [ri, rc] = await Promise.all([
        db.from('itens').select('*').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('nome'),
        db.from('categorias').select('*').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('ordem')
      ]);
      if (ri.error || rc.error) throw new Error('cardapio');
      ecomCardapio = { rid: restauranteAtual.id, itens: (ri.data || []).filter(i => i.disponivel !== false), cats: rc.data || [] };
    }
    ecomFiltrarPicker();
  } catch (e) {
    console.error('Cardápio para adicionar item falhou:', e);
    const l = document.getElementById('ecom-lista');
    if (l) l.innerHTML = 'Não consegui abrir o cardápio. Toque em Voltar e tente de novo.';
  }
}

function ecomFecharPicker() {
  const pk = document.getElementById('ecom-picker');
  if (pk) pk.remove();
  window.ecomAdicionando = false;
}

function ecomFiltrarPicker() {
  const l = document.getElementById('ecom-lista');
  if (!l || !ecomCardapio) return;
  const t = ((document.getElementById('ecom-busca') || {}).value || '').trim().toLowerCase();
  let itens = ecomCardapio.itens;
  if (t) itens = itens.filter(i => (i.nome || '').toLowerCase().includes(t) || (i.descricao || '').toLowerCase().includes(t));
  if (!itens.length) { l.innerHTML = '<div style="padding:16px 0;">Nenhum item encontrado.</div>'; return; }
  const linha = it => {
    const sem = (typeof itemSemPreco === 'function' && itemSemPreco(it));
    const esg = ecomEsgotado(it);
    const bloq = sem || esg;
    const preco = (typeof precoExibicaoItem === 'function') ? precoExibicaoItem(it) : ecomReais(it.preco);
    return `<div ${bloq ? '' : `onclick="ecomEscolherItem('${it.id}')"`} class="ecom-linha-item" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 4px;border-top:1px solid var(--creme-borda);${bloq ? 'opacity:.5;' : 'cursor:pointer;'}">
      <div style="min-width:0;color:var(--texto);font-weight:600;">${esc(it.nome)}${esg ? ' <span style="font-size:10px;background:#FBE1DE;color:#B3261E;padding:2px 7px;border-radius:10px;">ESGOTADO</span>' : ''}${sem ? ' <span style="font-size:10px;color:var(--texto-muted);">sem valor</span>' : ''}</div>
      <div style="font-size:13px;color:var(--laranja);font-weight:700;white-space:nowrap;">${preco}</div></div>`;
  };
  let html = '';
  const ids = new Set(ecomCardapio.cats.map(c => c.id));
  ecomCardapio.cats.forEach(c => {
    const lista = itens.filter(i => i.categoria_id === c.id);
    if (lista.length) html += `<div style="font-size:12px;font-weight:800;color:var(--laranja-dark);text-transform:uppercase;letter-spacing:.4px;margin:12px 0 2px;">${esc(c.nome)}</div>` + lista.map(linha).join('');
  });
  const outros = itens.filter(i => !ids.has(i.categoria_id));
  if (outros.length) html += `<div style="font-size:12px;font-weight:800;color:var(--laranja-dark);text-transform:uppercase;letter-spacing:.4px;margin:12px 0 2px;">Outros</div>` + outros.map(linha).join('');
  l.innerHTML = html;
}

function ecomEscolherItem(id) {
  const it = ecomCardapio && ecomCardapio.itens.find(i => i.id === id);
  if (!it || !ecomEstado) return;
  if (ecomEsgotado(it)) { toast('Este item esgotou por hoje.', 'erro'); return; }
  if (it.opcoes && it.opcoes.length > 0) {
    // Tem opções (tamanho, adicionais...): abre a janela de opções do cardápio, por cima desta
    const m = document.getElementById('modal-item-cliente');
    if (m) m.style.zIndex = '10001';
    window.ecomAdicionando = true;
    abrirModalItem(it);
    return;
  }
  const preco = (it.preco_promocional && parseFloat(it.preco_promocional) < parseFloat(it.preco)) ? parseFloat(it.preco_promocional) : parseFloat(it.preco);
  ecomReceberNovo({ item_id: it.id, nome: it.nome, preco: preco, qtd: 1, obs: '' });
}

function ecomDesfazer(n) { const i = ecomEstado && ecomEstado.itens[n]; if (i) { i.qtd = i.qtdOriginal; ecomDesenhar(); } }

async function ecomSalvar() {
  if (!ecomEstado) return;
  const est = ecomEstado;
  const btn = document.getElementById('ecom-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
  try {
    // Confere de novo que o pedido continua editável (pode ter avançado enquanto a janela estava aberta)
    const permitidos = editarPedidoNovoAtivo() ? ['novo', 'preparando'] : ['novo'];
    const { data: atual, error: e0 } = await db.from('pedidos').select('status').eq('id', est.id).maybeSingle();
    if (e0 || !atual) throw new Error('nao-achei');
    if (!permitidos.includes(atual.status)) {
      toast(atual.status === 'novo' || atual.status === 'preparando' ? 'Não dá mais para editar este pedido.' : 'Este pedido já saiu. Não dá mais para editar.', 'erro');
      ecomFechar();
      ecomAtualizarTela();
      return;
    }
    const mudancas = est.itens.filter(i => i.qtd !== i.qtdOriginal);
    const novos = est.novos || [];
    if ((!mudancas.length && !novos.length) || (est.itens.every(i => i.qtd === 0) && !novos.length)) { ecomFechar(); return; }
    // Calcula o novo total; grava os itens e, por último, o total
    const novoTotal = ecomTotalNovo();
    let delta = 0;
    mudancas.forEach(i => { delta += i.preco * (i.qtdOriginal - i.qtd); });
    novos.forEach(n => { delta -= n.preco * n.qtd; });
    const dados = { total: novoTotal };
    if (est.subOriginal !== null && !isNaN(est.subOriginal)) dados.subtotal = Math.max(0, Math.round((est.subOriginal - delta) * 100) / 100);
    // Primeiro grava os itens novos (se falhar, nada foi tirado); depois tira/muda os antigos; por último o total
    if (novos.length) {
      const { error: eN } = await db.from('pedido_itens').insert(novos.map(n => ({
        pedido_id: est.id, item_id: n.item_id, nome: n.nome, preco: n.preco, quantidade: n.qtd, observacao: n.obs || null
      })));
      if (eN) throw eN;
    }
    for (const i of mudancas) {
      if (i.qtd === 0) {
        const { error } = await db.from('pedido_itens').delete().eq('id', i.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('pedido_itens').update({ quantidade: i.qtd }).eq('id', i.id);
        if (error) throw error;
      }
    }
    const { error: e2 } = await db.from('pedidos').update(dados).eq('id', est.id).in('status', permitidos);
    if (e2) throw e2;
    toast(est.ehComanda ? 'Comanda atualizada.' : 'Pedido atualizado.', 'ok');
    ecomFechar();
    ecomAtualizarTela();
    // Pedido que já estava em preparo já tinha saído no papel: imprime de novo com o aviso "PEDIDO ALTERADO"
    if (editarPedidoNovoAtivo() && atual.status === 'preparando') {
      try {
        const { data: ped } = await db.from('pedidos').select('*,pedido_itens(id,nome,quantidade,preco,observacao)').eq('id', est.id).maybeSingle();
        if (ped && typeof imprimirComanda === 'function') imprimirComanda(Object.assign({}, ped, { __alterado: true }));
      } catch (e3) { console.error('Reimpressão após editar falhou:', e3); toast('Salvou, mas não consegui imprimir de novo. Use o botão Imprimir.', 'erro'); }
    }
  } catch (e) {
    console.error('Editar pedido falhou:', e);
    toast('Não consegui salvar. Confira o pedido na tela e tente de novo.', 'erro');
    ecomFechar();
    ecomAtualizarTela();
  }
}

function ecomAtualizarTela() {
  try {
    if (paginaAtual === 'comandas') renderComandas();
    else if (paginaAtual === 'pedidos') renderPedidos();
  } catch (e) {}
}
