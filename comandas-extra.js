// ===== COMANDAS COMO EXTRA (26/11/2026) =====
// Comandas (mesas) viram um recurso que o Super Admin liga loja por loja (restaurantes.comandas_ativas).
// Loja com Comandas desligada: o menu "Comandas" e tudo que é de mesa some. Nada é apagado, só fica escondido.
// Mensalidade: R$ 39,90 sem Comandas, R$ 49,90 com Comandas (lojas com preço travado não mudam). Quem cobra é o servidor (api/_precos.js).
// POR ENQUANTO SÓ NA DEMO (servidelivery-demo). Para liberar para todas as lojas: troque a linha "return" de comandasRecursoLiberado() por "return true;".
// Usa: restauranteAtual.

function comandasRecursoLiberado() {
  return true;
}

// true = a loja usa Comandas (padrão). Só fica false se o recurso estiver liberado E o Super Admin tiver desligado.
function comandasLigadas() {
  try {
    if (typeof restauranteAtual === 'undefined' || !restauranteAtual) return true;
    if (!comandasRecursoLiberado()) return true;
    return restauranteAtual.comandas_ativas !== false;
  } catch (e) { return true; }
}

// Embrulha um pedaço de tela que só existe para quem usa Comandas.
function comandasEnvolver(html) {
  return html ? '<div class="so-comandas">' + html + '</div>' : '';
}

(function comandasIniciar() {
  try {
    var st = document.createElement('style');
    st.id = 'comandas-extra-css';
    st.textContent = 'body.sem-comandas .so-comandas{display:none !important;}';
    document.head.appendChild(st);
  } catch (e) {}
  function aplicar() {
    try { if (document.body) document.body.classList.toggle('sem-comandas', !comandasLigadas()); } catch (e) {}
  }
  aplicar();
  setInterval(aplicar, 1000);
})();
