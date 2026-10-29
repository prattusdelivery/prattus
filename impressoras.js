// ===== IMPRESSÃO SEPARADA: COZINHA (comida) e CAIXA (bebida) =====
// Usa o QZ Tray (programa gratuito instalado no computador) pra mandar cada papel pra uma
// impressora diferente, sem janelinha. A tela de Configurações oferece um botão que baixa o
// link do site oficial do QZ Tray e se liga sozinha quando o QZ Tray ficar pronto. Só vale para comandas (mesas), só neste aparelho.
// Liberado só na loja Demo e no Quiosque da Praça por enquanto (localStorage 'impressao_separada' = 'true'/'false' força).
// Se qualquer coisa falhar, o painel imprime do jeito de sempre (nada se perde).

var QZ_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';

function usarImpressaoSeparada() {
  try {
    const v = localStorage.getItem('impressao_separada');
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch (e) {}
  return !!(restauranteAtual && (restauranteAtual.slug === 'servidelivery-demo' || restauranteAtual.slug === 'quiosquedapraca'));
}

function impLer(chave, padrao) {
  try { const v = localStorage.getItem(chave + '_' + restauranteAtual.id); return v === null ? padrao : v; } catch (e) { return padrao; }
}
function impGravar(chave, valor) {
  try { localStorage.setItem(chave + '_' + restauranteAtual.id, valor); } catch (e) {}
}

// Ligado + as duas impressoras escolhidas
function impressaoSeparadaAtiva() {
  if (!usarImpressaoSeparada()) return false;
  return impLer('imp_separar_ativo', 'false') === 'true' && !!impLer('imp_cozinha', '') && !!impLer('imp_bebida', '');
}

// Categorias que são bebida (guardado neste aparelho). Na 1ª vez marca sozinho pelo nome.
var IMP_REGEX_BEBIDA = /bebida|suco|refri|cerveja|chope|chopp|drink|drinque|caipir|vinho|[aá]gua|coquetel|energ[eé]tico|whisky|vodka|gin\b|licor|cafe|caf[eé]|ch[aá]\b|milk ?shake|smoothie|limonada|batida/i;
function impCategoriasBebida(cats) {
  let salvo = null;
  try { salvo = JSON.parse(impLer('imp_cats_bebida', 'null')); } catch (e) {}
  if (Array.isArray(salvo)) return new Set(salvo);
  const auto = (cats || []).filter(c => IMP_REGEX_BEBIDA.test(c.nome || '')).map(c => c.id);
  return new Set(auto);
}

// ---------- QZ Tray ----------
var qzPromessaScript = null;
function carregarQz() {
  if (window.qz) return Promise.resolve();
  if (qzPromessaScript) return qzPromessaScript;
  qzPromessaScript = new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = QZ_SCRIPT_URL;
    sc.onload = () => resolve();
    sc.onerror = () => { qzPromessaScript = null; reject(new Error('qz-script')); };
    document.head.appendChild(sc);
  });
  return qzPromessaScript;
}

var qzSegurancaPronta = false;
async function conectarQz() {
  await carregarQz();
  if (!qzSegurancaPronta) {
    qz.security.setCertificatePromise((resolve, reject) => {
      fetch('/qz-cert.txt', { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject(new Error('cert'))).then(resolve, reject);
    });
    qz.security.setSignatureAlgorithm('SHA512');
    qz.security.setSignaturePromise(toSign => (resolve, reject) => {
      (async () => {
        const { data } = await db.auth.getSession();
        const token = data && data.session && data.session.access_token;
        if (!token) throw new Error('sem-login');
        const r = await fetch('/api/verificar-duplicado', {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ qz_request: toSign })
        });
        if (!r.ok) throw new Error('assinar-' + r.status);
        return r.text();
      })().then(resolve, reject);
    });
    qzSegurancaPronta = true;
  }
  if (qz.websocket.isActive()) return;
  await Promise.race([
    qz.websocket.connect({ retries: 1, delay: 1 }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('qz-demorou')), 8000))
  ]);
}

async function imprimirHtmlQz(nomeImpressora, html) {
  const cfg = qz.configs.create(nomeImpressora, { margins: 0, rasterize: true });
  await qz.print(cfg, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
}

// ---------- O papel (simples: mesa grande, itens, observações) ----------
function impPapelHtml(p, titulo, linhas, mesa) {
  const tam = { normal: 15, grande: 19, extra: 24, gigante: 30 }[impLer('imprimir_tam', 'normal')] || 15;
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hora = dataDoBanco(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const obsGeral = ((p.observacao || '').match(/Obs:\s*([^\n]+)/) || [])[1] || '';
  return `<html><body style="margin:0;padding:4px 6px;font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#000;">
    ${mesa ? `<div style="font-size:${tam + 13}px;text-align:center;">MESA ${e(mesa)}</div>` : ''}
    <div style="font-size:${tam + 3}px;text-align:center;border:2px solid #000;margin:4px 0;padding:2px;">${e(titulo)}</div>
    <div style="font-size:${tam - 3}px;text-align:center;">Pedido #${p.id.slice(-4).toUpperCase()} · ${e(hora)}</div>
    <hr style="border:0;border-top:2px dashed #000;margin:6px 0;">
    ${linhas.map(l => `<div style="font-size:${tam}px;margin:3px 0;">${parseInt(l.quantidade) || 1}x ${e(l.nome)}</div>${l.observacao ? `<div style="font-size:${tam - 2}px;margin:0 0 3px 12px;">Obs: ${e(l.observacao)}</div>` : ''}`).join('')}
    ${obsGeral ? `<hr style="border:0;border-top:2px dashed #000;margin:6px 0;"><div style="font-size:${tam - 2}px;">Obs do pedido: ${e(obsGeral)}</div>` : ''}
    <div style="height:24px;"></div>
  </body></html>`;
}

// ---------- Imprimir um pedido de comanda dividido ----------
async function imprimirSeparado(p) {
  const impCozinha = impLer('imp_cozinha', ''), impBebida = impLer('imp_bebida', '');
  await conectarQz();

  const { data: linhas, error } = await db.from('pedido_itens').select('item_id,nome,quantidade,observacao').eq('pedido_id', p.id);
  if (error || !linhas || !linhas.length) throw new Error('sem-itens');
  const ids = [...new Set(linhas.map(l => l.item_id).filter(Boolean))];
  const catDoItem = {};
  if (ids.length) {
    const { data: its } = await db.from('itens').select('id,categoria_id').in('id', ids);
    (its || []).forEach(i => { catDoItem[i.id] = i.categoria_id; });
  }
  const { data: cats } = await db.from('categorias').select('id,nome').eq('restaurante_id', restauranteAtual.id);
  const bebidas = impCategoriasBebida(cats);

  const comida = [], bebida = [];
  linhas.forEach(l => (l.item_id && bebidas.has(catDoItem[l.item_id]) ? bebida : comida).push(l));

  const obs = p.observacao || '';
  const mesa = (obs.match(/Mesa\s+(\S+)/) || [])[1] || (String(p.endereco || '').match(/Mesa\s+(\S+)/) || [])[1] || '';

  const tarefas = [];
  if (comida.length) tarefas.push(imprimirHtmlQz(impCozinha, impPapelHtml(p, 'COZINHA', comida, mesa)));
  if (bebida.length) tarefas.push(imprimirHtmlQz(impBebida, impPapelHtml(p, 'BEBIDAS', bebida, mesa)));
  await Promise.all(tarefas);
}

// ---------- Tela em Configurações ----------
function impBlocoConfig() {
  if (!usarImpressaoSeparada()) return '';
  setTimeout(impIniciarTela, 300);
  const cozinha = impLer('imp_cozinha', ''), bebida = impLer('imp_bebida', '');
  const esc2 = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const opc = nome => nome ? `<option value="${esc2(nome)}" selected>${esc2(nome)}</option>` : '<option value="">— procure as impressoras primeiro —</option>';
  return `
  <div class="form-group" style="background:var(--creme);border-radius:10px;padding:14px;margin-top:10px;">
    <label style="font-weight:700;">🍽️🍹 Imprimir comida na cozinha e bebida no caixa</label>
    <div style="font-size:12px;color:var(--texto-muted);margin:2px 0 10px;line-height:1.5;">Para comandas (mesas). O garçom faz um pedido só e cada impressora imprime a sua parte. Vale só neste computador.</div>
    <div id="imp-status" style="font-size:13px;font-weight:600;margin-bottom:10px;">Verificando este computador...</div>

    <div id="imp-instalar" style="display:none;">
      <a class="btn-sm" href="https://qz.io/download/" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;font-size:15px;font-weight:700;padding:12px 18px;background:var(--laranja);color:#fff;border-radius:10px;">⬇️ Baixar o QZ Tray (programa de impressão)</a>
      <ol style="font-size:13px;line-height:1.7;margin:12px 0 0;padding-left:20px;">
        <li>Clique no botão acima. Abre o site oficial do programa.</li>
        <li>Baixe a versão do <b>Windows</b> (arquivo terminado em <b>.exe</b>) e abra o arquivo baixado.</li>
        <li>Clique em <b>Next</b> (Próximo) até terminar a instalação. O QZ Tray abre sozinho e fica um ícone perto do relógio.</li>
        <li>Volte para esta tela. Ela se liga sozinha, não precisa fazer mais nada.</li>
      </ol>
      <div style="font-size:12px;color:var(--texto-muted);margin-top:8px;">Na primeira vez, o QZ Tray mostra uma janelinha pedindo permissão para o ServiDelivery. Marque <b>Lembrar</b> (Remember) e clique em <b>Permitir</b> (Allow).</div>
    </div>

    <div id="imp-impressoras" style="display:none;">
    <div style="margin-top:4px;">
      <div style="font-weight:600;font-size:13px;">🍽️ Impressora da cozinha (comida)</div>
      <div style="display:flex;gap:8px;margin-top:4px;"><select id="imp-sel-cozinha" style="flex:1;" onchange="impGravar('imp_cozinha', this.value); toast('Impressora da cozinha salva.', 'ok');">${opc(cozinha)}</select><button class="btn-sm" onclick="impTeste('cozinha')">Testar</button></div>
    </div>
    <div style="margin-top:12px;">
      <div style="font-weight:600;font-size:13px;">🍹 Impressora da bebida (caixa)</div>
      <div style="display:flex;gap:8px;margin-top:4px;"><select id="imp-sel-bebida" style="flex:1;" onchange="impGravar('imp_bebida', this.value); toast('Impressora da bebida salva.', 'ok');">${opc(bebida)}</select><button class="btn-sm" onclick="impTeste('bebida')">Testar</button></div>
    </div>
    <div style="margin-top:14px;">
      <div style="font-weight:600;font-size:13px;">Quais categorias são bebida?</div>
      <div style="font-size:12px;color:var(--texto-muted);margin:2px 0 6px;">Já deixei marcadas as que têm nome de bebida. Confira e ajuste se precisar.</div>
      <div id="imp-cats" style="font-size:13px;">Carregando...</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 0;margin-top:12px;border-top:1px solid var(--creme-borda);">
      <div><div style="font-weight:600;font-size:13px;">Separar comida e bebida ao imprimir</div><div style="font-size:12px;color:var(--texto-muted);margin-top:2px;">Desligado = imprime tudo junto, como sempre.</div></div>
      <label class="toggle-switch" style="flex-shrink:0;margin-left:14px;">
        <input type="checkbox" ${impLer('imp_separar_ativo', 'false') === 'true' ? 'checked' : ''} onchange="impGravar('imp_separar_ativo', this.checked ? 'true' : 'false'); toast(this.checked ? 'Impressão separada ligada neste aparelho.' : 'Impressão separada desligada neste aparelho.', 'ok');">
        <span class="toggle-slider"></span>
      </label>
    </div>
    </div>
  </div>`;
}

async function impIniciarTela() {
  impVerificar();
  const box = document.getElementById('imp-cats');
  if (!box) return;
  try {
    const { data: cats } = await db.from('categorias').select('id,nome').eq('restaurante_id', restauranteAtual.id).is('excluido_em', null).order('ordem');
    const marcadas = impCategoriasBebida(cats || []);
    if (!Array.isArray((() => { try { return JSON.parse(impLer('imp_cats_bebida', 'null')); } catch (e) { return null; } })())) {
      impGravar('imp_cats_bebida', JSON.stringify([...marcadas]));
    }
    box.innerHTML = (cats || []).length ? (cats || []).map(c => `
      <label style="display:flex;align-items:center;gap:10px;margin:0;padding:9px 0;font-size:14px;font-weight:500;color:var(--texto);cursor:pointer;border-top:1px solid var(--creme-borda);">
        <input type="checkbox" style="width:20px;height:20px;min-width:20px;padding:0;margin:0;flex:none;accent-color:var(--laranja);" ${marcadas.has(c.id) ? 'checked' : ''} onchange="impMarcarCategoria('${c.id}', this.checked)">
        <span style="flex:1;">${String(c.nome || '').replace(/</g, '&lt;')}</span>
      </label>`).join('') : 'Nenhuma categoria ainda.';
  } catch (e) { box.textContent = 'Não consegui carregar as categorias.'; }
}

function impMarcarCategoria(id, marcado) {
  let lista = [];
  try { lista = JSON.parse(impLer('imp_cats_bebida', '[]')) || []; } catch (e) {}
  lista = lista.filter(x => x !== id);
  if (marcado) lista.push(id);
  impGravar('imp_cats_bebida', JSON.stringify(lista));
}

var impVerificando = false, impTimer = null;

// Vê se o QZ Tray está funcionando neste computador. Se não estiver, mostra o botão de instalar
// e fica conferindo sozinho a cada 5 segundos até aparecer.
async function impVerificar() {
  const st = document.getElementById('imp-status');
  if (!st || impVerificando) return;
  impVerificando = true;
  try {
    // 1) a chave de segurança do site precisa estar configurada (feito uma vez só pelo dono do sistema)
    const { data } = await db.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (token) {
      const r = await fetch('/api/verificar-duplicado', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ qz_request: 'teste' }) });
      if (r.status === 500) {
        st.innerHTML = '⚠️ Falta uma configuração do sistema (chave de impressão). Avise o suporte do ServiDelivery.';
        document.getElementById('imp-instalar').style.display = 'none';
        document.getElementById('imp-impressoras').style.display = 'none';
        impVerificando = false;
        return;
      }
    }
    // 2) o QZ Tray precisa estar aberto neste computador
    await conectarQz();
    const lista = await qz.printers.find();
    clearInterval(impTimer); impTimer = null;
    st.innerHTML = '✅ Tudo certo neste computador. ' + lista.length + ' impressora(s) encontrada(s).';
    document.getElementById('imp-instalar').style.display = 'none';
    document.getElementById('imp-impressoras').style.display = 'block';
    ['cozinha', 'bebida'].forEach(qual => {
      const sel = document.getElementById('imp-sel-' + qual);
      if (!sel) return;
      const atual = impLer('imp_' + qual, '');
      sel.innerHTML = '<option value="">— escolha —</option>' + lista.map(n => `<option value="${String(n).replace(/"/g, '&quot;')}" ${n === atual ? 'selected' : ''}>${String(n).replace(/</g, '&lt;')}</option>`).join('');
    });
  } catch (e) {
    console.error('QZ', e);
    st.innerHTML = '🔎 Este computador ainda não está pronto para imprimir separado. Instale em 1 minuto:';
    const inst = document.getElementById('imp-instalar'), imps = document.getElementById('imp-impressoras');
    if (inst) inst.style.display = 'block';
    if (imps) imps.style.display = 'none';
    if (!impTimer) impTimer = setInterval(() => { if (!document.getElementById('imp-status')) { clearInterval(impTimer); impTimer = null; return; } impVerificar(); }, 5000);
  }
  impVerificando = false;
}

async function impTeste(qual) {
  const nome = impLer('imp_' + qual, '');
  if (!nome) { toast('Escolha a impressora primeiro.', 'erro'); return; }
  try {
    await conectarQz();
    const falso = { id: '0000TESTE', criado_em: new Date().toISOString(), observacao: '' };
    await imprimirHtmlQz(nome, impPapelHtml(falso, qual === 'cozinha' ? 'COZINHA' : 'BEBIDAS', [{ quantidade: 1, nome: 'Teste de impressão', observacao: '' }], 'TESTE'));
    toast('Teste enviado. Veja se saiu o papel.', 'ok');
  } catch (e) {
    console.error('QZ teste', e);
    toast('Não consegui imprimir o teste. Veja se o QZ Tray está aberto.', 'erro');
  }
}
