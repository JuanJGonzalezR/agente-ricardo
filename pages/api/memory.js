const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

async function redisSet(key, value) {
  const response = await fetch(`${REDIS_URL}/set/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([key, JSON.stringify(value)]),
  });
  return response.json();
}

async function redisGet(key) {
  const response = await fetch(`${REDIS_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  return response.json();
}

export default async function handler(req, res) {
  const { method } = req;

  try {
    if (method === "GET") {
      const { clave } = req.query;
      if (!clave) return res.status(400).json({ error: "Falta clave" });
      const result = await redisGet(`vendor:${clave}`);
      const memoria = result.result ? JSON.parse(result.result) : null;
      return res.status(200).json({ memoria });
    }

    if (method === "POST") {
      const { clave, datos } = req.body;
      if (!clave) return res.status(400).json({ error: "Falta clave" });
      const prevResult = await redisGet(`vendor:${clave}`);
      const memoriaPrevia = prevResult.result
        ? JSON.parse(prevResult.result)
        : { sesiones: 0, pendientes: [], historial: [] };

      const nuevaMemoria = {
        clave,
        sesiones: (memoriaPrevia.sesiones || 0) + 1,
        ultimaSesion: new Date().toISOString(),
        resumenUltimaSesion: datos?.resumen || "",
        pendientes: datos?.pendientes || memoriaPrevia.pendientes || [],
        historial: [
          ...(memoriaPrevia.historial || []).slice(-4),
          {
            fecha: new Date().toISOString(),
            resumen: datos?.resumen || "",
            pendientes: datos?.pendientes || [],
          },
        ],
      };

      await redisSet(`vendor:${clave}`, nuevaMemoria);
      return res.status(200).json({ ok: true, memoria: nuevaMemoria });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (error) {
    console.error("Error Redis:", error);
    return res.status(500).json({ error: "Error de memoria" });
  }
}
