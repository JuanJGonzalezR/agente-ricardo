// pages/api/odoo/diag.js
import { getOdooUid, limpiarCacheUid } from '../../../lib/odoo';

export default async function handler(req, res) {
  const reporte = { pasos: [] };

  const url = (process.env.ODOO_URL || '').trim();
  const db = (process.env.ODOO_DB || '').trim();
  const user = (process.env.ODOO_USERNAME || '').trim();
  const key = (process.env.ODOO_API_KEY || '').trim();

  reporte.variables = {
    ODOO_URL: url || '(vacia)',
    ODOO_DB: db || '(vacia)',
    ODOO_USERNAME: user || '(vacia)',
    ODOO_API_KEY_longitud: key.length,
    ODOO_API_KEY_primeros4: key ? key.slice(0, 4) : '(vacia)',
  };

  if (!url || !db || !user || !key) {
    reporte.resultado = 'FALTAN_VARIABLES';
    return res.status(200).json(reporte);
  }
  reporte.pasos.push('Variables presentes OK');

  if (req.query.limpiar) {
    try {
      await limpiarCacheUid();
      reporte.pasos.push('Cache del uid vaciada OK');
    } catch (e) {
      reporte.pasos.push('No se pudo vaciar cache: ' + e.message);
    }
  }

  try {
    const uid = await getOdooUid(true);
    reporte.pasos.push('Autenticacion OK (uid: ' + uid + ')');
    reporte.uid = uid;
    reporte.resultado = 'CONEXION_OK';
  } catch (e) {
    reporte.pasos.push('Autenticacion FALLO');
    reporte.error = e.message;
    reporte.resultado = 'AUTENTICACION_FALLIDA';
  }

  return res.status(200).json(reporte);
}
