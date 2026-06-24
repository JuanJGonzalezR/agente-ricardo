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
      const { clave, datos, conversacion } = req.body;
      if (!clave) return res.status(400).json({ error: "Falta clave" });

      const previa = await redis.get(`vendor:${clave}`);
      const memoriaPrevia = previa && typeof previa === "object" && !Array.isArray(previa)
        ? previa
        : { sesiones: 0, pendientes: [], historial: [] };

      // Extraer pendientes concretos con Claude
      let pendientesExtraidos = datos?.pendientes || [];
      if (conversacion && conversacion.length > 0) {
        try {
          const resumenConv = conversacion
            .map((m) => `${m.role === "user" ? "Vendedor" : "Agente"}: ${m.content}`)
            .join("\n");

          const respIA = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 300,
              system: "Extrae los pendientes y compromisos concretos de esta conversación de ventas. Devuelve SOLO un array JSON de strings cortos, sin explicación. Ejemplo: [\"Demo Toyota viernes\", \"Llamar a gerente Honda lunes\"]. Si no hay pendientes claros, devuelve [].",
              messages: [{ role: "user", content: resumenConv }],
            }),
          });
          const dataIA = await respIA.json();
          if (dataIA.content && dataIA.content[0]) {
            const texto = dataIA.content[0].text.trim();
            const match = texto.match(/\[.*\]/s);
            if (match) {
              pendientesExtraidos = JSON.parse(match[0]);
            }
          }
        } catch (e) {
          console.error("Error extrayendo pendientes:", e);
        }
      }

      const nuevaMemoria = {
        clave,
        sesiones: (memoriaPrevia.sesiones || 0) + 1,
        ultimaSesion: new Date().toISOString(),
        resumenUltimaSesion: datos?.resumen || "",
        pendientes: pendientesExtraidos,
        historial: [
          ...(memoriaPrevia.historial || []).slice(-4),
          {
            fecha: new Date().toISOString(),
            resumen: datos?.resumen || "",
            pendientes: pendientesExtraidos,
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
