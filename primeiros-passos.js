// ===== PRIMEIROS PASSOS: quadro de ajuda para o dono que está começando =====
// Aparece em cima da tela inicial: Dashboard (Modo Completo) ou Pedidos (Modo Fácil). Só o dono vê.
// Lista diferente para o plano Simples (Fácil) e para o Completo. Cada passo ganha ✔ sozinho.
// Por enquanto só na loja Demo (localStorage 'primeiros_passos' = '1' liga / '0' desliga neste aparelho).
// Estado guardado em restaurantes.avisos_whatsapp.primeiros_passos = { estado: 'aberto'|'pulado', link: true } (sem SQL).
// Na Demo, o link "Ver como cliente novo" simula uma loja sem nada feito (só neste aparelho, não mexe no banco).

var psCache = { t: 0, f: null };

function psAtivo() {
  try {
    const v = localStorage.getItem('primeiros_passos');
    if (v === '1') return true;
    if (v === '0') return false;
  } catch (e) {}
  return !!(typeof restauranteAtual !== 'undefined' && restauranteAtual && restauranteAtual.slug === 'servidelivery-demo');
}
function psSimulando() { try { return sessionStorage.getItem('ps_sim') === '1'; } catch (e) { return false; } }

function psEstado() {
  if (psSimulando()) { try { return JSON.parse(sessionStorage.getItem('ps_sim_estado') || '{}'); } catch (e) { return {}; } }
  return (restauranteAtual.avisos_whatsapp && restauranteAtual.avisos_whatsapp.primeiros_passos) || {};
}
async function psSalvar(patch) {
  const novo = { ...psEstado(), ...patch };
  if (psSimulando()) { try { sessionStorage.setItem('ps_sim_estado', JSON.stringify(novo)); } catch (e) {} return; }
  const av = { ...(restauranteAtual.avisos_whatsapp || {}), primeiros_passos: novo };
  const { error } = await db.from('restaurantes').update({ avisos_whatsapp: av }).eq('id', restauranteAtual.id);
  if (!error) restauranteAtual = { ...restauranteAtual, avisos_whatsapp: av };
}

function psLinkLoja() { return 'https://www.servidelivery.com.br/' + restauranteAtual.slug; }

function psLista() {
  const completo = restauranteAtual.plano_painel !== 'simples';
  const p = [
    { id: 'cardapio', titulo: 'Montar o seu cardápio', dica: 'Troque os exemplos pelos seus pratos, com preço e foto.', botao: 'Abrir o Cardápio' },
    { id: 'horarios', titulo: 'Colocar o horário de funcionamento', dica: 'Os dias e horários em que você atende.', botao: 'Colocar o horário' },
    { id: 'fretes', titulo: 'Colocar o frete por bairro', dica: 'Quanto você cobra para entregar em cada bairro.', botao: 'Colocar o frete' }
  ];
  if (completo) {
    p.push({ id: 'mesas', titulo: 'Cadastrar as mesas', dica: 'Para quem atende no salão: diga quantas mesas você tem.', botao: 'Cadastrar as mesas' });
    p.push({ id: 'pagamento', titulo: 'Escolher como receber o pagamento', dica: 'Pix, cartão e maquininha: marque o que você aceita.', botao: 'Escolher o pagamento' });
  }
  p.push({ id: 'link', titulo: 'Copiar o link do seu cardápio', dica: 'Cole no Instagram e no WhatsApp para os clientes pedirem.', botao: 'Copiar o link' });
  p.push({ id: 'teste', titulo: 'Fazer um pedido de teste', dica: 'Peça pelo seu próprio cardápio e veja o pedido chegar aqui.', botao: 'Abrir o meu cardápio' });
  return p;
}

async function psCalcular(forcar) {
  if (!forcar && psCache.f && Date.now() - psCache.t < 20000 && psCache.sim === psSimulando()) return psCache.f;
  const r = restauranteAtual, rid = r.id, est = psEstado();
  let f;
  if (psSimulando()) {
    f = { cardapio: false, horarios: false, fretes: false, mesas: false, pagamento: false, link: !!est.link, teste: false };
  } else {
    const cnt = q => q.then(x => x.count || 0).catch(() => 0);
    const [itens, fretes, pedidos, codigos] = await Promise.all([
      cnt(db.from('itens').select('id', { count: 'exact', head: true }).eq('restaurante_id', rid).is('excluido_em', null).not('nome', 'ilike', 'Exemplo%')),
      cnt(db.from('fretes').select('id', { count: 'exact', head: true }).eq('restaurante_id', rid)),
      cnt(db.from('pedidos').select('id', { count: 'exact', head: true }).eq('restaurante_id', rid)),
      cnt(db.from('codigos_comanda').select('id', { count: 'exact', head: true }).eq('restaurante_id', rid))
    ]);
    const hs = r.horarios_semana;
    let hor = !!(hs && typeof hs === 'object' && Object.values(hs).some(h => h && h.ativo && h.abre && h.fecha));
    if (!hor && r.horario_abre && r.horario_fecha && (r.dias_funcionamento || []).length) hor = true;
    f = {
      cardapio: itens > 0, horarios: hor, fretes: fretes > 0,
      mesas: (parseInt(r.qtd_mesas) || 0) > 0 || codigos > 0,
      pagamento: !!est.pagamento || !!r.pix_online_ativo,
      link: !!est.link, teste: pedidos > 0
    };
  }
  psCache = { t: Date.now(), f, sim: psSimulando() };
  return f;
}

// Coloca o quadro em cima da tela (pagina = 'dashboard' ou 'pedidos')
async function psInserir(pagina) {
  try {
    if (!psAtivo() || !restauranteAtual || meuPapel !== 'dono') return;
    const facil = typeof modoFacilAtivo === 'function' && modoFacilAtivo();
    if ((pagina === 'pedidos') !== facil) return; // Fácil mostra em Pedidos; Completo mostra no Dashboard
    if (paginaAtual !== pagina) return;
    const c = document.getElementById('conteudo');
    if (!c) return;
    const html = await psHtml();
    if (paginaAtual !== pagina) return;
    const ant = document.getElementById('ps-box'); if (ant) ant.remove();
    if (!html) return;
    c.insertAdjacentHTML('afterbegin', '<div id="ps-box" style="margin-bottom:16px;">' + html + '</div>');
  } catch (e) { console.error('primeiros passos', e); }
}

async function psHtml() {
  const lista = psLista();
  const f = await psCalcular(false);
  const feitos = lista.filter(p => f[p.id]).length, total = lista.length;
  const est = psEstado();
  const tudo = feitos === total;
  const sim = psSimulando();
  const demoBar = `<div style="text-align:center;margin-top:8px;"><a href="#" onclick="psSimular(${sim ? 'false' : 'true'});return false;" style="font-size:12px;color:var(--texto-muted);text-decoration:underline;">${sim ? '⟵ Sair da simulação' : 'Ver como cliente novo (só na Demo)'}</a></div>`;
  const caixa = (conteudo) => `<div style="background:#FFF7F1;border:2px solid var(--laranja);border-radius:16px;padding:16px;">${conteudo}</div>`;
  const rodapeSim = (sim || tudo) ? demoBar : '';

  if (tudo) {
    return `<div style="background:#E1F5EE;border:2px solid #0F6E56;border-radius:16px;padding:14px 16px;font-size:15px;font-weight:700;color:#0F6E56;">🎉 Tudo pronto! Você já fez todos os passos para começar.</div>${rodapeSim}`;
  }
  if (est.estado === 'pulado') {
    return `<div onclick="psAbrir()" style="background:#FFF7F1;border:1.5px solid var(--laranja);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:14px;font-weight:700;">
      <span>🚀 Ajuda para começar · ${feitos} de ${total} feitos</span><span style="color:var(--laranja);">Ver ▾</span></div>${rodapeSim}`;
  }
  if (!est.estado) {
    return caixa(`
      <div style="font-size:18px;font-weight:800;margin-bottom:4px;">👋 Quer ajuda para começar?</div>
      <div style="font-size:14px;color:var(--texto-muted);margin-bottom:14px;">Eu te mostro, passo a passo, o que falta para o seu cardápio ficar pronto.</div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-laranja" style="flex:2;padding:14px;font-size:16px;" onclick="psAbrir()">Quero ajuda</button>
        <button class="btn btn-outline" style="flex:1;padding:14px;font-size:16px;" onclick="psPular()">Pular</button>
      </div>`) + rodapeSim;
  }
  const linhas = lista.map((p, i) => {
    const ok = f[p.id];
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #F0DCCB;">
      <span style="flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;${ok ? 'background:#0F6E56;color:#fff;' : 'background:#fff;border:2px solid var(--laranja);color:var(--laranja);'}">${ok ? '✔' : i + 1}</span>
      <span style="flex:1;min-width:0;"><span style="display:block;font-size:15px;font-weight:700;${ok ? 'text-decoration:line-through;color:var(--texto-muted);' : ''}">${p.titulo}</span>${ok ? '' : `<span style="display:block;font-size:12px;color:var(--texto-muted);">${p.dica}</span>`}</span>
      ${ok ? '' : `<button class="btn-sm" style="flex:none;padding:10px 12px;font-size:13px;font-weight:700;background:var(--laranja);color:#fff;border:none;" onclick="psIr('${p.id}')">${p.botao}</button>`}
    </div>`;
  }).join('');
  return caixa(`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
      <div><div style="font-size:18px;font-weight:800;">🚀 Vamos começar</div><div style="font-size:13px;color:var(--texto-muted);">${feitos} de ${total} passos feitos</div></div>
      <button type="button" onclick="psPular()" style="background:none;border:none;font-size:13px;color:var(--texto-muted);cursor:pointer;text-decoration:underline;">Esconder</button>
    </div>
    <div style="height:8px;background:#F0DCCB;border-radius:6px;margin:10px 0 4px;overflow:hidden;"><div style="height:100%;width:${Math.round(feitos / total * 100)}%;background:#0F6E56;border-radius:6px;"></div></div>
    ${linhas}`) + rodapeSim;
}

async function psAbrir() { await psSalvar({ estado: 'aberto' }); psAtualizar(); }
async function psPular() { await psSalvar({ estado: 'pulado' }); psAtualizar(); }
function psAtualizar() {
  psCache = { t: 0, f: null };
  psInserir(paginaAtual === 'pedidos' ? 'pedidos' : 'dashboard');
}
function psSimular(ligar) {
  try {
    if (ligar) { sessionStorage.setItem('ps_sim', '1'); sessionStorage.removeItem('ps_sim_estado'); }
    else { sessionStorage.removeItem('ps_sim'); sessionStorage.removeItem('ps_sim_estado'); }
  } catch (e) {}
  psAtualizar();
}

// Espera a tela de Configurações abrir e vai direto na aba certa
function psConfigAba(aba) {
  irPara('config');
  let n = 0;
  const t = setInterval(() => {
    n++;
    if (document.querySelector('.cfg-abas') && typeof cfgIrAba === 'function') {
      clearInterval(t);
      if (aba === 'mesas') { // acha sozinho a aba onde está "Quantas mesas você tem?"
        const sec = [...document.querySelectorAll('.cfg-secao')].find(s => (s.textContent || '').includes('Quantas mesas'));
        aba = sec ? sec.dataset.aba : 'impressao';
      }
      cfgIrAba(aba);
      const alvo = aba && [...document.querySelectorAll('.cfg-secao')].find(s => s.dataset.aba === aba);
      const el = alvo && ([...alvo.querySelectorAll('div')].find(d => d.children.length === 0 && (d.textContent || '').includes(aba === 'entrega' ? 'Horário de funcionamento' : '__nada__')));
      window.scrollTo({ top: 0 });
      if (el) el.scrollIntoView({ block: 'start' });
    }
    else if (n > 30) clearInterval(t);
  }, 150);
}

async function psIr(id) {
  if (id === 'cardapio') setTimeout(() => irPara('cardapio'), 0);
  else if (id === 'fretes') setTimeout(() => irPara('fretes'), 0);
  else if (id === 'horarios') setTimeout(() => psConfigAba('entrega'), 0);
  else if (id === 'mesas') setTimeout(() => psConfigAba('impressao'), 0);
  else if (id === 'pagamento') setTimeout(() => psConfigAba('pagamentos'), 0);
  else if (id === 'teste') window.open(psLinkLoja(), '_blank');
  else if (id === 'link') {
    try { await navigator.clipboard.writeText(psLinkLoja()); toast('Link copiado! Agora é só colar onde você quiser.', 'ok'); }
    catch (e) { prompt('Copie o link do seu cardápio:', psLinkLoja()); }
    await psSalvar({ link: true });
    psAtualizar();
  }
}

// O quadro reaparece em cima da tela toda vez que ela é desenhada
if (typeof renderDashboard === 'function' && !window.__psDash) {
  window.__psDash = true;
  const orig = renderDashboard;
  renderDashboard = async function () { const r = await orig.apply(this, arguments); psInserir('dashboard'); return r; };
}
// Quando o dono salva as formas de pagamento com sucesso, o passo ganha ✔
if (typeof salvarFormasPagamento === 'function' && !window.__psPag) {
  window.__psPag = true;
  const orig3 = salvarFormasPagamento;
  salvarFormasPagamento = async function () {
    const antes = restauranteAtual;
    const r = await orig3.apply(this, arguments);
    if (restauranteAtual !== antes && !psSimulando() && psAtivo() && !psEstado().pagamento) psSalvar({ pagamento: true });
    return r;
  };
}
if (typeof renderPedidosFacil === 'function' && !window.__psFacil) {
  window.__psFacil = true;
  const orig2 = renderPedidosFacil;
  renderPedidosFacil = function () { const r = orig2.apply(this, arguments); psInserir('pedidos'); return r; };
}
