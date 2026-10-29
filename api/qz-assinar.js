// Assina os pedidos de impressão que o painel manda para o QZ Tray (programa que liga o
// painel às impressoras do computador). Sem essa assinatura o QZ Tray fica perguntando
// "Permitir?" a cada impressão. A chave privada fica só aqui, no Vercel (variável
// QZ_CHAVE_PRIVADA) — nunca vai para o navegador.
// Só assina para quem está logado no painel (token do Supabase), pra ninguém de fora usar.
import crypto from 'crypto';

const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).send('Método não permitido');

  const chave = (process.env.QZ_CHAVE_PRIVADA || '').replace(/\\n/g, '\n').trim();
  if (!chave || !process.env.SUPABASE_SERVICE_KEY) return res.status(500).send('Chave de impressão não configurada');

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).send('Sem login');

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return res.status(401).send('Login inválido');
  } catch (e) {
    return res.status(502).send('Não consegui conferir o login');
  }

  const texto = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body).request; } catch (e) { return ''; } })() : (req.body || {}).request;
  if (!texto || typeof texto !== 'string' || texto.length > 200000) return res.status(400).send('Pedido inválido');

  try {
    const assinatura = crypto.createSign('SHA512').update(texto).sign(chave, 'base64');
    return res.status(200).send(assinatura);
  } catch (e) {
    return res.status(500).send('Erro ao assinar');
  }
}
