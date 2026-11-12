// A webhook receiver on plain node:http that checks the Packagist-Signature header before trusting the body.
//
//   PACKAGIST_WEBHOOK_SECRET=... node examples/webhook-server.ts
//
// In your own code, import from 'private-packagist-api'.

import { createServer } from 'node:http';
import { WEBHOOK_SIGNATURE_HEADER, WebhookSignature } from '../src/index.ts';

const secret = process.env.PACKAGIST_WEBHOOK_SECRET;
if (!secret) {
  console.error('Set PACKAGIST_WEBHOOK_SECRET to the secret of the webhook in Private Packagist.');
  process.exit(2);
}

const webhooks = new WebhookSignature(secret);
const port = Number(process.env.PORT ?? 8080);

createServer(async (request, response) => {
  if (request.method !== 'POST') {
    response.writeHead(405).end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);

  const header = request.headers[WEBHOOK_SIGNATURE_HEADER.toLowerCase()];
  if (!(await webhooks.validate(Array.isArray(header) ? header[0] : header, body))) {
    response.writeHead(401).end();
    return;
  }

  const event = JSON.parse(body.toString('utf8')) as { event?: string };
  console.log(`${new Date().toISOString()} ${event.event ?? 'webhook'}`);
  response.writeHead(204).end();
}).listen(port, () => console.log(`Listening on http://localhost:${port}`));
