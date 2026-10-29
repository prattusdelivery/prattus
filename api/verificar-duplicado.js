import { reportarErro } from './_sentry.js';
import crypto from 'crypto';
// Confere se um CPF/CNPJ ou WhatsApp já usou o teste grátis antes, sem precisar
// abrir leitura pública nenhuma na tabela protegida de documentos.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Assinatura dos pedidos de impressão do QZ Tray (impressão separada cozinha/bebida).
  // Fica aqui pra não passar do limite de funções do plano do Vercel.
  if (req.body && typeof req.body === 'object' && req.body.qz_request !== undefined) {
    return assinarQz(req, res);
  }

  try {
    const { cpfCnpj, whatsapp } = req.body || {};
    if (!cpfCnpj && !whatsapp) {
      return res.status(400).json({ error: 'Informe cpfCnpj ou whatsapp' });
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Chave de serviço não configurada' });
    }

    const headers = {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    let duplicado = false;

    if (cpfCnpj) {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/restaurante_privado?cpf_cnpj=eq.${encodeURIComponent(cpfCnpj)}&select=restaurante_id&limit=1`, { headers });
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) duplicado = true;
    }

    if (!duplicado && whatsapp) {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/restaurantes?whatsapp=eq.${encodeURIComponent(whatsapp)}&select=id&limit=1`, { headers });
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) duplicado = true;
    }

    return res.status(200).json({ duplicado });
  } catch (e) {
    await reportarErro(e, 'verificar-duplicado');
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}

// Só assina para quem está logado no painel (token do Supabase). A chave privada fica só no Vercel
// (variável QZ_CHAVE_PRIVADA) — nunca vai para o navegador.
async function assinarQz(req, res) {
  res.setHeader('Cache-Control', 'no-store');
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
  const texto = req.body.qz_request;
  if (!texto || typeof texto !== 'string' || texto.length > 200000) return res.status(400).send('Pedido inválido');
  try {
    return res.status(200).send(crypto.createSign('SHA512').update(texto).sign(chave, 'base64'));
  } catch (e) {
    return res.status(500).send('Erro ao assinar');
  }
}
