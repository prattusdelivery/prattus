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

// Editar pedido DEPOIS de aceito ("Em preparo") e também em delivery/retirada que ainda NÃO foi pago:
// por enquanto só na loja Demo. Para liberar para todas as lojas, troque o return por !!restauranteAtual.
function editarPedidoNovoAtivo() {
  return !!(restauranteAtual && restauranteAtual.slug === 'servidelivery-demo');
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
    mesa: ((p.observacao || '').match(/Mesa\s+(\S+)/) || [])[1] || ''
  };
  ecomDesenhar();
}

function ecomFechar() {
  const el = document.getElementById('ecom-fundo');
  if (el) el.remove();
  ecomEstado = null;
}

function ecomTotalNovo() {
  if (!ecomEstado) return 0;
  let delta = 0;
  ecomEstado.itens.forEach(i => { delta += i.preco * (i.qtdOriginal - i.qtd); });
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
  const sobram = itens.filter(i => i.qtd > 0);
  const mudou = itens.some(i => i.qtd !== i.qtdOriginal);
  fundo.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:440px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3);">
      <div style="font-weight:800;font-size:17px;">✏️ Editar ${ecomEstado.ehComanda ? 'comanda' : 'pedido'}${ecomEstado.mesa ? ' — Mesa ' + esc(ecomEstado.mesa) : ''}</div>
      <div style="font-size:12px;color:var(--texto-muted);margin:4px 0 12px;line-height:1.5;">Use + e − para mudar a quantidade ou "Tirar" para tirar o item.${ecomEstado.ehComanda ? ' Para um item que não está na lista, toque na mesa e faça um pedido novo.' : ''}</div>
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
    if (!mudancas.length || est.itens.every(i => i.qtd === 0)) { ecomFechar(); return; }
    // Calcula o novo total; grava os itens e, por último, o total
    const novoTotal = ecomTotalNovo();
    let delta = 0;
    mudancas.forEach(i => { delta += i.preco * (i.qtdOriginal - i.qtd); });
    const dados = { total: novoTotal };
    if (est.subOriginal !== null && !isNaN(est.subOriginal)) dados.subtotal = Math.max(0, Math.round((est.subOriginal - delta) * 100) / 100);
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
