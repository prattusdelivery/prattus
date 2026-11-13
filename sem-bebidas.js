// ===== NÃO IMPRIMIR BEBIDAS (só comandas) =====
// Pedido do cliente Quiosque da Praça: as bebidas ficam só no sistema, não saem no papel.
//  • Comanda com comida e bebida: imprime só a comida.
//  • Comanda só de bebida: não imprime nada (fica só no sistema).
//  • Delivery não muda.
// A escolha fica guardada NA LOJA (coluna restaurantes.sem_bebidas = {ativo:true, cats:[ids]}),
// então vale para todos os aparelhos da loja, não só para o aparelho onde foi ligada.
// Só aparece nas lojas da lista abaixo. Se qualquer coisa der errado, imprime do jeito de sempre.

var SEMB_LOJAS = ['servidelivery-demo'];

function semBebidasLiberado() {
  return !!restauranteAtual && SEMB_LOJAS.indexOf(restauranteAtual.slug) >= 0;
}

function semBebidasCfg() {
  const c = restauranteAtual && restauranteAtual.sem_bebidas;
  return (c && typeof c === 'object') ? c : {};
}

function semBebidasAtivo() {
  if (!semBebidasLiberado()) return false;
  return semBebidasCfg().ativo === true;
}

// Categorias que são bebida: as marcadas na loja; se ninguém marcou ainda, marca sozinho pelo nome.
function semBebidasCategorias(cats) {
  const salvo = semBebidasCfg().cats;
  if (Array.isArray(salvo)) return new Set(salvo);
  const rx = (typeof IMP_REGEX_BEBIDA !== 'undefined') ? IMP_REGEX_BEBIDA : /bebida|suco|refri|cerveja|chope|chopp|drink|caipir|vinho|[aá]gua/i;
  return new Set((cats || []).filter(c => rx.test(c.nome || '')).map(c => c.id));
}

// Grava na loja (banco). Devolve true/false.
async function semBebidasGravar(patch) {
  const novo = Object.assign({}, semBebidasCfg(), patch);
  const { error } = await db.from('restaurantes').update({ sem_bebidas: novo }).eq('id', restauranteAtual.id);
  if (error) { console.error('sem_bebidas: não salvou', error); return false; }
  restauranteAtual.sem_bebidas = novo;
  return true;
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
  const bebidas = semBebidasCategorias(cats);
  const comida = linhas.filter(l => !(l.item_id && bebidas.has(catDoItem[l.item_id])));
  if (!comida.length) return { vazio: true };
  if (comida.length === linhas.length) return { pedido: Object.assign({}, p, { __semBebidas: true }) };
  const total = comida.reduce((s, l) => s + (parseFloat(l.preco) || 0) * (parseInt(l.quantidade) || 1), 0);
  return { pedido: Object.assign({}, p, { pedido_itens: comida, total: total, __semBebidas: true }) };
}

// ---------- Configurações: chavinha + lista de categorias ----------
function semBebidasChavinhaHtml() {
  if (!semBebidasLiberado()) return '';
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid var(--creme-borda);">
      <div><div style="font-weight:600;font-size:13px;">Bebidas só no sistema (não imprimir)</div><div style="font-size:12px;color:var(--texto-muted);margin-top:2px;">No papel sai só a COMIDA. As bebidas aparecem na tela do sistema, mas não saem na impressora. Se o pedido for só de bebida, não imprime nada. Vale para todos os aparelhos da loja.</div></div>
      <label class="toggle-switch" style="flex-shrink:0;margin-left:14px;">
        <input type="checkbox" ${semBebidasAtivo() ? 'checked' : ''} onchange="semBebidasLigar(this)">
        <span class="toggle-slider"></span>
      </label>
    </div>`;
}

async function semBebidasLigar(el) {
  const quer = el.checked;
  const ok = await semBebidasGravar({ ativo: quer });
  if (!ok) {
    el.checked = !quer;
    toast('Não consegui salvar agora. Tente de novo.', 'erro');
    return;
  }
  toast(quer ? 'Ligado para a loja toda: bebidas não saem no papel.' : 'Desligado: as bebidas voltam a sair no papel.', 'ok');
}

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
    const marcadas = semBebidasCategorias(cats || []);
    el.innerHTML = (cats || []).length ? (cats || []).map(c => `
      <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--creme-borda);cursor:pointer;">
        <input type="checkbox" class="semb-cat" value="${esc(c.id)}" ${marcadas.has(c.id) ? 'checked' : ''} onchange="semBebidasSalvarCats()" style="width:auto;">
        <span>${esc(c.nome)}</span>
      </label>`).join('') : 'Nenhuma categoria no cardápio ainda.';
  } catch (e) {
    el.textContent = 'Não consegui carregar as categorias agora. Tente abrir Configurações de novo.';
  }
}

async function semBebidasSalvarCats() {
  const ids = Array.from(document.querySelectorAll('.semb-cat:checked')).map(i => i.value);
  const ok = await semBebidasGravar({ cats: ids });
  toast(ok ? 'Salvo. Categorias marcadas não saem no papel.' : 'Não consegui salvar agora. Tente de novo.', ok ? 'ok' : 'erro');
}

// Aparelhos que ficam abertos o dia todo (caixa) pegam a escolha nova sem precisar recarregar.
setInterval(async function () {
  try {
    if (!semBebidasLiberado()) return;
    const { data, error } = await db.from('restaurantes').select('sem_bebidas').eq('id', restauranteAtual.id).maybeSingle();
    if (!error && data) restauranteAtual.sem_bebidas = data.sem_bebidas;
  } catch (e) {}
}, 60000);
