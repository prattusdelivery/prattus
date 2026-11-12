// ===== Fechar conta da mesa: taxa de serviço + dividir a conta =====
// Por enquanto só na loja Demo (localStorage 'conta_mesa_nova' = '1' liga / '0' desliga neste aparelho).
// Chamado por pedidos.js (abrirFechamentoComanda / confirmarFechamentoComanda) e financeiro.js.

var ctm = null; // conta que está sendo fechada agora

function contaMesaAtiva() {
  try {
    const v = localStorage.getItem('conta_mesa_nova');
    if (v === '1') return true;
    if (v === '0') return false;
  } catch (e) {}
  return !!(typeof restauranteAtual !== 'undefined' && restauranteAtual && restauranteAtual.slug === 'servidelivery-demo');
}

function ctmReais(v) { return 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ','); }
function ctmArred(v) { return Math.round((Number(v) || 0) * 100) / 100; }

function contaMesaConfig() {
  const t = restauranteAtual && restauranteAtual.avisos_whatsapp && restauranteAtual.avisos_whatsapp.taxa_servico;
  return { ativo: !!(t && t.ativo), pct: parseFloat(t && t.pct) > 0 ? parseFloat(t.pct) : 10 };
}

function ctmTaxa() { return ctm && ctm.cobrarTaxa ? ctmArred(ctm.consumo * ctm.pct / 100) : 0; }
function ctmTotal() { return ctm ? ctmArred(ctm.consumo + ctmTaxa()) : 0; }
function contaMesaTotal() { return ctm ? ctmTotal() : null; }
function contaMesaDividindo() { return !!(ctm && ctm.dividir); }
function ctmTemForma() { return typeof finFormaPagDisponivel === 'function' && finFormaPagDisponivel(); }

function contaMesaLimpar() {
  ctm = null;
  ['fechar-conta-taxa', 'fechar-conta-dividir'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });
}

// itens = [[nome, {qtd, preco}], ...]
function contaMesaIniciar(consumo, itens) {
  if (!contaMesaAtiva()) { contaMesaLimpar(); return; }
  consumo = ctmArred(consumo);
  if (consumo <= 0) { contaMesaLimpar(); return; }
  const cfg = contaMesaConfig();
  ctm = { consumo, itens: itens || [], cobrarTaxa: cfg.ativo, pct: cfg.pct, usaTaxa: cfg.ativo, dividir: false, n: 2, vals: [], formas: [] };
  contaMesaRender();
}

function ctmDividirIgual() {
  const total = ctmTotal(), n = ctm.n;
  const base = Math.floor(total * 100 / n) / 100;
  ctm.vals = [];
  for (let i = 0; i < n; i++) ctm.vals.push(base);
  ctm.vals[n - 1] = ctmArred(total - base * (n - 1));
  ctm.formas = ctm.formas.slice(0, n);
}

function contaMesaRender() {
  if (!ctm) return;
  const total = ctmTotal(), taxa = ctmTaxa();
  // Linhas de consumo e taxa (em cima do total)
  const elT = document.getElementById('fechar-conta-taxa');
  if (elT) {
    if (ctm.usaTaxa) {
      elT.style.display = 'block';
      elT.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:14px;"><span>Consumo</span><span style="font-weight:600;">${ctmReais(ctm.consumo)}</span></div>
        <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;font-size:14px;cursor:pointer;">
          <span style="display:flex;align-items:center;gap:8px;"><input type="checkbox" ${ctm.cobrarTaxa ? 'checked' : ''} onchange="ctmTrocarTaxa(this.checked)" style="width:20px;height:20px;"> Taxa de serviço (${String(ctm.pct).replace('.', ',')}%)</span>
          <span style="font-weight:600;${ctm.cobrarTaxa ? '' : 'text-decoration:line-through;color:var(--texto-muted);'}">${ctmReais(ctm.cobrarTaxa ? taxa : ctmArred(ctm.consumo * ctm.pct / 100))}</span>
        </label>`;
    } else { elT.style.display = 'none'; elT.innerHTML = ''; }
  }
  const totalEl = document.getElementById('fechar-comanda-total');
  if (totalEl) totalEl.textContent = ctmReais(total);

  // Dividir a conta
  const elD = document.getElementById('fechar-conta-dividir');
  const formaBox = document.getElementById('fechar-forma-pag');
  if (!elD) return;
  elD.style.display = 'block';
  const btnImprimir = `<button type="button" class="btn-sm" style="width:100%;padding:12px;margin-top:8px;" onclick="contaMesaImprimir()">🖨️ Imprimir a conta</button>`;
  if (!ctm.dividir) {
    if (formaBox && ctmTemForma()) formaBox.style.display = 'block';
    elD.innerHTML = `<button type="button" class="btn-sm" style="width:100%;padding:12px;margin-top:14px;font-size:15px;font-weight:700;" onclick="ctmAbrirDivisao()">✂️ Dividir a conta</button>${btnImprimir}`;
    return;
  }
  if (formaBox) formaBox.style.display = 'none';
  if (!ctm.vals.length) ctmDividirIgual();
  const temForma = ctmTemForma();
  const botoes = i => temForma ? `<div style="display:flex;gap:6px;margin-top:6px;">${FIN_FORMAS.map(([v, t]) => {
    const on = ctm.formas[i] === v;
    return `<button type="button" onclick="ctmForma(${i},'${v}')" style="flex:1;padding:10px 2px;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;border:2px solid ${on ? 'var(--laranja)' : 'var(--creme-borda)'};background:${on ? 'var(--laranja)' : '#fff'};color:${on ? '#fff' : 'var(--texto)'};">${t}</button>`;
  }).join('')}</div>` : '';
  elD.innerHTML = `
    <div style="margin-top:14px;background:var(--creme);border-radius:12px;padding:12px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">✂️ Dividir a conta</div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
        <span style="font-size:14px;flex:1;">Quantas pessoas?</span>
        <button type="button" onclick="ctmMudaN(-1)" style="width:42px;height:42px;border-radius:50%;border:2px solid var(--creme-borda);background:#fff;font-size:22px;font-weight:700;cursor:pointer;">−</button>
        <span style="font-size:20px;font-weight:800;min-width:26px;text-align:center;">${ctm.n}</span>
        <button type="button" onclick="ctmMudaN(1)" style="width:42px;height:42px;border-radius:50%;border:2px solid var(--creme-borda);background:#fff;font-size:22px;font-weight:700;cursor:pointer;">+</button>
      </div>
      ${ctm.vals.map((v, i) => `
        <div style="background:#fff;border:1px solid var(--creme-borda);border-radius:10px;padding:10px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:14px;font-weight:600;flex:1;">Pessoa ${i + 1}</span>
            <span style="font-size:14px;">R$</span>
            <input type="text" inputmode="decimal" value="${v.toFixed(2).replace('.', ',')}" oninput="ctmValor(${i}, this.value)" style="width:100px;text-align:right;font-size:16px;font-weight:700;">
          </div>
          ${botoes(i)}
        </div>`).join('')}
      <div id="ctm-status" style="font-size:14px;font-weight:700;margin:6px 0;"></div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn-sm" style="flex:1;padding:10px;" onclick="ctmIgual()">Dividir igual</button>
        <button type="button" class="btn-sm" style="flex:1;padding:10px;" onclick="ctmFecharDivisao()">Voltar (1 pagamento só)</button>
      </div>
      ${btnImprimir}
    </div>`;
  ctmStatus();
}

function ctmStatus() {
  const el = document.getElementById('ctm-status');
  if (!el || !ctm) return;
  const soma = ctmArred(ctm.vals.reduce((s, v) => s + (Number(v) || 0), 0));
  const dif = ctmArred(ctmTotal() - soma);
  if (Math.abs(dif) < 0.009) { el.style.color = '#0F6E56'; el.textContent = '✔ A soma está certinha: ' + ctmReais(soma); }
  else if (dif > 0) { el.style.color = '#B42318'; el.textContent = 'Ainda falta ' + ctmReais(dif); }
  else { el.style.color = '#B42318'; el.textContent = 'Passou ' + ctmReais(-dif) + ' do total'; }
}

function ctmTrocarTaxa(on) { if (!ctm) return; ctm.cobrarTaxa = !!on; if (ctm.dividir) ctmDividirIgual(); contaMesaRender(); }
function ctmAbrirDivisao() { if (!ctm) return; ctm.dividir = true; ctm.n = 2; ctm.formas = []; ctmDividirIgual(); contaMesaRender(); }
function ctmFecharDivisao() { if (!ctm) return; ctm.dividir = false; ctm.vals = []; ctm.formas = []; contaMesaRender(); }
function ctmMudaN(d) { if (!ctm) return; ctm.n = Math.max(2, Math.min(20, ctm.n + d)); ctmDividirIgual(); contaMesaRender(); }
function ctmIgual() { if (!ctm) return; ctmDividirIgual(); contaMesaRender(); }
function ctmValor(i, txt) {
  if (!ctm) return;
  const v = parseFloat(String(txt).replace(/\./g, '').replace(',', '.'));
  ctm.vals[i] = isNaN(v) ? 0 : ctmArred(v);
  ctmStatus();
}
function ctmForma(i, f) { if (!ctm) return; ctm.formas[i] = f; contaMesaRender(); }

// Devolve um texto de erro (ou null se pode fechar a conta)
function contaMesaValidar() {
  if (!ctm || !ctm.dividir) return null;
  const soma = ctmArred(ctm.vals.reduce((s, v) => s + (Number(v) || 0), 0));
  const dif = ctmArred(ctmTotal() - soma);
  if (ctm.vals.some(v => !(v > 0))) return 'Tem uma pessoa com valor zero. Diminua a quantidade de pessoas.';
  if (Math.abs(dif) >= 0.009) return dif > 0 ? `Ainda falta ${ctmReais(dif)} para fechar o total.` : `As partes passaram ${ctmReais(-dif)} do total.`;
  if (ctmTemForma() && ctm.vals.some((v, i) => !ctm.formas[i])) return 'Marque como cada pessoa pagou: Pix, Cartão ou Dinheiro.';
  return null;
}

// Campos que vão para o histórico da comanda quando a conta é fechada
function contaMesaCampos() {
  if (!ctm) return null;
  const c = { total: ctmTotal(), taxa_servico: ctmTaxa() };
  if (ctm.dividir && ctmTemForma()) {
    const por = {};
    ctm.vals.forEach((v, i) => { const f = ctm.formas[i]; por[f] = ctmArred((por[f] || 0) + v); });
    c.pagamentos = por;
    const fs = Object.keys(por);
    if (fs.length === 1) c.forma_pagamento = fs[0]; // formas diferentes: fica vazio (o banco só aceita pix/cartao/dinheiro); o detalhe está em 'pagamentos'
  } else if (!ctm.dividir && typeof finFormaPagValor === 'function' && finFormaPagValor()) {
    c.pagamentos = { [finFormaPagValor()]: ctmTotal() };
  }
  return c;
}

// Conta impressa para o cliente conferir (não é nota fiscal)
function contaMesaImprimir() {
  if (!ctm) return;
  const pc = document.getElementById('print-cardapio'); if (pc) pc.innerHTML = '';
  let tam = 'normal'; try { tam = localStorage.getItem('imprimir_tam_' + restauranteAtual.id) || 'normal'; } catch (e) {}
  document.getElementById('comanda-print').className = (tam === 'gigante' ? 'cp-gg' : tam === 'extra' ? 'cp-xg' : (tam === 'grande' ? 'cp-g' : ''));
  const mesa = (typeof textoMesa === 'function' && comandaAtual) ? textoMesa(comandaAtual.mesa) : '';
  const taxa = ctmTaxa(), total = ctmTotal();
  const itensHtml = ctm.itens.map(([nome, info]) => `<div class="cp-par cp-item cp-prod"><span>${info.qtd}x ${esc(nome)}</span><span>${ctmReais(info.preco * info.qtd)}</span></div>`).join('');
  const divisao = ctm.dividir ? `<div class="cp-linha"></div><div class="cp-tit">CONTA DIVIDIDA EM ${ctm.n}</div>` +
    ctm.vals.map((v, i) => `<div class="cp-par cp-info"><span>Pessoa ${i + 1}</span><span>${ctmReais(v)}</span></div>`).join('') : '';
  document.getElementById('comanda-print').innerHTML = `
    <h2>${esc(restauranteAtual.nome || '')}</h2>
    <div class="cp-caixa">CONTA — ${esc(mesa)}</div>
    <div style="text-align:center;">${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
    <div class="cp-linha"></div>
    ${itensHtml}
    <div class="cp-linha"></div>
    ${taxa > 0 ? `<div class="cp-par cp-info"><span>Consumo</span><span>${ctmReais(ctm.consumo)}</span></div><div class="cp-par cp-info"><span>Taxa de serviço (${String(ctm.pct).replace('.', ',')}%)</span><span>${ctmReais(taxa)}</span></div>` : ''}
    <div class="cp-par cp-total"><span>TOTAL</span><span>${ctmReais(total)}</span></div>
    ${divisao}
    <div class="cp-linha"></div>
    <div style="text-align:center;font-size:13px;font-weight:700;margin-top:4px;">NÃO É DOCUMENTO FISCAL</div>`;
  imprimirPapelAjustado();
}

// ----- Configurações: taxa de serviço -----
function taxaServicoLerCampos() {
  const a = document.getElementById('cfg-taxa-ativa');
  if (!a) return null;
  let pct = parseFloat(String(document.getElementById('cfg-taxa-pct').value).replace(',', '.'));
  if (!(pct > 0 && pct <= 30)) pct = 10;
  return { ativo: a.checked, pct };
}
async function salvarTaxaServico() {
  const t = taxaServicoLerCampos();
  if (!t) return;
  const bruto = parseFloat(String(document.getElementById('cfg-taxa-pct').value).replace(',', '.'));
  if (t.ativo && !(bruto > 0 && bruto <= 30)) { toast('Digite uma porcentagem entre 1 e 30.', 'erro'); return; }
  const novo = { ...(restauranteAtual.avisos_whatsapp || {}), taxa_servico: t };
  const { error } = await db.from('restaurantes').update({ avisos_whatsapp: novo }).eq('id', restauranteAtual.id);
  if (error) { toast('Não consegui salvar: ' + error.message, 'erro'); return; }
  restauranteAtual = { ...restauranteAtual, avisos_whatsapp: novo };
  toast('Taxa de serviço salva!', 'ok');
}
