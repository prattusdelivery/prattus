// ===== MAPA DE MESAS =====
// Quadradinhos com o número de cada mesa, na tela de Comandas. O garçom toca na mesa, monta o pedido
// (mesma tela de comanda de sempre) e pode voltar na mesma mesa pra adicionar itens.
// Por baixo cada mesa é uma comanda comum (tabela codigos_comanda) com código curto "M1", "M2"... —
// ou seja, pedido, impressão, fechamento de conta e histórico continuam EXATAMENTE como já eram.
// Liberado em todas as lojas (só aparece se o dono digitar a quantidade de mesas em Configurações).
// Colunas novas em restaurantes: qtd_mesas (quantas mesas) e comanda_modo ('qr' | 'mapa' | 'ambos').

var mapaTocando = false;

// Liberado para todas as lojas. Quem não digitar a quantidade de mesas em Configurações continua só com QR Code.
function mapaMesasDisponivel() {
  return !!restauranteAtual;
}

// Como o garçom abre a mesa nesta loja: 'qr' (só QR, como sempre), 'mapa' ou 'ambos'
function mapaMesasModo(r) {
  r = r || restauranteAtual;
  if (!r) return 'qr';
  const qtd = parseInt(r.qtd_mesas) || 0;
  if (typeof planoSimplesLoja === 'function' && planoSimplesLoja(r)) return qtd > 0 ? 'mapa' : 'qr'; // Simples: só o mapa, sem escolha
  return (r.comanda_modo === 'mapa' || r.comanda_modo === 'ambos') ? r.comanda_modo : 'qr';
}

function mapaMesasAtivo() {
  return !!restauranteAtual && mapaMesasDisponivel() && mapaMesasModo() !== 'qr' && (parseInt(restauranteAtual.qtd_mesas) || 0) > 0;
}

// Desenha o mapa no topo da tela de Comandas. "mesas" = comandas abertas agora (com total).
function mapaMesasInserir(mesas) {
  if (!mapaMesasAtivo()) return;
  const cont = document.getElementById('conteudo');
  if (!cont || document.getElementById('mapa-mesas-card')) return;
  const qtd = Math.min(parseInt(restauranteAtual.qtd_mesas) || 0, 99);
  const porMesa = {};
  (mesas || []).forEach(m => { if (m.mesa) porMesa[String(m.mesa).trim()] = m; });

  let tiles = '';
  for (let n = 1; n <= qtd; n++) {
    const m = porMesa[String(n)];
    // Só fica "com pedido" depois que algum pedido foi enviado. Mesa aberta sem pedido continua "livre".
    const ocupada = !!m && (m.qtdPedidos || 0) > 0;
    const total = ocupada ? 'R$ ' + (m.total || 0).toFixed(2).replace('.', ',') : 'livre';
    tiles += `<button type="button" onclick="mapaMesaTocar(${n})" style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;height:78px;border-radius:14px;cursor:pointer;font-family:inherit;
        border:2px solid ${ocupada ? 'var(--laranja)' : 'var(--creme-borda)'};
        background:${ocupada ? 'var(--laranja)' : '#fff'};color:${ocupada ? '#fff' : 'var(--texto)'};">
        <span style="font-size:24px;font-weight:800;line-height:1.1;">${n}</span>
        <span style="font-size:12px;margin-top:2px;${ocupada ? 'font-weight:700;' : 'color:var(--texto-muted);'}">${total}</span>
      </button>`;
  }
  cont.insertAdjacentHTML('afterbegin', `
    <div class="card" id="mapa-mesas-card" style="margin-bottom:20px;">
      <div class="card-titulo">🍽️ Mesas</div>
      <div style="display:flex;gap:16px;font-size:13px;color:var(--texto-muted);margin:0 0 12px;">
        <span><i style="display:inline-block;width:12px;height:12px;border-radius:4px;background:#fff;border:2px solid var(--creme-borda);margin-right:6px;vertical-align:-1px;"></i>Livre</span>
        <span><i style="display:inline-block;width:12px;height:12px;border-radius:4px;background:var(--laranja);margin-right:6px;vertical-align:-1px;"></i>Com pedido</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:10px;">${tiles}</div>
      <div style="font-size:12px;color:var(--texto-muted);margin-top:12px;text-align:center;">Toque numa mesa para abrir ou continuar o pedido</div>
    </div>`);

  // Só mapa: o garçom não precisa do leitor de QR
  if (mapaMesasModo() === 'mapa') {
    const bt = cont.querySelector('button[onclick="abrirLeitorQr()"]');
    const cartao = bt && bt.closest('.card');
    if (cartao) cartao.style.display = 'none';
  }
  // A lista "Mesas abertas agora" repetiria o mapa — esconde, a não ser que tenha comanda sem número de mesa (balança)
  const lista = document.getElementById('mesas-abertas-lista');
  if (lista && (mesas || []).every(m => m.mesa && String(parseInt(m.mesa)) === String(m.mesa).trim() && parseInt(m.mesa) >= 1 && parseInt(m.mesa) <= qtd)) {
    lista.style.display = 'none';
  }
  cont.querySelectorAll('.empty').forEach(el => { if (/Escaneie o QR/.test(el.textContent || '')) el.style.display = 'none'; });
}

// O garçom tocou numa mesa
async function mapaMesaTocar(n) {
  if (mapaTocando) return;
  mapaTocando = true;
  try {
    const rid = restauranteAtual.id;
    // Mesa já aberta (por mapa ou por QR): continua nela
    const { data: aberta } = await db.from('codigos_comanda').select('id')
      .eq('restaurante_id', rid).eq('status', 'em_uso').eq('mesa', String(n)).limit(1);
    if (aberta && aberta.length) { window.location.href = '?comanda=' + aberta[0].id; return; }

    // Mesa livre: usa a comanda "M<n>" (cria se ainda não existir)
    const cod = 'M' + n;
    const { data: achou } = await db.from('codigos_comanda').select('id,status')
      .eq('restaurante_id', rid).eq('codigo_curto', cod).limit(1);
    let linha = achou && achou[0];
    if (!linha) {
      const { data: nova, error } = await db.from('codigos_comanda')
        .insert({ restaurante_id: rid, status: 'livre', codigo_curto: cod }).select('id,status').single();
      if (error || !nova) { toast('Não consegui abrir a mesa. Peça ao dono para salvar as mesas em Configurações.', 'erro'); return; }
      linha = nova;
    }
    if (linha.status !== 'em_uso') {
      // Já diz o número da mesa pra tela de comanda não perguntar de novo
      try { sessionStorage.setItem('mapa_mesa_pre', JSON.stringify({ id: linha.id, mesa: String(n), t: Date.now() })); } catch (e) {}
    }
    window.location.href = '?comanda=' + linha.id;
  } finally {
    mapaTocando = false;
  }
}

// Garçom tocou numa mesa, não lançou nada e saiu ("← Voltar pro painel"): solta a mesa de volta (fica livre,
// sem deixar comanda aberta à toa). Só mexe em comanda criada pelo mapa ("M<n>") e que não tem nenhum pedido.
async function mapaMesaSoltarSeVazia(com) {
  try {
    if (!com || !com.id || !mapaMesasAtivo()) return;
    const { data: cod } = await db.from('codigos_comanda').select('id,codigo_curto,status').eq('id', com.id).maybeSingle();
    if (!cod || cod.status !== 'em_uso' || !/^M\d{1,2}$/.test(cod.codigo_curto || '')) return;
    const { count } = await db.from('pedidos').select('id', { count: 'exact', head: true })
      .eq('codigo_comanda_id', com.id).neq('status', 'cancelado').gte('criado_em', com.abertaEm || '1970-01-01');
    if ((count || 0) > 0) return;
    const { error } = await db.from('codigos_comanda').update({ status: 'livre', mesa: null, aberta_em: null }).eq('id', com.id);
    if (error) return;
    // Apaga o registro de "comanda aberta" que não chegou a ter pedido (senão contaria como comanda usada)
    const { error: e2 } = await db.from('comandas_historico').delete().eq('codigo_comanda_id', com.id).is('fechada_em', null);
    if (e2) await db.from('comandas_historico').update({ fechada_em: new Date().toISOString() }).eq('codigo_comanda_id', com.id).is('fechada_em', null);
  } catch (e) {}
}

// Usado por carregarModoComanda: se a comanda foi aberta pelo mapa, devolve o número da mesa (e apaga o recado)
function mapaMesaPreDefinida(codigo) {
  try {
    const raw = sessionStorage.getItem('mapa_mesa_pre');
    if (raw) {
      sessionStorage.removeItem('mapa_mesa_pre');
      const o = JSON.parse(raw);
      if (o && codigo && o.id === codigo.id && Date.now() - o.t < 120000) return String(o.mesa);
    }
  } catch (e) {}
  // Garantia extra (não depende do recado do navegador): comanda criada pelo mapa tem código "M<n>".
  // Só vale se o mapa está ligado nesta loja e o número está dentro da quantidade de mesas.
  try {
    const mm = codigo && /^M(\d{1,2})$/.exec(codigo.codigo_curto || '');
    if (mm && mapaMesasAtivo()) {
      const n = parseInt(mm[1]);
      if (n >= 1 && n <= (parseInt(restauranteAtual.qtd_mesas) || 0)) return String(n);
    }
  } catch (e) {}
  return null;
}

// ===== CONFIGURAÇÕES: quantas mesas e como abrir =====
function mapaMesasConfigHtml(r) {
  if (!mapaMesasDisponivel()) return '';
  const simples = typeof planoSimplesLoja === 'function' && planoSimplesLoja(r);
  const qtd = parseInt(r.qtd_mesas) || 0;
  const modo = (r.comanda_modo === 'mapa' || r.comanda_modo === 'ambos') ? r.comanda_modo : 'qr';
  const opc = (v, titulo, desc) => `
      <label style="display:flex;gap:10px;align-items:flex-start;padding:12px;border:2px solid ${modo === v ? 'var(--laranja)' : 'var(--creme-borda)'};border-radius:14px;margin-bottom:10px;cursor:pointer;background:${modo === v ? 'var(--laranja-light)' : '#fff'};">
        <input type="radio" name="mapa-modo" value="${v}" ${modo === v ? 'checked' : ''} style="margin-top:3px;width:auto;">
        <span><b>${titulo}</b><br><span style="font-size:12px;color:var(--texto-muted);">${desc}</span></span>
      </label>`;
  return `
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--creme-borda);">
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">🍽️ Mapa de mesas</div>
        <div style="font-size:13px;color:var(--texto-muted);margin-bottom:14px;">Diga quantas mesas você tem e o sistema desenha um quadradinho para cada uma na tela de Comandas. O garçom toca na mesa e lança o pedido, sem precisar de cartão com QR Code.</div>
        <div class="form-group" style="margin:0 0 14px;">
          <label style="font-size:12px;">Quantas mesas você tem?</label>
          <input type="number" id="mapa-qtd-mesas" value="${qtd || ''}" placeholder="Ex: 20" min="0" max="99" style="width:120px;">
        </div>
        ${simples ? '' : `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Como o garçom abre a mesa?</div>
        ${opc('mapa', 'Mapa de mesas', 'Toca no número e pronto. Sem imprimir cartão.')}
        ${opc('qr', 'QR Code', 'Cartão com QR Code (como era antes). Sem o mapa.')}
        ${opc('ambos', 'Os dois', 'O mapa e o QR Code juntos.')}`}
        <button type="button" class="btn-sm" onclick="mapaMesasSalvar()">Salvar mesas</button>
        <div style="font-size:11px;color:var(--texto-muted);margin-top:8px;">${simples ? 'No plano Simples só existe o mapa de mesas.' : 'Se escolher "QR Code", o mapa não aparece.'} Depois de salvar, abra a tela Comandas.</div>
      </div>`;
}

async function mapaMesasSalvar() {
  if (!restauranteAtual) return;
  const qtd = parseInt((document.getElementById('mapa-qtd-mesas') || {}).value) || 0;
  if (qtd < 0 || qtd > 99) { toast('Digite um número de mesas entre 1 e 99.', 'erro'); return; }
  const simples = typeof planoSimplesLoja === 'function' && planoSimplesLoja(restauranteAtual);
  const marcado = document.querySelector('input[name="mapa-modo"]:checked');
  const modo = simples ? 'mapa' : (marcado ? marcado.value : 'qr');
  const { error } = await db.from('restaurantes').update({ qtd_mesas: qtd, comanda_modo: modo }).eq('id', restauranteAtual.id);
  if (error) { toast('Erro ao salvar: ' + error.message, 'erro'); return; }

  // Cria as comandas "M1".."M<n>" que ainda não existem
  if (qtd > 0) {
    const { data: existentes } = await db.from('codigos_comanda').select('codigo_curto')
      .eq('restaurante_id', restauranteAtual.id).like('codigo_curto', 'M%');
    const tem = new Set((existentes || []).map(x => x.codigo_curto));
    const novas = [];
    for (let n = 1; n <= qtd; n++) if (!tem.has('M' + n)) novas.push({ restaurante_id: restauranteAtual.id, status: 'livre', codigo_curto: 'M' + n });
    if (novas.length) {
      const { error: e2 } = await db.from('codigos_comanda').insert(novas);
      if (e2) { toast('Salvei, mas não consegui preparar as mesas: ' + e2.message, 'erro'); return; }
    }
  }
  restauranteAtual = { ...restauranteAtual, qtd_mesas: qtd, comanda_modo: modo };
  toast('Mesas salvas!', 'ok');
}

// ===== TROCAR / JUNTAR MESAS =====
// Botão "🔄 Trocar / juntar mesa" na tela da comanda. Trocar = passar a conta pra outra mesa livre.
// Juntar = escolher uma mesa que já tem pedido: as duas contas viram uma só (os pedidos são movidos, nada é impresso de novo).
// Liberado só na loja Demo por enquanto (localStorage 'troca_mesa' = 'true'/'false' força).
var mapaTrocaDados = null;

function trocaMesaDisponivel() {
  try {
    const v = localStorage.getItem('troca_mesa');
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch (e) {}
  return !!restauranteAtual && ['servidelivery-demo'].includes(restauranteAtual.slug);
}

function mapaTrocaBotaoHtml() {
  if (!trocaMesaDisponivel() || typeof comandaAtual === 'undefined' || !comandaAtual || !comandaAtual.mesa) return '';
  return `<button onclick="mapaTrocaAbrir()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;margin-left:8px;">🔄 Trocar / juntar mesa</button>`;
}

function mapaTrocaFechar() {
  const el = document.getElementById('mapa-troca-fundo');
  if (el) el.remove();
}

async function mapaTrocaAbrir() {
  if (!comandaAtual || !comandaAtual.mesa) return;
  const rid = restauranteAtual.id;
  // Mesas abertas agora, com o total de cada uma (pedido recusado não conta)
  const { data: abertas } = await db.from('codigos_comanda').select('id,mesa,codigo_curto,aberta_em')
    .eq('restaurante_id', rid).eq('status', 'em_uso');
  const ids = (abertas || []).map(a => a.id);
  let peds = [];
  if (ids.length) {
    const { data } = await db.from('pedidos').select('total,status,criado_em,codigo_comanda_id')
      .eq('restaurante_id', rid).in('codigo_comanda_id', ids);
    peds = (data || []).filter(p => p.status !== 'cancelado');
  }
  const porMesa = {};
  (abertas || []).forEach(a => {
    if (!a.mesa || a.id === comandaAtual.id) return;
    const deles = peds.filter(p => p.codigo_comanda_id === a.id && dataDoBanco(p.criado_em) >= dataDoBanco(a.aberta_em));
    porMesa[String(a.mesa).trim()] = { ...a, qtd: deles.length, total: deles.reduce((s, p) => s + parseFloat(p.total || 0), 0) };
  });
  mapaTrocaDados = { porMesa };

  const qtd = Math.min(parseInt(restauranteAtual.qtd_mesas) || 0, 99);
  const minha = String(comandaAtual.mesa).trim();
  let corpo = '';
  if (qtd > 0) {
    let tiles = '';
    for (let n = 1; n <= qtd; n++) {
      const d = porMesa[String(n)];
      const ocupada = !!d && d.qtd > 0;
      const eh = String(n) === minha;
      tiles += `<button type="button" ${eh ? 'disabled' : `onclick="mapaTrocaEscolher(${n})"`} style="
          display:flex;flex-direction:column;align-items:center;justify-content:center;height:66px;border-radius:12px;font-family:inherit;cursor:${eh ? 'default' : 'pointer'};
          border:2px solid ${eh ? '#444' : ocupada ? 'var(--laranja)' : 'var(--creme-borda)'};
          background:${eh ? '#444' : ocupada ? 'var(--laranja)' : '#fff'};color:${eh || ocupada ? '#fff' : 'var(--texto)'};">
          <span style="font-size:20px;font-weight:800;line-height:1.1;">${n}</span>
          <span style="font-size:11px;">${eh ? 'esta mesa' : ocupada ? 'R$ ' + d.total.toFixed(2).replace('.', ',') : 'livre'}</span>
        </button>`;
    }
    corpo = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:8px;">${tiles}</div>
      <div style="font-size:12px;color:var(--texto-muted);margin-top:10px;">Mesa <b>branca</b> = passar a conta para ela. Mesa <b>laranja</b> = juntar as duas contas.</div>`;
  } else {
    corpo = `<div style="font-size:13px;color:var(--texto-muted);margin-bottom:8px;">Digite o número da outra mesa. Se ela já tiver pedido, as duas contas viram uma só.</div>
      <div style="display:flex;gap:8px;"><input type="text" id="mapa-troca-num" inputmode="numeric" placeholder="Número da mesa" style="flex:1;font-size:16px;">
      <button class="btn-sm" onclick="mapaTrocaEscolher((document.getElementById('mapa-troca-num')||{}).value)">Continuar</button></div>`;
  }
  mapaTrocaFechar();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="mapa-troca-fundo" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:flex-end;justify-content:center;" onclick="if(event.target===this)mapaTrocaFechar()">
      <div style="background:#fff;width:100%;max-width:520px;max-height:85vh;overflow:auto;border-radius:20px 20px 0 0;padding:18px 16px 22px;">
        <div style="font-size:17px;font-weight:800;margin-bottom:4px;">🔄 Trocar / juntar mesa</div>
        <div style="font-size:13px;color:var(--texto-muted);margin-bottom:14px;">Você está na <b>Mesa ${esc(minha)}</b>. Para qual mesa quer levar a conta?</div>
        ${corpo}
        <button type="button" onclick="mapaTrocaFechar()" style="width:100%;margin-top:16px;padding:12px;border-radius:12px;border:2px solid var(--creme-borda);background:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">Cancelar</button>
      </div>
    </div>`);
}

async function mapaTrocaEscolher(nBruto) {
  const n = String(parseInt(nBruto) || '').trim();
  if (!n || !mapaTrocaDados) { toast('Digite um número de mesa válido.', 'erro'); return; }
  const minha = String(comandaAtual.mesa).trim();
  if (n === minha) { toast('Essa já é a mesa atual.', 'erro'); return; }
  const d = mapaTrocaDados.porMesa[n];
  const ocupada = !!d && d.qtd > 0;
  const msg = ocupada
    ? `A Mesa ${n} já tem pedido (R$ ${d.total.toFixed(2).replace('.', ',')}). Juntar a conta da Mesa ${minha} com a da Mesa ${n}?`
    : `Passar a conta da Mesa ${minha} para a Mesa ${n}?`;
  if (!confirm(msg)) return;
  mapaTrocaFechar();
  await mapaTrocaExecutar(n);
}

// Move os pedidos de uma comanda pra outra, acertando o número da mesa escrito neles
async function mapaMoverPedidos(origId, destId, mesaAntiga, mesaNova, abertaEm) {
  const { data: peds } = await db.from('pedidos').select('id,observacao')
    .eq('codigo_comanda_id', origId).gte('criado_em', abertaEm || '1970-01-01');
  for (const p of (peds || [])) {
    await db.from('pedidos').update({
      codigo_comanda_id: destId,
      endereco: `Mesa ${mesaNova}`,
      observacao: (p.observacao || '').replace(`Mesa ${mesaAntiga}`, `Mesa ${mesaNova}`)
    }).eq('id', p.id);
  }
}

async function mapaTrocaExecutar(n) {
  try {
    const rid = restauranteAtual.id;
    const origId = comandaAtual.id;
    const { data: o } = await db.from('codigos_comanda').select('id,codigo_curto,aberta_em,mesa').eq('id', origId).single();
    if (!o) { toast('Não achei essa comanda. Tente de novo.', 'erro'); return; }
    const mesaAntiga = String(o.mesa).trim();
    const oEhMapa = /^M\d{1,2}$/.test(o.codigo_curto || '');
    const d = mapaTrocaDados.porMesa[n]; // comanda aberta que já está nessa mesa (se houver)
    let destinoId = origId;

    if (d) {
      // JUNTAR: tudo vai pra comanda da outra mesa; a abertura vale a mais antiga das duas
      const antiga = dataDoBanco(o.aberta_em) < dataDoBanco(d.aberta_em) ? o.aberta_em : d.aberta_em;
      if (antiga !== d.aberta_em) {
        await db.from('codigos_comanda').update({ aberta_em: antiga }).eq('id', d.id);
        await db.from('comandas_historico').update({ aberta_em: antiga }).eq('codigo_comanda_id', d.id).is('fechada_em', null);
      }
      await mapaMoverPedidos(origId, d.id, mesaAntiga, n, o.aberta_em);
      const { error: eDel } = await db.from('comandas_historico').delete().eq('codigo_comanda_id', origId).is('fechada_em', null);
      if (eDel) await db.from('comandas_historico').update({ fechada_em: new Date().toISOString() }).eq('codigo_comanda_id', origId).is('fechada_em', null);
      await db.from('codigos_comanda').update({ status: 'livre', mesa: null, aberta_em: null }).eq('id', origId);
      destinoId = d.id;
    } else if (oEhMapa) {
      // TROCAR (mesa do mapa): a conta vai pra linha "M<n>" da mesa nova, que está livre
      let { data: dr } = await db.from('codigos_comanda').select('id,status').eq('restaurante_id', rid).eq('codigo_curto', 'M' + n).maybeSingle();
      if (!dr) {
        const { data: nova, error: eN } = await db.from('codigos_comanda').insert({ restaurante_id: rid, status: 'livre', codigo_curto: 'M' + n }).select('id,status').single();
        if (eN || !nova) { toast('Não consegui preparar a mesa ' + n + '. Tente de novo.', 'erro'); return; }
        dr = nova;
      }
      if (dr.status === 'em_uso') { toast('A mesa ' + n + ' acabou de ser aberta por outra pessoa. Escolha de novo.', 'erro'); return; }
      await db.from('codigos_comanda').update({ status: 'em_uso', mesa: n, aberta_em: o.aberta_em }).eq('id', dr.id);
      await db.from('comandas_historico').update({ codigo_comanda_id: dr.id, mesa: n }).eq('codigo_comanda_id', origId).is('fechada_em', null);
      await mapaMoverPedidos(origId, dr.id, mesaAntiga, n, o.aberta_em);
      await db.from('codigos_comanda').update({ status: 'livre', mesa: null, aberta_em: null }).eq('id', origId);
      destinoId = dr.id;
    } else {
      // TROCAR (cartão com QR): o cartão continua o mesmo, só muda o número da mesa
      await db.from('codigos_comanda').update({ mesa: n }).eq('id', origId);
      await db.from('comandas_historico').update({ mesa: n }).eq('codigo_comanda_id', origId).is('fechada_em', null);
      const { data: peds } = await db.from('pedidos').select('id,observacao').eq('codigo_comanda_id', origId).gte('criado_em', o.aberta_em || '1970-01-01');
      for (const p of (peds || [])) {
        await db.from('pedidos').update({ endereco: `Mesa ${n}`, observacao: (p.observacao || '').replace(`Mesa ${mesaAntiga}`, `Mesa ${n}`) }).eq('id', p.id);
      }
    }
    try { sessionStorage.removeItem('mapa_mesa_pre'); } catch (e) {}
    window.location.href = '?comanda=' + destinoId;
  } catch (e) {
    toast('Não consegui trocar a mesa. Tente de novo.', 'erro');
  }
}
