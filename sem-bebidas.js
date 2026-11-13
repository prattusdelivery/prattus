// ===== NÃO IMPRIMIR BEBIDAS (só comandas) =====
// Pedido do cliente Quiosque da Praça: as bebidas ficam só no sistema, não saem no papel.
//  • Comanda com comida e bebida: imprime só a comida.
//  • Comanda só de bebida: não imprime nada (fica só no sistema).
//  • Delivery não muda. Vale só neste aparelho (chavinha em Configurações > Impressão e comandas).
// Só aparece nas lojas da lista abaixo. Se qualquer coisa der errado, imprime do jeito de sempre.

var SEMB_LOJAS = ['servidelivery-demo'];

function semBebidasLiberado() {
  return !!restauranteAtual && SEMB_LOJAS.indexOf(restauranteAtual.slug) >= 0;
}

function semBebidasAtivo() {
  if (!semBebidasLiberado()) return false;
  try { return localStorage.getItem('nao_imprimir_bebidas_' + restauranteAtual.id) === 'true'; } catch (e) { return false; }
}

// Devolve { vazio: true } (só tem bebida), ou { pedido } (cópia do pedido sem as bebidas; o total acompanha)
async function semBebidasFiltrar(p) {
  const { data: linhas, error } = await db.from('pedido_itens').select('item_id,nome,quantidade,preco,observacao').eq('pedido_id', p.id);
  if (error || !linhas || !linhas.length) throw new Error('sem-itens');
  const ids = [...new Set(linhas.map(l => l.item_id).filter(Boolean))];
  const catDoItem = {};
  if (ids.length) {
    const { data: its, error: e2 } = await db.from('itens').select('id,categoria_id').in('id', ids);
    if (e2) throw new Error('sem-itens-cat');
    (its || []).forEach(i => { catDoItem[i.id] = i.categoria_id; });
  }
  const { data: cats, error: e3 } = await db.from('categorias').select('id,nome').eq('restaurante_id', restauranteAtual.id);
  if (e3) throw new Error('sem-categorias');
  const bebidas = (typeof impCategoriasBebida === 'function') ? impCategoriasBebida(cats) : new Set();
  const comida = linhas.filter(l => !(l.item_id && bebidas.has(catDoItem[l.item_id])));
  if (!comida.length) return { vazio: true };
  if (comida.length === linhas.length) return { pedido: Object.assign({}, p, { __semBebidas: true }) };
  const total = comida.reduce((s, l) => s + (parseFloat(l.preco) || 0) * (parseInt(l.quantidade) || 1), 0);
  return { pedido: Object.assign({}, p, { pedido_itens: comida, total: total, __semBebidas: true }) };
}

// ---------- Configurações: lista de categorias que são bebida ----------
function semBebidasBlocoHtml() {
  if (!semBebidasLiberado()) return '';
  return `
    <div class="form-group" style="background:var(--creme);border-radius:10px;padding:14px;margin-top:10px;">
      <label style="font-weight:700;">🥤 Quais categorias são bebida</label>
      <div style="font-size:12px;color:var(--texto-muted);margin:2px 0 8px;line-height:1.5;">Serve para a chavinha "Bebidas só no sistema (não imprimir)". As categorias marcadas aqui NÃO saem no papel da comanda; elas continuam aparecendo na tela do sistema. O sistema já marca sozinho pelo nome. Confira se está certo.</div>
      <div id="semb-lista" style="font-size:14px;">Carregando...</div>
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="" style="display:none" onload="semBebidasCarregarCats()">
    </div>`;
}

async function semBebidasCarregarCats() {
  const el = document.getElementById('semb-lista');
  if (!el || !restauranteAtual) return;
  try {
    const { data: cats, error } = await db.from('categorias').select('id,nome').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('ordem');
    if (error) throw error;
    const marcadas = impCategoriasBebida(cats || []);
    el.innerHTML = (cats || []).length ? (cats || []).map(c => `
      <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--creme-borda);cursor:pointer;">
        <input type="checkbox" class="semb-cat" value="${esc(c.id)}" ${marcadas.has(c.id) ? 'checked' : ''} onchange="semBebidasSalvarCats()" style="width:auto;">
        <span>${esc(c.nome)}</span>
      </label>`).join('') : 'Nenhuma categoria no cardápio ainda.';
  } catch (e) {
    el.textContent = 'Não consegui carregar as categorias agora. Tente abrir Configurações de novo.';
  }
}

function semBebidasSalvarCats() {
  const ids = Array.from(document.querySelectorAll('.semb-cat:checked')).map(i => i.value);
  impGravar('imp_cats_bebida', JSON.stringify(ids));
  toast('Salvo. Categorias marcadas não saem no papel.', 'ok');
}
