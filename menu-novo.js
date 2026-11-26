// ===== MENU ENXUTO (26/11/2026) =====
// Menu da esquerda com menos itens:
//   Pedidos · Comandas (só se ligadas) · Cardápio · Resultados · Mais ▾ · Ajuda
//   Resultados = Dashboard + Relatórios + Financeiro + Histórico + Avaliações (abas no topo da tela).
//   Mais (fechado) = Clientes, Cupons, Fretes, Equipe, Mensalidade, Configurações.
//   Ajuda = janelinha com Tutoriais e Falar com o suporte.
// Nada é apagado: as telas são as mesmas, só mudou onde ficam no menu. O painel abre direto em Pedidos.
// POR ENQUANTO SÓ NA DEMO (servidelivery-demo). Para liberar para todas: troque a linha "return" de menuNovoLiberado() por
// "return !!(restauranteAtual && restauranteAtual.plano_painel !== 'simples');" (e em app.html a linha de paginaInicialDoPapel já usa esta função).
// Usa: restauranteAtual, meuPapel, paginaAtual, irPara, fecharSidebar, abrirTutoriais, pedirAjudaAbrir, financeiroDisponivel.

var MN_PAGINAS_RESULTADOS = ['dashboard', 'relatorios', 'financeiro', 'historico', 'avaliacoes'];
var MN_PAGINAS_MAIS = ['clientes', 'cupons', 'fretes', 'equipe', 'mensalidade', 'config'];

function menuNovoLiberado() {
  return !!(typeof restauranteAtual !== 'undefined' && restauranteAtual && restauranteAtual.slug === 'servidelivery-demo' && restauranteAtual.plano_painel !== 'simples');
}

function mnCss() {
  if (document.getElementById('menu-novo-css')) return;
  var st = document.createElement('style');
  st.id = 'menu-novo-css';
  st.textContent =
    'body.menu-novo .sidebar-scroll .nav-section{display:none !important;}' +
    'body.menu-novo .mn-oculto{display:none !important;}' +
    '#nav-mais-lista{display:none;}#nav-mais-lista.aberto{display:block;}' +
    '#nav-mais-lista .nav-item{padding-left:34px;}' +
    '#nav-mais .mn-seta{margin-left:auto;font-size:11px;transition:transform .15s;}' +
    '#nav-mais.aberto .mn-seta{transform:rotate(180deg);}' +
    '#mn-abas{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px 0;}' +
    '#mn-abas .mn-aba{font-family:inherit;font-size:14px;font-weight:500;padding:9px 16px;min-height:40px;border-radius:20px;border:1px solid #D9CBBB;background:#fff;color:var(--texto,#2B1F14);cursor:pointer;}' +
    '#mn-abas .mn-aba.on{background:var(--texto,#2B1F14);color:#fff;border-color:var(--texto,#2B1F14);font-weight:600;}';
  document.head.appendChild(st);
}

function mnItemPor(pagina) {
  var itens = document.querySelectorAll('.sidebar-scroll .nav-item');
  for (var i = 0; i < itens.length; i++) {
    if ((itens[i].getAttribute('onclick') || '').indexOf("irPara('" + pagina + "')") >= 0) return itens[i];
  }
  return null;
}

var MN_ICONE = {
  resultados: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  ajuda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>'
};

function menuNovoMontar() {
  if (document.getElementById('nav-resultados')) return;
  var cardapio = mnItemPor('cardapio');
  if (!cardapio || !cardapio.parentNode) return;
  mnCss();
  document.body.classList.add('menu-novo');

  // 1) esconde o que foi para dentro de "Resultados" e "Ajuda"
  ['dashboard', 'avaliacoes', 'relatorios', 'financeiro', 'historico'].forEach(function (p) {
    var el = mnItemPor(p); if (el) el.classList.add('mn-oculto');
  });
  var itens = document.querySelectorAll('.sidebar-scroll .nav-item');
  for (var i = 0; i < itens.length; i++) {
    if ((itens[i].getAttribute('onclick') || '').indexOf('abrirTutoriais') >= 0) itens[i].classList.add('mn-oculto');
  }
  var pedir = document.getElementById('nav-pedir-ajuda');
  if (pedir) pedir.classList.add('mn-oculto');

  // 2) "Resultados"
  var res = document.createElement('div');
  res.className = 'nav-item nav-somente-dono';
  res.id = 'nav-resultados';
  res.setAttribute('onclick', "irPara('dashboard')");
  res.innerHTML = MN_ICONE.resultados + 'Resultados';

  // 3) "Mais" (fechado) com os itens de uso raro
  var mais = document.createElement('div');
  mais.className = 'nav-item';
  mais.id = 'nav-mais';
  mais.onclick = function () { menuNovoAlternarMais(); };
  mais.innerHTML = MN_ICONE.mais + 'Mais<span class="mn-seta">▾</span>';
  var lista = document.createElement('div');
  lista.id = 'nav-mais-lista';

  // 4) "Ajuda"
  var aj = document.createElement('div');
  aj.className = 'nav-item';
  aj.id = 'nav-ajuda';
  aj.onclick = function () { menuNovoAjuda(); };
  aj.innerHTML = MN_ICONE.ajuda + 'Ajuda';

  cardapio.parentNode.insertBefore(res, cardapio.nextSibling);
  res.parentNode.insertBefore(mais, res.nextSibling);
  mais.parentNode.insertBefore(lista, mais.nextSibling);
  lista.parentNode.insertBefore(aj, lista.nextSibling);

  // move (sem recriar) os itens para dentro do "Mais", na ordem combinada
  ['clientes', 'cupons', 'fretes', 'equipe', 'mensalidade', 'config'].forEach(function (p) {
    var el = mnItemPor(p); if (el) lista.appendChild(el);
  });
}

function menuNovoAlternarMais(forcar) {
  var lista = document.getElementById('nav-mais-lista'), bt = document.getElementById('nav-mais');
  if (!lista || !bt) return;
  var abrir = typeof forcar === 'boolean' ? forcar : !lista.classList.contains('aberto');
  lista.classList.toggle('aberto', abrir);
  bt.classList.toggle('aberto', abrir);
}

function menuNovoAjuda() {
  try { fecharSidebar(); } catch (e) {}
  if (document.getElementById('mn-ajuda-tela')) return;
  var d = document.createElement('div');
  d.id = 'mn-ajuda-tela';
  d.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(30,20,10,.6);display:flex;align-items:center;justify-content:center;padding:16px;';
  d.onclick = function (e) { if (e.target === d) menuNovoAjudaFechar(); };
  var bt = 'width:100%;padding:14px;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px;';
  d.innerHTML =
    '<div style="background:#fff;border-radius:16px;max-width:380px;width:100%;padding:22px 20px;box-shadow:0 20px 50px rgba(0,0,0,.35);font-family:inherit;">' +
      '<div style="font-size:19px;font-weight:700;color:#2B1F14;margin-bottom:14px;">Como podemos ajudar?</div>' +
      '<button type="button" onclick="menuNovoAjudaFechar();abrirTutoriais();" style="' + bt + 'border:1.5px solid var(--creme-borda,#e5d9cc);background:#fff;color:#2B1F14;">📚 Ver os tutoriais</button>' +
      '<button type="button" onclick="menuNovoAjudaFechar();pedirAjudaAbrir();" style="' + bt + 'border:none;background:#25D366;color:#fff;">💬 Falar com o suporte</button>' +
      '<div style="text-align:center;margin-top:4px;"><a href="#" onclick="event.preventDefault();menuNovoAjudaFechar();" style="font-size:13px;color:#8a7766;">Fechar</a></div>' +
    '</div>';
  document.body.appendChild(d);
}
function menuNovoAjudaFechar() {
  var d = document.getElementById('mn-ajuda-tela');
  if (d) d.remove();
}

// Abas no alto das telas que viraram "Resultados"
function menuNovoBarra() {
  var c = document.getElementById('conteudo');
  if (!c) return;
  var tem = document.getElementById('mn-abas');
  var naTela = typeof paginaAtual !== 'undefined' && MN_PAGINAS_RESULTADOS.indexOf(paginaAtual) >= 0 && meuPapel === 'dono';
  if (!naTela) { if (tem) tem.remove(); return; }
  var abas = [['dashboard', 'Resumo'], ['relatorios', 'Relatórios']];
  try { if (typeof financeiroDisponivel === 'function' && financeiroDisponivel()) abas.push(['financeiro', 'Financeiro']); } catch (e) {}
  abas.push(['historico', 'Histórico de pedidos'], ['avaliacoes', 'Avaliações']);
  var chave = abas.map(function (a) { return a[0]; }).join(',') + '|' + paginaAtual;
  if (tem && tem.dataset.chave === chave && tem === c.firstChild) return;
  if (tem) tem.remove();
  var b = document.createElement('div');
  b.id = 'mn-abas';
  b.dataset.chave = chave;
  abas.forEach(function (a) {
    var bt = document.createElement('button');
    bt.type = 'button';
    bt.className = 'mn-aba' + (a[0] === paginaAtual ? ' on' : '');
    bt.textContent = a[1];
    bt.onclick = function () { if (a[0] !== paginaAtual) irPara(a[0]); };
    b.appendChild(bt);
  });
  c.insertBefore(b, c.firstChild);
}

// Deixa aceso o item certo do menu e abre o "Mais" quando a tela atual está dentro dele
var mnUltimaPagina = null;
function menuNovoAcender() {
  if (typeof paginaAtual === 'undefined') return;
  var res = document.getElementById('nav-resultados');
  var emResultados = MN_PAGINAS_RESULTADOS.indexOf(paginaAtual) >= 0;
  if (res) res.classList.toggle('ativo', emResultados);
  if (mnUltimaPagina !== paginaAtual) {
    mnUltimaPagina = paginaAtual;
    if (MN_PAGINAS_MAIS.indexOf(paginaAtual) >= 0) menuNovoAlternarMais(true);
  }
  // se nenhum item visível está aceso (ex.: logo ao abrir o painel), acende o da tela atual
  var acesos = document.querySelectorAll('.sidebar-scroll .nav-item.ativo:not(.mn-oculto)');
  if (!acesos.length && !emResultados) {
    var el = mnItemPor(paginaAtual);
    if (el) el.classList.add('ativo');
  }
  // tira o "aceso" do que ficou escondido (Dashboard no começo)
  document.querySelectorAll('.sidebar-scroll .nav-item.ativo.mn-oculto').forEach(function (n) { n.classList.remove('ativo'); });
}

function menuNovoPapel() {
  var garcom = typeof meuPapel !== 'undefined' && meuPapel === 'garcom';
  var dono = typeof meuPapel !== 'undefined' && meuPapel === 'dono';
  ['nav-resultados', 'nav-mais', 'nav-ajuda'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('mn-oculto', garcom || (id === 'nav-resultados' && !dono)); // Resultados é só do dono
  });
}

(function menuNovoIniciar() {
  var obs = null;
  function ciclo() {
    try {
      if (!menuNovoLiberado()) return;
      menuNovoMontar();
      menuNovoPapel();
      menuNovoAcender();
      var c = document.getElementById('conteudo');
      if (c && !obs) {
        obs = new MutationObserver(function () { try { menuNovoBarra(); } catch (e) {} });
        obs.observe(c, { childList: true });
      }
      menuNovoBarra();
    } catch (e) {}
  }
  setInterval(ciclo, 700);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ciclo); else ciclo();
})();
