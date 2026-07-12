// pages/api/odoo/team.js
// Consolidado del equipo para el modo director.
// Recorre los vendedores del ODOO_USER_MAP, lee el pipeline de cada uno
// y arma un resumen ejecutivo. Cachea 5 min en Redis.

import { Redis } from '@upstash/redis';
import { searchRead } from '../../../lib/odoo';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const CACHE_TTL = 300;
const CACHE_KEY = 'odoo:team';

// El director no se cuenta a sí mismo en el equipo
const EXCLUIR = ['RICARDO'];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.ODOO_URL || !process.env.ODOO_API_KEY) {
    return res.status(200).json({ sinDatosOdoo: true, razon: 'credenciales no configuradas' });
  }

  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return res.status(200).json({ ...cached, fromCache: true });
  } catch {}

  let mapa = {};
  try {
    mapa = JSON.parse(process.env.ODOO_USER_MAP || '{}');
  } catch {
    return res.status(200).json({ sinDatosOdoo: true, razon: 'ODOO_USER_MAP invalido' });
  }

  const claves = Object.keys(mapa).filter((k) => !EXCLUIR.includes(k));
  if (!claves.length) {
    return res.status(200).json({ sinDatosOdoo: true, razon: 'sin vendedores mapeados' });
  }

  try {
    const hoy = new Date();
    const ayerStr = new Date(hoy.getTime() - 86400000).toISOString().split('T')[0];

    // 1. Traer todos los usuarios de Odoo de una sola vez (por sus logins)
    const logins = claves.map((k) => mapa[k]);
    const users = await searchRead(
      'res.users',
      [['login', 'in', logins]],
      { fields: ['id', 'name', 'login'], limit: 100 }
    );

    // login -> {id, name}
    const porLogin = {};
    for (const u of users) porLogin[u.login] = u;

    const userIds = users.map((u) => u.id);
    if (!userIds.length) {
      return res.status(200).json({ sinDatosOdoo: true, razon: 'ningun vendedor encontrado en Odoo' });
    }

    // 2. Traer TODAS las oportunidades del equipo en una sola consulta
    const leads = await searchRead(
      'crm.lead',
      [
        ['user_id', 'in', userIds],
        ['active', '=', true],
        ['type', '=', 'opportunity'],
      ],
      {
        fields: ['name','stage_id','partner_id','user_id','date_last_stage_update','activity_date_deadline'],
        limit: 2000,
      }
    );

    // 3. Traer TODAS las actividades vencidas del equipo
    const actVencidas = await searchRead(
      'mail.activity',
      [
        ['user_id', 'in', userIds],
        ['date_deadline', '<=', ayerStr],
      ],
      { fields: ['user_id','res_name','date_deadline'], limit: 500 }
    );

    // 4. Consolidar por vendedor
    const porVendedor = {};
    for (const clave of claves) {
      const login = mapa[clave];
      const u = porLogin[login];
      if (!u) continue;
      porVendedor[u.id] = {
        clave,
        nombre: u.name,
        totalOportunidades: 0,
        varadas: 0,
        varadaMasCritica: null,
        actividadesVencidas: 0,
        porEtapa: {},
      };
    }

    for (const lead of leads) {
      const uid = lead.user_id && lead.user_id[0];
      const v = porVendedor[uid];
      if (!v) continue;

      v.totalOportunidades++;
      const etapa = lead.stage_id && lead.stage_id[1] ? lead.stage_id[1] : 'Sin etapa';
      v.porEtapa[etapa] = (v.porEtapa[etapa] || 0) + 1;

      if (lead.date_last_stage_update) {
        const dias = Math.floor((hoy - new Date(lead.date_last_stage_update)) / 86400000);
        if (dias >= 7 && !lead.activity_date_deadline) {
          v.varadas++;
          if (!v.varadaMasCritica || dias > v.varadaMasCritica.dias) {
            v.varadaMasCritica = { nombre: lead.name, etapa, dias };
          }
        }
      }
    }

    for (const a of actVencidas) {
      const uid = a.user_id && a.user_id[0];
      const v = porVendedor[uid];
      if (v) v.actividadesVencidas++;
    }

    // 5. Armar el reporte
    const vendedores = Object.values(porVendedor);
    vendedores.sort((a, b) => (b.varadas + b.actividadesVencidas) - (a.varadas + a.actividadesVencidas));

    const totalEquipo = vendedores.reduce((s, v) => s + v.totalOportunidades, 0);
    const totalVaradas = vendedores.reduce((s, v) => s + v.varadas, 0);
    const totalVencidas = vendedores.reduce((s, v) => s + v.actividadesVencidas, 0);

    const etapasEquipo = {};
    for (const v of vendedores) {
      for (const [etapa, n] of Object.entries(v.porEtapa)) {
        etapasEquipo[etapa] = (etapasEquipo[etapa] || 0) + n;
      }
    }

    const reporte = {
      totalVendedores: vendedores.length,
      totalOportunidadesEquipo: totalEquipo,
      totalVaradasEquipo: totalVaradas,
      totalActividadesVencidasEquipo: totalVencidas,
      etapasEquipo,
      enRiesgo: vendedores.slice(0, 5).map((v) => ({
        nombre: v.nombre,
        clave: v.clave,
        oportunidades: v.totalOportunidades,
        varadas: v.varadas,
        actividadesVencidas: v.actividadesVencidas,
        varadaMasCritica: v.varadaMasCritica,
      })),
      vendedores: vendedores.map((v) => ({
        nombre: v.nombre,
        clave: v.clave,
        oportunidades: v.totalOportunidades,
        varadas: v.varadas,
        actividadesVencidas: v.actividadesVencidas,
      })),
      actualizadoEn: hoy.toISOString(),
    };

    try { await redis.set(CACHE_KEY, reporte, { ex: CACHE_TTL }); } catch {}
    return res.status(200).json({ ...reporte, fromCache: false });

  } catch (err) {
    console.error('[odoo/team] error:', err.message);
    return res.status(200).json({ sinDatosOdoo: true, razon: err.message });
  }
}
