// ===== CHAMAR GARÇOM =====
// 1) Cada mesa tem um QR do cardápio com o número dela dentro (?consulta=1&mesa=N). No topo do cardápio aparece o botão
//    "Chamar o garçom". O aviso vai para o servidor (/api/consultar-pontos, ação chamar_garcom) e fica na tabela chamados_garcom.
// 2) No painel (dono, gerente e garçom) a mesa que chamou pisca em verde neon, sem som: no mapa de mesas e numa faixa embaixo da tela.
//    Quando o garçom toca na mesa (ou na faixa), o chamado some.
// Por enquanto só na loja Demo (servidelivery-demo). Para liberar para todas: trocar chamadoLojaLiberada() por "return true".

function chamadoLojaLiberada(slug) {
  return slug === 'servidelivery-demo';
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
    #chamados-faixa { position: fixed; left: 10px; right: 10px; bottom: 10px; z-index: 950; display: flex; align-items: center; gap: 8px; background: #fff; border: 2px solid #39ff14; border-radius: 14px; padding: 7px 10px; max-width: 520px; margin: 0 auto; animation: chamadoPisca 1s ease-in-out infinite; }
    #chamados-faixa .ch-txt { flex-shrink: 0; font-size: 12px; font-weight: 800; color: #0a3d00; line-height: 1.15; }
    #chamados-faixa .ch-txt small { display: block; font-size: 10px; font-weight: 600; opacity: .8; }
    #chamados-faixa .ch-lista { display: flex; gap: 6px; overflow-x: auto; flex: 1; padding: 2px; }
    #chamados-faixa button { flex-shrink: 0; min-width: 40px; height: 40px; border-radius: 10px; border: 2px solid #39ff14; background: #eaffe3; color: #0a3d00; font-size: 17px; font-weight: 800; font-family: inherit; cursor: pointer; padding: 0 8px; }
  `;
  document.head.appendChild(st);
})();

// ---------- PAINEL: ler e mostrar os chamados ----------
var chamadosLista = [];
var chamadosTimer = null;

function chamadoLojaAtual() {
  return !!(restauranteAtual && chamadoLojaLiberada(restauranteAtual.slug));
}

function chamadosIniciar() {
  if (chamadosTimer) { clearInterval(chamadosTimer); chamadosTimer = null; }
  chamadosLista = [];
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
    chamadosLista = novas;
    if (antes !== novas.join(',')) chamadosDesenhar();
  } catch (e) { /* sem rede: tenta de novo no próximo ciclo */ }
}

function chamadosDesenhar() {
  let f = document.getElementById('chamados-faixa');
  if (!chamadosLista.length) { if (f) f.remove(); chamadosMarcarMapa(); return; }
  if (!f) { f = document.createElement('div'); f.id = 'chamados-faixa'; document.body.appendChild(f); }
  f.innerHTML = `<div class="ch-txt">🔔 Chamando<small>toque no número<br>quando atender</small></div>
    <div class="ch-lista">${chamadosLista.map(n => `<button type="button" onclick="chamadoAtender(${n})" aria-label="Atender mesa ${n}">${n}</button>`).join('')}</div>`;
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

// Mesas juntas ("2/3"): tocar na mesa atende todas do grupo
function chamadoAtenderVarias(nums) {
  (nums || []).forEach(n => chamadoAtender(n));
}

// ---------- CLIENTE: botão no topo do cardápio ----------
function chamarGarcomMontar(rest, mesa) {
  if (!rest || !chamadoLojaLiberada(rest.slug)) return;
  mesa = parseInt(mesa);
  if (!mesa || mesa < 1 || mesa > 99) return;
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
  const qtd = Math.min(parseInt(restauranteAtual.qtd_mesas) || 0, 99);
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
  const qtd = Math.min(parseInt(restauranteAtual.qtd_mesas) || 0, 99);
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
