// ===== CHAMAR GARÇOM =====
// 1) Cada mesa tem um QR do cardápio com o número dela dentro (?consulta=1&mesa=N). No topo do cardápio aparece o botão
//    "Chamar o garçom". O aviso vai para o servidor (/api/consultar-pontos, ação chamar_garcom) e fica na tabela chamados_garcom.
// 2) No painel (dono, gerente e garçom) a mesa que chamou pisca em verde neon: no mapa de mesas e numa faixa no topo da tela.
//    Quando o garçom toca na mesa (ou na faixa), o chamado some.
// 3) SOM (ding-dong) quando chega chamado novo (ver chamadoSomLiberado).
// Tudo liberado para todas as lojas.

function chamadoLojaLiberada(slug) {
  return true; // liberado para todas as lojas
}

// SOM ao chegar um chamado novo (ding-dong, 2 vezes + vibração no celular). Liberado para todas as lojas.
function chamadoSomLiberado() {
  return !!restauranteAtual;
}
function chamadoTocarSom() {
  try {
    if (!audioCtxAlerta) audioCtxAlerta = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtxAlerta;
    const tocar = () => {
      [0, 0.95].forEach(ini => {
        [[784, 0], [587, 0.4]].forEach(([freq, atraso]) => {
          const t0 = ctx.currentTime + ini + atraso;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(0.45, t0 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.85);
          osc.start(t0); osc.stop(t0 + 0.9);
        });
      });
    };
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (ctx.state === 'suspended') toast('🔇 Mesa chamando — toque na tela para ligar o som', 'erro');
        else tocar();
      }).catch(() => {});
    } else {
      tocar();
    }
  } catch (e) { /* sem som: a mesa continua piscando */ }
  try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch (e) {}
}

(function () {
  if (document.getElementById('chamado-css')) return;
  const st = document.createElement('style');
  st.id = 'chamado-css';
  st.textContent = `
    @keyframes chamadoPisca {
      0%, 100% { box-shadow: 0 0 0 3px #39ff14, 0 0 16px 4px rgba(57,255,20,.85); border-color: #39ff14 !important; }
      50%      { box-shadow: 0 0 0 0 rgba(57,255,20,0), 0 0 0 0 rgba(57,255,20,0); border-color: var(--creme-borda) !important; }
    }
    .mesa-chamando { animation: chamadoPisca 1s ease-in-out infinite; border-color: #39ff14 !important; }
    /* Faixa sempre no topo, pequena: nas telas do painel fica logo abaixo da barra de cima; ao montar pedido da mesa, no alto da tela */
    #chamados-faixa { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100% - 20px); z-index: 950; display: flex; align-items: center; gap: 6px; background: #fff; border: 2px solid #39ff14; border-radius: 12px; padding: 4px 8px; animation: chamadoPisca 1s ease-in-out infinite; }
    #chamados-faixa .ch-txt { flex-shrink: 0; font-size: 12px; font-weight: 800; color: #0a3d00; line-height: 1.15; }
    #chamados-faixa .ch-lista { display: flex; gap: 6px; overflow-x: auto; flex: 1; padding: 2px; }
    #chamados-faixa button { flex-shrink: 0; min-width: 32px; height: 32px; border-radius: 8px; border: 2px solid #39ff14; background: #eaffe3; color: #0a3d00; font-size: 15px; font-weight: 800; font-family: inherit; cursor: pointer; padding: 0 8px; }
  `;
  document.head.appendChild(st);
})();

// ---------- AVISO NO CELULAR BLOQUEADO (notificação) — só garçom, só loja Demo por enquanto ----------
// O garçom liga uma vez no menu "Aviso de mesa". Quando o cliente chama, o servidor manda uma notificação para o aparelho dele.
// (O servidor também confere a loja: ver PUSH_MESA_LOJAS em api/consultar-pontos.js.)
function avisoMesaLiberado() {
  return !!(restauranteAtual && meuPapel === 'garcom');
}
function avisoMesaSuportado() {
  return ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);
}
function avisoMesaLigado() {
  try { return !!restauranteAtual && avisoMesaSuportado() && Notification.permission === 'granted' && localStorage.getItem('aviso_mesa_' + restauranteAtual.id) === 'true'; } catch (e) { return false; }
}
function avisoMesaRotulo() {
  return '<span style="font-size:14px;width:15px;text-align:center;">🔔</span> ' + (avisoMesaLigado() ? 'Aviso de mesa: LIGADO ✓' : 'Ligar aviso de mesa (tela bloqueada)');
}
function avisoMesaMenu() {
  const antigo = document.getElementById('nav-aviso-mesa');
  if (!avisoMesaLiberado()) { if (antigo) antigo.remove(); return; }
  if (antigo) { antigo.innerHTML = avisoMesaRotulo(); return; }
  const cfg = document.querySelector('.sidebar-scroll .nav-item[onclick*="config"]');
  if (!cfg || !cfg.parentNode) return;
  const d = document.createElement('div');
  d.className = 'nav-item';
  d.id = 'nav-aviso-mesa';
  d.setAttribute('onclick', 'avisoMesaAlternar()');
  d.innerHTML = avisoMesaRotulo();
  cfg.parentNode.insertBefore(d, cfg.nextSibling);
}
async function avisoMesaAlternar() {
  if (!avisoMesaLiberado()) return;
  const chave = 'aviso_mesa_' + restauranteAtual.id;
  if (!avisoMesaSuportado()) { toast('Este celular não aceita esse tipo de aviso.', 'erro'); return; }
  const ehIphone = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const jaApp = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (ehIphone && !jaApp) { toast('No iPhone, primeiro toque em "Instalar app no celular", abra pelo ícone e ligue o aviso lá.', 'erro', 9000); return; }

  // Já ligado: desliga
  if (avisoMesaLigado()) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'remover', tipo: 'restaurante', endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    } catch (e) {}
    try { localStorage.removeItem(chave); } catch (e) {}
    toast('Aviso de mesa desligado.', 'ok');
    avisoMesaMenu();
    return;
  }

  const msgBloqueado = 'O celular está bloqueando os avisos deste site. Abra as configurações do navegador (ou do app), procure "Notificações" e escolha "Permitir". Depois toque aqui de novo.';
  if (Notification.permission === 'denied') { toast(msgBloqueado, 'erro', 9000); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast(perm === 'denied' ? msgBloqueado : 'Você não permitiu os avisos. Toque aqui de novo e escolha "Permitir".', 'erro', 9000); return; }
  try {
    const reg = await registrarServiceWorker();
    if (!reg) { toast('Não consegui preparar o aviso. Tente de novo.', 'erro'); return; }
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    const r = await fetch('/api/push-subscription', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'salvar', tipo: 'restaurante', restauranteId: restauranteAtual.id, subscription: sub, somenteGarcom: true })
    });
    if (!r.ok) { toast('Não consegui ligar o aviso. Tente de novo.', 'erro'); return; }
    try { localStorage.setItem(chave, 'true'); } catch (e) {}
    toast('Pronto! Quando uma mesa chamar, o celular avisa mesmo bloqueado. 🔔', 'ok', 6000);
    avisoMesaMenu();
  } catch (e) {
    toast('Não consegui ligar o aviso. Tente de novo.', 'erro');
  }
}

// ---------- PAINEL: ler e mostrar os chamados ----------
var chamadosLista = [];
var chamadosTimer = null;

function chamadoLojaAtual() {
  return !!(restauranteAtual && chamadoLojaLiberada(restauranteAtual.slug));
}

function chamadosIniciar() {
  if (chamadosTimer) { clearInterval(chamadosTimer); chamadosTimer = null; }
  chamadosLista = [];
  try { avisoMesaMenu(); } catch (e) {}
  chamadosDesenhar();
  if (!chamadoLojaAtual()) return;
  chamadosBuscar();
  chamadosTimer = setInterval(chamadosBuscar, 6000);
}

async function chamadosBuscar() {
  if (!chamadoLojaAtual()) { chamadosIniciar(); return; }
  try {
    const { data, error } = await db.from('chamados_garcom').select('mesa,criado_em')
      .eq('restaurante_id', restauranteAtual.id).order('criado_em', { ascending: true });
    if (error) return;
    const novas = (data || []).map(x => x.mesa);
    const antes = chamadosLista.join(',');
    const chegouNova = novas.some(n => !chamadosLista.includes(n));
    chamadosLista = novas;
    if (chegouNova && chamadoSomLiberado()) chamadoTocarSom();
    if (antes !== novas.join(',')) chamadosDesenhar();
    chamadoPosicionar();
  } catch (e) { /* sem rede: tenta de novo no próximo ciclo */ }
}

// A faixa fica sempre no topo: logo abaixo da barra de cima do painel (ou no alto da tela, quando não há barra, como ao montar o pedido da mesa)
function chamadoPosicionar() {
  const f = document.getElementById('chamados-faixa');
  if (!f) return;
  let topo = 8;
  const t = document.querySelector('#tela-painel.ativa .topbar');
  if (t) { const r = t.getBoundingClientRect(); if (r.height > 0 && r.bottom > 0) topo = Math.round(r.bottom) + 6; }
  f.style.top = topo + 'px';
}

function chamadosDesenhar() {
  let f = document.getElementById('chamados-faixa');
  if (!chamadosLista.length) { if (f) f.remove(); chamadosMarcarMapa(); return; }
  if (!f) { f = document.createElement('div'); f.id = 'chamados-faixa'; document.body.appendChild(f); }
  f.innerHTML = `<div class="ch-txt">🔔 Mesa chamando</div>
    <div class="ch-lista">${chamadosLista.map(n => `<button type="button" onclick="chamadoAtender(${n})" aria-label="Atender mesa ${n}">${n}</button>`).join('')}</div>`;
  chamadoPosicionar();
  chamadosMarcarMapa();
}

// Pisca os quadradinhos do mapa de mesas (se a tela de Comandas estiver aberta)
function chamadosMarcarMapa() {
  document.querySelectorAll('#mapa-mesas-card button[data-mesas]').forEach(b => {
    const nums = String(b.getAttribute('data-mesas') || '').split(',').map(x => parseInt(x)).filter(x => x > 0);
    b.classList.toggle('mesa-chamando', nums.some(n => chamadosLista.includes(n)));
  });
}

// O garçom atendeu: tira o chamado da mesa
async function chamadoAtender(n) {
  n = parseInt(n);
  if (!n || !restauranteAtual) return;
  chamadosLista = chamadosLista.filter(x => x !== n);
  chamadosDesenhar();
  try {
    await db.from('chamados_garcom').delete().eq('restaurante_id', restauranteAtual.id).eq('mesa', n);
  } catch (e) { /* o próximo ciclo mostra de novo se não apagou */ }
}

// Aceitar, recusar ou mexer num pedido de uma mesa também conta como "atendi": o chamado dessa mesa some
async function chamadoAtenderDoPedido(pedidoId) {
  try {
    if (!chamadosLista.length || !restauranteAtual) return;
    const { data } = await db.from('pedidos').select('observacao,endereco').eq('id', pedidoId).maybeSingle();
    if (!data) return;
    const m = String((data.observacao || '') + ' ' + (data.endereco || '')).match(/Mesa\s+(\d+(?:\s*\/\s*\d+)*)/i);
    if (!m) return;
    m[1].split('/').map(x => parseInt(x)).filter(n => chamadosLista.includes(n)).forEach(n => chamadoAtender(n));
  } catch (e) { /* sem problema: o garçom ainda pode tocar no número */ }
}

// Mesas juntas ("2/3"): tocar na mesa atende todas do grupo
function chamadoAtenderVarias(nums) {
  (nums || []).forEach(n => chamadoAtender(n));
}

// ---------- CLIENTE: botão no topo do cardápio ----------
function chamarGarcomMontar(rest, mesa) {
  if (!rest || !chamadoLojaLiberada(rest.slug)) return;
  mesa = parseInt(mesa);
  if (!mesa || mesa < 1 || mesa > 200) return;
  const card = document.querySelector('#tela-cliente .pub-card');
  if (!card || document.getElementById('btn-chamar-garcom')) return;
  const chave = 'chamou_garcom_' + rest.id + '_' + mesa;
  const box = document.createElement('div');
  box.style.cssText = 'margin-bottom:14px;';
  box.innerHTML = `<button id="btn-chamar-garcom" type="button" style="width:100%;border:none;border-radius:12px;padding:14px;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit;background:var(--laranja);color:#fff;">
      🔔 Chamar o garçom<span style="display:block;font-size:12px;font-weight:600;opacity:.9;margin-top:2px;">Mesa ${mesa}</span></button>`;
  card.prepend(box);
  const btn = box.querySelector('button');

  function bloquear(ms) {
    btn.disabled = true;
    btn.style.background = '#2e9e4f';
    btn.style.cursor = 'default';
    btn.innerHTML = `✓ Garçom avisado!<span style="display:block;font-size:12px;font-weight:600;opacity:.9;margin-top:2px;">Já já ele chega na mesa ${mesa}</span>`;
    setTimeout(liberar, ms);
  }
  function liberar() {
    btn.disabled = false;
    btn.style.background = 'var(--laranja)';
    btn.style.cursor = 'pointer';
    btn.innerHTML = `🔔 Chamar o garçom<span style="display:block;font-size:12px;font-weight:600;opacity:.9;margin-top:2px;">Mesa ${mesa}</span>`;
  }
  // Se já chamou há pouco (recarregou a página), continua bloqueado até completar 2 minutos
  try {
    const t = parseInt(localStorage.getItem(chave));
    if (t && Date.now() - t < 120000) bloquear(120000 - (Date.now() - t));
  } catch (e) {}

  btn.onclick = async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.style.opacity = '.7';
    try {
      const r = await fetch('/api/consultar-pontos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'chamar_garcom', restauranteId: rest.id, mesa })
      });
      const d = await r.json().catch(() => ({}));
      btn.style.opacity = '1';
      if (!r.ok) {
        toast(d.error || 'Não consegui avisar o garçom. Tente de novo.', 'erro');
        liberar();
        return;
      }
      try { localStorage.setItem(chave, String(Date.now())); } catch (e) {}
      bloquear(120000);
    } catch (e) {
      btn.style.opacity = '1';
      toast('Sem internet agora. Tente de novo.', 'erro');
      liberar();
    }
  };
}

// ---------- CONFIGURAÇÕES: imprimir um QR para cada mesa ----------
function chamadoConfigInserir() {
  if (!restauranteAtual || !chamadoLojaLiberada(restauranteAtual.slug)) return;
  const alvo = document.getElementById('mesa-qr-unico');
  if (!alvo || document.getElementById('chamado-qr-bloco')) return;
  const qtd = Math.min(parseInt(restauranteAtual.qtd_mesas) || 0, limiteMesas());
  const bloco = document.createElement('div');
  bloco.id = 'chamado-qr-bloco';
  bloco.style.cssText = 'margin-top:20px;padding-top:16px;border-top:1px solid var(--creme-borda);';
  bloco.innerHTML = `
    <div style="font-size:15px;font-weight:600;margin-bottom:6px;">🔔 QR Code de cada mesa (cardápio + chamar garçom)</div>
    <div style="font-size:13px;color:var(--texto-muted);margin-bottom:14px;line-height:1.5;">
      Um QR para cada mesa, com o número dela. O cliente vê o cardápio e toca em "Chamar o garçom" — a mesa pisca em verde no seu painel.
      ${qtd > 0 ? `Sua loja tem <b>${qtd} mesas</b>.` : 'Primeiro digite a quantidade de mesas lá em cima (Mapa de mesas) e salve.'}
    </div>
    ${qtd > 0 ? `<button class="btn-sm" onclick="chamadoImprimirQrMesas()">🖨️ Imprimir QR das ${qtd} mesas</button>` : ''}`;
  alvo.parentElement.insertAdjacentElement('afterend', bloco);
}

async function chamadoImprimirQrMesas() {
  const qtd = Math.min(parseInt(restauranteAtual.qtd_mesas) || 0, limiteMesas());
  if (!qtd) { toast('Digite a quantidade de mesas e salve primeiro.', 'erro'); return; }
  const base = `https://servidelivery.com.br/${restauranteAtual.slug}?consulta=1&mesa=`;
  let html = '';
  for (let n = 1; n <= qtd; n++) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(base + n)}`;
    html += `
      <div style="display:inline-block;text-align:center;border:1px dashed #999;border-radius:8px;padding:12px;margin:8px;width:220px;page-break-inside:avoid;vertical-align:top;">
        <div style="font-size:22px;font-weight:800;font-family:Arial,sans-serif;color:#000;margin-bottom:6px;">Mesa ${n}</div>
        <img class="qr-mesa-img" src="${qrUrl}" width="180" height="180">
        <div style="margin-top:8px;font-size:13px;font-weight:700;font-family:Arial,sans-serif;color:#000;line-height:1.3;">Veja o cardápio aqui<br>ou chame o garçom.</div>
      </div>`;
  }
  const alvo = document.getElementById('print-cardapio');
  alvo.innerHTML = `<div style="text-align:center;">${html}</div>`;
  const comandaPrint = document.getElementById('comanda-print');
  if (comandaPrint) comandaPrint.innerHTML = '';
  toast('Preparando os QR das mesas...', 'ok');
  const imgs = [...alvo.querySelectorAll('img')];
  await Promise.race([
    Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = r; i.onerror = r; }))),
    new Promise(r => setTimeout(r, 12000))
  ]);
  window.print();
}
