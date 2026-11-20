// ===== BOTÃO "ENVIAR CARDÁPIO" NO TOPO DO PAINEL =====
// Para quem não entende de computador conseguir mandar o link do cardápio ao cliente sem procurar em menu.
// Toque no botão -> abre uma janelinha com "Enviar pelo WhatsApp" e "Copiar o link".
// Usa: restauranteAtual, meuPapel, toast. Por enquanto só na loja Demo.

function enviarCardapioLiberado() {
  return !!(typeof restauranteAtual !== 'undefined' && restauranteAtual && restauranteAtual.slug === 'servidelivery-demo');
}
function enviarCardapioLink() {
  return 'https://servidelivery.com.br/' + (restauranteAtual.slug || '');
}
function enviarCardapioMensagem() {
  return 'Olá! 😊 Faça o seu pedido na ' + (restauranteAtual.nome || 'nossa loja') + ' pelo nosso cardápio:\n' + enviarCardapioLink();
}

function enviarCardapioIniciar() {
  if (!enviarCardapioLiberado()) return;
  if (typeof meuPapel !== 'undefined' && meuPapel === 'garcom') return; // o garçom não vê
  if (document.getElementById('btn-enviar-cardapio')) return;
  var ref = document.getElementById('btn-pausar-loja');
  if (!ref || !ref.parentNode) return;
  if (!document.getElementById('enviar-cardapio-css')) {
    var st = document.createElement('style');
    st.id = 'enviar-cardapio-css';
    st.textContent =
      '#btn-enviar-cardapio{font-size:12px;font-weight:700;padding:8px 14px;border-radius:8px;border:1.5px solid var(--laranja,#E8673C);background:#fff;color:var(--laranja-dark,#C4522E);cursor:pointer;white-space:nowrap;font-family:inherit;}' +
      '@media (max-width:600px){#btn-enviar-cardapio{white-space:normal;max-width:92px;line-height:1.2;padding:6px 8px;text-align:center;}}';
    document.head.appendChild(st);
  }
  var b = document.createElement('button');
  b.id = 'btn-enviar-cardapio';
  b.type = 'button';
  b.textContent = '📲 Enviar cardápio ao cliente';
  b.onclick = enviarCardapioAbrir;
  ref.parentNode.insertBefore(b, ref);
}

function enviarCardapioAbrir() {
  if (document.getElementById('enviar-cardapio-tela')) return;
  var d = document.createElement('div');
  d.id = 'enviar-cardapio-tela';
  d.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(30,20,10,.6);display:flex;align-items:center;justify-content:center;padding:16px;';
  d.onclick = function (e) { if (e.target === d) enviarCardapioFechar(); };
  d.innerHTML =
    '<div style="background:#fff;border-radius:16px;max-width:400px;width:100%;padding:22px 20px;box-shadow:0 20px 50px rgba(0,0,0,.35);font-family:inherit;">' +
      '<div style="font-size:19px;font-weight:700;color:#2B1F14;margin-bottom:6px;">📲 Enviar o cardápio ao cliente</div>' +
      '<div style="font-size:14px;color:#5b4a3a;line-height:1.45;margin-bottom:14px;">O cliente abre o link, escolhe e faz o pedido sozinho.</div>' +
      '<div style="background:var(--creme,#fbf5ee);border-radius:10px;padding:10px 12px;font-size:13px;color:#2B1F14;word-break:break-all;margin-bottom:14px;">' + enviarCardapioLink().replace(/^https:\/\//, '') + '</div>' +
      '<button type="button" onclick="enviarCardapioWhats()" style="width:100%;padding:14px;border:none;border-radius:10px;background:#25D366;color:#fff;font-size:16px;font-weight:700;cursor:pointer;margin-bottom:10px;font-family:inherit;">💬 Enviar pelo WhatsApp</button>' +
      '<button type="button" onclick="enviarCardapioCopiar()" style="width:100%;padding:12px;border:1.5px solid var(--creme-borda,#e5d9cc);border-radius:10px;background:#fff;color:#2B1F14;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;">📋 Copiar o link</button>' +
      '<div style="text-align:center;margin-top:10px;"><a href="#" onclick="event.preventDefault();enviarCardapioFechar();" style="font-size:13px;color:#8a7766;">Fechar</a></div>' +
    '</div>';
  document.body.appendChild(d);
}

function enviarCardapioFechar() {
  var d = document.getElementById('enviar-cardapio-tela');
  if (d) d.remove();
}

function enviarCardapioWhats() {
  window.open('https://wa.me/?text=' + encodeURIComponent(enviarCardapioMensagem()), '_blank');
}

function enviarCardapioCopiar() {
  var txt = enviarCardapioLink();
  var ok = function () { toast('Link copiado!', 'ok'); enviarCardapioFechar(); };
  var antigo = function () {
    var t = document.createElement('textarea');
    t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); ok(); } catch (e) { prompt('Copie o link:', txt); }
    t.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, antigo);
  else antigo();
}
