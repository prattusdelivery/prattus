import { reportarErro } from './_sentry.js';
// Cria, remove ou redefine a senha de um funcionário do restaurante, só se quem chamar for o dono de verdade.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Chave de serviço não configurada' });
  }

  const svcHeaders = {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
  };

  try {
    const { acao, restauranteId, tokenDono } = req.body || {};
    if (!acao || !restauranteId || !tokenDono) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // Confirma que quem está chamando é dono desse restaurante
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenDono}` }
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida. Faça login de novo e tente outra vez.' });
    const userData = await userResp.json();

    const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=user_id`, { headers: svcHeaders });
    const restData = await restResp.json();
    if (!restData?.[0] || restData[0].user_id !== userData.id) {
      return res.status(403).json({ error: 'Só o dono do restaurante pode gerenciar a equipe.' });
    }

    // Aceite dos Termos de Uso: consulta e registro (guarda data/hora, versão e IP no servidor).
    // Fica aqui por causa do limite de funções do plano gratuito da Vercel.
    if (acao === 'consultar_aceite' || acao === 'registrar_aceite') {
      const versao = String(req.body?.versao || '').slice(0, 20);
      if (!versao) return res.status(400).json({ error: 'Versão dos Termos não informada.' });
      const base = `${SUPABASE_URL}/rest/v1/aceites_termos`;
      const jaResp = await fetch(`${base}?restaurante_id=eq.${restauranteId}&versao=eq.${encodeURIComponent(versao)}&select=id,aceito_em&limit=1`, { headers: svcHeaders });
      if (!jaResp.ok) {
        if (acao === 'consultar_aceite') return res.status(200).json({ ok: true, aceito: true, aviso: 'verificação indisponível' }); // nunca trava o painel por falha nossa
        return res.status(500).json({ error: 'Não foi possível registrar o aceite agora.' });
      }
      const ja = await jaResp.json();
      const aceitoEm = Array.isArray(ja) && ja[0] ? ja[0].aceito_em : null;
      if (acao === 'consultar_aceite') return res.status(200).json({ ok: true, aceito: !!aceitoEm, aceito_em: aceitoEm });
      if (aceitoEm) return res.status(200).json({ ok: true, aceito: true, aceito_em: aceitoEm });
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64) || null;
      const origemOk = ['cadastro', 'tela_login'].includes(req.body?.origem) ? req.body.origem : 'outro';
      const insResp = await fetch(base, {
        method: 'POST',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ restaurante_id: restauranteId, user_id: userData.id, versao, ip, user_agent: String(req.headers['user-agent'] || '').slice(0, 300), origem: origemOk })
      });
      if (!insResp.ok) return res.status(500).json({ error: 'Não foi possível registrar o aceite agora.' });
      return res.status(200).json({ ok: true, aceito: true });
    }

    if (acao === 'criar') {
      const { nome, usuario, senha, funcao, nivel } = req.body || {};
      if (!nome || !usuario || !senha) return res.status(400).json({ error: 'Preencha nome, usuário e senha do funcionário.' });
      if (senha.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

      const usuarioLimpo = String(usuario).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (!usuarioLimpo) return res.status(400).json({ error: 'Usuário inválido. Use letras, números, ponto, traço ou underline.' });

      // Usuário precisa ser único em toda a plataforma (é usado pra resolver o login depois)
      const checaResp = await fetch(`${SUPABASE_URL}/rest/v1/usuarios_restaurante?usuario=eq.${encodeURIComponent(usuarioLimpo)}&select=id`, { headers: svcHeaders });
      const checaData = await checaResp.json();
      if (Array.isArray(checaData) && checaData.length > 0) {
        return res.status(400).json({ error: 'Esse nome de usuário já está em uso. Escolha outro.' });
      }

      // E-mail interno sintético — o funcionário nunca vê nem usa isso diretamente, só o "usuário"
      const emailInterno = `${usuarioLimpo}@${restauranteId}.equipe.servidelivery.internal`;

      const criaResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: svcHeaders,
        body: JSON.stringify({ email: emailInterno, password: senha, email_confirm: true, user_metadata: { nome, tipo: 'restaurante' } })
      });
      const criaData = await criaResp.json();
      if (!criaResp.ok) {
        const msg = criaData?.msg || criaData?.error_description || criaData?.message || 'Erro ao criar a conta.';
        return res.status(400).json({ error: msg });
      }

      const vinculoResp = await fetch(`${SUPABASE_URL}/rest/v1/usuarios_restaurante`, {
        method: 'POST',
        headers: { ...svcHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ restaurante_id: restauranteId, user_id: criaData.id, nome, papel: 'funcionario', usuario: usuarioLimpo, funcao: funcao || null, nivel: nivel === 'garcom' ? 'garcom' : 'gerente' })
      });
      if (!vinculoResp.ok) {
        const errText = await vinculoResp.text();
        return res.status(500).json({ error: 'Conta criada, mas houve erro ao vincular ao restaurante.', detalhe: errText });
      }
      return res.status(200).json({ ok: true });
    }

    if (acao === 'remover') {
      const { vinculoId } = req.body || {};
      if (!vinculoId) return res.status(400).json({ error: 'vinculoId é obrigatório' });
      await fetch(`${SUPABASE_URL}/rest/v1/usuarios_restaurante?id=eq.${vinculoId}&restaurante_id=eq.${restauranteId}`, {
        method: 'DELETE', headers: svcHeaders
      });
      return res.status(200).json({ ok: true });
    }

    if (acao === 'redefinir_senha') {
      const { vinculoId, novaSenha } = req.body || {};
      if (!vinculoId || !novaSenha) return res.status(400).json({ error: 'Dados incompletos' });
      if (String(novaSenha).length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

      // Só mexe em funcionário que pertence a ESTE restaurante (o dono já foi confirmado acima)
      const vResp = await fetch(`${SUPABASE_URL}/rest/v1/usuarios_restaurante?id=eq.${encodeURIComponent(vinculoId)}&restaurante_id=eq.${encodeURIComponent(restauranteId)}&select=user_id`, { headers: svcHeaders });
      const vData = await vResp.json();
      const alvoId = Array.isArray(vData) && vData[0] ? vData[0].user_id : null;
      if (!alvoId) return res.status(404).json({ error: 'Funcionário não encontrado.' });

      const upResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${alvoId}`, {
        method: 'PUT', headers: svcHeaders, body: JSON.stringify({ password: String(novaSenha) })
      });
      if (!upResp.ok) {
        const t = await upResp.json().catch(() => ({}));
        return res.status(400).json({ error: t?.msg || t?.message || 'Não foi possível trocar a senha.' });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação desconhecida' });
  } catch (e) {
    await reportarErro(e, 'equipe');
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
