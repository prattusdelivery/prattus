// Registra a nota (1 a 5) que o cliente deu pro pedido, e alerta o dono se for nota baixa.
import webpush from 'web-push';

const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { pedidoId, nota } = req.body || {};
    const notaNum = parseInt(nota);
    if (!pedidoId || !notaNum || notaNum < 1 || notaNum > 5) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    // Confere se o pedido existe e ainda não foi avaliado
    const buscaResp = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&select=avaliacao,criado_em,restaurante_id`, { headers });
    const buscaData = await buscaResp.json();
    const pedido = Array.isArray(buscaData) ? buscaData[0] : null;

    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (pedido.avaliacao) return res.status(400).json({ error: 'Esse pedido já foi avaliado.' });

    await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ avaliacao: notaNum })
    });

    // Nota baixa (1 ou 2) dispara um alerta separado pro dono, pra ele poder tentar reverter
    if (notaNum <= 2 && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      try {
        webpush.setVapidDetails('mailto:contato@servidelivery.com.br', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
        const inscResp = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?restaurante_id=eq.${pedido.restaurante_id}&select=id,subscription`, { headers });
        const inscricoes = await inscResp.json();
        console.log('DEBUG inscricoes encontradas:', JSON.stringify(inscricoes));
        const payload = JSON.stringify({
          titulo: '⚠️ Avaliação baixa recebida',
          corpo: `Um cliente avaliou o pedido #${pedidoId.slice(-6).toUpperCase()} com ${notaNum} estrela${notaNum>1?'s':''}. Vale a pena entrar em contato.`,
          url: '/prattus.html'
        });
        for (const insc of (Array.isArray(inscricoes) ? inscricoes : [])) {
          await webpush.sendNotification(insc.subscription, payload).catch(e => console.log('DEBUG erro sendNotification:', e.message));
        }
      } catch (e) {
        console.log('DEBUG erro geral no bloco de notificação:', e.message);
      }
    } else {
      console.log('DEBUG não entrou no bloco de notificação. notaNum:', notaNum, 'VAPID_PUBLIC_KEY existe:', !!process.env.VAPID_PUBLIC_KEY, 'VAPID_PRIVATE_KEY existe:', !!process.env.VAPID_PRIVATE_KEY);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
