// ===== BOTÃO "RETIRADA NO LOCAL: SIM / NÃO" NA TELA DE PEDIDOS =====
// Para o dono ligar/desligar a retirada com UM toque, sem entrar em Configurações.
// Usa a mesma coluna de sempre (restaurantes.retirada_disponivel), então não precisa de SQL nem muda o cardápio do cliente.
// Por enquanto só na loja Demo (servidelivery-demo). Para liberar para todas: trocar retiradaBotaoLiberado() por "return true"
// (e tirar a regra da Demo que esconde a chave antiga em Configurações, no app.html: cfg-retirada-box).
// Usa: restauranteAtual, meuPapel, paginaAtual, db, toast.

function retiradaBotaoLiberado() {
  return !!(typeof restauranteAtual !== 'undefined' && restauranteAtual && restauranteAtual.slug === 'servidelivery-demo');
}

function retiradaBotaoLigada() {
  return !!restauranteAtual && restauranteAtual.retirada_disponivel !== false;
}

function retiradaBotaoCss() {
  if (document.getElementById('retirada-hoje-css')) return;
  var st = document.createElement('style');
  st.id = 'retirada-hoje-css';
  st.textContent =
    '#retirada-hoje{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px 0;}' +
    '#retirada-hoje .rh-btn{font-family:inherit;font-size:15px;font-weight:800;padding:10px 18px;border-radius:999px;border:2px solid;cursor:pointer;white-space:nowrap;}' +
    '#retirada-hoje .rh-btn.sim{background:#E3F4EE;border-color:#2E9E6F;color:#0B5C47;}' +
    '#retirada-hoje .rh-btn.nao{background:#F0ECE8;border-color:#B8ACA0;color:#6B5B50;}' +
    '#retirada-hoje .rh-btn[disabled]{opacity:.6;cursor:wait;}' +
    '#retirada-hoje .rh-dica{font-size:12px;color:var(--texto-muted,#8a7868);}';
  document.head.appendChild(st);
}

function retiradaBotaoTexto() {
  return retiradaBotaoLigada() ? '🛍️ Retirada no local: SIM' : '🛍️ Retirada no local: NÃO';
}

function retiradaBotaoAtualizar() {
  var b = document.getElementById('retirada-hoje-btn');
  if (!b) return;
  var ligada = retiradaBotaoLigada();
  b.className = 'rh-btn ' + (ligada ? 'sim' : 'nao');
  b.textContent = retiradaBotaoTexto();
  var d = document.getElementById('retirada-hoje-dica');
  if (d) d.textContent = ligada ? 'O cliente pode escolher retirar. Toque para desligar.' : 'O cliente só vê entrega. Toque para ligar.';
}

function retiradaBotaoGarantir() {
  try {
    if (!retiradaBotaoLiberado()) return;
    if (typeof meuPapel !== 'undefined' && meuPapel === 'garcom') return; // o garçom não vê
    if (typeof paginaAtual === 'undefined' || paginaAtual !== 'pedidos') return;
    var c = document.getElementById('conteudo');
    if (!c || document.getElementById('retirada-hoje')) return;
    retiradaBotaoCss();
    var w = document.createElement('div');
    w.id = 'retirada-hoje';
    w.innerHTML = '<button type="button" id="retirada-hoje-btn" class="rh-btn" onclick="retiradaBotaoAlternar(this)"></button><span id="retirada-hoje-dica" class="rh-dica"></span>';
    c.insertBefore(w, c.firstChild);
    retiradaBotaoAtualizar();
  } catch (e) {}
}

async function retiradaBotaoAlternar(btn) {
  if (!restauranteAtual) return;
  var novo = !retiradaBotaoLigada();
  if (btn) btn.disabled = true;
  var r = await db.from('restaurantes').update({ retirada_disponivel: novo }).eq('id', restauranteAtual.id);
  if (btn) btn.disabled = false;
  if (r && r.error) { toast('Não deu certo. Toque de novo.', 'erro'); return; }
  restauranteAtual.retirada_disponivel = novo;
  retiradaBotaoAtualizar();
  toast(novo ? 'Retirada ligada. O cliente já pode escolher retirar.' : 'Retirada desligada. O cliente só vê entrega.', 'ok');
}

(function retiradaBotaoIniciar() {
  var obs = null;
  function ligar() {
    var c = document.getElementById('conteudo');
    if (!c) return;
    if (!obs) {
      obs = new MutationObserver(function () { retiradaBotaoGarantir(); });
      obs.observe(c, { childList: true });
    }
    retiradaBotaoGarantir();
  }
  // a tela de pedidos é redesenhada várias vezes; confere de tempos em tempos também (leve)
  setInterval(function () { ligar(); }, 2000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
})();
