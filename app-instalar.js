// ===== INSTALAR O PAINEL COMO APP NO CELULAR (atalho na tela inicial) =====
// Serve para o garçom (e o dono) abrirem o painel com um toque, em tela cheia, como um app.
// Não precisa de Play Store nem App Store: é o próprio site "instalado" pelo navegador.
// Usa: restauranteAtual, meuPapel, toast. Por enquanto só na loja Demo (appInstalarLiberado).

var appInstalarEvento = null; // guardado no Android (Chrome) para abrir o aviso nativo de instalar

function appInstalarLiberado() {
  return !!restauranteAtual && restauranteAtual.slug === 'servidelivery-demo';
}
function appInstalarEhCelular() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches && window.innerWidth < 900);
}
function appInstalarJaApp() {
  try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; } catch (e) { return false; }
}
function appInstalarEhIphone() { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ''); }

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  appInstalarEvento = e;
});
window.addEventListener('appinstalled', function () {
  appInstalarEvento = null;
  appInstalarFechar();
  var b = document.getElementById('app-instalar-faixa'); if (b) b.remove();
  var n = document.getElementById('nav-instalar-app'); if (n) n.remove();
});

function appInstalarCss() {
  if (document.getElementById('app-instalar-css')) return;
  var st = document.createElement('style');
  st.id = 'app-instalar-css';
  st.textContent =
    '#app-instalar-faixa{display:flex;align-items:center;gap:10px;margin:10px 12px 0;padding:11px 12px;border-radius:12px;background:#FFF3EC;border:1.5px solid var(--laranja,#E86339);}' +
    '#app-instalar-faixa .ai-txt{flex:1;min-width:0;font-size:14px;font-weight:700;line-height:1.25;color:var(--texto,#2b211c);}' +
    '#app-instalar-faixa .ai-txt span{display:block;font-size:12px;font-weight:400;color:var(--texto-muted,#7a6a60);margin-top:2px;}' +
    '#app-instalar-faixa button{font-family:inherit;border:0;cursor:pointer;border-radius:10px;}' +
    '#app-instalar-faixa .ai-sim{background:var(--laranja,#E86339);color:#fff;font-weight:700;font-size:14px;padding:11px 14px;white-space:nowrap;}' +
    '#app-instalar-faixa .ai-nao{background:transparent;color:var(--texto-muted,#7a6a60);font-size:20px;line-height:1;padding:6px 8px;}' +
    '#app-instalar-modal{position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px;}' +
    '#app-instalar-modal .ai-caixa{background:#fff;border-radius:16px;max-width:380px;width:100%;padding:20px 18px;color:#2b211c;max-height:90vh;overflow:auto;}' +
    '#app-instalar-modal h3{font-size:18px;margin:0 0 12px;}' +
    '#app-instalar-modal ol{margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.5;}' +
    '#app-instalar-modal li{margin-bottom:8px;}' +
    '#app-instalar-modal .ai-fechar{width:100%;font-family:inherit;border:0;cursor:pointer;border-radius:12px;background:var(--laranja,#E86339);color:#fff;font-weight:700;font-size:16px;padding:14px;}';
  document.head.appendChild(st);
}

// Chamado depois que a loja carrega
function appInstalarIniciar() {
  if (!appInstalarLiberado() || !appInstalarEhCelular() || appInstalarJaApp()) return;
  var dispensou = false;
  try { dispensou = localStorage.getItem('app_instalar_dispensado') === '1'; } catch (e) {}
  appInstalarCss();
  appInstalarMenu();
  if (!dispensou && meuPapel === 'garcom') appInstalarFaixa(); // a faixa é só do garçom; o dono usa o item do menu
}

// Item fixo no menu: "📲 Instalar app no celular"
function appInstalarMenu() {
  if (document.getElementById('nav-instalar-app')) return;
  var cfg = document.querySelector('.sidebar-scroll .nav-item[onclick*="config"]');
  if (!cfg || !cfg.parentNode) return;
  var d = document.createElement('div');
  d.className = 'nav-item';
  d.id = 'nav-instalar-app';
  d.setAttribute('onclick', 'appInstalarAbrir()');
  d.innerHTML = '<span style="font-size:14px;width:15px;text-align:center;">📲</span> Instalar app no celular';
  cfg.parentNode.insertBefore(d, cfg.nextSibling);
}

// Faixa no topo da tela principal (só até a pessoa tocar no X)
function appInstalarFaixa() {
  if (document.getElementById('app-instalar-faixa')) return;
  var conteudo = document.getElementById('conteudo');
  var alvo = conteudo && conteudo.parentNode;
  if (!conteudo || !alvo) return;
  var f = document.createElement('div');
  f.id = 'app-instalar-faixa';
  f.innerHTML = '<div class="ai-txt">📲 Abrir mais rápido, como um app<span>Fica um ícone na tela do celular</span></div>' +
    '<button type="button" class="ai-sim" onclick="appInstalarAbrir()">Instalar</button>' +
    '<button type="button" class="ai-nao" onclick="appInstalarDispensar()" title="Agora não">✕</button>';
  alvo.insertBefore(f, conteudo);
}
function appInstalarDispensar() {
  try { localStorage.setItem('app_instalar_dispensado', '1'); } catch (e) {}
  var f = document.getElementById('app-instalar-faixa'); if (f) f.remove();
}

function appInstalarFechar() {
  var m = document.getElementById('app-instalar-modal'); if (m) m.remove();
}

// Botão "Instalar": no Android abre o aviso do próprio celular; no iPhone (ou se não abrir) mostra o passo a passo
async function appInstalarAbrir() {
  appInstalarCss();
  if (appInstalarEvento) {
    try {
      appInstalarEvento.prompt();
      var r = await appInstalarEvento.userChoice;
      appInstalarEvento = null;
      if (r && r.outcome === 'accepted') return;
    } catch (e) {}
  }
  var passos = appInstalarEhIphone()
    ? '<li>Toque no botão <b>Compartilhar</b> (o quadradinho com uma setinha para cima), lá embaixo no Safari.</li>' +
      '<li>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</li>' +
      '<li>Toque em <b>Adicionar</b>. Pronto: o ícone aparece na tela do celular.</li>' +
      '<li>Abra pelo ícone e entre com o seu login <b>uma vez</b>.</li>'
    : '<li>Toque nos <b>3 pontinhos</b> no canto de cima do Chrome.</li>' +
      '<li>Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</li>' +
      '<li>Toque em <b>Instalar</b>. Pronto: o ícone aparece na tela do celular.</li>';
  appInstalarFechar();
  var m = document.createElement('div');
  m.id = 'app-instalar-modal';
  m.innerHTML = '<div class="ai-caixa"><h3>📲 Instalar no celular</h3><ol>' + passos + '</ol>' +
    '<button type="button" class="ai-fechar" onclick="appInstalarFechar()">Entendi</button></div>';
  m.addEventListener('click', function (e) { if (e.target === m) appInstalarFechar(); });
  document.body.appendChild(m);
}
