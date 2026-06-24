const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

async function redisCommand(command, ...args) {
  const response = await fetch(`${REDIS_URL}/${command}/${args.join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  return response.json();
}

export default async function handler(req, res) {
  const { method } = req;
  const { action, clave, datos } = req.body || req.query;

  if (!clave) return res.status(400).json({ error: "Falta clave de vendedor" });

  const key = `vendor:${clave}`;

  try {
    // LEER memoria del vendedor
    if (method === "GET" || action === "get") {
      const result = await redisCommand("get", key);
      const memoria = result.result ? JSON.parse(result.result) : null;
      return res.status(200).json({ memoria });
    }

    // GUARDAR memoria del vendedor
    if (method === "POST" || action === "set") {
      const memoriaActual = await redisCommand("get", key);
      const memoriaPrevia = memoriaActual.result
        ? JSON.parse(memoriaActual.result)
        : { sesiones: 0, pendientes: [], historial: [] };

      const nuevaMemoria = {
        clave,
        sesiones: (memoriaPrevia.sesiones || 0) + 1,
        ultimaSesion: new Date().toISOString(),
        resumenUltimaSesion: datos?.resumen || "",
        pendientes: datos?.pendientes || memoriaPrevia.pendientes || [],
        historial: [
          ...(memoriaPrevia.historial || []).slice(-4), // últimas 4 sesiones
          {
            fecha: new Date().toISOString(),
            resumen: datos?.resumen || "",
            pendientes: datos?.pendientes || [],
          },
        ],
      };

      await redisCommand("set", key, encodeURIComponent(JSON.stringify(nuevaMemoria)));
      return res.status(200).json({ ok: true, memoria: nuevaMemoria });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (error) {
    console.error("Error Redis:", error);
    return res.status(500).json({ error: "Error de memoria" });
  }
}