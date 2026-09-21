// ===== MÓDULO CARDÁPIO =====
// Extraído de prattus.html pra deixar o arquivo principal menor e mais fácil de mexer.
// Usa as mesmas variáveis globais do arquivo principal (db, restauranteAtual, esc, toast,
// abrirModal, fecharModal, etiquetasCache) — não precisa de import/export, é carregado
// como um script normal, na mesma página.

let itemArrastando = null;
let categoriaArrastando = null;
let itensCache = [];
var gruposOpcoesEditando = [];

async function toggleDestaque(itemId, destacarAgora) {
  await db.from('itens').update({ destaque_manual: destacarAgora }).eq('id', itemId);
  toast(destacarAgora ? 'Item forçado em destaque!' : 'Destaque removido.', 'ok');
  renderCardapio();
}

async function toggleEsgotado(itemId, esgotarAgora) {
  let esgotadoAte = null;
  if (esgotarAgora) {
    const fimDoDia = new Date();
    fimDoDia.setHours(23, 59, 59, 999);
    esgotadoAte = fimDoDia.toISOString();
  }
  await db.from('itens').update({ esgotado_ate: esgotadoAte }).eq('id', itemId);
  toast(esgotarAgora ? 'Item marcado como esgotado hoje.' : 'Item disponível de novo!', 'ok');
  renderCardapio();
}

async function renderCardapio() {
  if (!restauranteAtual) return;
  const { data: cats } = await db.from('categorias').select('*').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('ordem');
  const { data: itens } = await db.from('itens').select('*,categorias(nome)').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('ordem_item', {nullsFirst:false}).order('criado_em');
  const { data: etiquetas } = await db.from('etiquetas').select('*').eq('restaurante_id', restauranteAtual.id).order('nome');
  etiquetasCache = etiquetas || [];
  itensCache = itens || [];

  document.getElementById('conteudo').innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
      <button class="btn btn-laranja" style="width:auto;padding:10px 20px" onclick="abrirNovoItem()">+ Novo item</button>
      <button class="btn btn-outline" style="width:auto;padding:10px 20px" onclick="abrirModal('modal-cat')">+ Nova categoria</button>
      <button class="btn btn-outline" style="width:auto;padding:10px 20px" onclick="abrirModalEtiquetas()">🏷️ Gerenciar etiquetas</button>
      <button class="btn btn-outline" style="width:auto;padding:10px 20px" onclick="baixarCardapioPDF()">🖨️ Baixar cardápio em PDF</button>
      <button class="btn btn-outline" style="width:auto;padding:10px 20px" onclick="abrirModalLixeira()">🗑️ Lixeira</button>
    </div>
    ${(cats||[]).length > 1 ? `<div style="font-size:11px;color:var(--texto-muted);margin-bottom:10px;">☰ Arraste o título de uma categoria pra reordenar como aparecem no cardápio.</div>` : ''}
    ${(cats||[]).map(cat => `
      <div class="card" style="margin-bottom:16px;" ondragover="dragOverItem(event)" ondrop="dropCategoria(event,'${cat.id}')">
        <div draggable="true" ondragstart="dragStartCategoria(event,'${cat.id}')" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;cursor:grab;">
          <div class="card-titulo" style="margin-bottom:0;">☰ ${cat.nome}</div>
          <div style="display:flex;gap:6px;">
            <button class="btn-sm" onclick="editarCategoria('${cat.id}','${cat.nome.replace(/'/g,"\\'")}')">Renomear</button>
            <button class="btn-sm perigo" onclick="excluirCategoria('${cat.id}')">Excluir</button>
          </div>
        </div>
        ${(itensCache||[]).filter(i => i.categoria_id === cat.id).length > 1 ? `<div style="font-size:11px;color:var(--texto-muted);margin-bottom:8px;">☰ Arraste os itens pra reordenar como aparecem no cardápio.</div>` : ''}
        ${(itensCache||[]).filter(i => i.categoria_id === cat.id).map(item => {
          const esgotado = item.esgotado_ate && new Date(item.esgotado_ate) > new Date();
          const destacado = !!item.destaque_manual;
          return `
          <div class="item-card" draggable="true" ondragstart="dragStartItem(event,'${item.id}')" ondragover="dragOverItem(event)" ondrop="dropItem(event,'${item.id}','${cat.id}')" style="${esgotado?'opacity:0.6;':''}cursor:grab;">
            <div style="color:var(--texto-muted);font-size:16px;align-self:center;padding-right:2px;user-select:none;">☰</div>
            <div class="item-foto">${item.foto_url ? `<img src="${item.foto_url}" onerror="this.parentElement.textContent='🍽️'">` : '🍽️'}</div>
            <div style="flex:1;">
              <div class="item-nome">${esc(item.nome)} ${esgotado?'<span style="font-size:10px;background:#FBE1DE;color:#B3261E;padding:2px 8px;border-radius:10px;font-weight:700;">ESGOTADO HOJE</span>':''} ${destacado?'<span style="font-size:10px;background:#FFF1E6;color:#C4522E;padding:2px 8px;border-radius:10px;font-weight:700;">⭐ EM DESTAQUE</span>':''}</div>
              <div class="item-desc">${esc(item.descricao)}</div>
              <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
                ${(item.etiquetas_ids||[]).map(eid => {
                  const et = etiquetasCache.find(e => e.id === eid);
                  return et ? `<span style="font-size:10px;background:${et.cor}22;color:${et.cor};padding:2px 6px;border-radius:10px;font-weight:600;">${esc(et.nome)}</span>` : '';
                }).join('')}
              </div>
            </div>
            <div style="text-align:right;">
              <div class="item-preco">R$ ${parseFloat(item.preco).toFixed(2).replace('.',',')}</div>
              <div class="item-acoes" style="margin-top:6px;">
                <button class="btn-sm" onclick="toggleDestaque('${item.id}', ${destacado?'false':'true'})" style="${destacado?'background:var(--laranja-light);color:var(--laranja-dark);':''}">${destacado?'⭐ Tirar destaque':'☆ Forçar destaque'}</button>
                <button class="btn-sm" onclick="toggleEsgotado('${item.id}', ${esgotado?'false':'true'})" style="${esgotado?'background:var(--verde-bg,#E1F5EE);color:#0F6E56;':'background:#FBE1DE;color:#B3261E;'}">${esgotado?'✅ Disponível':'🚫 Esgotou hoje'}</button>
                <button class="btn-sm" onclick="editarItem('${item.id}')">Editar</button>
                <button class="btn-sm perigo" onclick="excluirItem('${item.id}')">Excluir</button>
              </div>
            </div>
          </div>
        `}).join('') || '<div style="font-size:13px;color:var(--texto-muted);padding:8px 0;">Nenhum item nesta categoria</div>'}
      </div>
    `).join('') || '<div class="empty"><div class="empty-ico">🍽️</div><div class="empty-txt">Crie uma categoria primeiro</div></div>'}
  `;
  // Carrega categorias no select do modal
  const sel = document.getElementById('item-cat');
  sel.innerHTML = (cats||[]).map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
}

async function baixarCardapioPDF() {
  if (!restauranteAtual) return;
  toast('Preparando o cardápio...', 'ok');

  const { data: cats } = await db.from('categorias').select('*').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('ordem');
  const { data: itens } = await db.from('itens').select('*').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('ordem_item', {nullsFirst:false}).order('criado_em');

  const html = `
    <div class="pc-header">
      <h1>${esc(restauranteAtual.nome)}</h1>
      ${restauranteAtual.descricao ? `<div>${esc(restauranteAtual.descricao)}</div>` : ''}
      ${restauranteAtual.whatsapp ? `<div style="font-size:12px;margin-top:4px;">WhatsApp: ${esc(restauranteAtual.whatsapp)}</div>` : ''}
    </div>
    ${(cats||[]).map(cat => {
      const itensCat = (itens||[]).filter(i => i.categoria_id === cat.id);
      if (itensCat.length === 0) return '';
      return `
        <div class="pc-cat">
          <h2>${esc(cat.nome)}</h2>
          ${itensCat.map(item => `
            <div class="pc-item">
              <div>
                <div class="pc-item-nome">${esc(item.nome)}</div>
                ${item.descricao ? `<div class="pc-item-desc">${esc(item.descricao)}</div>` : ''}
              </div>
              <div class="pc-item-preco">R$ ${parseFloat(item.preco_promocional && parseFloat(item.preco_promocional) < parseFloat(item.preco) ? item.preco_promocional : item.preco).toFixed(2).replace('.',',')}</div>
            </div>
          `).join('')}
        </div>
      `;
    }).join('')}
  `;

  document.getElementById('print-cardapio').innerHTML = html;
  setTimeout(() => window.print(), 200);
}
function dragStartCategoria(ev, catId) {
  ev.stopPropagation();
  categoriaArrastando = catId;
  ev.dataTransfer.effectAllowed = 'move';
}

async function dropCategoria(ev, catIdAlvo) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!categoriaArrastando || categoriaArrastando === catIdAlvo) { categoriaArrastando = null; return; }

  const { data: cats } = await db.from('categorias').select('id').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('ordem');
  const lista = cats || [];
  const idxOrigem = lista.findIndex(c => c.id === categoriaArrastando);
  const idxDestino = lista.findIndex(c => c.id === catIdAlvo);
  if (idxOrigem === -1 || idxDestino === -1) { categoriaArrastando = null; return; }

  const [movida] = lista.splice(idxOrigem, 1);
  lista.splice(idxDestino, 0, movida);

  await Promise.all(lista.map((c, i) => db.from('categorias').update({ ordem: i }).eq('id', c.id)));
  categoriaArrastando = null;
  renderCardapio();
}

function dragStartItem(ev, itemId) {
  itemArrastando = itemId;
  ev.dataTransfer.effectAllowed = 'move';
}

function dragOverItem(ev) {
  ev.preventDefault();
}

async function dropItem(ev, itemIdAlvo, catId) {
  ev.preventDefault();
  if (!itemArrastando || itemArrastando === itemIdAlvo) return;

  const itensCat = itensCache.filter(i => i.categoria_id === catId);
  const idxOrigem = itensCat.findIndex(i => i.id === itemArrastando);
  const idxDestino = itensCat.findIndex(i => i.id === itemIdAlvo);
  if (idxOrigem === -1 || idxDestino === -1) { itemArrastando = null; return; }

  const [movido] = itensCat.splice(idxOrigem, 1);
  itensCat.splice(idxDestino, 0, movido);

  await Promise.all(itensCat.map((it, i) => db.from('itens').update({ ordem_item: i }).eq('id', it.id)));
  itemArrastando = null;
  renderCardapio();
}

function renderGruposOpcoes() {
  const wrap = document.getElementById('item-opcoes-grupos');
  if (!wrap) return;
  if (gruposOpcoesEditando.length === 0) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--texto-muted);">Nenhum grupo adicionado ainda.</div>';
    return;
  }
  wrap.innerHTML = gruposOpcoesEditando.map((g, gi) => `
    <div style="border:1px solid var(--creme-borda);border-radius:10px;padding:12px;margin-bottom:10px;background:var(--creme);">
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input type="text" placeholder="Nome do grupo (ex: Tamanho, Bacon, Ponto da carne)" value="${esc(g.nome)}" oninput="atualizarNomeGrupo(${gi}, this.value)" style="flex:2;">
        <select onchange="atualizarTipoGrupo(${gi}, this.value)" style="flex:1;">
          <option value="unica" ${g.tipo==='unica'?'selected':''}>Escolhe 1 (soma no preço)</option>
          <option value="unica_preco" ${g.tipo==='unica_preco'?'selected':''}>Escolhe 1 (preço final)</option>
          <option value="multipla" ${g.tipo==='multipla'?'selected':''}>Marca quantas quiser</option>
        </select>
        <button type="button" class="btn-sm perigo" onclick="removerGrupoOpcao(${gi})" title="Remover grupo">🗑️</button>
      </div>
      ${g.tipo === 'multipla' ? `
      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;">
        <label style="font-size:12px;color:var(--texto-muted);flex-shrink:0;">Mínimo</label>
        <input type="number" min="0" placeholder="0" value="${g.min ?? 0}" oninput="atualizarMinMaxGrupo(${gi},'min',this.value)" style="width:70px;">
        <label style="font-size:12px;color:var(--texto-muted);flex-shrink:0;margin-left:8px;">Máximo</label>
        <input type="number" min="0" placeholder="Sem limite" value="${g.max ?? ''}" oninput="atualizarMinMaxGrupo(${gi},'max',this.value)" style="width:100px;">
        <span style="font-size:11px;color:var(--texto-muted);">Mínimo 0 = opcional. Máximo em branco = sem limite.</span>
      </div>
      ` : ''}
      ${g.opcoes.map((o, oi) => o.subgrupo ? `
        <div style="display:flex;gap:8px;margin:14px 0 6px;align-items:center;padding-top:10px;border-top:1px dashed var(--creme-borda);">
          <span style="font-size:11px;color:var(--texto-muted);flex-shrink:0;">📁 Subgrupo:</span>
          <input type="text" placeholder="Ex: Sabores salgados" value="${esc(o.nome)}" oninput="atualizarOpcaoCampo(${gi},${oi},'nome',this.value)" style="flex:1;font-weight:600;">
          <button type="button" class="btn-sm perigo" onclick="removerOpcaoDoGrupo(${gi},${oi})" title="Remover subgrupo" style="padding:6px 10px;">×</button>
        </div>
      ` : `
        <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
          <input type="text" placeholder="Ex: 2 bifes" value="${esc(o.nome)}" oninput="atualizarOpcaoCampo(${gi},${oi},'nome',this.value)" style="flex:2;">
          <input type="number" placeholder="0.00" step="0.01" value="${o.preco}" oninput="atualizarOpcaoCampo(${gi},${oi},'preco',this.value)" style="flex:1;">
          <button type="button" class="btn-sm perigo" onclick="removerOpcaoDoGrupo(${gi},${oi})" title="Remover opção" style="padding:6px 10px;">×</button>
        </div>
      `).join('')}
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn-sm" onclick="adicionarOpcaoNoGrupo(${gi})">+ Adicionar opção</button>
        ${g.tipo === 'multipla' ? `<button type="button" class="btn-sm" onclick="adicionarSubgrupoNoGrupo(${gi})">📁 Adicionar subgrupo</button>` : ''}
      </div>
    </div>
  `).join('');
}

function adicionarGrupoOpcao() {
  gruposOpcoesEditando.push({ nome: '', tipo: 'unica', opcoes: [{ nome: '', preco: 0 }], min: 0, max: null });
  renderGruposOpcoes();
}

function atualizarMinMaxGrupo(gi, campo, valor) {
  const num = valor === '' ? (campo === 'max' ? null : 0) : Math.max(0, parseInt(valor, 10) || 0);
  gruposOpcoesEditando[gi][campo] = num;
}

function removerGrupoOpcao(gi) {
  gruposOpcoesEditando.splice(gi, 1);
  renderGruposOpcoes();
}

function atualizarNomeGrupo(gi, valor) {
  gruposOpcoesEditando[gi].nome = valor;
}

function atualizarTipoGrupo(gi, valor) {
  gruposOpcoesEditando[gi].tipo = valor;
  renderGruposOpcoes();
}

function adicionarOpcaoNoGrupo(gi) {
  gruposOpcoesEditando[gi].opcoes.push({ nome: '', preco: 0 });
  renderGruposOpcoes();
}

function adicionarSubgrupoNoGrupo(gi) {
  gruposOpcoesEditando[gi].opcoes.push({ subgrupo: true, nome: '' });
  renderGruposOpcoes();
}

function removerOpcaoDoGrupo(gi, oi) {
  gruposOpcoesEditando[gi].opcoes.splice(oi, 1);
  renderGruposOpcoes();
}

function atualizarOpcaoCampo(gi, oi, campo, valor) {
  gruposOpcoesEditando[gi].opcoes[oi][campo] = campo === 'preco' ? (parseFloat(valor) || 0) : valor;
}

function gruposOpcoesValidos() {
  const limpos = gruposOpcoesEditando
    .map(g => ({ nome: (g.nome||'').trim(), tipo: g.tipo, opcoes: g.opcoes.filter(o => (o.nome||'').trim()), min: g.tipo === 'multipla' ? (g.min ?? 0) : undefined, max: g.tipo === 'multipla' ? (g.max ?? null) : undefined }))
    .filter(g => g.nome && g.opcoes.length > 0);
  return limpos.length ? limpos : null;
}

function atualizarPreviewGenerica(url, previewId) {
  const img = document.getElementById(previewId);
  if (url) { img.src = url; img.style.display = 'block'; }
  else { img.style.display = 'none'; img.src = ''; }
}

async function uploadFotoGenerica(inputEl, campoId, previewId, prefixo) {
  const file = inputEl.files[0];
  if (!file) return;
  const status = document.getElementById(campoId + '-status');

  if (file.size > 5 * 1024 * 1024) {
    if (status) status.textContent = '❌ Foto muito grande (máximo 5MB). Escolha uma foto menor.';
    inputEl.value = '';
    return;
  }

  if (status) status.textContent = '📤 Enviando foto...';
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const nomeArquivo = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from('fotos').upload(nomeArquivo, file, { upsert: true });
    if (error) throw error;
    const { data } = db.storage.from('fotos').getPublicUrl(nomeArquivo);
    document.getElementById(campoId).value = data.publicUrl;
    atualizarPreviewGenerica(data.publicUrl, previewId);
    if (status) status.textContent = '✅ Foto enviada!';
  } catch (e) {
    if (status) status.textContent = '❌ Erro ao enviar foto: ' + (e.message || 'tente novamente');
  }
}

function atualizarPreviewFotoItem(url) {
  const img = document.getElementById('item-foto-preview');
  if (url) { img.src = url; img.style.display = 'block'; }
  else { img.style.display = 'none'; img.src = ''; }
}

async function uploadFotoItem(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  const status = document.getElementById('item-foto-status');

  if (file.size > 5 * 1024 * 1024) {
    status.textContent = '❌ Foto muito grande (máximo 5MB). Escolha uma foto menor.';
    inputEl.value = '';
    return;
  }

  status.textContent = '📤 Enviando foto...';
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const nomeArquivo = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from('fotos').upload(nomeArquivo, file, { upsert: true });
    if (error) throw error;
    const { data } = db.storage.from('fotos').getPublicUrl(nomeArquivo);
    document.getElementById('item-foto').value = data.publicUrl;
    atualizarPreviewFotoItem(data.publicUrl);
    status.textContent = '✅ Foto enviada!';
  } catch (e) {
    status.textContent = '❌ Erro ao enviar foto: ' + (e.message || 'tente novamente');
  }
}

async function salvarItem() {
  const id = document.getElementById('item-id').value;
  const precoPromoVal = document.getElementById('item-preco-promo').value;
  const etiquetasSelecionadas = Array.from(document.querySelectorAll('#item-etiquetas-wrap input:checked')).map(cb => cb.value);
  const dados = {
    restaurante_id: restauranteAtual.id,
    categoria_id: document.getElementById('item-cat').value || null,
    nome: document.getElementById('item-nome').value,
    descricao: document.getElementById('item-desc').value,
    preco: parseFloat(document.getElementById('item-preco').value),
    preco_promocional: precoPromoVal ? parseFloat(precoPromoVal) : null,
    foto_url: document.getElementById('item-foto').value || null,
    etiquetas_ids: etiquetasSelecionadas,
    opcoes: gruposOpcoesValidos(),
  };
  if (id) {
    await db.from('itens').update(dados).eq('id', id);
  } else {
    await db.from('itens').insert(dados);
  }
  fecharModal('modal-item');
  toast('Item salvo!', 'ok');
  renderCardapio();
}

function renderEtiquetasItemForm(selecionadas) {
  const wrap = document.getElementById('item-etiquetas-wrap');
  if (!wrap) return;
  selecionadas = selecionadas || [];
  if (etiquetasCache.length === 0) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--texto-muted);">Nenhuma etiqueta criada ainda.</div>';
    return;
  }
  wrap.innerHTML = etiquetasCache.map(e => `
    <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;background:${e.cor}22;border:1px solid ${e.cor}55;padding:4px 10px;border-radius:20px;">
      <input type="checkbox" value="${e.id}" ${selecionadas.includes(e.id)?'checked':''} style="width:auto;margin:0;">
      ${esc(e.nome)}
    </label>
  `).join('');
}

function abrirModalEtiquetas() {
  cancelarEdicaoEtiqueta();
  renderListaEtiquetas();
  abrirModal('modal-etiquetas');
}

function renderListaEtiquetas() {
  const lista = document.getElementById('lista-etiquetas');
  if (etiquetasCache.length === 0) {
    lista.innerHTML = '<div style="font-size:13px;color:var(--texto-muted);">Nenhuma etiqueta criada ainda.</div>';
    return;
  }
  lista.innerHTML = etiquetasCache.map(e => `
    <div class="frete-row">
      <span style="background:${e.cor}22;color:${e.cor};border:1px solid ${e.cor}55;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${esc(e.nome)}</span>
      <button class="btn-sm" onclick="editarEtiqueta('${e.id}')">✏️ Editar</button>
      <button class="btn-sm perigo" onclick="excluirEtiqueta('${e.id}')">Excluir</button>
    </div>
  `).join('');
}

let etiquetaEditandoId = null;

function editarEtiqueta(id) {
  const et = etiquetasCache.find(e => e.id === id);
  if (!et) return;
  etiquetaEditandoId = id;
  document.getElementById('etq-nome').value = et.nome;
  document.getElementById('etq-cor').value = et.cor;
  document.getElementById('etq-btn-salvar').textContent = '💾 Salvar';
  document.getElementById('etq-btn-cancelar').style.display = 'inline-block';
  document.getElementById('etq-nome').focus();
}

function cancelarEdicaoEtiqueta() {
  etiquetaEditandoId = null;
  document.getElementById('etq-nome').value = '';
  document.getElementById('etq-cor').value = '#8A7B6C';
  document.getElementById('etq-btn-salvar').textContent = '+ Criar';
  document.getElementById('etq-btn-cancelar').style.display = 'none';
}

async function salvarEtiqueta() {
  const nome = document.getElementById('etq-nome').value.trim();
  const cor = document.getElementById('etq-cor').value;
  if (!nome) { toast('Digite o nome da etiqueta.', 'erro'); return; }

  const { error } = etiquetaEditandoId
    ? await db.from('etiquetas').update({ nome, cor }).eq('id', etiquetaEditandoId)
    : await db.from('etiquetas').insert({ restaurante_id: restauranteAtual.id, nome, cor });

  if (error) { toast('Erro ao salvar etiqueta.', 'erro'); return; }
  toast(etiquetaEditandoId ? 'Etiqueta atualizada!' : 'Etiqueta criada!', 'ok');
  cancelarEdicaoEtiqueta();
  const { data } = await db.from('etiquetas').select('*').eq('restaurante_id', restauranteAtual.id).order('nome');
  etiquetasCache = data || [];
  renderListaEtiquetas();
}

async function excluirEtiqueta(id) {
  if (!confirm('Excluir essa etiqueta? Ela vai sumir de qualquer item que a estiver usando.')) return;
  await db.from('etiquetas').delete().eq('id', id);
  etiquetasCache = etiquetasCache.filter(e => e.id !== id);
  toast('Etiqueta excluída.', 'ok');
  renderListaEtiquetas();
}

function abrirNovoItem() {
  document.getElementById('item-id').value = '';
  document.getElementById('item-nome').value = '';
  document.getElementById('item-desc').value = '';
  document.getElementById('item-preco').value = '';
  document.getElementById('item-preco-promo').value = '';
  document.getElementById('item-foto').value = '';
  atualizarPreviewFotoItem('');
  gruposOpcoesEditando = [];
  renderGruposOpcoes();
  renderEtiquetasItemForm([]);
  document.getElementById('modal-item-titulo').textContent = 'Novo item';
  abrirModal('modal-item');
}

async function editarItem(id) {
  const { data } = await db.from('itens').select('*').eq('id', id).single();
  if (!data) return;
  document.getElementById('item-id').value = data.id;
  document.getElementById('item-nome').value = data.nome;
  document.getElementById('item-desc').value = data.descricao || '';
  document.getElementById('item-preco').value = data.preco;
  document.getElementById('item-preco-promo').value = data.preco_promocional || '';
  document.getElementById('item-foto').value = data.foto_url || '';
  atualizarPreviewFotoItem(data.foto_url || '');
  document.getElementById('item-cat').value = data.categoria_id || '';
  gruposOpcoesEditando = data.opcoes ? JSON.parse(JSON.stringify(data.opcoes)) : [];
  renderGruposOpcoes();
  renderEtiquetasItemForm(data.etiquetas_ids || []);
  document.getElementById('modal-item-titulo').textContent = 'Editar item';
  abrirModal('modal-item');
}

async function excluirItem(id) {
  if (!confirm('Mover este item pra lixeira? Você pode restaurar depois em "🗑️ Lixeira".')) return;
  await db.from('itens').update({ excluido_em: new Date().toISOString() }).eq('id', id);
  toast('Item movido pra lixeira.', 'ok');
  renderCardapio();
}

async function salvarCategoria() {
  const id = document.getElementById('cat-id').value;
  const nome = document.getElementById('cat-nome').value;
  if (!nome) return;
  if (id) {
    await db.from('categorias').update({ nome }).eq('id', id);
  } else {
    await db.from('categorias').insert({ restaurante_id: restauranteAtual.id, nome });
  }
  fecharModal('modal-cat');
  document.getElementById('cat-nome').value = '';
  document.getElementById('cat-id').value = '';
  document.getElementById('modal-cat-titulo').textContent = 'Nova categoria';
  toast('Categoria salva!', 'ok');
  renderCardapio();
}

function editarCategoria(id, nome) {
  document.getElementById('cat-id').value = id;
  document.getElementById('cat-nome').value = nome;
  document.getElementById('modal-cat-titulo').textContent = 'Renomear categoria';
  abrirModal('modal-cat');
}

async function excluirCategoria(id) {
  const { data: itensDaCategoria } = await db.from('itens').select('id').eq('categoria_id', id).is('excluido_em', null);
  const qtd = (itensDaCategoria || []).length;
  const aviso = qtd > 0
    ? `Mover esta categoria pra lixeira? Ela tem ${qtd} ${qtd === 1 ? 'item' : 'itens'} — ${qtd === 1 ? 'ele vai' : 'eles vão'} junto, mas dá pra restaurar tudo depois em "🗑️ Lixeira".`
    : 'Mover esta categoria pra lixeira? Dá pra restaurar depois em "🗑️ Lixeira".';
  if (!confirm(aviso)) return;

  const agora = new Date().toISOString();
  await db.from('itens').update({ excluido_em: agora }).eq('categoria_id', id).is('excluido_em', null);
  await db.from('categorias').update({ excluido_em: agora }).eq('id', id);
  toast('Categoria movida pra lixeira.', 'ok');
  renderCardapio();
}

async function abrirModalLixeira() {
  abrirModal('modal-lixeira');
  await renderLixeira();
}

async function renderLixeira() {
  const container = document.getElementById('lixeira-conteudo');
  container.innerHTML = 'Carregando...';

  const [{ data: catsExcluidas }, { data: itensExcluidos }] = await Promise.all([
    db.from('categorias').select('*').eq('restaurante_id', restauranteAtual.id).not('excluido_em', 'is', null).order('excluido_em', {ascending: false}),
    db.from('itens').select('*').eq('restaurante_id', restauranteAtual.id).not('excluido_em', 'is', null).order('excluido_em', {ascending: false})
  ]);

  const cats = catsExcluidas || [];
  const itens = itensExcluidos || [];

  if (cats.length === 0 && itens.length === 0) {
    container.innerHTML = '<div class="empty"><div class="empty-ico">🗑️</div><div class="empty-txt">A lixeira está vazia.</div></div>';
    return;
  }

  let html = '';
  if (cats.length > 0) {
    html += '<div style="font-size:12px;font-weight:700;color:var(--texto-muted);margin:10px 0 6px;">CATEGORIAS</div>';
    html += cats.map(c => `
      <div class="frete-row">
        <div style="flex:1;font-size:14px;font-weight:600;">${esc(c.nome)}</div>
        <button class="btn-sm" onclick="restaurarCategoria('${c.id}')">♻️ Restaurar</button>
        <button class="btn-sm perigo" onclick="excluirPermanente('categorias','${c.id}')">Excluir de vez</button>
      </div>
    `).join('');
  }
  if (itens.length > 0) {
    html += '<div style="font-size:12px;font-weight:700;color:var(--texto-muted);margin:14px 0 6px;">ITENS</div>';
    html += itens.map(i => `
      <div class="frete-row">
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">${esc(i.nome)}</div>
          <div style="font-size:11px;color:var(--texto-muted);">R$ ${parseFloat(i.preco).toFixed(2).replace('.',',')}</div>
        </div>
        <button class="btn-sm" onclick="restaurarItem('${i.id}')">♻️ Restaurar</button>
        <button class="btn-sm perigo" onclick="excluirPermanente('itens','${i.id}')">Excluir de vez</button>
      </div>
    `).join('');
  }
  container.innerHTML = html;
}

async function restaurarCategoria(id) {
  await db.from('categorias').update({ excluido_em: null }).eq('id', id);
  await db.from('itens').update({ excluido_em: null }).eq('categoria_id', id).not('excluido_em', 'is', null);
  toast('Categoria restaurada!', 'ok');
  renderLixeira();
  renderCardapio();
}

async function restaurarItem(id) {
  await db.from('itens').update({ excluido_em: null }).eq('id', id);
  toast('Item restaurado!', 'ok');
  renderLixeira();
  renderCardapio();
}

async function excluirPermanente(tabela, id) {
  if (!confirm('Excluir de vez? Isso NÃO tem volta.')) return;
  await db.from(tabela).delete().eq('id', id);
  toast('Excluído definitivamente.', 'ok');
  renderLixeira();
}

