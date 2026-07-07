// pages/api/odoo/summary.js
import { Redis } from '@upstash/redis';
import { odooExecute, getOdooLogin } from '../../../lib/odoo';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const CACHE_TTL = 300;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { clave } = req.query;
  if (!clave) return res.status(400).json({ error: 'Falta parametro: clave' });

  if (!process.env.ODOO_URL || !process.env.ODOO_DB || !process.env.ODOO_API_KEY) {
    return res.status(200).json({ clave, sinDatosOdoo: true, razon: 'credenciales no configuradas' });
  }

  const cacheKey = `odoo:summary:${clave}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json({ ...cached, fromCache: true });
  } catch {}

  const odooLogin = getOdooLogin(clave);
  if (!odooLogin) {
    return res.status(200).json({ clave, sinDatosOdoo: true, razon: 'vendedor no mapeado en ODOO_USER_MAP' });
  }

  try {
    const users = await odooExecute(
      'res.users', 'search_read',
      [[ [['login', '=', odooLogin]] ]],
      { fields: ['id', 'name'], limit: 1 }
    );
    if (!users || !users.length) {
      return res.status(200).json({ clave, sinDatosOdoo: true, razon: `Usuario "${odooLogin}" no encontrado en Odoo` });
    }
    const odooUserId = users[0].id;
    const vendorName = users[0].name;

    const leads = await odooExecute(
      'crm.lead', 'search_read',
      [[ [
        ['user_id', '=', odooUserId],
        ['active', '=', true],
        ['type', '=', 'opportunity'],
      ] ]],
      {
        fields: ['name','stage_id','partner_id','planned_revenue','date_deadline','probability','date_last_stage_update','activity_date_deadline'],
        limit: 100,
        order: 'date_last_stage_update asc',
      }
    );

    const hoy = new Date();
    const porEtapa = {};
    const varadas = [];
    for (const lead of leads) {
      const etapa = lead.stage_id?.[1] || 'Sin etapa';
      porEtapa[etapa] = (porEtapa[etapa] || 0) + 1;
      if (lead.date_last_stage_update) {
        const diasSinMov = Math.floor((hoy - new Date(lead.date_last_stage_update)) / 86400000);
        if (diasSinMov >= 7 && !lead.activity_date_deadline) {
          varadas.push({
            id: lead.id,
            nombre: lead.name,
            cliente: lead.partner_id?.[1] || 'Sin cliente',
            etapa,
            diasSinMovimiento: diasSinMov,
          });
        }
      }
    }
    varadas.sort((a, b) => b.diasSinMovimiento - a.diasSinMovimiento);
    const varadasTop = varadas.slice(0, 5);

    const ayerStr = new Date(hoy.getTime() - 86400000).toISOString().split('T')[0];
    const actVencidas = await odooExecute(
      'mail.activity', 'search_read',
      [[ [
        ['user_id', '=', odooUserId],
        ['date_deadline', '<=', ayerStr],
      ] ]],
      { fields: ['summary','date_deadline','res_name','activity_type_id'], limit: 10 }
    );

    const summary = {
      clave,
      vendedor: vendorName,
      totalOportunidades: leads.length,
      porEtapa,
      varadas: varadasTop,
      actividadesVencidas: (actVencidas || []).map(a => ({
        descripcion: a.summary || a.activity_type_id?.[1] || 'Actividad',
        oportunidad: a.res_name,
        vencio: a.date_deadline,
      })),
      actualizadoEn: hoy.toISOString(),
    };

    try { await redis.set(cacheKey, summary, { ex: CACHE_TTL }); } catch {}
    return res.status(200).json({ ...summary, fromCache: false });
  } catch (err) {
    console.error('[odoo/summary] error:', err.message);
    return res.status(200).json({ clave, sinDatosOdoo: true, razon: err.message });
  }
}
