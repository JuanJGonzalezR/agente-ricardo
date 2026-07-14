// pages/api/semaforo.js
// Lee el Semáforo Comercial del dashboard (fuente de verdad) y extrae
// lo esencial para el agente, priorizando por PUNTOS RECUPERABLES por KPI.
//
// Formula de priorizacion (documento maestro de Ricardo):
//   puntos recuperables = peso x (100 - scoreKPI) / 100
//
// GET /api/semaforo?clave=JORGE_E   -> semaforo de un vendedor
// GET /api/semaforo                 -> semaforo del equipo (director)

import { Redis } from '@upstash/redis';
import { getOdooLogin } from '../../lib/odoo';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const CACHE_TTL = 600;
const CACHE_KEY = 'dashboard:semaforo';

// KPIs informativos: pesan 0, NO suman puntos. Nunca recomendarlos.
const INFORMATIVOS = ['Seguimiento Continuo', 'Diferencia entre Meta y Presupuesto'];

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
  if (!data.ok) throw new Error('Dashboard: ' + (data.message || 'error'));

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
        kpis: (b.items || []).map((i) => ({
          kpi: i.label,
          peso: i.weight,
          real: i.valueLabel ?? i.value,
          metaHoy: i.targetTodayLabel ?? i.target,
          metaMes: i.targetMonthLabel ?? i.targetMonth,
          scoreKPI: i.score,
        })),
      })),
    })),
  };

  try { await redis.set(CACHE_KEY, compacto, { ex: CACHE_TTL }); } catch {}
  return compacto;
}

// Calcula los puntos recuperables de cada KPI y los ordena por impacto.
// Excluye: KPIs informativos (peso 0) y los que ya estan en 100%.
function oportunidadesDeMejora(v) {
  const lista = [];
  for (const b of v.bloques || []) {
    for (const k of b.kpis || []) {
      const peso = k.peso || 0;
      if (peso === 0) continue;                    // informativo, no suma
      if (INFORMATIVOS.includes(k.kpi)) continue;
      const score = k.scoreKPI || 0;
      if (score >= 100) continue;                  // ya topado, no da puntos extra
      const recuperables = +(peso * (100 - score) / 100).toFixed(1);
      if (recuperables <= 0) continue;
      lista.push({
        kpi: k.kpi,
        bloque: b.titulo,
        peso,
        scoreActual: score,
        real: k.real,
        metaHoy: k.metaHoy,
        puntosRecuperables: recuperables,
      });
    }
  }
  lista.sort((a, b) => b.puntosRecuperables - a.puntosRecuperables);
  return lista;
}

// Color segun los umbrales OFICIALES del dashboard
function colorPorScore(score) {
  if (score >= 90) return 'Verde';
  if (score >= 70) return 'Amarillo';
  return 'Rojo';
}

// Cuanto le falta para el SIGUIENTE nivel (no siempre es 90)
function siguienteNivel(score) {
  if (score >= 90) return { nivel: 'Verde', faltan: 0 };
  if (score >= 70) return { nivel: 'Verde', faltan: +(90 - score).toFixed(1) };
  return { nivel: 'Amarillo', faltan: +(70 - score).toFixed(1) };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.DASHBOARD_URL || !process.env.DASHBOARD_API_KEY) {
    return res.status(200).json({ sinSemaforo: true, razon: 'dashboard no configurado' });
  }

  try {
    const rep = await getReporte();
    const { clave } = req.query;

    if (!clave) {
      return res.status(200).json({
        periodo: rep.periodo,
        generadoEn: rep.generadoEn,
        umbrales: { verde: '90+', amarillo: '70-89.9', rojo: '<70' },
        equipo: rep.vendedores.map((v) => {
          const sig = siguienteNivel(v.score);
          const op = oportunidadesDeMejora(v);
          return {
            nombre: v.nombre,
            score: v.score,
            estado: v.estado,
            siguienteNivel: sig.nivel,
            puntosParaSiguienteNivel: sig.faltan,
            mayorOportunidad: op[0] || null,
          };
        }),
      });
    }

    const login = getOdooLogin(clave);
    if (!login) return res.status(200).json({ sinSemaforo: true, razon: 'vendedor no mapeado' });

    const v = rep.vendedores.find((x) => x.login === login);
    if (!v) return res.status(200).json({ sinSemaforo: true, razon: 'vendedor no esta en el semaforo' });

    const sig = siguienteNivel(v.score);
    const op = oportunidadesDeMejora(v);

    return res.status(200).json({
      nombre: v.nombre,
      score: v.score,
      estado: v.estado,
      periodo: rep.periodo,
      umbrales: { verde: '90+', amarillo: '70-89.9', rojo: '<70' },
      siguienteNivel: sig.nivel,
      puntosParaSiguienteNivel: sig.faltan,
      // Los 4 bloques con sus puntos
      bloques: v.bloques.map((b) => ({
        titulo: b.titulo,
        peso: b.peso,
        puntos: b.puntos,
        puntosFaltantes: +((b.peso || 0) - (b.puntos || 0)).toFixed(1),
      })),
      // LO MAS IMPORTANTE: donde estan los puntos, ordenados por impacto
      oportunidadesDeMejora: op.slice(0, 6),
    });

  } catch (err) {
    console.error('[semaforo] error:', err.message);
    return res.status(200).json({ sinSemaforo: true, razon: err.message });
  }
}
