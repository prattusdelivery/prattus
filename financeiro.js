// ===== FINANCEIRO (plano Completo — só o dono) =====
// Etapa 1: quanto entrou (vendas), quanto saiu (despesas que o dono anota) e o lucro, por hoje / 7 dias / mês.
// Entradas vêm dos pedidos (mesmos status do Relatórios). Saídas ficam na tabela "despesas" (supabase/financeiro.sql).
// Usa as variáveis globais do app: db, restauranteAtual, meuPapel, esc, toast, dataBR, dataDoBanco.

var finEstado = { periodo: 'mes', ini: null, fim: null }; // ini/fim só valem no período "Personalizado"
var FIN_LOJAS_LIBERADAS = ['servidelivery-demo', 'sorveteria-skina', 'quiosquedapraca', 'frigideiras-bar'];
var FIN_CATEGORIAS = [
  ['ingredientes', '🥩 Ingredientes / mercadoria'],
  ['funcionarios', '👥 Funcionários'],
  ['aluguel', '🏠 Aluguel'],
  ['contas', '💡 Luz, água, internet'],
  ['gas', '🔥 Gás'],
  ['embalagens', '📦 Embalagens'],
  ['propaganda', '📣 Propaganda'],
  ['outros', '🧾 Outros']
];

// Loja liberada: plano Completo E recurso premium ligado nessa loja (lista abaixo; loja nova só entra se o Alessandro liberar).
// localStorage 'financeiro' = 'true'/'false' força num aparelho (teste).
function finLojaLiberada() {
  if (!restauranteAtual) return false;
  if (restauranteAtual.plano_painel === 'simples') return false;
  try {
    const v = localStorage.getItem('financeiro');
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch (e) {}
  return FIN_LOJAS_LIBERADAS.includes(restauranteAtual.slug);
}
// A tela Financeiro é só do dono
function financeiroDisponivel() {
  return finLojaLiberada() && meuPapel === 'dono';
}

// ----- Fechar conta da mesa: como o cliente pagou (Pix / Cartão / Dinheiro) -----
// Aparece na janela "Fechar conta" (pedidos.js chama finFormaPagMostrar). Só plano Completo; garçom não fecha conta.
var finFormaSel = null;
var FIN_FORMAS = [['pix', '📱 Pix'], ['cartao', '💳 Cartão'], ['dinheiro', '💵 Dinheiro']];
function finFormaPagDisponivel() { return finLojaLiberada() && meuPapel !== 'garcom'; }
function finFormaPagFaltando() { return finFormaPagDisponivel() && !finFormaSel; }
function finFormaPagValor() { return finFormaPagDisponivel() ? finFormaSel : null; }
function finFormaPagMostrar() {
  finFormaSel = null;
  const el = document.getElementById('fechar-forma-pag');
  if (!el) return;
  if (!finFormaPagDisponivel()) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = `<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Como o cliente pagou?</div>
    <div style="display:flex;gap:8px;">${FIN_FORMAS.map(([v, t]) => `<button type="button" data-forma="${v}" onclick="finFormaPagEscolher('${v}')" style="flex:1;padding:14px 4px;border-radius:12px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;border:2px solid var(--creme-borda);background:#fff;color:var(--texto);">${t}</button>`).join('')}</div>`;
}
function finFormaPagEscolher(f) {
  finFormaSel = f;
  document.querySelectorAll('#fechar-forma-pag button[data-forma]').forEach(b => {
    const on = b.dataset.forma === f;
    b.style.background = on ? 'var(--laranja)' : '#fff';
    b.style.color = on ? '#fff' : 'var(--texto)';
    b.style.borderColor = on ? 'var(--laranja)' : 'var(--creme-borda)';
  });
}

// Mostra ou esconde o item "Financeiro" no menu
function financeiroMenu() {
  const el = document.getElementById('nav-financeiro');
  if (el) el.style.display = financeiroDisponivel() ? '' : 'none';
}
if (typeof aplicarRestricoesGarcom === 'function' && !window.__finWrap) {
  window.__finWrap = true;
  const orig = aplicarRestricoesGarcom;
  aplicarRestricoesGarcom = function () {
    orig.apply(this, arguments);
    try { financeiroMenu(); } catch (e) {}
  };
}

function finReais(v) {
  v = v || 0;
  return (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function finDataBr(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }

// Soma/subtrai dias numa data "AAAA-MM-DD"
function finSomarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function finPeriodo(p) {
  const hoje = dataBR(new Date());               // "AAAA-MM-DD" no horário de Brasília
  const [a, m] = hoje.split('-').map(Number);
  const pad = x => String(x).padStart(2, '0');
  if (p === 'hoje') return { ini: hoje, fim: hoje, rotulo: 'Hoje' };
  if (p === 'custom') return { ini: finEstado.ini || finSomarDias(hoje, -29), fim: finEstado.fim || hoje, rotulo: 'Período escolhido' };
  if (p === '7') return { ini: finSomarDias(hoje, -6), fim: hoje, rotulo: 'Últimos 7 dias' };
  if (p === 'passado') {
    const ini = m === 1 ? `${a - 1}-12-01` : `${a}-${pad(m - 1)}-01`;
    return { ini, fim: finSomarDias(`${a}-${pad(m)}-01`, -1), rotulo: 'Mês passado' };
  }
  const primeiro = `${a}-${pad(m)}-01`;
  const prox = m === 12 ? `${a + 1}-01-01` : `${a}-${pad(m + 1)}-01`;
  return { ini: primeiro, fim: finSomarDias(prox, -1), rotulo: 'Este mês' };
}

// Busca em páginas de 1000 (o banco limita) — até 5000 pedidos no período
async function finBuscarPedidos(rid, ini, fim) {
  let todos = [];
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db.from('pedidos')
      .select('total,criado_em,observacao,codigo_comanda_id')
      .eq('restaurante_id', rid).in('status', ['preparando', 'entrega', 'entregue'])
      .gte('criado_em', ini + 'T00:00:00-03:00').lte('criado_em', fim + 'T23:59:59-03:00')
      .range(i * 1000, i * 1000 + 999);
    if (error) return { erro: error };
    todos = todos.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return { dados: todos, cheio: todos.length >= 5000 };
}

function finFormaPag(p) {
  const m = /Pagamento:\s*([^\n]*)/i.exec(p.observacao || ''); // o pedido guarda "Pagamento: Dinheiro" no texto
  const t = (m ? m[1] : '').toLowerCase();
  if (t.includes('pix')) return 'Pix';
  if (t.includes('cart')) return 'Cartão';
  if (t.includes('dinheiro')) return 'Dinheiro';
  return 'Outros';
}

function finBarras(mapa, cor) {
  const itens = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  if (!itens.length) return '<div class="empty-txt" style="color:var(--texto-muted);">Nada por aqui ainda</div>';
  const max = Math.max(...itens.map(i => i[1]), 1);
  const total = itens.reduce((s, i) => s + i[1], 0) || 1;
  return itens.map(([nome, v]) => `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:14px;margin-bottom:4px;">
        <span>${esc(nome)}</span><span style="font-weight:700;">${finReais(v)} <span style="color:var(--texto-muted);font-weight:400;font-size:12px;">(${Math.round(v / total * 100)}%)</span></span>
      </div>
      <div style="height:8px;background:var(--creme-borda);border-radius:6px;overflow:hidden;"><div style="height:100%;width:${Math.max(3, v / max * 100)}%;background:${cor};border-radius:6px;"></div></div>
    </div>`).join('');
}

async function renderFinanceiro(periodo) {
  if (!restauranteAtual) return;
  const c = document.getElementById('conteudo');
  if (!financeiroDisponivel()) {
    c.innerHTML = '<div class="card"><div style="font-size:15px;">💰 O Financeiro faz parte do plano <b>Completo</b>.</div></div>';
    return;
  }
  if (typeof periodo === 'string') finEstado.periodo = periodo;
  const rid = restauranteAtual.id;
  if (finEstado.periodo === 'custom' && !finEstado.ini) { const p0 = finPeriodo('custom'); finEstado.ini = p0.ini; finEstado.fim = p0.fim; }
  const { ini, fim, rotulo } = finPeriodo(finEstado.periodo);

  const [rp, rd, rh] = await Promise.all([
    finBuscarPedidos(rid, ini, fim),
    db.from('despesas').select('id,descricao,valor,categoria,data').eq('restaurante_id', rid)
      .gte('data', ini).lte('data', fim).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(1000),
    // contas de mesa fechadas no período (com a forma de pagamento marcada no caixa)
    db.from('comandas_historico').select('total,forma_pagamento').eq('restaurante_id', rid).not('fechada_em', 'is', null)
      .gte('fechada_em', ini + 'T00:00:00-03:00').lte('fechada_em', fim + 'T23:59:59-03:00').limit(3000)
  ]);
  if (rp.erro || rd.error) {
    c.innerHTML = '<div class="card"><div style="font-size:15px;">Não consegui abrir o Financeiro agora. Recarregue a página e tente de novo.</div></div>';
    return;
  }
  const pedidos = rp.dados, despesas = rd.data || [];

  const entradas = pedidos.reduce((s, p) => s + parseFloat(p.total || 0), 0);
  const saidas = despesas.reduce((s, d) => s + parseFloat(d.valor || 0), 0);
  const lucro = entradas - saidas;
  const margem = entradas > 0 ? Math.round(lucro / entradas * 100) : null;

  const porPag = {}, porMesa = {}, porDia = {};
  pedidos.forEach(p => {
    const v = parseFloat(p.total || 0);
    if (!p.codigo_comanda_id) { const f = finFormaPag(p); porPag[f] = (porPag[f] || 0) + v; } // só delivery
    const dia = dataBR(dataDoBanco(p.criado_em));
    (porDia[dia] = porDia[dia] || { e: 0, s: 0 }).e += v;
  });
  const nomeCat = Object.fromEntries(FIN_CATEGORIAS);
  despesas.forEach(d => {
    const v = parseFloat(d.valor || 0);
    (porDia[d.data] = porDia[d.data] || { e: 0, s: 0 }).s += v;
  });
  const nomeForma = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  ((rh && rh.data) || []).forEach(h => {
    const f = nomeForma[h.forma_pagamento] || 'Não informado';
    porMesa[f] = (porMesa[f] || 0) + parseFloat(h.total || 0);
  });
  const dias = Object.keys(porDia).sort().reverse();

  const chip = (v, t) => `<button type="button" onclick="renderFinanceiro('${v}')" style="padding:10px 18px;border-radius:24px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;border:2px solid ${finEstado.periodo === v ? 'var(--laranja)' : 'var(--creme-borda)'};background:${finEstado.periodo === v ? 'var(--laranja)' : '#fff'};color:${finEstado.periodo === v ? '#fff' : 'var(--texto)'};">${t}</button>`;
  const verde = '#0F6E56', vermelho = '#C0392B';

  c.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
      ${chip('hoje', 'Hoje')}${chip('7', '7 dias')}${chip('mes', 'Este mês')}${chip('passado', 'Mês passado')}${chip('custom', '📅 Personalizado')}
    </div>
    ${finEstado.periodo === 'custom' ? `
    <div class="card" style="margin:10px 0 6px;padding:14px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div class="form-group" style="margin:0;flex:1;min-width:140px;"><label style="font-size:12px;">De</label><input type="date" id="fin-ini" value="${ini}"></div>
        <div class="form-group" style="margin:0;flex:1;min-width:140px;"><label style="font-size:12px;">Até</label><input type="date" id="fin-fim" value="${fim}"></div>
        <button class="btn btn-laranja" style="width:auto;padding:11px 22px;" onclick="finAplicarPersonalizado()">Ver</button>
      </div>
    </div>` : ''}
    <div style="font-size:13px;color:var(--texto-muted);margin-bottom:18px;">${rotulo}: ${finDataBr(ini)}${ini !== fim ? ' a ' + finDataBr(fim) : ''}</div>

    <div class="metricas">
      <div class="metrica"><div class="metrica-label">💰 Entrou (vendas)</div><div class="metrica-val" style="color:${verde};">${finReais(entradas)}</div><div style="font-size:12px;color:var(--texto-muted);margin-top:2px;">${pedidos.length} pedido(s)</div></div>
      <div class="metrica"><div class="metrica-label">💸 Saiu (despesas)</div><div class="metrica-val" style="color:${vermelho};">${finReais(saidas)}</div><div style="font-size:12px;color:var(--texto-muted);margin-top:2px;">${despesas.length} despesa(s)</div></div>
      <div class="metrica"><div class="metrica-label">${lucro >= 0 ? '✅ Sobrou (lucro)' : '⚠️ Faltou (prejuízo)'}</div><div class="metrica-val" style="color:${lucro >= 0 ? verde : vermelho};">${finReais(lucro)}</div>${margem !== null ? `<div style="font-size:12px;color:var(--texto-muted);margin-top:2px;">${margem}% do que entrou</div>` : ''}</div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-titulo">➕ Anotar uma despesa</div>
        <div class="form-group"><label>O que foi?</label><input type="text" id="fin-desc" maxlength="80" placeholder="Ex: Compra de carne" autocomplete="off"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <div class="form-group" style="flex:1;min-width:130px;"><label>Valor (R$)</label><input type="text" id="fin-valor" inputmode="decimal" placeholder="Ex: 150,00" autocomplete="off"></div>
          <div class="form-group" style="flex:1;min-width:150px;"><label>Dia</label><input type="date" id="fin-data" value="${dataBR(new Date())}"></div>
        </div>
        <div class="form-group"><label>Tipo de despesa</label>
          <select id="fin-cat">${FIN_CATEGORIAS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
        </div>
        <button class="btn btn-laranja" id="fin-salvar" onclick="finSalvarDespesa()">Salvar despesa</button>
      </div>
      <div class="card">
        <div class="card-titulo">Para onde foi o dinheiro</div>
        ${despesas.length === 0 ? '<div class="empty-txt" style="color:var(--texto-muted);">Nenhuma despesa anotada neste período</div>' :
          '<div style="max-height:360px;overflow:auto;">' + despesas.map(d => `
          <div class="frete-row">
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;">${esc(d.descricao)}</div>
              <div style="font-size:12px;color:var(--texto-muted);">${finDataBr(d.data)} · ${esc(nomeCat[d.categoria] || nomeCat.outros)}</div>
            </div>
            <div style="font-size:15px;font-weight:700;color:${vermelho};margin:0 10px;white-space:nowrap;">${finReais(parseFloat(d.valor))}</div>
            <button type="button" class="btn-sm" onclick="finExcluirDespesa('${d.id}')" title="Apagar esta despesa" style="padding:6px 10px;font-size:12px;">Apagar</button>
          </div>`).join('') + '</div>'}
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-titulo">🛵 Delivery — como pagaram</div>
        ${finBarras(porPag, verde)}
      </div>
      <div class="card">
        <div class="card-titulo">🍽️ Mesas — como pagaram</div>
        ${finBarras(porMesa, verde)}
        ${porMesa['Não informado'] ? '<div style="font-size:12px;color:var(--texto-muted);margin-top:6px;">"Não informado" são contas fechadas antes de o caixa marcar a forma de pagamento.</div>' : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-titulo">Dia a dia</div>
      ${dias.length === 0 ? '<div class="empty-txt" style="color:var(--texto-muted);">Sem movimento neste período</div>' : `
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="text-align:left;color:var(--texto-muted);font-size:12px;"><th style="padding:6px 8px;">Dia</th><th style="padding:6px 8px;text-align:right;">Entrou</th><th style="padding:6px 8px;text-align:right;">Saiu</th><th style="padding:6px 8px;text-align:right;">Sobrou</th></tr>
        ${dias.map(dia => { const x = porDia[dia]; const l = x.e - x.s; return `
        <tr style="border-top:1px solid var(--creme-borda);">
          <td style="padding:8px;">${finDataBr(dia)}</td>
          <td style="padding:8px;text-align:right;color:${verde};">${finReais(x.e)}</td>
          <td style="padding:8px;text-align:right;color:${vermelho};">${x.s ? finReais(x.s) : '—'}</td>
          <td style="padding:8px;text-align:right;font-weight:700;color:${l >= 0 ? verde : vermelho};">${finReais(l)}</td>
        </tr>`; }).join('')}
      </table></div>`}
    </div>
    <div style="font-size:12px;color:var(--texto-muted);text-align:center;margin:4px 0 20px;">"Entrou" conta os pedidos do delivery e das mesas (menos os recusados). "Mesas — como pagaram" mostra as contas fechadas no período. "Saiu" é o que você anota aqui.${rp.cheio ? '<br><b>Atenção:</b> o período é muito grande e só os primeiros 5.000 pedidos foram somados. Escolha um período menor.' : ''}</div>`;
}

// Botão "Ver" do período personalizado
function finAplicarPersonalizado() {
  const ini = (document.getElementById('fin-ini') || {}).value;
  const fim = (document.getElementById('fin-fim') || {}).value;
  if (!ini || !fim) { toast('Escolha o dia inicial e o dia final.', 'erro'); return; }
  if (ini > fim) { toast('O dia inicial precisa ser antes do dia final.', 'erro'); return; }
  if ((new Date(fim + 'T12:00:00Z') - new Date(ini + 'T12:00:00Z')) / 86400000 > 366) { toast('Escolha no máximo 1 ano.', 'erro'); return; }
  finEstado.ini = ini; finEstado.fim = fim;
  renderFinanceiro('custom');
}

// "1.250,50" / "35,5" / "35.50" → número
function finLerValor(txt) {
  let s = String(txt || '').trim().replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s);
}

async function finSalvarDespesa() {
  if (!financeiroDisponivel()) return;
  const desc = (document.getElementById('fin-desc').value || '').trim();
  const valor = finLerValor(document.getElementById('fin-valor').value);
  const data = document.getElementById('fin-data').value;
  const cat = document.getElementById('fin-cat').value || 'outros';
  if (!desc) { toast('Escreva o que foi a despesa.', 'erro'); return; }
  if (!(valor > 0) || valor > 9999999) { toast('Digite um valor válido. Ex: 150,00', 'erro'); return; }
  if (!data) { toast('Escolha o dia.', 'erro'); return; }
  const bt = document.getElementById('fin-salvar');
  if (bt) bt.disabled = true;
  const { error } = await db.from('despesas').insert({
    restaurante_id: restauranteAtual.id, descricao: desc.slice(0, 80), valor: Math.round(valor * 100) / 100, categoria: cat, data
  });
  if (error) { if (bt) bt.disabled = false; toast('Não consegui salvar. Tente de novo.', 'erro'); return; }
  toast('Despesa salva!', 'ok');
  renderFinanceiro();
}

async function finExcluirDespesa(id) {
  if (!financeiroDisponivel()) return;
  if (!confirm('Apagar esta despesa?')) return;
  const { error } = await db.from('despesas').delete().eq('id', id).eq('restaurante_id', restauranteAtual.id);
  if (error) { toast('Não consegui apagar. Tente de novo.', 'erro'); return; }
  toast('Despesa apagada.', 'ok');
  renderFinanceiro();
}
