// Confere se um CPF/CNPJ ou WhatsApp já usou o teste grátis antes, sem precisar
// abrir leitura pública nenhuma na tabela protegida de documentos.
const SUPABASE_URL = 'https://qdyhmtccahlqscvrckpx.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
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
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
