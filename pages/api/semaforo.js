// pages/api/semaforo.js
// Lee el Semáforo Comercial del dashboard (fuente de verdad) y extrae
// solo lo esencial para el agente: score, color y desglose por bloque.
//
// GET /api/semaforo?clave=JORGE_E   -> semáforo de un vendedor
// GET /api/semaforo                 -> semáforo de todo el equipo (director)

import { Redis } from '@upstash/redis';
import { getOdooLogin } from '../../lib/odoo';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const CACHE_TTL = 600; // 10 minutos
const CACHE_KEY = 'dashboard:semaforo';

// Trae el reporte completo del dashboard (cacheado)
async function getReporte() {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return cached;
  } catch {}

  const url = (process.env.DASHBOARD_URL || '').trim();
  const key = (process.env.DASHBOARD_API_KEY || '').trim();
  if (!url || !key) throw new Error('DASHBOARD_URL o DASHBOARD_API_KEY no configuradas');

  const res = await fetch(`${url}/api/external/v1/reports/sales/latest`, {
    headers: { 'X-API-Key': key },
  });
  const data = await res.json();
  if (!data.ok) throw new Error('Dashboard respondio: ' + (data.message || 'error'));

  // Extraemos SOLO lo esencial de cada vendedor (el reporte completo pesa 240KB)
  const compacto = {
    generadoEn: data.generatedAt,
    periodo: data.period?.label || '',
    vendedores: (data.rows || []).map((r) => ({
      nombre: r.name,
      login: r.login,
      score: r.score,
      estado: r.status,
      bloques: (r.blocks || []).map((b) => ({
        titulo: b.title,
        peso: b.weight,
        puntos: b.points,
        // por cada KPI: cuánto va vs cuánto debería ir
        kpis: (b.items || []).map((i) => ({
          kpi: i.label,
          real: i.valueLabel ?? i.value,
          metaHoy: i.targetTodayLabel ?? i.target,
          metaMes: i.targetMonthLabel ?? i.targetMonth,
          score: i.score,
        })),
      })),
    })),
  };

  try { await redis.set(CACHE_KEY, compacto, { ex: CACHE_TTL }); } catch {}
  return compacto;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.DASHBOARD_URL || !process.env.DASHBOARD_API_KEY) {
    return res.status(200).json({ sinSemaforo: true, razon: 'dashboard no configurado' });
  }

  try {
    const rep = await getReporte();
    const { clave } = req.query;

    // Sin clave: devuelve el equipo completo (para el director)
    if (!clave) {
      return res.status(200).json({
        periodo: rep.periodo,
        generadoEn: rep.generadoEn,
        equipo: rep.vendedores.map((v) => ({
          nombre: v.nombre,
          score: v.score,
          estado: v.estado,
          // el bloque donde más puntos está perdiendo
          peorBloque: peorBloque(v),
        })),
      });
    }

    // Con clave: devuelve el semáforo de ese vendedor
    const login = getOdooLogin(clave);
    if (!login) {
      return res.status(200).json({ sinSemaforo: true, razon: 'vendedor no mapeado' });
    }

    const v = rep.vendedores.find((x) => x.login === login);
    if (!v) {
      return res.status(200).json({ sinSemaforo: true, razon: 'vendedor no esta en el semaforo del dashboard' });
    }

    return res.status(200).json({
      nombre: v.nombre,
      score: v.score,
      estado: v.estado,
      metaMinima: 90,
      periodo: rep.periodo,
      bloques: v.bloques,
      peorBloque: peorBloque(v),
      puntosQueFaltan: Math.max(0, 90 - v.score).toFixed(1),
    });

  } catch (err) {
    console.error('[semaforo] error:', err.message);
    return res.status(200).json({ sinSemaforo: true, razon: err.message });
  }
}

// Identifica en qué bloque el vendedor está dejando más puntos sobre la mesa
function peorBloque(v) {
  if (!v.bloques || !v.bloques.length) return null;
  let peor = null;
  for (const b of v.bloques) {
    const perdidos = (b.peso || 0) - (b.puntos || 0);
    if (!peor || perdidos > peor.puntosPerdidos) {
      peor = { titulo: b.titulo, peso: b.peso, puntos: b.puntos, puntosPerdidos: +perdidos.toFixed(1) };
    }
  }
  return peor;
}
