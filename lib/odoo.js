// lib/odoo.js
// Comunicación JSON-RPC con Odoo — sin dependencias extra (solo fetch nativo)

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ODOO_URL      = process.env.ODOO_URL;
const ODOO_DB       = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY  = process.env.ODOO_API_KEY;

async function odooRpc(service, method, args) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: { service, method, args },
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Odoo RPC: ${data.error.data?.message || JSON.stringify(data.error)}`);
  }
  return data.result;
}

export async function getOdooUid() {
  const cached = await redis.get('odoo:uid');
  if (cached) return cached;
  const uid = await odooRpc('common', 'authenticate', [
    ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {},
  ]);
  if (!uid) {
    throw new Error('Autenticacion Odoo fallida - revisa ODOO_USERNAME y ODOO_API_KEY');
  }
  await redis.set('odoo:uid', uid, { ex: 28800 });
  return uid;
}

export async function odooExecute(model, method, args = [[]], kwargs = {}) {
  const uid = await getOdooUid();
  return odooRpc('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_API_KEY,
    model, method, args, kwargs,
  ]);
}

export function getOdooLogin(clave) {
  try {
    const map = JSON.parse(process.env.ODOO_USER_MAP || '{}');
    return map[clave] || null;
  } catch {
    return null;
  }
}
