import bcrypt from "bcryptjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { clave, pin } = req.body;

  if (!clave || !pin) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  // Leer MEMBER_PINS del entorno
  const memberPins = process.env.MEMBER_PINS;
  if (!memberPins) {
    return res.status(500).json({ error: "Configuración incompleta" });
  }

  // Parsear los pares CLAVE:hash
  const pares = memberPins.split(",");
  const parEncontrado = pares.find((p) => p.startsWith(clave + ":"));

  if (!parEncontrado) {
    return res.status(401).json({ ok: false, error: "Usuario no encontrado" });
  }

  const hash = parEncontrado.split(":").slice(1).join(":");
  const esValido = await bcrypt.compare(pin, hash);

  if (!esValido) {
    return res.status(401).json({ ok: false, error: "PIN incorrecto" });
  }

  // Si es Ricardo, marcar como director
  const esDirector = clave === "RICARDO";

  return res.status(200).json({
    ok: true,
    clave,
    esDirector,
  });
}