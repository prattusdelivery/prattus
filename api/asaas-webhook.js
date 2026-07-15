// Recebe o aviso automático da Asaas quando um pagamento é confirmado
// e libera o restaurante correspondente no Supabase (plano_ativo = true).
import webpush from 'web-push';

const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    // Confere se o aviso realmente veio da Asaas (token combinado nas duas pontas)
    const tokenRecebido = req.headers['asaas-access-token'];
    if (!tokenRecebido || tokenRecebido !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const evento = req.body || {};
    const tipo = evento.event;
    const pagamento = evento.payment;

    const eventosQueLiberam = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];
    const eventosQueCancelam = ['PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED'];

    if (eventosQueLiberam.includes(tipo) && pagamento?.externalReference) {
      const restauranteId = pagamento.externalReference;

      const resp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ plano_ativo: true })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return res.status(500).json({ error: 'Erro ao atualizar restaurante no Supabase', detalhe: errText });
      }

      // Registra no histórico, pra alimentar os relatórios de crescimento
      await fetch(`${SUPABASE_URL}/rest/v1/eventos_plano`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ restaurante_id: restauranteId, evento: 'ativado' })
      }).catch(() => {});
    }

    if (eventosQueCancelam.includes(tipo) && pagamento?.externalReference) {
      const restauranteId = pagamento.externalReference;

      await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ plano_ativo: false })
      }).catch(() => {});

      await fetch(`${SUPABASE_URL}/rest/v1/eventos_plano`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ restaurante_id: restauranteId, evento: 'cancelado' })
      }).catch(() => {});

      // Avisa o Super Admin que um assinante cancelou
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        try {
          const svcHeaders = { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` };
          const restResp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?id=eq.${restauranteId}&select=nome`, { headers: svcHeaders });
          const restData = await restResp.json();
          const nomeLoja = Array.isArray(restData) && restData[0] ? restData[0].nome : 'uma loja';

          webpush.setVapidDetails('mailto:contato@servidelivery.com.br', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
          const inscResp = await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?select=id,subscription`, { headers: svcHeaders });
          const inscricoes = await inscResp.json();
          const payload = JSON.stringify({ titulo: '⚠️ Assinante cancelou', corpo: `${nomeLoja} deixou de ser assinante (${tipo}).`, url: '/prattus.html' });
          for (const insc of (Array.isArray(inscricoes) ? inscricoes : [])) {
            webpush.sendNotification(insc.subscription, payload).catch(() => {});
          }
        } catch (e) {}
      }
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
