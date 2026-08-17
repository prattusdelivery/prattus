// Envia notificação push — tanto de novo pedido/avaliação (pro restaurante) quanto administrativa (pro Super Admin).
// Também envia o e-mail de boas-vindas com o link do vídeo tutorial pra quem acabou de se cadastrar.
import webpush from 'web-push';
import nodemailer from 'nodemailer';

const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

async function enviarBoasVindas(nomeRestaurante, email) {
  if (!process.env.ZOHO_SMTP_EMAIL || !process.env.ZOHO_SMTP_SENHA) {
    return { ok: false, aviso: 'E-mail de boas-vindas não configurado no servidor (faltam variáveis ZOHO_SMTP_EMAIL / ZOHO_SMTP_SENHA)' };
  }
  const linkVideo = process.env.VIDEO_TUTORIAL_URL || null;

  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 587,
    secure: false,
    auth: { user: process.env.ZOHO_SMTP_EMAIL, pass: process.env.ZOHO_SMTP_SENHA }
  });

  const corpoVideo = linkVideo
    ? `<p>Preparamos um vídeo rapidinho mostrando tudo, de A a Z, pra você não perder tempo tentando descobrir sozinho:</p>
       <p><a href="${linkVideo}" style="display:inline-block;background:#E86339;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">▶️ Assistir o vídeo</a></p>`
    : `<p>Em breve te mandamos um vídeo rapidinho mostrando tudo, de A a Z. Qualquer dúvida antes disso, é só chamar no suporte.</p>`;

  await transporter.sendMail({
    from: `"ServiDelivery" <${process.env.ZOHO_SMTP_EMAIL}>`,
    to: email,
    subject: `Bem-vindo ao ServiDelivery, ${nomeRestaurante}! 🎉`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#E86339;">Sua conta está pronta!</h2>
        <p>Seu teste grátis de 14 dias já começou. O cardápio da <b>${nomeRestaurante}</b> já está no ar.</p>
        ${corpoVideo}
        <p style="color:#888;font-size:13px;margin-top:24px;">Precisa de ajuda? Responda este e-mail que a gente te ajuda.</p>
      </div>
    `
  });
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { tipo, restauranteId, titulo, corpo, nomeRestaurante, email } = req.body || {};

    if (tipo === 'boas_vindas') {
      if (!nomeRestaurante || !email) return res.status(400).json({ error: 'nomeRestaurante e email são obrigatórios' });
      const resultado = await enviarBoasVindas(nomeRestaurante, email);
      return res.status(200).json(resultado);
    }

    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Configuração de notificação incompleta no servidor' });
    }
    if (!titulo) return res.status(400).json({ error: 'titulo é obrigatório' });

    webpush.setVapidDetails('mailto:contato@servidelivery.com.br', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

    const headers = {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    let inscricoes = [];
    if (tipo === 'admin') {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?select=id,subscription`, { headers });
      inscricoes = await resp.json();
    } else {
      if (!restauranteId) return res.status(400).json({ error: 'restauranteId é obrigatório' });
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?restaurante_id=eq.${restauranteId}&select=id,subscription`, { headers });
      inscricoes = await resp.json();
    }

    if (!Array.isArray(inscricoes) || inscricoes.length === 0) {
      return res.status(200).json({ ok: true, enviados: 0, aviso: 'Nenhum aparelho inscrito' });
    }

    const payload = JSON.stringify({ titulo, corpo: corpo || '', url: '/prattus.html' });
    const tabela = tipo === 'admin' ? 'admin_push_subscriptions' : 'push_subscriptions';

    let enviados = 0;
    for (const insc of inscricoes) {
      try {
        await webpush.sendNotification(insc.subscription, payload);
        enviados++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${insc.id}`, { method: 'DELETE', headers }).catch(() => {});
        }
      }
    }

    return res.status(200).json({ ok: true, enviados });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
