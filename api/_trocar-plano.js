import { reportarErro } from './_sentry.js';
import { TABELA_PRECOS } from './_precos.js';
// (Fica como arquivo com _ para não contar como função extra na Vercel: o limite do plano é 12.)
// O dono troca o plano da própria loja: Simples <-> Completo.
// - Teste grátis / sem assinatura: troca na hora, sem custo.
// - Assinante: SOBE para o Completo pagando na hora só os dias que faltam (diferença proporcional, mensal ou anual);
//   o Completo liga quando o pagamento é confirmado. DESCE para o Simples a partir da próxima cobrança.
// Quem decide tudo é o servidor: o dono não consegue mudar o próprio plano direto no banco.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';
const ASAAS_BASE = 'https://api.asaas.com/v3';

// Dias que faltam até a próxima cobrança (base: data guardada no pagamento; senão, a data da assinatura no Asaas)
function diasQueFaltam(rest, assinatura, diasCiclo) {
  const base = rest.proxima_cobranca || (assinatura && assinatura.nextDueDate) || null;
  if (!base) return diasCiclo;
  const dias = Math.ceil((new Date(base).getTime() - Date.now()) / 86400000);
  if (!(dias > 0)) return 0;
  return Math.min(dias, diasCiclo);
}

// Chamado pelo aviso do Asaas quando a cobrança da diferença é paga: liga o Completo e acerta o valor da assinatura
export async function ativarCompletoPago(restauranteId) {
  const svc = {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
  };
  const asaasHeaders = { 'Content-Type': 'application/json', 'access_token': process.env.ASAAS_API_KEY || '' };
  const rResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${encodeURIComponent(restauranteId)}&select=id,plano_painel`, { headers: svc });
  const rData = await rResp.json();
  const rest = Array.isArray(rData) ? rData[0] : null;
  if (!rest || rest.plano_painel === 'completo') return false; // já está no Completo (aviso repetido): nada a fazer

  const sResp = await fetch(`${ASAAS_BASE}/subscriptions?externalReference=${encodeURIComponent(rest.id)}&status=ACTIVE&limit=10`, { headers: asaasHeaders });
  const sData = await sResp.json();
  const assinatura = sResp.ok && Array.isArray(sData.data) && sData.data.length ? sData.data[0] : null;
  if (assinatura) {
    const ciclo = assinatura.cycle === 'YEARLY' ? 'anual' : 'mensal';
    const r = await fetch(`${ASAAS_BASE}/subscriptions/${assinatura.id}`, {
      method: 'POST', headers: asaasHeaders,
      body: JSON.stringify({ value: TABELA_PRECOS.completo[ciclo], updatePendingPayments: true })
    });
    if (!r.ok) throw new Error('Asaas não aceitou o novo valor da assinatura: ' + (await r.text()));
  }
  const p = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${rest.id}`, {
    method: 'PATCH', headers: { ...svc, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ plano_painel: 'completo', plano_painel_proximo: null })
  });
  if (!p.ok) throw new Error('Falha ao ligar o Completo: ' + (await p.text()));
  return true;
}

export async function trocarPlano(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Chave de serviço não configurada' });

  const svc = {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
  };
  const asaasHeaders = { 'Content-Type': 'application/json', 'access_token': process.env.ASAAS_API_KEY || '' };

  try {
    const { restauranteId, plano, tokenDono, simular } = req.body || {};
    if (!restauranteId || !tokenDono || (plano !== 'completo' && plano !== 'simples')) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // 1) Quem está pedindo precisa ser o dono desta loja
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${tokenDono}` }
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Sessão inválida. Entre de novo no painel.' });
    const user = await userResp.json();

    const rResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${encodeURIComponent(restauranteId)}&select=id,user_id,plano_ativo,plano_tipo,plano_painel,plano_painel_proximo,preco_mensal_travado,proxima_cobranca`, { headers: svc });
    const rData = await rResp.json();
    const rest = Array.isArray(rData) ? rData[0] : null;
    if (!rest) return res.status(404).json({ error: 'Restaurante não encontrado' });
    if (rest.user_id !== user.id) return res.status(403).json({ error: 'Só o dono da loja pode trocar de plano.' });

    // Lojas com preço combinado (antigas) não trocam por aqui
    if (parseFloat(rest.preco_mensal_travado) > 0) {
      return res.status(409).json({ error: 'Seu plano tem preço combinado. Para mudar, fale com o suporte.' });
    }

    const atual = rest.plano_painel === 'simples' ? 'simples' : 'completo';
    const patch = async (corpo) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${rest.id}`, {
        method: 'PATCH', headers: { ...svc, 'Prefer': 'return=minimal' }, body: JSON.stringify(corpo)
      });
      if (!r.ok) throw new Error('Falha ao salvar o plano: ' + (await r.text()));
    };

    // 2) Sem assinatura ativa (teste grátis ou ainda não assinou): troca na hora
    if (!rest.plano_ativo) {
      if (simular) return res.status(200).json({ simulacao: true, efeito: 'imediato', de: atual, para: plano });
      await patch({ plano_painel: plano, plano_painel_proximo: null });
      return res.status(200).json({ ok: true, efeito: 'imediato', plano });
    }

    // 3) Assinante: precisa achar a assinatura no Asaas
    let assinatura = null;
    if (process.env.ASAAS_API_KEY) {
      const sResp = await fetch(`${ASAAS_BASE}/subscriptions?externalReference=${encodeURIComponent(rest.id)}&status=ACTIVE&limit=10`, { headers: asaasHeaders });
      const sData = await sResp.json();
      if (sResp.ok && Array.isArray(sData.data) && sData.data.length) assinatura = sData.data[0];
    }

    const proximo = rest.plano_painel_proximo || null;

    // Nada a mudar (já está nesse plano e sem mudança marcada)
    if (plano === atual && !proximo) {
      return res.status(200).json({ ok: true, efeito: 'nenhum', plano });
    }

    if (!assinatura) {
      // Sem assinatura no Asaas (ex.: liberada à mão pelo Super Admin)
      if (plano === 'simples') {
        if (simular) return res.status(200).json({ simulacao: true, efeito: 'imediato', semAssinatura: true });
        await patch({ plano_painel: 'simples', plano_painel_proximo: null });
        return res.status(200).json({ ok: true, efeito: 'imediato', plano });
      }
      return res.status(409).json({ error: 'Não achei sua assinatura automática. Fale com o suporte para subir para o Completo.' });
    }

    const ciclo = assinatura.cycle === 'YEARLY' ? 'anual' : 'mensal';
    const valorCompleto = TABELA_PRECOS.completo[ciclo];
    const valorSimples = TABELA_PRECOS.simples[ciclo];
    const dataProxima = assinatura.nextDueDate || null;

    const atualizarValor = async (novoValor) => {
      const r = await fetch(`${ASAAS_BASE}/subscriptions/${assinatura.id}`, {
        method: 'POST', headers: asaasHeaders,
        body: JSON.stringify({ value: novoValor, updatePendingPayments: true })
      });
      const d = await r.json();
      if (!r.ok) throw Object.assign(new Error('Asaas não aceitou a mudança de valor'), { detalhe: d });
    };

    // SUBIR para o Completo (ou desfazer uma volta ao Simples que estava marcada)
    if (plano === 'completo') {
      const subindo = atual === 'simples';
      if (!subindo) {
        // Estava só marcado para voltar ao Simples: desfaz (continua no Completo, sem cobrar nada)
        if (simular) return res.status(200).json({ simulacao: true, efeito: 'imediato', desfezVolta: true, cobrarAgora: 0, dias: 0 });
        await atualizarValor(valorCompleto);
        await patch({ plano_painel_proximo: null });
        return res.status(200).json({ ok: true, efeito: 'imediato', plano: 'completo', ciclo, valorNovo: valorCompleto, desfezVolta: true });
      }
      // Quem sobe paga NA HORA só os dias que faltam até a próxima cobrança (diferença proporcional)
      const diasCiclo = ciclo === 'anual' ? 365 : 30;
      const dias = diasQueFaltam(rest, assinatura, diasCiclo);
      const diferenca = Math.round((valorCompleto - valorSimples) * 100) / 100;
      let cobrarAgora = Math.round(diferenca * dias / diasCiclo * 100) / 100;
      if (cobrarAgora < 5) cobrarAgora = 0; // o Asaas não cobra menos que R$ 5: nesses poucos dias liga sem cobrar
      if (simular) return res.status(200).json({ simulacao: true, efeito: cobrarAgora > 0 ? 'aguardando_pagamento' : 'imediato', ciclo, valorNovo: valorCompleto, cobrarAgora, dias, diasCiclo, assinaturaId: assinatura.id, proxima: dataProxima });

      if (cobrarAgora > 0) {
        // O Completo só liga quando o pagamento for confirmado (o aviso do Asaas chama ativarCompletoPago)
        const hoje = new Date().toISOString().split('T')[0];
        const pResp = await fetch(`${ASAAS_BASE}/payments`, {
          method: 'POST', headers: asaasHeaders,
          body: JSON.stringify({
            customer: assinatura.customer, billingType: 'UNDEFINED', value: cobrarAgora, dueDate: hoje,
            description: `Diferença do plano Completo (${ciclo}) - ${dias} dia${dias === 1 ? '' : 's'} - ServiDelivery`,
            externalReference: `upgrade:${rest.id}`
          })
        });
        const pData = await pResp.json();
        if (!pResp.ok || !pData.invoiceUrl) {
          return res.status(500).json({ error: 'Não consegui gerar a cobrança da diferença. Nada foi alterado.', detalhe: pData });
        }
        return res.status(200).json({ ok: true, efeito: 'aguardando_pagamento', plano: 'completo', ciclo, cobrarAgora, dias, valorNovo: valorCompleto, checkoutUrl: pData.invoiceUrl, proxima: dataProxima });
      }
      // Faltam poucos dias: liga na hora, sem cobrança
      await atualizarValor(valorCompleto);
      await patch({ plano_painel: 'completo', plano_painel_proximo: null });
      return res.status(200).json({ ok: true, efeito: 'imediato', plano: 'completo', ciclo, valorNovo: valorCompleto, cobrarAgora: 0, dias, proxima: dataProxima });
    }

    // DESCER para o Simples: só a partir da próxima cobrança
    if (simular) return res.status(200).json({ simulacao: true, efeito: 'proxima_cobranca', ciclo, valorNovo: valorSimples, assinaturaId: assinatura.id, proxima: dataProxima });
    await atualizarValor(valorSimples);
    await patch({ plano_painel_proximo: 'simples' });
    return res.status(200).json({ ok: true, efeito: 'proxima_cobranca', plano: 'simples', ciclo, valorNovo: valorSimples, proxima: dataProxima });
  } catch (e) {
    await reportarErro(e, 'trocar-plano');
    return res.status(500).json({ error: 'Erro ao trocar o plano. Tente de novo ou fale com o suporte.', detalhe: e.message });
  }
}
