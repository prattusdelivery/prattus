/* ServiDelivery — aceite dos Termos de Uso
   - Cadastro: caixinha "Li e aceito os Termos de Uso" (obrigatória)
   - Quem já usa e ainda não aceitou vê uma tela única de aceite (só o dono)
   - A prova (data/hora, versão, IP) é guardada pelo servidor, na tabela aceites_termos */
var TERMOS_VERSAO = '1';

function termosGateAtivo() {
  return !!(typeof restauranteAtual !== 'undefined' && restauranteAtual);
}

function termosCadastroAtivo() {
  return true;
}

async function termosChamar(acao, restauranteId, extra) {
  var sess = await db.auth.getSession();
  var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
  if (!token) throw new Error('sem sessão');
  var corpo = Object.assign({ acao: acao, restauranteId: restauranteId, tokenDono: token, versao: TERMOS_VERSAO }, extra || {});
  var resp = await fetch('/api/equipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  var dados = await resp.json().catch(function () { return {}; });
  if (!resp.ok) throw new Error(dados.error || 'erro');
  return dados;
}

// Registra o aceite no servidor. Devolve true se deu certo.
async function termosRegistrar(restauranteId, origem) {
  try {
    await termosChamar('registrar_aceite', restauranteId, { origem: origem });
    try { sessionStorage.setItem('termos_ok_' + restauranteId + '_' + TERMOS_VERSAO, '1'); } catch (e) {}
    return true;
  } catch (e) { return false; }
}

// Verifica se o dono já aceitou esta versão. Se a verificação falhar, NÃO bloqueia ninguém.
async function termosVerificar() {
  if (!termosGateAtivo()) return;
  if (typeof meuPapel === 'undefined' || meuPapel !== 'dono') return;
  var id = restauranteAtual.id;
  try { if (sessionStorage.getItem('termos_ok_' + id + '_' + TERMOS_VERSAO) === '1') return; } catch (e) {}
  try {
    var r = await termosChamar('consultar_aceite', id);
    if (r.aceito) { try { sessionStorage.setItem('termos_ok_' + id + '_' + TERMOS_VERSAO, '1'); } catch (e) {} return; }
    termosMostrarTela();
  } catch (e) { /* sem internet ou erro: não trava o painel */ }
}

function termosMostrarTela() {
  if (document.getElementById('termos-tela')) return;
  var d = document.createElement('div');
  d.id = 'termos-tela';
  d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(30,20,10,.72);display:flex;align-items:center;justify-content:center;padding:16px;';
  d.innerHTML =
    '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:24px 22px;box-shadow:0 20px 50px rgba(0,0,0,.35);font-family:inherit;">' +
      '<div style="font-size:20px;font-weight:700;color:#2B1F14;margin-bottom:8px;">Termos de Uso</div>' +
      '<div style="font-size:14px;color:#5b4a3a;line-height:1.5;margin-bottom:16px;">Para continuar usando o ServiDelivery, leia e aceite os Termos de Uso.</div>' +
      '<a href="/termos.html" target="_blank" rel="noopener" style="display:block;text-align:center;padding:12px;border:1.5px solid var(--laranja,#E8673C);color:var(--laranja-dark,#C4522E);border-radius:10px;font-weight:600;text-decoration:none;font-size:14px;margin-bottom:16px;">📄 Ler os Termos de Uso</a>' +
      '<label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;color:#2B1F14;cursor:pointer;line-height:1.4;margin-bottom:16px;">' +
        '<input type="checkbox" id="termos-check" style="margin-top:2px;flex:none;width:18px;height:18px;" onchange="var b=document.getElementById(\'termos-btn\');b.disabled=!this.checked;b.style.opacity=this.checked?1:.45;">' +
        '<span>Li e aceito os Termos de Uso</span>' +
      '</label>' +
      '<button id="termos-btn" class="btn btn-laranja" disabled style="width:100%;opacity:.45;" onclick="termosAceitarClique()">Aceitar e continuar</button>' +
      '<div id="termos-msg" style="font-size:13px;color:#b3261e;margin-top:10px;min-height:16px;"></div>' +
      '<div style="text-align:center;margin-top:6px;"><a href="#" onclick="event.preventDefault();sair();document.getElementById(\'termos-tela\')&&document.getElementById(\'termos-tela\').remove();" style="font-size:13px;color:#8a7766;">Sair</a></div>' +
    '</div>';
  document.body.appendChild(d);
}

async function termosAceitarClique() {
  var btn = document.getElementById('termos-btn');
  var msg = document.getElementById('termos-msg');
  if (!document.getElementById('termos-check').checked) return;
  btn.disabled = true; btn.textContent = 'Salvando...'; msg.textContent = '';
  var ok = await termosRegistrar(restauranteAtual.id, 'tela_login');
  if (ok) { var t = document.getElementById('termos-tela'); if (t) t.remove(); return; }
  btn.disabled = false; btn.textContent = 'Aceitar e continuar';
  msg.textContent = 'Não deu certo. Confira a internet e tente de novo.';
}

(function () {
  var e = document.getElementById('campo-termos');
  if (e && termosCadastroAtivo()) e.style.display = 'flex';
})();
