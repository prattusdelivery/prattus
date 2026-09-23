// ===== MÓDULO CLIENTES =====
// Extraído de prattus.html pra deixar o arquivo principal menor.
// Usa as mesmas variáveis/funções globais do arquivo principal (db, restauranteAtual,
// esc, toast, abrirModal, fecharModal, gerarCSV, baixarArquivoTexto).

let clienteEditandoId = null;

function editarCliente(id) {
  const c = clientesCache.find(x => x.id === id);
  if (!c) return;
  clienteEditandoId = id;
  document.getElementById('cad-cliente-nome').value = c.nome || '';
  document.getElementById('cad-cliente-telefone').value = c.telefone || '';
  document.getElementById('cad-cliente-nascimento').value = c.data_nascimento || '';
  document.getElementById('cad-cliente-titulo').textContent = 'Editar cliente';
  document.getElementById('cad-cliente-btn-salvar').textContent = 'Salvar alterações';
  abrirModal('modal-cadastro-cliente');
}

function resetarFormCliente() {
  clienteEditandoId = null;
  document.getElementById('cad-cliente-nome').value = '';
  document.getElementById('cad-cliente-telefone').value = '';
  document.getElementById('cad-cliente-nascimento').value = '';
  document.getElementById('cad-cliente-titulo').textContent = 'Cadastrar cliente';
  document.getElementById('cad-cliente-btn-salvar').textContent = 'Cadastrar';
}

async function salvarClienteManual() {
  const nome = document.getElementById('cad-cliente-nome').value.trim();
  const telefone = document.getElementById('cad-cliente-telefone').value.trim();
  const nascimento = document.getElementById('cad-cliente-nascimento').value || null;

  if (!nome || !telefone) {
    toast('Preencha nome e telefone!', 'erro');
    return;
  }

  const { data: existente } = await db.from('clientes').select('id')
    .eq('restaurante_id', restauranteAtual.id).eq('telefone', telefone).maybeSingle();
  if (existente && existente.id !== clienteEditandoId) {
    toast('Já existe um cliente cadastrado com esse telefone.', 'erro');
    return;
  }

  const { error } = clienteEditandoId
    ? await db.from('clientes').update({ nome, telefone, data_nascimento: nascimento }).eq('id', clienteEditandoId)
    : await db.from('clientes').insert({ restaurante_id: restauranteAtual.id, nome, telefone, data_nascimento: nascimento });

  if (error) {
    toast(clienteEditandoId ? 'Erro ao salvar alterações.' : 'Erro ao cadastrar cliente.', 'erro');
    return;
  }

  const mensagemSucesso = clienteEditandoId ? 'Cliente atualizado!' : 'Cliente cadastrado!';
  resetarFormCliente();
  fecharModal('modal-cadastro-cliente');
  toast(mensagemSucesso, 'ok');
  if (paginaAtual === 'dashboard') renderDashboard();
  if (paginaAtual === 'clientes') renderClientes();
}

function enviarPromocao(telefone) {
  const msg = document.getElementById('promo-mensagem').value.trim();
  if (!msg) { toast('Escreva a mensagem da promoção primeiro.', 'erro'); return; }
  if (!telefone) { toast('Esse cliente não tem telefone cadastrado.', 'erro'); return; }
  window.open(`https://wa.me/${telefone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, 'wa_servidelivery');
}

async function resetarSenhaCliente(clienteId, nome) {
  if (!confirm(`Resetar a senha de fidelidade de ${nome}? Na próxima vez que ele consultar os pontos, vai poder criar uma senha nova.`)) return;
  const { error } = await db.from('clientes').update({ senha_hash: null }).eq('id', clienteId);
  if (error) { toast('Erro ao resetar. Tente de novo.', 'erro'); return; }
  toast('Senha resetada!', 'ok');
  renderClientes();
}

function estaAniversarioProximo(dataNasc, diasJanela) {
  if (!dataNasc) return false;
  const nasc = new Date(dataNasc + 'T00:00:00');
  const hoje = new Date();
  for (let i = 0; i <= diasJanela; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    if (d.getMonth() === nasc.getMonth() && d.getDate() === nasc.getDate()) return true;
  }
  return false;
}

function enviarParabens(telefone, nome) {
  if (!telefone) { toast('Esse cliente não tem telefone cadastrado.', 'erro'); return; }
  const msg = `Feliz aniversário, ${nome}! 🎉🎂 Pra comemorar, preparamos uma condição especial pra você hoje. Bora pedir?`;
  window.open(`https://wa.me/${telefone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, 'wa_servidelivery');
}

function enviarRecuperacao(telefone, nome) {
  if (!telefone) { toast('Esse cliente não tem telefone cadastrado.', 'erro'); return; }
  const msg = `Oi, ${nome}! Faz um tempinho que você não pede com a gente e sentimos sua falta 💛 Bora dar uma olhada no cardápio de novo?`;
  window.open(`https://wa.me/${telefone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, 'wa_servidelivery');
}

async function renderClientes() {
  if (!restauranteAtual) return;
  const { data: clientes } = await db.from('clientes').select('*')
    .eq('restaurante_id', restauranteAtual.id).order('total_gasto', {ascending: false});
  clientesCache = clientes || [];
  const { data: recompensas } = await db.from('recompensas').select('*')
    .eq('restaurante_id', restauranteAtual.id).order('pontos_necessarios');
  const { data: itensCardapio } = await db.from('itens').select('id,nome,preco').is('excluido_em', null)
    .eq('restaurante_id', restauranteAtual.id).order('nome');

  // Clientes sumindo: 2+ pedidos, sem comprar há 15 dias ou mais
  const { data: pedidosRecentes } = await db.from('pedidos').select('cliente_id,criado_em')
    .eq('restaurante_id', restauranteAtual.id).not('cliente_id', 'is', null)
    .in('status', ['preparando','entrega','entregue']);
  const ultimaCompraPorCliente = {};
  (pedidosRecentes||[]).forEach(p => {
    const data = dataDoBanco(p.criado_em);
    if (!ultimaCompraPorCliente[p.cliente_id] || data > ultimaCompraPorCliente[p.cliente_id]) {
      ultimaCompraPorCliente[p.cliente_id] = data;
    }
  });
  const agora = new Date();
  const clientesSumindo = (clientes||[])
    .filter(c => (c.total_pedidos||0) >= 2 && ultimaCompraPorCliente[c.id])
    .map(c => {
      const dias = Math.floor((agora - ultimaCompraPorCliente[c.id]) / (1000*60*60*24));
      return { ...c, diasSemComprar: dias };
    })
    .filter(c => c.diasSemComprar >= 15)
    .sort((a,b) => b.diasSemComprar - a.diasSemComprar);

  const aniversariantes = (clientes||[]).filter(c => estaAniversarioProximo(c.data_nascimento, 7));

  document.getElementById('conteudo').innerHTML = `
    ${aniversariantes.length > 0 ? `
    <div class="card" style="margin-bottom:20px;background:var(--laranja-light);border:1.5px dashed var(--laranja);">
      <div class="card-titulo">🎂 Aniversariantes da semana</div>
      ${aniversariantes.map(c => `
        <div class="frete-row">
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">${esc(c.nome)}</div>
            <div style="font-size:12px;color:var(--texto-muted);">${new Date(c.data_nascimento+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long'})}</div>
          </div>
          <button class="btn-sm" onclick="enviarParabens('${c.telefone}','${esc(c.nome).replace(/'/g,"\\'")}')">🎉 Enviar parabéns</button>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${clientesSumindo.length > 0 ? `
    <div class="card" style="margin-bottom:20px;background:#FFF4E5;border:1.5px dashed #E8A33D;">
      <div class="card-titulo">👋 Clientes sumindo</div>
      <div style="font-size:12px;color:var(--texto-muted);margin-bottom:14px;">Já compraram pelo menos 2 vezes, mas estão há 15 dias ou mais sem voltar. Uma mensagem rápida pode trazer de volta.</div>
      ${clientesSumindo.map(c => `
        <div class="frete-row">
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">${esc(c.nome)}</div>
            <div style="font-size:12px;color:var(--texto-muted);">${c.diasSemComprar} dias sem comprar · ${c.total_pedidos} pedidos · R$ ${parseFloat(c.total_gasto||0).toFixed(2).replace('.',',')} no total</div>
          </div>
          <button class="btn-sm" onclick="enviarRecuperacao('${c.telefone}','${esc(c.nome).replace(/'/g,"\\'")}')">💬 Enviar mensagem</button>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="card" style="margin-bottom:20px;">
      <div class="card-titulo">🎁 Recompensas de fidelidade</div>
      <div style="font-size:12px;color:var(--texto-muted);margin-bottom:14px;">O cliente acumula 1 ponto por real gasto. Crie prêmios que ele pode trocar na hora de fechar o pedido.</div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:14px;">
        <select id="rec-item" onchange="preencherDescontoSugerido()">
          <option value="">Escolha um produto do cardápio...</option>
          ${(itensCardapio||[]).map(i => `<option value="${i.id}" data-preco="${i.preco}">${esc(i.nome)}</option>`).join('')}
        </select>
        <input type="number" id="rec-pontos" placeholder="Pontos necessários">
        <input type="number" id="rec-desconto" placeholder="Valor do desconto (R$)" step="0.01">
        <button class="btn-sm" onclick="criarRecompensa()">+ Criar</button>
      </div>
      ${(recompensas||[]).length === 0 ? '<div style="font-size:13px;color:var(--texto-muted);">Nenhuma recompensa criada ainda.</div>' :
        (recompensas||[]).map(r => `
          <div class="frete-row">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;">${esc(r.descricao)}</div>
              <div style="font-size:12px;color:var(--texto-muted);">${r.pontos_necessarios} pontos → R$ ${parseFloat(r.desconto_valor).toFixed(2).replace('.',',')} de desconto</div>
            </div>
            <span style="font-size:11px;padding:3px 8px;border-radius:10px;background:${r.ativo?'#E1F5EE':'#F1EFE8'};color:${r.ativo?'#0F6E56':'#5F5E5A'}">${r.ativo?'Ativa':'Inativa'}</span>
            <button class="btn-sm" onclick="toggleRecompensa('${r.id}',${!r.ativo})">${r.ativo?'Desativar':'Ativar'}</button>
            <button class="btn-sm perigo" onclick="excluirRecompensa('${r.id}')">Excluir</button>
          </div>
        `).join('')
      }
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-titulo">📣 Enviar promoção</div>
      <div style="font-size:12px;color:var(--texto-muted);margin-bottom:10px;">Escreva a mensagem uma vez, e clique em "Enviar" ao lado de cada cliente pra abrir o WhatsApp já com o texto pronto.</div>
      <textarea id="promo-mensagem" rows="2" placeholder="Ex: Hoje é dia de pizza! 20% off até às 22h 🍕" style="width:100%;padding:10px;border:1px solid var(--creme-borda);border-radius:8px;font-size:13px;font-family:inherit;"></textarea>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-titulo">Ranking — maior valor gasto</div>
        ${(clientes||[]).slice(0,5).map((c,i) => `
          <div class="cliente-row">
            <div class="rank-pos">${i+1}</div>
            <div class="cliente-avatar">${esc(c.nome).charAt(0).toUpperCase()}</div>
            <div style="flex:1;">
              <div class="cliente-nome">${esc(c.nome)}</div>
              <div class="cliente-sub">${c.total_pedidos} pedido(s)</div>
            </div>
            <div style="font-size:14px;font-weight:700;color:var(--laranja)">R$ ${parseFloat(c.total_gasto||0).toFixed(2).replace('.',',')}</div>
          </div>
        `).join('') || '<div class="empty-txt">Nenhum cliente ainda</div>'}
      </div>
      <div class="card">
        <div class="card-titulo">Ranking — mais pedidos</div>
        ${[...(clientes||[])].sort((a,b) => b.total_pedidos - a.total_pedidos).slice(0,5).map((c,i) => `
          <div class="cliente-row">
            <div class="rank-pos">${i+1}</div>
            <div class="cliente-avatar">${esc(c.nome).charAt(0).toUpperCase()}</div>
            <div style="flex:1;">
              <div class="cliente-nome">${esc(c.nome)}</div>
              <div class="cliente-sub">R$ ${parseFloat(c.total_gasto||0).toFixed(2).replace('.',',')} gastos</div>
            </div>
            <div style="font-size:14px;font-weight:700;">${c.total_pedidos} pedidos</div>
          </div>
        `).join('') || '<div class="empty-txt">Nenhum cliente ainda</div>'}
      </div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <div class="card-titulo" style="margin-bottom:0;">Todos os clientes</div>
        <div style="display:flex;gap:8px;">
          <input type="text" id="cliente-busca" placeholder="🔍 Buscar por nome ou telefone..." oninput="filtrarClientesLista(this.value)" style="min-width:220px;">
          <button class="btn-sm" onclick="resetarFormCliente();abrirModal('modal-cadastro-cliente')">+ Cadastrar</button>
        </div>
      </div>
      <div id="lista-todos-clientes">${renderClienteLista(clientesCache)}</div>
    </div>
  `;
}

function renderClienteLista(lista) {
  if (!lista.length) return '<div class="empty"><div class="empty-ico">👥</div><div class="empty-txt">Nenhum cliente encontrado</div></div>';
  return lista.map(c => `
          <div class="cliente-row">
            <div class="cliente-avatar">${esc(c.nome).charAt(0).toUpperCase()}</div>
            <div style="flex:1;">
              <div class="cliente-nome">${esc(c.nome)}</div>
              <div class="cliente-sub">${esc(c.email)||''} ${c.telefone?'· '+esc(c.telefone):''}${c.data_nascimento ? ' · 🎂 '+new Date(c.data_nascimento+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}) : ''}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:13px;font-weight:700;color:var(--laranja)">R$ ${parseFloat(c.total_gasto||0).toFixed(2).replace('.',',')}</div>
              <div style="font-size:11px;color:var(--texto-muted)">${c.total_pedidos} pedidos · ${c.pontos} pts</div>
            </div>
            <button class="btn-sm" onclick="editarCliente('${c.id}')" style="margin-left:10px;">✏️ Editar</button>
            <button class="btn-sm" onclick="enviarPromocao('${c.telefone}')" style="margin-left:6px;">📣 Enviar</button>
            ${c.senha_hash ? `<button class="btn-sm" onclick="resetarSenhaCliente('${c.id}','${esc(c.nome).replace(/'/g,"\\'")}')" style="margin-left:6px;" title="Cliente esqueceu a senha de fidelidade">🔑 Resetar senha</button>` : ''}
          </div>
    `).join('');
}

function filtrarClientesLista(termo) {
  const t = termo.trim().toLowerCase();
  const filtrados = !t ? clientesCache : clientesCache.filter(c =>
    (c.nome||'').toLowerCase().includes(t) || (c.telefone||'').replace(/\D/g,'').includes(t.replace(/\D/g,''))
  );
  document.getElementById('lista-todos-clientes').innerHTML = renderClienteLista(filtrados);
}

// ===== RELATORIOS =====
// Relatórios (gráficos, filtros, exportação) agora está em relatorios.js


function gerarCSV(linhas) {
  return linhas.map(linha => linha.map(campo => {
    const txt = String(campo ?? '');
    return /[",;\n]/.test(txt) ? '"' + txt.replace(/"/g,'""') + '"' : txt;
  }).join(';')).join('\r\n');
}

function baixarArquivoTexto(conteudo, nomeArquivo, tipo) {
  const blob = new Blob(['\uFEFF' + conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

async function gerarCodigosComanda() {
  const qtd = parseInt(document.getElementById('qtd-comandas').value);
  if (!qtd || qtd < 1) { toast('Digite a quantidade de códigos.', 'erro'); return; }
  if (qtd > 60) { toast('Máximo de 60 por vez.', 'erro'); return; }

  const linhas = Array.from({length: qtd}, () => ({
    restaurante_id: restauranteAtual.id, status: 'livre',
    codigo_curto: String(Math.floor(100000 + Math.random() * 900000))
  }));
  const { data, error } = await db.from('codigos_comanda').insert(linhas).select();
  if (error) { toast('Erro ao gerar códigos: ' + error.message, 'erro'); return; }

  comandasGeradasCache = data;
  const grid = document.getElementById('comandas-qr-grid');
  let html = '';
  data.forEach((c, i) => {
    const url = `https://servidelivery.com.br/prattus.html?comanda=${c.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
    const barrasUrl = `https://barcodeapi.org/api/128/${c.codigo_curto}`;
    html += `
      <div style="text-align:center;border:1px solid var(--creme-borda);border-radius:10px;padding:12px;">
        <img src="${qrUrl}" width="140" height="140" style="border-radius:6px;">
        <div style="font-size:13px;font-weight:700;margin-top:6px;">Código ${i+1}</div>
        <div style="margin-top:4px;"><a href="${url}" target="_blank" style="font-size:11px;color:var(--texto-muted);">🔗 Abrir/testar link</a></div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--creme-borda);">
          <img src="${barrasUrl}" style="max-width:140px;height:50px;" onerror="this.style.display='none'">
          <div style="font-size:10px;color:var(--texto-muted);margin-top:4px;">pra leitor de código de barras do caixa</div>
        </div>
      </div>
    `;
  });
  grid.innerHTML = html + `<button class="btn btn-outline" style="width:auto;padding:10px 20px;margin-top:10px;" onclick="imprimirComandasGeradas()">🖨️ Imprimir todos (QR + código de barras)</button>`;
  toast(`${qtd} códigos de comanda gerados!`, 'ok');
}

let comandasGeradasCache = [];

function imprimirComandasGeradas() {
  if (!comandasGeradasCache.length) return;
  const html = comandasGeradasCache.map((c, i) => {
    const url = `https://servidelivery.com.br/prattus.html?comanda=${c.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    const barrasUrl = `https://barcodeapi.org/api/128/${c.codigo_curto}`;
    return `
      <div style="display:inline-block;text-align:center;border:1px dashed #999;border-radius:8px;padding:14px;margin:8px;width:220px;page-break-inside:avoid;">
        <img src="${qrUrl}" width="180" height="180">
        <div style="margin-top:12px;padding-top:12px;border-top:1px dashed #ccc;">
          <img src="${barrasUrl}" style="max-width:180px;height:60px;">
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('print-cardapio').innerHTML = `<div style="text-align:center;">${html}</div>`;
  setTimeout(() => window.print(), 300);
}

async function exportarClientesCSV() {
  if (!restauranteAtual) return;
  toast('Gerando arquivo...', 'ok');
  const { data: clientes } = await db.from('clientes').select('*').eq('restaurante_id', restauranteAtual.id).order('total_gasto', {ascending:false});
  const linhas = [['Nome','Telefone','Total gasto','Total de pedidos','Pontos','Aniversário']];
  (clientes||[]).forEach(c => linhas.push([
    c.nome, c.telefone, parseFloat(c.total_gasto||0).toFixed(2).replace('.',','),
    c.total_pedidos, c.pontos, c.data_nascimento ? new Date(c.data_nascimento+'T00:00:00').toLocaleDateString('pt-BR') : ''
  ]));
  baixarArquivoTexto(gerarCSV(linhas), `clientes-${restauranteAtual.nome.replace(/\s+/g,'-')}.csv`, 'text/csv;charset=utf-8');
  toast('Arquivo de clientes baixado!', 'ok');
}

