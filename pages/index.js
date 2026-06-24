import { useState, useRef, useEffect } from "react";

const VENDEDORES = [
  { nombre: "Jorge Echeveste", clave: "JORGE_E", inicial: "JE" },
  { nombre: "Alan", clave: "ALAN", inicial: "AL" },
  { nombre: "Bobby", clave: "BOBBY", inicial: "BO" },
  { nombre: "Arturo (Curro)", clave: "CURRO", inicial: "AC" },
  { nombre: "Manolo", clave: "MANOLO", inicial: "MA" },
  { nombre: "Montserrat", clave: "MONTSE", inicial: "MO" },
  { nombre: "Israel Nazareno", clave: "ISRAEL", inicial: "IN" },
  { nombre: "Arturo Anaya", clave: "ARTURO_A", inicial: "AA" },
  { nombre: "Ing. Gerardo", clave: "GERARDO", inicial: "GE" },
  { nombre: "Jonathan", clave: "JONATHAN", inicial: "JO" },
  { nombre: "Jorge Ramos", clave: "JORGE_R", inicial: "JR" },
  { nombre: "Marco", clave: "MARCO", inicial: "MR" },
  { nombre: "Rodrigo", clave: "RODRIGO", inicial: "RO" },
  { nombre: "Ricardo Gárate", clave: "RICARDO", inicial: "RG", director: true },
];

export default function Home() {
  const [pantalla, setPantalla] = useState("inicio");
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const [mensajes, setMensajes] = useState([]);
  const [inputTexto, setInputTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [memoria, setMemoria] = useState(null);
  const chatRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [mensajes]);

  const seleccionarVendedor = (vendedor) => {
    setVendedorSeleccionado(vendedor);
    setPin("");
    setError("");
    setPantalla("pin");
  };

  const ingresarDigito = (digito) => {
    if (pin.length < 4) {
      const nuevoPin = pin + digito;
      setPin(nuevoPin);
      if (nuevoPin.length === 4) validarPin(nuevoPin);
    }
  };

  const borrarDigito = () => {
    setPin(pin.slice(0, -1));
    setError("");
  };

  const validarPin = async (pinIngresado) => {
    if (intentos >= 3) {
      setError("Demasiados intentos. Espera un momento.");
      return;
    }
    setCargando(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: vendedorSeleccionado.clave, pin: pinIngresado }),
      });
      const data = await res.json();
      if (data.ok) {
        setIntentos(0);
        await cargarMemoriaEIniciarChat(vendedorSeleccionado, data.esDirector);
      } else {
        setIntentos((i) => i + 1);
        setError(intentos >= 2 ? "Acceso bloqueado temporalmente." : "PIN incorrecto.");
        setPin("");
      }
    } catch {
      setError("Error de conexión.");
      setPin("");
    }
    setCargando(false);
  };

  const cargarMemoriaEIniciarChat = async (vendedor, esDirector) => {
    let memoriaVendedor = null;

    try {
      const res = await fetch(`/api/memory?action=get&clave=${vendedor.clave}`);
      const data = await res.json();
      memoriaVendedor = data.memoria;
      setMemoria(memoriaVendedor);
    } catch {
      console.log("Sin memoria previa");
    }

    const nombre = vendedor.nombre.split(" ")[0];
    let mensajeInicial = "";

    if (esDirector) {
      mensajeInicial = memoriaVendedor
        ? `Bienvenido Ricardo. Última sesión: ${new Date(memoriaVendedor.ultimaSesion).toLocaleDateString("es-MX")}. ¿Qué revisamos hoy?`
        : `Buenos días Ricardo. ¿Qué quieres revisar hoy — el estado general del equipo, un vendedor específico, o las alertas del día?`;
    } else {
      if (memoriaVendedor && memoriaVendedor.sesiones > 0) {
        const listaPendientes = memoriaVendedor.pendientes?.length > 0
          ? `Tienes estos pendientes:\n${memoriaVendedor.pendientes.map((p) => `• ${p}`).join("\n")}\n\n¿Avanzaste con alguno?`
          : "No me quedaron pendientes anotados de la última vez. ¿Qué hiciste hoy?";
        mensajeInicial = `Hola ${nombre}, bienvenido de vuelta.\n\n${listaPendientes}`;
      } else {
        mensajeInicial = `Hola ${nombre}. Soy tu agente de ventas. ¿Qué hiciste hoy o qué tienes agendado? Cuéntame y yo te ayudo a registrarlo.`;
      }
    }

    setMensajes([{ role: "assistant", content: mensajeInicial }]);
    setPantalla("agente");
  };

  const enviarMensaje = async () => {
    if (!inputTexto.trim() || enviando) return;

    const nuevoMensaje = { role: "user", content: inputTexto.trim() };
    const historialActualizado = [...mensajes, nuevoMensaje];
    setMensajes(historialActualizado);
    setInputTexto("");
    setEnviando(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensajes: historialActualizado,
          vendedor: vendedorSeleccionado.nombre,
          esDirector: vendedorSeleccionado.director || false,
          memoria,
        }),
      });
      const data = await res.json();
      if (data.respuesta) {
        setMensajes((prev) => [...prev, { role: "assistant", content: data.respuesta }]);
      }
    } catch {
      setMensajes((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexión. Intenta de nuevo." },
      ]);
    }
    setEnviando(false);
    inputRef.current?.focus();
  };

  const cerrarSesion = async () => {
    if (vendedorSeleccionado && mensajes.length > 1) {
      try {
        const ultimosMensajes = mensajes
          .slice(-6)
          .map((m) => `${m.role === "user" ? "Vendedor" : "Agente"}: ${m.content}`)
          .join(" | ");

        const body = {
          clave: vendedorSeleccionado.clave,
          datos: {
            resumen: ultimosMensajes.slice(0, 400),
            pendientes: [],
          },
          conversacion: mensajes.slice(-10),
        };

        await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        console.error("Error guardando memoria:", e);
      }
    }

    setPantalla("inicio");
    setVendedorSeleccionado(null);
    setPin("");
    setError("");
    setIntentos(0);
    setMensajes([]);
    setInputTexto("");
    setMemoria(null);
  };

  const manejarTecla = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  };

  // ── PANTALLA INICIO ──────────────────────────────────────────
  if (pantalla === "inicio") {
    return (
      <div style={s.contenedor}>
        <div style={s.header}>
          <div style={s.logo}>NANOSCHUTZ</div>
          <div style={s.logoSub}>Agente Ricardo</div>
        </div>
        <p style={s.instruccion}>¿Quién eres?</p>
        <div style={s.lista}>
          {VENDEDORES.filter((v) => !v.director).map((v) => (
            <button key={v.clave} style={s.card} onClick={() => seleccionarVendedor(v)}>
              <div style={s.avatar}>{v.inicial}</div>
              <span style={s.nombreCard}>{v.nombre}</span>
              <span style={s.chevron}>›</span>
            </button>
          ))}
          <button
            style={{ ...s.card, ...s.cardDirector }}
            onClick={() => seleccionarVendedor(VENDEDORES.find((v) => v.director))}
          >
            <div style={{ ...s.avatar, ...s.avatarDirector }}>RG</div>
            <span style={s.nombreCard}>Ricardo Gárate</span>
            <span style={s.badge}>Director</span>
          </button>
        </div>
      </div>
    );
  }

  // ── PANTALLA PIN ─────────────────────────────────────────────
  if (pantalla === "pin") {
    return (
      <div style={s.contenedor}>
        <button style={s.btnVolver} onClick={() => setPantalla("inicio")}>← Volver</button>
        <div style={s.pinHeader}>
          <div style={vendedorSeleccionado.director
            ? { ...s.avatar, ...s.avatarDirector, ...s.avatarGrande }
            : { ...s.avatar, ...s.avatarGrande }}>
            {vendedorSeleccionado.inicial}
          </div>
          <p style={s.pinNombre}>{vendedorSeleccionado.nombre}</p>
          <p style={s.pinLabel}>Ingresa tu PIN</p>
        </div>
        <div style={s.puntos}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={pin.length > i ? s.puntoActivo : s.punto} />
          ))}
        </div>
        {error && <p style={s.error}>{error}</p>}
        {cargando && <p style={s.cargando}>Verificando...</p>}
        <div style={s.teclado}>
          {[1,2,3,4,5,6,7,8,9].map((n) => (
            <button key={n} style={s.tecla}
              onClick={() => ingresarDigito(String(n))}
              disabled={cargando || pin.length === 4}>{n}</button>
          ))}
          <div />
          <button style={s.tecla} onClick={() => ingresarDigito("0")}
            disabled={cargando || pin.length === 4}>0</button>
          <button style={s.teclaBorrar} onClick={borrarDigito} disabled={cargando}>⌫</button>
        </div>
      </div>
    );
  }

  // ── PANTALLA AGENTE ──────────────────────────────────────────
  if (pantalla === "agente") {
    return (
      <div style={s.contenedor}>
        <div style={s.agenteHeader}>
          <div style={s.agenteInfo}>
            <span style={s.agenteNombre}>
              {vendedorSeleccionado.director ? "👔 " : "👋 "}
              {vendedorSeleccionado.nombre}
            </span>
            <button style={s.btnCerrar} onClick={cerrarSesion}>Salir</button>
          </div>
          {memoria && (
            <p style={s.sesionInfo}>
              Sesión #{memoria.sesiones + 1} · Última vez: {new Date(memoria.ultimaSesion).toLocaleDateString("es-MX")}
            </p>
          )}
        </div>

        <div style={s.chatArea} ref={chatRef}>
          {mensajes.map((m, i) => (
            <div key={i} style={m.role === "user" ? s.bubbleUser : s.bubbleAgent}>
              <p style={s.bubbleTexto}>
                {m.content.split("\n").map((linea, idx) => (
                  <span key={idx}>
                    {linea}
                    {idx < m.content.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </p>
            </div>
          ))}
          {enviando && (
            <div style={s.bubbleAgent}>
              <p style={s.bubbleTexto}>...</p>
            </div>
          )}
        </div>

        <div style={s.inputArea}>
          <input
            ref={inputRef}
            style={s.inputChat}
            placeholder="Escribe aquí..."
            value={inputTexto}
            onChange={(e) => setInputTexto(e.target.value)}
            onKeyDown={manejarTecla}
            disabled={enviando}
          />
          <button
            style={enviando ? { ...s.btnEnviar, opacity: 0.5 } : s.btnEnviar}
            onClick={enviarMensaje}
            disabled={enviando}
          >›</button>
        </div>
      </div>
    );
  }
}

const s = {
  contenedor: { minHeight: "100vh", backgroundColor: "#0D0D0D", color: "#FFFFFF", fontFamily: "'Inter', -apple-system, sans-serif", display: "flex", flexDirection: "column", maxWidth: "430px", margin: "0 auto" },
  header: { padding: "40px 24px 16px", borderBottom: "1px solid #1A1A1A" },
  logo: { fontSize: "11px", letterSpacing: "4px", color: "#00C896", fontWeight: "700" },
  logoSub: { fontSize: "28px", fontWeight: "700", color: "#FFFFFF", marginTop: "4px" },
  instruccion: { padding: "24px 24px 8px", fontSize: "13px", color: "#666", letterSpacing: "1px", textTransform: "uppercase", margin: 0 },
  lista: { display: "flex", flexDirection: "column", gap: "2px", padding: "0 16px" },
  card: { display: "flex", alignItems: "center", gap: "12px", backgroundColor: "#141414", border: "none", borderRadius: "12px", padding: "14px 16px", cursor: "pointer", color: "#FFFFFF", textAlign: "left", width: "100%" },
  cardDirector: { marginTop: "12px", backgroundColor: "#0F1F18", border: "1px solid #00C89633" },
  avatar: { width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "#1E1E1E", color: "#888", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", flexShrink: 0 },
  avatarDirector: { backgroundColor: "#00C89622", color: "#00C896" },
  avatarGrande: { width: "64px", height: "64px", borderRadius: "20px", fontSize: "18px", margin: "0 auto 12px" },
  nombreCard: { flex: 1, fontSize: "15px", fontWeight: "500", color: "#EEE" },
  chevron: { color: "#444", fontSize: "20px" },
  badge: { fontSize: "11px", color: "#00C896", fontWeight: "600", backgroundColor: "#00C89615", padding: "3px 8px", borderRadius: "6px" },
  btnVolver: { background: "none", border: "none", color: "#666", fontSize: "14px", padding: "24px", cursor: "pointer", alignSelf: "flex-start" },
  pinHeader: { display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 24px 24px" },
  pinNombre: { fontSize: "20px", fontWeight: "700", margin: "0 0 4px", color: "#FFF" },
  pinLabel: { fontSize: "13px", color: "#666", margin: 0 },
  puntos: { display: "flex", justifyContent: "center", gap: "16px", padding: "24px 0" },
  punto: { width: "14px", height: "14px", borderRadius: "50%", backgroundColor: "#222", border: "2px solid #333" },
  puntoActivo: { width: "14px", height: "14px", borderRadius: "50%", backgroundColor: "#00C896", border: "2px solid #00C896" },
  error: { color: "#FF4444", textAlign: "center", fontSize: "13px", margin: "0 0 16px", padding: "0 24px" },
  cargando: { color: "#00C896", textAlign: "center", fontSize: "13px", margin: "0 0 16px" },
  teclado: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", padding: "0 32px", marginTop: "8px" },
  tecla: { backgroundColor: "#1A1A1A", border: "none", borderRadius: "14px", color: "#FFF", fontSize: "22px", fontWeight: "400", padding: "20px", cursor: "pointer" },
  teclaBorrar: { backgroundColor: "#1A1A1A", border: "none", borderRadius: "14px", color: "#888", fontSize: "20px", padding: "20px", cursor: "pointer" },
  agenteHeader: { borderBottom: "1px solid #1A1A1A", padding: "20px 20px 12px", flexShrink: 0 },
  agenteInfo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  agenteNombre: { fontSize: "16px", fontWeight: "600", color: "#FFF" },
  sesionInfo: { fontSize: "11px", color: "#444", margin: "6px 0 0", letterSpacing: "0.3px" },
  btnCerrar: { background: "none", border: "1px solid #2A2A2A", borderRadius: "8px", color: "#666", fontSize: "12px", padding: "6px 12px", cursor: "pointer" },
  chatArea: { flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", minHeight: 0, height: "calc(100vh - 140px)", maxHeight: "calc(100vh - 140px)" },
  bubbleAgent: { backgroundColor: "#141414", borderRadius: "16px 16px 16px 4px", padding: "12px 16px", maxWidth: "85%", alignSelf: "flex-start" },
  bubbleUser: { backgroundColor: "#00C89622", border: "1px solid #00C89644", borderRadius: "16px 16px 4px 16px", padding: "12px 16px", maxWidth: "85%", alignSelf: "flex-end" },
  bubbleTexto: { fontSize: "14px", color: "#EEE", margin: 0, lineHeight: "1.5", whiteSpace: "pre-wrap" },
  inputArea: { display: "flex", gap: "8px", padding: "12px 16px", borderTop: "1px solid #1A1A1A", flexShrink: 0 },
  inputChat: { flex: 1, backgroundColor: "#141414", border: "1px solid #2A2A2A", borderRadius: "12px", color: "#FFF", fontSize: "15px", padding: "12px 16px", outline: "none" },
  btnEnviar: { backgroundColor: "#00C896", border: "none", borderRadius: "12px", color: "#000", fontSize: "22px", fontWeight: "700", width: "48px", cursor: "pointer" },
};