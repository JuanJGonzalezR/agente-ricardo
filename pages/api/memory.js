import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { method } = req;

  try {
    if (method === "GET") {
      const { clave } = req.query;
      if (!clave) return res.status(400).json({ error: "Falta clave" });

      const memoria = await redis.get(`vendor:${clave}`);
      // El SDK ya devuelve el objeto parseado, o null si no existe
      const memoriaValida = memoria && typeof memoria === "object" && !Array.isArray(memoria) ? memoria : null;
      return res.status(200).json({ memoria: memoriaValida });
    }

    if (method === "POST") {
      const { clave, datos } = req.body;
      if (!clave) return res.status(400).json({ error: "Falta clave" });

      const previa = await redis.get(`vendor:${clave}`);
      const memoriaPrevia = previa && typeof previa === "object" && !Array.isArray(previa)
        ? previa
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

      await redis.set(`vendor:${clave}`, nuevaMemoria);
      return res.status(200).json({ ok: true, memoria: nuevaMemoria });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (error) {
    console.error("Error Redis:", error);
    return res.status(500).json({ error: "Error de memoria" });
  }
}
