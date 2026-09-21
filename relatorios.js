// ===== MÓDULO RELATÓRIOS =====
// Extraído de prattus.html pra deixar o arquivo principal menor.
// Usa as mesmas variáveis/funções globais do arquivo principal (db, restauranteAtual,
// esc, toast, dataDoBanco, dataBR, diaSemanaBR, horaBR).

async function renderRelatorios(dataInicio = null, dataFim = null, filtroTipo = 'todos') {
  if (!restauranteAtual) return;
  const rid = restauranteAtual.id;
  relEstado = { inicio: dataInicio, fim: dataFim, tipo: filtroTipo };

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
  const inicioAno = new Date(hoje.getFullYear(), 0, 1).toISOString();
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59).toISOString();

  // Período personalizado ou mês atual
  const periodoInicio = dataInicio ? new Date(dataInicio).toISOString() : inicioMes;
  const periodoFim = dataFim ? new Date(dataFim + 'T23:59:59').toISOString() : fimHoje;

  // Período anterior de mesmo tamanho, pra comparação
  const duracaoMs = new Date(periodoFim) - new Date(periodoInicio);
  const periodoAnteriorFim = new Date(new Date(periodoInicio) - 1);
  const periodoAnteriorInicio = new Date(periodoAnteriorFim.getTime() - duracaoMs);

  const [{ data: pedPeriodoRaw }, { data: pedAno }, { data: pedAnterior }] = await Promise.all([
    db.from('pedidos').select('id,total,criado_em,codigo_comanda_id').eq('restaurante_id', rid).in('status', ['preparando','entrega','entregue']).gte('criado_em', periodoInicio).lte('criado_em', periodoFim),
    db.from('pedidos').select('total,criado_em').eq('restaurante_id', rid).in('status', ['preparando','entrega','entregue']).gte('criado_em', inicioAno),
    db.from('pedidos').select('total').eq('restaurante_id', rid).in('status', ['preparando','entrega','entregue']).gte('criado_em', periodoAnteriorInicio.toISOString()).lte('criado_em', periodoAnteriorFim.toISOString())
  ]);

  // Filtro Pedidos/Comanda aplicado por cima dos dados do período
  const pedPeriodoTudo = pedPeriodoRaw || [];
  const pedPeriodo = filtroTipo === 'pedidos' ? pedPeriodoTudo.filter(p => !p.codigo_comanda_id)
    : filtroTipo === 'comandas' ? pedPeriodoTudo.filter(p => !!p.codigo_comanda_id)
    : pedPeriodoTudo;

  const fatPeriodo = (pedPeriodo||[]).reduce((s,p) => s+parseFloat(p.total||0),0);
  const fatAno = (pedAno||[]).reduce((s,p) => s+parseFloat(p.total||0),0);
  const ticketMedio = (pedPeriodo||[]).length ? fatPeriodo / (pedPeriodo||[]).length : 0;

  const fatAnterior = (pedAnterior||[]).reduce((s,p) => s+parseFloat(p.total||0),0);
  const variacaoFat = fatAnterior > 0 ? ((fatPeriodo - fatAnterior) / fatAnterior * 100) : (fatPeriodo > 0 ? 100 : 0);
  const variacaoTxt = fatAnterior > 0
    ? `${variacaoFat >= 0 ? '↑' : '↓'} ${Math.abs(variacaoFat).toFixed(0)}% vs período anterior`
    : (fatPeriodo > 0 ? 'Sem dados do período anterior pra comparar' : '');

  // Últimos 7 dias corridos, terminando na data final do período filtrado — sempre no fuso de Brasília
  const fimBase = new Date(periodoFim);
  const janela7dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(fimBase); d.setDate(d.getDate() - i);
    janela7dias.push(dataBR(d));
  }
  const pedUltimos7 = (pedPeriodo||[]).filter(p => janela7dias.includes(dataBR(dataDoBanco(p.criado_em))));

  const dias = janela7dias.map(ds => {
    const dTemp = new Date(ds + 'T12:00:00'); // meio-dia evita virar de data em conversões
    const fat = pedUltimos7.filter(p => dataBR(dataDoBanco(p.criado_em)) === ds).reduce((s,p) => s+parseFloat(p.total||0),0);
    return { label: diaSemanaBR(dTemp), fat };
  });
  const maxFat = Math.max(...dias.map(d => d.fat), 1);

  // Itens mais pedidos — mesma janela de 7 dias, respeitando o filtro Pedidos/Comanda
  const { data: itensPed } = await db.from('pedido_itens').select('nome,quantidade,pedido_id')
    .in('pedido_id', pedUltimos7.map(p=>p.id));
  const demanda = {};
  (itensPed||[]).forEach(i => { demanda[i.nome] = (demanda[i.nome]||0) + i.quantidade; });
  const demandaOrdenada = Object.entries(demanda).sort((a,b) => b[1]-a[1]);

  // Horário de pico: quantidade de pedidos por hora do dia (fuso de Brasília)
  const contagemHora = new Array(24).fill(0);
  (pedPeriodo||[]).forEach(p => {
    contagemHora[horaBR(dataDoBanco(p.criado_em))]++;
  });
  const maxPedidosHora = Math.max(...contagemHora, 1);
  const horaPico = contagemHora.indexOf(Math.max(...contagemHora));

  const labelPeriodo = dataInicio ? `${dataInicio} a ${dataFim||'hoje'}` : 'Este mês';

  document.getElementById('conteudo').innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-titulo">Filtrar por período</div>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div class="form-group" style="margin:0;flex:1;min-width:140px;">
          <label style="font-size:12px;">Data inicial</label>
          <input type="date" id="rel-inicio" value="${dataInicio||''}" style="padding:8px 10px;border:1px solid var(--creme-borda);border-radius:8px;font-size:13px;width:100%;">
        </div>
        <div class="form-group" style="margin:0;flex:1;min-width:140px;">
          <label style="font-size:12px;">Data final</label>
          <input type="date" id="rel-fim" value="${dataFim||''}" style="padding:8px 10px;border:1px solid var(--creme-borda);border-radius:8px;font-size:13px;width:100%;">
        </div>
        <button class="btn btn-laranja" style="width:auto;padding:10px 20px;" onclick="filtrarRelatorio()">Filtrar</button>
        <button class="btn btn-outline" style="width:auto;padding:10px 20px;" onclick="relatorioEsteMes()">Este mês</button>
        <button class="btn btn-outline" style="width:auto;padding:10px 20px;" onclick="exportarRelatorio()">⬇ Exportar</button>
      </div>
    </div>

    <div class="metricas" style="margin-bottom:24px;">
      <div class="metrica"><div class="metrica-label">Faturamento (${labelPeriodo})</div><div class="metrica-val laranja">R$ ${fatPeriodo.toFixed(2).replace('.',',')}</div>${variacaoTxt ? `<div style="font-size:11px;font-weight:600;margin-top:2px;color:${variacaoFat>=0?'#0F6E56':'#C0392B'};">${variacaoTxt}</div>` : ''}</div>
      <div class="metrica"><div class="metrica-label">Pedidos no período</div><div class="metrica-val">${(pedPeriodo||[]).length}</div></div>
      <div class="metrica"><div class="metrica-label">Ticket médio</div><div class="metrica-val">R$ ${ticketMedio.toFixed(2).replace('.',',')}</div></div>
      <div class="metrica"><div class="metrica-label">Faturamento do ano</div><div class="metrica-val">R$ ${fatAno.toFixed(2).replace('.',',')}</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <div class="card-titulo" style="margin-bottom:0;">Vendas — últimos 7 dias</div>
          <div style="display:flex;gap:4px;">
            <button class="btn-sm" onclick="filtrarRelatorioTipo('todos')" style="padding:4px 10px;font-size:11px;${filtroTipo==='todos'?'background:var(--laranja);color:#fff;border:none;':''}">Todos</button>
            <button class="btn-sm" onclick="filtrarRelatorioTipo('pedidos')" style="padding:4px 10px;font-size:11px;${filtroTipo==='pedidos'?'background:var(--laranja);color:#fff;border:none;':''}">Pedidos</button>
            <button class="btn-sm" onclick="filtrarRelatorioTipo('comandas')" style="padding:4px 10px;font-size:11px;${filtroTipo==='comandas'?'background:var(--laranja);color:#fff;border:none;':''}">Comanda</button>
          </div>
        </div>
        <div class="barras">
          ${dias.map(d => `
            <div class="barra-wrap">
              <div class="barra" style="height:${Math.max(4, (d.fat/maxFat)*100)}px" title="R$ ${d.fat.toFixed(2)}"></div>
              <div class="barra-label">${d.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <div class="card-titulo" style="margin-bottom:0;">Itens mais pedidos — últimos 7 dias</div>
          <div style="display:flex;gap:4px;">
            <button class="btn-sm" onclick="filtrarRelatorioTipo('todos')" style="padding:4px 10px;font-size:11px;${filtroTipo==='todos'?'background:var(--laranja);color:#fff;border:none;':''}">Todos</button>
            <button class="btn-sm" onclick="filtrarRelatorioTipo('pedidos')" style="padding:4px 10px;font-size:11px;${filtroTipo==='pedidos'?'background:var(--laranja);color:#fff;border:none;':''}">Pedidos</button>
            <button class="btn-sm" onclick="filtrarRelatorioTipo('comandas')" style="padding:4px 10px;font-size:11px;${filtroTipo==='comandas'?'background:var(--laranja);color:#fff;border:none;':''}">Comanda</button>
          </div>
        </div>
        ${demandaOrdenada.length === 0 ? '<div class="empty-txt">Sem dados ainda</div>' :
          demandaOrdenada.slice(0,6).map(([nome, qtd]) => `
            <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--creme-borda);">
              <div style="flex:1;font-size:13px;">${esc(nome)}</div>
              <div style="width:80px;height:6px;background:var(--creme);border-radius:3px;overflow:hidden;">
                <div style="height:100%;background:var(--laranja);width:${(qtd/demandaOrdenada[0][1]*100)}%;border-radius:3px;"></div>
              </div>
              <div style="font-size:12px;color:var(--texto-muted);min-width:28px;text-align:right;">${qtd}x</div>
            </div>
          `).join('')
        }
        ${demandaOrdenada.length > 0 ? `
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--creme-borda);">
            <div style="font-size:12px;color:var(--texto-muted);">Menos pedido: <strong>${esc(demandaOrdenada[demandaOrdenada.length-1]?.[0])||'-'}</strong></div>
          </div>
        ` : ''}
      </div>
    </div>

    <div class="card" style="margin-top:20px;">
      <div class="card-titulo">⏰ Horário de pico</div>
      <div style="font-size:12px;color:var(--texto-muted);margin-bottom:12px;">Quando os pedidos mais chegam — use isso pra organizar escala e estoque. Pico às <strong>${String(horaPico).padStart(2,'0')}h</strong>.</div>
      <div class="barras" style="height:70px;">
        ${contagemHora.map((qtd, h) => `
          <div class="barra-wrap" style="${h%2!==0?'opacity:0.55;':''}">
            <div class="barra" style="height:${qtd > 0 ? Math.max(3, (qtd/maxPedidosHora)*60) : 0}px;${h===horaPico?'background:var(--laranja-dark);':''}" title="${String(h).padStart(2,'0')}h — ${qtd} pedido(s)"></div>
            <div class="barra-label" style="font-size:9px;">${h%3===0?String(h).padStart(2,'0'):''}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

let relEstado = { inicio: null, fim: null, tipo: 'todos' };

function filtrarRelatorio() {
  const inicio = document.getElementById('rel-inicio').value;
  const fim = document.getElementById('rel-fim').value;
  if (!inicio) { toast('Selecione a data inicial!', 'erro'); return; }
  relEstado.inicio = inicio; relEstado.fim = fim || inicio;
  renderRelatorios(relEstado.inicio, relEstado.fim, relEstado.tipo);
}

function filtrarRelatorioTipo(tipo) {
  relEstado.tipo = tipo;
  renderRelatorios(relEstado.inicio, relEstado.fim, tipo);
}

function relatorioEsteMes() {
  relEstado = { inicio: null, fim: null, tipo: 'todos' };
  renderRelatorios();
}
