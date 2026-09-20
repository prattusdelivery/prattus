// Envia erros das funções de servidor pro Sentry, sem precisar de nenhuma biblioteca extra
// (usa a API HTTP direta do Sentry, só com fetch nativo).
const SENTRY_HOST = 'o4512120025382912.ingest.us.sentry.io';
const SENTRY_PROJECT_ID = '4512120060313600';
const SENTRY_PUBLIC_KEY = '4267cc4130ddb320942dab494fd5eacb';

export async function reportarErro(erro, contexto) {
  try {
    const payload = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: 'node',
      level: 'error',
      server_name: 'servidelivery-api',
      tags: { funcao: contexto || 'desconhecida' },
      exception: {
        values: [{
          type: erro?.name || 'Error',
          value: erro?.message || String(erro)
        }]
      },
      extra: { stack: erro?.stack || null }
    };
    await fetch(`https://${SENTRY_HOST}/api/${SENTRY_PROJECT_ID}/store/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${SENTRY_PUBLIC_KEY}, sentry_client=servidelivery-custom/1.0`
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // Nunca deixa o envio do erro quebrar a função original
  }
}
