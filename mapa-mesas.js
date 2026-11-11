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

// Mesas juntas: a comanda guarda "2/3" no campo mesa. Aqui separamos os números e montamos o rótulo.
function mapaNumerosDaMesa(mesa) {
  return String(mesa == null ? '' : mesa).split(/[+\/]/).map(x => parseInt(x)).filter(x => x > 0);
}
function mapaRotulo(nums) {
  return Array.from(new Set(nums)).sort((a, b) => a - b).join('/');
}

// Desenha o mapa no topo da tela de Comandas. "mesas" = comandas abertas agora (com total).
function mapaMesasInserir(mesas) {
  if (!mapaMesasAtivo()) return;
  const cont = document.getElementById('conteudo');
  if (!cont || document.getElementById('mapa-mesas-card')) return;
  const qtd = Math.min(parseInt(restauranteAtual.qtd_mesas) || 0, 99);
  const porMesa = {};
  // Mesas juntas ocupam todos os quadradinhos do grupo (cada um mostra "2/3" e a conta única)
  (mesas || []).forEach(m => {
    const nums = mapaNumerosDaMesa(m.mesa);
    const rot = nums.length > 1 ? mapaRotulo(nums) : null;
    nums.forEach(n => { porMesa[String(n)] = { m, rot, primeira: Math.min.apply(null, nums) }; });
  });

  let tiles = '';
  for (let n = 1; n <= qtd; n++) {
    const pm = porMesa[String(n)];
    const m = pm && pm.m;
    const rot = pm && pm.rot;
    if (rot && n !== pm.primeira) continue; // mesas juntas: aparecem num quadradinho só (na posição da primeira)
    // Só fica "com pedido" depois que algum pedido foi enviado. Mesa aberta sem pedido continua "livre".
    const ocupada = !!m && (m.qtdPedidos || 0) > 0;
    const total = ocupada ? 'R$ ' + (m.total || 0).toFixed(2).replace('.', ',') : (rot ? 'juntas' : 'livre');
    tiles += `<button type="button" onclick="mapaMesaTocar(${n})" style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;height:78px;border-radius:14px;cursor:pointer;font-family:inherit;
        border:2px solid ${ocupada || rot ? 'var(--laranja)' : 'var(--creme-borda)'};
        background:${ocupada ? 'var(--laranja)' : '#fff'};color:${ocupada ? '#fff' : 'var(--texto)'};">
        <span style="font-size:${rot ? (rot.length > 5 ? 15 : 20) : 24}px;font-weight:800;line-height:1.1;">${rot ? rot : n}</span>
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
  if (lista && (mesas || []).every(m => m.mesa && /^\d+([+\/]\d+)*$/.test(String(m.mesa).trim()) && mapaNumerosDaMesa(m.mesa).every(x => x >= 1 && x <= qtd))) {
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
    // (inclui mesas juntas: "2/3" abre a mesma conta tocando no 13 ou no 14)
    const { data: abertas } = await db.from('codigos_comanda').select('id,mesa')
      .eq('restaurante_id', rid).eq('status', 'em_uso').not('mesa', 'is', null);
    const aberta = (abertas || []).filter(a => mapaNumerosDaMesa(a.mesa).includes(n));
    if (aberta.length) { window.location.href = '?comanda=' + aberta[0].id; return; }

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
    if (mapaNumerosDaMesa(com.mesa).length > 1) return; // mesas juntas ficam juntas até pagar
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

async function mapaMesasSalvar(silencioso) {
  if (!restauranteAtual) return;
  if (!document.getElementById('mapa-qtd-mesas')) return; // campos das mesas não estão na tela
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
  if (!silencioso) toast('Mesas salvas!', 'ok');
}

// ===== TROCAR / JUNTAR MESAS =====
// Botão "🔄 Trocar / juntar mesa" na tela da comanda.
//  • Trocar = passar a conta pra outra mesa livre (a mesa antiga fica livre).
//  • Juntar = as mesas continuam TODAS ocupadas (quadradinho mostra "2/3"), mas a conta vira uma só.
//    A comanda guarda "2/3" no campo mesa. Fechar a conta libera todas as mesas do grupo de uma vez.
// Liberado em todas as lojas (localStorage 'troca_mesa' = 'false' desliga num aparelho).
var mapaTrocaDados = null;

function trocaMesaDisponivel() {
  try {
    const v = localStorage.getItem('troca_mesa');
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch (e) {}
  return !!restauranteAtual; // liberado para todas as lojas (planos Simples e Completo)
}

function mapaTrocaBotaoHtml() {
  if (!trocaMesaDisponivel() || typeof comandaAtual === 'undefined' || !comandaAtual || !comandaAtual.mesa) return '';
  return `<button onclick="mapaTrocaAbrir()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;margin-left:8px;">🔄 Trocar / juntar mesa</button>`;
}

function mapaTrocaFechar() {
  const el = document.getElementById('mapa-troca-fundo');
  if (el) el.remove();
}

function mapaRs(v) { return 'R$ ' + (v || 0).toFixed(2).replace('.', ','); }

// Solta uma comanda de mesa (fica livre) e apaga o registro de "aberta" dela
async function mapaLiberarLinha(id) {
  await db.from('codigos_comanda').update({ status: 'livre', mesa: null, aberta_em: null }).eq('id', id);
  const { error } = await db.from('comandas_historico').delete().eq('codigo_comanda_id', id).is('fechada_em', null);
  if (error) await db.from('comandas_historico').update({ fechada_em: new Date().toISOString() }).eq('codigo_comanda_id', id).is('fechada_em', null);
}

async function mapaTrocaAbrir(modo) {
  if (!comandaAtual || !comandaAtual.mesa) return;
  const rid = restauranteAtual.id;
  const meusNums = mapaNumerosDaMesa(comandaAtual.mesa);
  const emGrupo = meusNums.length > 1;
  modo = emGrupo ? 'juntar' : (modo || 'trocar');

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
  // cob[n] = comanda aberta (de outra mesa) que ocupa a mesa n
  const cob = {};
  (abertas || []).forEach(a => {
    if (!a.mesa || a.id === comandaAtual.id) return;
    const deles = peds.filter(p => p.codigo_comanda_id === a.id && dataDoBanco(p.criado_em) >= dataDoBanco(a.aberta_em));
    const nums = mapaNumerosDaMesa(a.mesa);
    const d = { ...a, nums, rot: mapaRotulo(nums), qtd: deles.length, total: deles.reduce((s, p) => s + parseFloat(p.total || 0), 0) };
    nums.forEach(n => { cob[String(n)] = d; });
  });
  mapaTrocaDados = { cob, modo };

  const qtd = Math.min(parseInt(restauranteAtual.qtd_mesas) || 0, 99);
  const minha = mapaRotulo(meusNums);
  const botModo = (v, titulo) => `<button type="button" ${emGrupo ? 'disabled' : `onclick="mapaTrocaAbrir('${v}')"`} style="flex:1;padding:10px;border-radius:12px;font-family:inherit;font-size:14px;font-weight:700;cursor:${emGrupo ? 'default' : 'pointer'};
      border:2px solid ${modo === v ? 'var(--laranja)' : 'var(--creme-borda)'};background:${modo === v ? 'var(--laranja)' : '#fff'};color:${modo === v ? '#fff' : 'var(--texto)'};opacity:${emGrupo && v === 'trocar' ? .4 : 1};">${titulo}</button>`;

  let corpo = '';
  if (qtd > 0) {
    let tiles = '';
    for (let n = 1; n <= qtd; n++) {
      const d = cob[String(n)];
      const minhaMesa = meusNums.includes(n);
      if (minhaMesa && emGrupo && n !== Math.min.apply(null, meusNums)) continue;
      if (!minhaMesa && d && d.nums.length > 1 && n !== Math.min.apply(null, d.nums)) continue;
      const ocupada = !!d && d.qtd > 0;
      let bloqueada = false, fundo = '#fff', borda = 'var(--creme-borda)', cor = 'var(--texto)', sub = 'livre', grande = String(n);
      if (minhaMesa) { bloqueada = true; fundo = '#444'; borda = '#444'; cor = '#fff'; sub = emGrupo ? 'esta conta' : 'esta mesa'; if (emGrupo) grande = minha; }
      else if (d && d.nums.length > 1 && !ocupada) { grande = d.rot; sub = 'juntas'; if (modo === 'trocar') { bloqueada = true; fundo = '#bbb'; borda = '#bbb'; cor = '#fff'; } else { borda = 'var(--laranja)'; } }
      else if (ocupada) {
        fundo = 'var(--laranja)'; borda = 'var(--laranja)'; cor = '#fff'; sub = mapaRs(d.total);
        if (d.nums.length > 1) grande = d.rot;
        if (modo === 'trocar') { bloqueada = true; fundo = '#bbb'; borda = '#bbb'; sub = 'ocupada'; }
      }
      tiles += `<button type="button" ${bloqueada ? 'disabled' : `onclick="mapaTrocaEscolher(${n})"`} style="
          display:flex;flex-direction:column;align-items:center;justify-content:center;height:66px;border-radius:12px;font-family:inherit;cursor:${bloqueada ? 'default' : 'pointer'};
          border:2px solid ${borda};background:${fundo};color:${cor};">
          <span style="font-size:${grande.length > 5 ? 14 : 20}px;font-weight:800;line-height:1.1;">${grande}</span>
          <span style="font-size:11px;">${sub}</span>
        </button>`;
    }
    corpo = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:8px;">${tiles}</div>
      <div style="font-size:12px;color:var(--texto-muted);margin-top:10px;">${modo === 'trocar'
        ? 'Toque numa mesa <b>livre</b> (branca) para passar a conta para ela.'
        : 'Toque na mesa que quer juntar. As mesas continuam todas ocupadas, mas a conta vira uma só.'}</div>`;
  } else {
    corpo = `<div style="font-size:13px;color:var(--texto-muted);margin-bottom:8px;">Digite o número da outra mesa.</div>
      <div style="display:flex;gap:8px;"><input type="text" id="mapa-troca-num" inputmode="numeric" placeholder="Número da mesa" style="flex:1;font-size:16px;">
      <button class="btn-sm" onclick="mapaTrocaEscolher((document.getElementById('mapa-troca-num')||{}).value)">Continuar</button></div>`;
  }
  mapaTrocaFechar();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="mapa-troca-fundo" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:flex-end;justify-content:center;" onclick="if(event.target===this)mapaTrocaFechar()">
      <div style="background:#fff;width:100%;max-width:520px;max-height:85vh;overflow:auto;border-radius:20px 20px 0 0;padding:18px 16px 22px;">
        <div style="font-size:17px;font-weight:800;margin-bottom:4px;">🔄 Trocar / juntar mesa</div>
        <div style="font-size:13px;color:var(--texto-muted);margin-bottom:12px;">Você está na <b>Mesa ${esc(minha)}</b>.${emGrupo ? ' (mesas juntas: dá para juntar mais uma)' : ''}</div>
        <div style="display:flex;gap:8px;margin-bottom:14px;">${botModo('trocar', '🔄 Trocar de mesa')}${botModo('juntar', '➕ Juntar mesas')}</div>
        ${corpo}
        <button type="button" onclick="mapaTrocaFechar()" style="width:100%;margin-top:16px;padding:12px;border-radius:12px;border:2px solid var(--creme-borda);background:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">Cancelar</button>
      </div>
    </div>`);
}

async function mapaTrocaEscolher(nBruto) {
  const n = parseInt(nBruto) || 0;
  if (!n || !mapaTrocaDados) { toast('Digite um número de mesa válido.', 'erro'); return; }
  const meusNums = mapaNumerosDaMesa(comandaAtual.mesa);
  if (meusNums.includes(n)) { toast('Essa mesa já faz parte desta conta.', 'erro'); return; }
  const minha = mapaRotulo(meusNums);
  const d = mapaTrocaDados.cob[String(n)];
  const ocupada = !!d && d.qtd > 0;
  let msg;
  if (mapaTrocaDados.modo === 'trocar') {
    if (ocupada) { toast('A Mesa ' + n + ' está ocupada. Escolha uma mesa livre.', 'erro'); return; }
    msg = `Passar a conta da Mesa ${minha} para a Mesa ${n}? A Mesa ${minha} fica livre.`;
  } else {
    msg = ocupada
      ? `Juntar a Mesa ${d.rot} (${mapaRs(d.total)}) com a Mesa ${minha}? As mesas continuam ocupadas e a conta vira uma só.`
      : `Juntar a Mesa ${n} com a Mesa ${minha}? As duas ficam ocupadas e a conta é uma só.`;
  }
  if (!confirm(msg)) return;
  mapaTrocaFechar();
  if (mapaTrocaDados.modo === 'trocar') await mapaTrocaExecutar(n);
  else await mapaJuntarExecutar(n);
}

// Acerta o texto "Mesa X" escrito nos pedidos de uma comanda (a partir da abertura dela)
async function mapaRotularPedidos(comandaId, abertaEm, mesaAntiga, mesaNova) {
  const { data: peds } = await db.from('pedidos').select('id,observacao')
    .eq('codigo_comanda_id', comandaId).gte('criado_em', abertaEm || '1970-01-01');
  for (const p of (peds || [])) {
    await db.from('pedidos').update({
      endereco: `Mesa ${mesaNova}`,
      observacao: (p.observacao || '').split(`Mesa ${mesaAntiga}`).join(`Mesa ${mesaNova}`)
    }).eq('id', p.id);
  }
}

// Move os pedidos de uma comanda pra outra, acertando o número da mesa escrito neles
async function mapaMoverPedidos(origId, destId, mesaAntiga, mesaNova, abertaEm) {
  const { data: peds } = await db.from('pedidos').select('id,observacao')
    .eq('codigo_comanda_id', origId).gte('criado_em', abertaEm || '1970-01-01');
  for (const p of (peds || [])) {
    await db.from('pedidos').update({
      codigo_comanda_id: destId,
      endereco: `Mesa ${mesaNova}`,
      observacao: (p.observacao || '').split(`Mesa ${mesaAntiga}`).join(`Mesa ${mesaNova}`)
    }).eq('id', p.id);
  }
}

// JUNTAR: a conta mais antiga vira a conta do grupo; a outra (se tiver) é movida pra ela e solta.
async function mapaJuntarExecutar(n) {
  try {
    const { data: o } = await db.from('codigos_comanda').select('id,aberta_em,mesa').eq('id', comandaAtual.id).single();
    if (!o) { toast('Não achei essa comanda. Tente de novo.', 'erro'); return; }
    // Confere de novo, na hora, quem está na mesa n (outra pessoa pode ter mexido)
    const { data: abertas } = await db.from('codigos_comanda').select('id,aberta_em,mesa')
      .eq('restaurante_id', restauranteAtual.id).eq('status', 'em_uso').neq('id', o.id).not('mesa', 'is', null);
    const outro = (abertas || []).find(a => mapaNumerosDaMesa(a.mesa).includes(n)) || null;

    let mestre = o, escravo = null;
    if (outro) {
      const antigaO = o.aberta_em ? dataDoBanco(o.aberta_em).getTime() : Infinity;
      const antigaX = outro.aberta_em ? dataDoBanco(outro.aberta_em).getTime() : Infinity;
      if (antigaX < antigaO) { mestre = outro; escravo = o; } else { escravo = outro; }
    }
    const nums = mapaNumerosDaMesa(o.mesa).concat(outro ? mapaNumerosDaMesa(outro.mesa) : [], [n]);
    const rotulo = mapaRotulo(nums);
    const rotMestreAntigo = mapaRotulo(mapaNumerosDaMesa(mestre.mesa));

    if (escravo) {
      await mapaMoverPedidos(escravo.id, mestre.id, mapaRotulo(mapaNumerosDaMesa(escravo.mesa)), rotulo, escravo.aberta_em);
      await mapaLiberarLinha(escravo.id);
    }
    // Pedidos que já estavam na conta do grupo passam a dizer "Mesa 13+14"
    await mapaRotularPedidos(mestre.id, mestre.aberta_em, rotMestreAntigo, rotulo);
    await db.from('codigos_comanda').update({ mesa: rotulo }).eq('id', mestre.id);
    await db.from('comandas_historico').update({ mesa: rotulo }).eq('codigo_comanda_id', mestre.id).is('fechada_em', null);
    try { sessionStorage.removeItem('mapa_mesa_pre'); } catch (e) {}
    window.location.href = '?comanda=' + mestre.id;
  } catch (e) {
    toast('Não consegui juntar as mesas. Tente de novo.', 'erro');
  }
}

// TROCAR: a conta vai pra uma mesa livre; a mesa antiga fica livre.
async function mapaTrocaExecutar(n) {
  try {
    const rid = restauranteAtual.id;
    const origId = comandaAtual.id;
    const { data: o } = await db.from('codigos_comanda').select('id,codigo_curto,aberta_em,mesa').eq('id', origId).single();
    if (!o) { toast('Não achei essa comanda. Tente de novo.', 'erro'); return; }
    const mesaAntiga = String(o.mesa).trim();
    const oEhMapa = /^M\d{1,2}$/.test(o.codigo_curto || '');
    // Se a mesa nova tem uma comanda aberta SEM pedido (sobra), solta ela antes
    const sobra = mapaTrocaDados && mapaTrocaDados.cob[String(n)];
    if (sobra && sobra.qtd === 0) await mapaLiberarLinha(sobra.id);
    let destinoId = origId;

    if (oEhMapa) {
      let { data: dr } = await db.from('codigos_comanda').select('id,status').eq('restaurante_id', rid).eq('codigo_curto', 'M' + n).maybeSingle();
      if (!dr) {
        const { data: nova, error: eN } = await db.from('codigos_comanda').insert({ restaurante_id: rid, status: 'livre', codigo_curto: 'M' + n }).select('id,status').single();
        if (eN || !nova) { toast('Não consegui preparar a mesa ' + n + '. Tente de novo.', 'erro'); return; }
        dr = nova;
      }
      if (dr.status === 'em_uso') { toast('A mesa ' + n + ' acabou de ser aberta por outra pessoa. Escolha de novo.', 'erro'); return; }
      await db.from('codigos_comanda').update({ status: 'em_uso', mesa: String(n), aberta_em: o.aberta_em }).eq('id', dr.id);
      await db.from('comandas_historico').update({ codigo_comanda_id: dr.id, mesa: String(n) }).eq('codigo_comanda_id', origId).is('fechada_em', null);
      await mapaMoverPedidos(origId, dr.id, mesaAntiga, n, o.aberta_em);
      await db.from('codigos_comanda').update({ status: 'livre', mesa: null, aberta_em: null }).eq('id', origId);
      destinoId = dr.id;
    } else {
      // Cartão com QR: o cartão continua o mesmo, só muda o número da mesa
      await db.from('codigos_comanda').update({ mesa: String(n) }).eq('id', origId);
      await db.from('comandas_historico').update({ mesa: String(n) }).eq('codigo_comanda_id', origId).is('fechada_em', null);
      await mapaRotularPedidos(origId, o.aberta_em, mesaAntiga, n);
    }
    try { sessionStorage.removeItem('mapa_mesa_pre'); } catch (e) {}
    window.location.href = '?comanda=' + destinoId;
  } catch (e) {
    toast('Não consegui trocar a mesa. Tente de novo.', 'erro');
  }
}
