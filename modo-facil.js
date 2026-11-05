// ===================================================================
// MODO FÁCIL — painel simples para quem só quer receber o pedido.
// Uma tela só, com UM botão grande por pedido (Aceitar -> Saiu/Pronto).
// Por enquanto só na loja Demo. Para ligar/desligar num aparelho:
//   localStorage.setItem('modo_facil_disponivel','true' ou 'false')
// Quem está no Modo Fácil volta ao Modo Completo pelo link "Modo Completo"
// (e do Completo para o Fácil pelo botão laranja no menu de baixo).
// ===================================================================
function modoFacilDisponivel() {
  try {
    const v = localStorage.getItem('modo_facil_disponivel');
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch (e) {}
  return !!restauranteAtual && meuPapel !== 'garcom' && ['servidelivery-demo'].includes(restauranteAtual.slug);
}

function modoFacilAtivo() {
  if (!modoFacilDisponivel()) return false;
  try { if (localStorage.getItem('modo_painel_' + restauranteAtual.id) === 'completo') return false; } catch (e) {}
  return true;
}

function modoFacilTrocar(facil) {
  try { localStorage.setItem('modo_painel_' + restauranteAtual.id, facil ? 'facil' : 'completo'); } catch (e) {}
  modoFacilAplicar();
  irPara(facil ? 'pedidos' : 'dashboard');
}

function modoFacilCss() {
  if (document.getElementById('css-modo-facil')) return;
  const st = document.createElement('style');
  st.id = 'css-modo-facil';
  st.textContent = `
body.modo-facil .sidebar, body.modo-facil .sidebar-overlay, body.modo-facil .menu-toggle{display:none !important;}
body.modo-facil .main{margin-left:0;}
body.modo-facil #btn-pausar-loja{font-size:15px !important;padding:12px 20px !important;border-radius:30px !important;font-weight:700 !important;}
#facil-nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 28px;background:#fff;border-bottom:1px solid var(--cinza-borda);}
.fn-btn{font-family:inherit;font-size:18px;font-weight:800;letter-spacing:.3px;padding:14px 26px;border-radius:14px;border:2px solid #E6D9CB;background:#fff;color:var(--texto);cursor:pointer;}
.fn-btn.on{background:var(--texto);color:#fff;border-color:var(--texto);}
.fn-badge{background:#D9302C;color:#fff;font-size:14px;border-radius:12px;padding:2px 9px;margin-left:8px;}
.fn-links{margin-left:auto;display:flex;gap:18px;flex-wrap:wrap;align-items:center;}
.fn-link{font-family:inherit;font-size:13px;color:#6B5B50;background:none;border:none;text-decoration:underline;cursor:pointer;padding:6px 0;}
.ff-som{background:#D9302C;color:#fff;font-size:20px;font-weight:800;text-align:center;padding:16px;border-radius:14px;margin-bottom:16px;cursor:pointer;}
.ff-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;}
.ff-tit{font-size:20px;font-weight:800;margin:4px 2px 12px;color:#4a3b31;}
.ff-card{background:#fff;border-radius:18px;padding:20px 22px;margin-bottom:18px;box-shadow:0 3px 10px rgba(0,0,0,.08);border-left:12px solid #ddd;}
.ff-card.novo{border-left-color:#D9302C;animation:ffpulse 1.6s ease-in-out infinite;}
.ff-card.prep{border-left-color:#F2A100;}
@keyframes ffpulse{0%,100%{box-shadow:0 3px 10px rgba(0,0,0,.08);}50%{box-shadow:0 0 0 5px rgba(217,48,44,.25);}}
.ff-l1{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:22px;font-weight:800;}
.ff-l1 small{font-size:15px;font-weight:600;color:#8a7868;white-space:nowrap;}
.ff-tags{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 2px;}
.ff-tag{font-size:14px;font-weight:800;padding:4px 12px;border-radius:8px;background:#fde3e1;color:#B3241F;}
.ff-tag.ret{background:#e3f3ea;color:#1A7A45;}
.ff-tag.ag{background:#FFF1D6;color:#7A4300;}
.ff-it{font-size:19px;line-height:1.55;margin:10px 0 6px;}
.ff-it small{display:block;font-size:14px;color:#6B5B50;line-height:1.3;margin:-2px 0 4px 22px;}
.ff-obs{font-size:15px;background:#FFF8E6;border-radius:8px;padding:8px 10px;margin:6px 0;}
.ff-end{font-size:16px;color:#4a3b31;margin:6px 0;}
.ff-pag{font-size:16px;font-weight:700;border-radius:8px;padding:10px 12px;margin:10px 0 14px;line-height:1.35;}
.ff-pag.ok{background:#E3F4EE;color:#0B5C47;}
.ff-pag.cobrar{background:#FFF1D6;color:#7A4300;}
.ff-pag.pix{background:#FDE8DC;color:#8F3010;}
.ff-btn{display:block;width:100%;font-family:inherit;font-size:24px;font-weight:800;color:#fff;border:none;border-radius:14px;padding:18px;cursor:pointer;}
.ff-btn.vermelho{background:#D9302C;}
.ff-btn.verde{background:#1F9D55;}
.ff-btn[disabled]{opacity:.6;cursor:wait;}
.ff-peq{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;}
.ff-lnk{font-family:inherit;font-size:13px;color:#6B5B50;background:none;border:none;text-decoration:underline;cursor:pointer;padding:4px 0;}
.ff-lnk.perigo{color:#8F3010;margin-left:auto;}
.ff-vazio{font-size:17px;color:#6B5B50;text-align:center;padding:26px 10px;border:2px dashed #D9CBBB;border-radius:16px;}
.ff-tudo{font-size:22px;font-weight:700;color:#6B5B50;text-align:center;padding:50px 10px;}
.ff-cam{margin-top:10px;background:#fff;border-radius:14px;padding:12px 16px;}
.ff-cam summary{font-size:16px;font-weight:700;cursor:pointer;}
.ff-cam-l{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #eee;font-size:16px;}
.ff-mini{font-family:inherit;font-size:14px;font-weight:700;color:#fff;background:#4a3b31;border:none;border-radius:10px;padding:10px 16px;cursor:pointer;}
@media(max-width:900px){
  #facil-nav{padding:10px 14px;}
  .fn-btn{font-size:15px;padding:12px 14px;}
  .fn-badge{font-size:12px;padding:2px 7px;margin-left:5px;}
  .fn-links{margin-left:0;width:100%;}
  .ff-grid{grid-template-columns:1fr;}
  body.modo-facil #btn-pausar-loja{font-size:13px !important;padding:10px 14px !important;}
}
`;
  document.head.appendChild(st);
}

// ----- Barra de botões grandes (PEDIDOS / MESAS / CARDÁPIO) -----
function modoFacilNav() {
  let nav = document.getElementById('facil-nav');
  if (nav) return nav;
  nav = document.createElement('div');
  nav.id = 'facil-nav';
  nav.innerHTML = `
    <button class="fn-btn" data-p="pedidos" onclick="irPara('pedidos')">PEDIDOS <span class="fn-badge" id="fn-b-pedidos" style="display:none;"></span></button>
    <button class="fn-btn" data-p="comandas" onclick="irPara('comandas')">MESAS <span class="fn-badge" id="fn-b-comandas" style="display:none;"></span></button>
    <button class="fn-btn" data-p="cardapio" onclick="irPara('cardapio')">CARDÁPIO</button>
    <div class="fn-links">
      <button class="fn-link" onclick="irPara('mensalidade')">Mensalidade</button>
      <button class="fn-link" onclick="irPara('config')">Configurações</button>
      <button class="fn-link" onclick="modoFacilTrocar(false)">Modo Completo</button>
    </div>`;
  const topo = document.querySelector('.main .topbar');
  const banner = document.getElementById('trial-banner');
  (banner || topo).after(nav);
  return nav;
}

function modoFacilMarcarNav() {
  document.querySelectorAll('#facil-nav .fn-btn').forEach(b => b.classList.toggle('on', b.dataset.p === paginaAtual));
}

function modoFacilBotaoNoMenu() {
  const rodape = document.querySelector('.sidebar-footer');
  if (!rodape) return;
  let b = document.getElementById('btn-modo-facil');
  const mostrar = modoFacilDisponivel() && !modoFacilAtivo();
  if (!mostrar) { if (b) b.style.display = 'none'; return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'btn-modo-facil';
    b.textContent = '⚡ Mudar para o Modo Fácil';
    b.onclick = () => modoFacilTrocar(true);
    b.style.cssText = 'display:block;width:100%;margin-bottom:8px;padding:10px;border:none;border-radius:8px;background:#E8643A;color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;';
    rodape.prepend(b);
  }
  b.style.display = 'block';
}

// ----- Liga/desliga o modo -----
var facilTimerBadges = null, facilWake = null;

function modoFacilAplicar() {
  const ligado = modoFacilAtivo();
  modoFacilCss();
  document.body.classList.toggle('modo-facil', ligado);
  const nav = ligado ? modoFacilNav() : document.getElementById('facil-nav');
  if (nav) nav.style.display = ligado ? '' : 'none';
  modoFacilBotaoNoMenu();
  if (ligado) {
    modoFacilMarcarNav();
    if (!facilTimerBadges) facilTimerBadges = setInterval(modoFacilBadges, 3000);
    modoFacilBadges();
    modoFacilWakeLock();
  } else {
    if (facilTimerBadges) { clearInterval(facilTimerBadges); facilTimerBadges = null; }
    if (facilWake) { try { facilWake.release(); } catch (e) {} facilWake = null; }
  }
}

function modoFacilIniciar() {
  try { modoFacilAplicar(); } catch (e) { console.error('modoFacilIniciar', e); }
}

// Os números vermelhos vêm dos que o sistema já calcula nos menus de sempre
function modoFacilBadges() {
  if (!modoFacilAtivo()) return;
  [['badge-pedidos-novos', 'fn-b-pedidos'], ['badge-comandas-pendentes', 'fn-b-comandas']].forEach(([de, para]) => {
    const o = document.getElementById(de), d = document.getElementById(para);
    if (!o || !d) return;
    const n = parseInt(o.textContent) || 0;
    d.textContent = n; d.style.display = (o.style.display !== 'none' && n > 0) ? 'inline-block' : 'none';
  });
}

// A tela não apaga enquanto o Modo Fácil está aberto (celular/tablet)
async function modoFacilWakeLock() {
  try {
    if (!modoFacilAtivo() || !navigator.wakeLock || document.visibilityState !== 'visible' || facilWake) return;
    facilWake = await navigator.wakeLock.request('screen');
    facilWake.addEventListener('release', () => { facilWake = null; });
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') modoFacilWakeLock(); });

// Depois de qualquer troca de página, marca o botão certo
if (typeof irPara === 'function' && !window.__irParaFacil) {
  window.__irParaFacil = true;
  const irParaOriginal = irPara;
  irPara = function (pagina) {
    irParaOriginal(pagina);
    try { if (modoFacilAtivo()) modoFacilMarcarNav(); } catch (e) {}
  };
}

// ----- Tela de pedidos do Modo Fácil -----
function facilSomBloqueado() {
  return !audioCtxAlerta || audioCtxAlerta.state !== 'running';
}
function facilLigarSom() {
  try {
    if (!audioCtxAlerta) audioCtxAlerta = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxAlerta.resume().catch(() => {});
    tocarSom((restauranteAtual && restauranteAtual.som_notificacao) || 'campainha');
  } catch (e) {}
  setTimeout(() => { if (paginaAtual === 'pedidos') facilRedesenhar(); }, 400);
}

function facilCard(p) {
  const ret = ehRetirada(p);
  const ag = textoAgendamento(p);
  const pag = pnPagamento(p);
  const tp = pnTempo(p);
  const obsGeral = (((p.observacao || '').match(/Obs:\s*([^\n]+)/) || [])[1] || '').trim();
  const tel = String(extrairTelefone(p) || '');
  let fone = tel.replace(/\D/g, '');
  if (fone && fone.length <= 11) fone = '55' + fone;
  const itens = (p.pedido_itens || []).map(i =>
    `<div>${parseInt(i.quantidade) || 1}x ${esc(i.nome)}</div>${i.observacao ? `<small>${esc(i.observacao)}</small>` : ''}`).join('');
  const novo = p.status === 'novo';
  const botao = novo
    ? `<button class="ff-btn vermelho" onclick="facilAceitar('${p.id}',this)">${imprimirAutoPara(false) ? '✔ ACEITAR E IMPRIMIR' : '✔ ACEITAR PEDIDO'}</button>`
    : `<button class="ff-btn verde" onclick="facilSaiu('${p.id}',this)">${ret ? '✔ PRONTO PARA RETIRAR' : '🛵 SAIU PARA ENTREGA'}</button>`;
  return `
    <div class="ff-card ${novo ? 'novo' : 'prep'}">
      <div class="ff-l1"><span>#${p.id.slice(-4).toUpperCase()} · ${esc(pnNome(p))}</span><span>${pnReais(p.total)}</span></div>
      <div class="ff-l1"><small>${tp ? esc(tp.txt) : ''}</small></div>
      <div class="ff-tags">
        <span class="ff-tag${ret ? ' ret' : ''}">${ret ? 'RETIRADA' : 'ENTREGA'}</span>
        ${ag ? `<span class="ff-tag ag">AGENDADO PARA ${esc(ag)}</span>` : ''}
      </div>
      <div class="ff-it">${itens}</div>
      ${obsGeral ? `<div class="ff-obs"><b>Observação:</b> ${esc(obsGeral)}</div>` : ''}
      ${!ret ? `<div class="ff-end">📍 ${esc([p.endereco, p.bairro].filter(x => x && String(x).trim()).join(' — ') || 'Endereço não informado')}</div>` : ''}
      ${pag ? `<div class="ff-pag ${pag.cls}">${esc(pag.txt)}</div>` : ''}
      ${botao}
      <div class="ff-peq">
        <button class="ff-lnk" onclick="imprimirComandaPorId('${p.id}')">Imprimir de novo</button>
        ${fone ? `<button class="ff-lnk" onclick="window.open('https://wa.me/${fone}','wa_servidelivery')">Chamar no WhatsApp</button>` : ''}
        ${novo ? `<button class="ff-lnk perigo" onclick="pnRecusar('${p.id}')">Recusar</button>` : ''}
      </div>
    </div>`;
}

function renderPedidosFacil(lista) {
  pnInjetarCss();
  modoFacilCss();
  const novos = lista.filter(p => p.status === 'novo');
  const prep = lista.filter(p => p.status === 'preparando');
  const cam = lista.filter(p => p.status === 'entrega');
  const vazio = !novos.length && !prep.length;
  const colunaNovos = `<div><div class="ff-tit">🔔 NOVOS${novos.length ? ' (' + novos.length + ')' : ''}</div>
      ${novos.length ? novos.map(facilCard).join('') : '<div class="ff-vazio">Nenhum pedido novo.<br>Quando chegar, toca um som e aparece aqui.</div>'}</div>`;
  const colunaPrep = `<div><div class="ff-tit">👨‍🍳 PREPARANDO${prep.length ? ' (' + prep.length + ')' : ''}</div>
      ${prep.length ? prep.map(facilCard).join('') : '<div class="ff-vazio">Nenhum pedido em preparo.</div>'}</div>`;
  document.getElementById('conteudo').innerHTML = `
    ${facilSomBloqueado() ? '<div class="ff-som" onclick="facilLigarSom()">🔔 TOQUE AQUI PARA LIGAR O SOM DOS PEDIDOS</div>' : ''}
    ${pnFaixaAgendados(lista)}
    ${vazio ? '<div class="ff-tudo">☕ Tudo tranquilo por aqui.<br><span style="font-size:16px;font-weight:500;">Quando chegar um pedido novo, vai tocar um som.</span></div>' : `<div class="ff-grid">${colunaNovos}${colunaPrep}</div>`}
    ${cam.length ? `<details class="ff-cam"><summary>🛵 A caminho ou esperando retirada (${cam.length})</summary>
      ${cam.map(p => `<div class="ff-cam-l"><span>#${p.id.slice(-4).toUpperCase()} · ${esc(pnNome(p))} · ${ehRetirada(p) ? 'Retirada' : 'Entrega'}</span><button class="ff-mini" onclick="facilEntregue('${p.id}',this)">JÁ ENTREGUEI</button></div>`).join('')}
    </details>` : ''}`;
}

function facilRedesenhar() {
  if (paginaAtual === 'pedidos' && modoFacilAtivo()) renderPedidosFacil(pedidosCache || []);
}

async function facilAceitar(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Aceitando...'; }
  const agora = new Date().toISOString();
  const { data: ok, error } = await db.from('pedidos')
    .update({ status: 'preparando', aceito_em: agora })
    .eq('id', id).eq('status', 'novo').select('id');
  if (error) { toast('Não deu certo. Toque de novo.', 'erro'); renderPedidos(); return; }
  if (!ok || !ok.length) { toast('Esse pedido já foi aceito.', 'ok'); renderPedidos(); return; }
  const p = (pedidosCache || []).find(x => x.id === id);
  if (p) { p.status = 'preparando'; p.aceito_em = agora; }
  try { if (ultimosPedidosIds && ultimosPedidosIds.delete) ultimosPedidosIds.delete(id); } catch (e) {}
  if (p && imprimirAutoPara(false)) imprimirComanda(p);
  toast('✅ Pedido aceito!', 'ok');
  facilRedesenhar();
}

async function facilSaiu(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Um momento...'; }
  const agora = new Date().toISOString();
  const { error } = await db.from('pedidos').update({ status: 'entrega', saiu_entrega_em: agora }).eq('id', id).eq('status', 'preparando');
  if (error) { toast('Não deu certo. Toque de novo.', 'erro'); renderPedidos(); return; }
  const p = (pedidosCache || []).find(x => x.id === id);
  if (p) { p.status = 'entrega'; p.saiu_entrega_em = agora; }
  toast('✅ Pronto! O cliente já vê isso no acompanhamento.', 'ok');
  facilRedesenhar();
}

async function facilEntregue(id, btn) {
  if (btn) btn.disabled = true;
  await db.from('pedidos').update({ status: 'entregue' }).eq('id', id);
  const p = (pedidosCache || []).find(x => x.id === id);
  if (p) p.status = 'entregue';
  facilRedesenhar();
}
