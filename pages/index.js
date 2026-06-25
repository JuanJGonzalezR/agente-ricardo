import { useState, useRef, useEffect } from "react";

const VENDEDORES = [
  { nombre: "Jorge Echeveste", clave: "JORGE_E", inicial: "JE", semaforo: "rojo" },
  { nombre: "Alan", clave: "ALAN", inicial: "AL", semaforo: "verde" },
  { nombre: "Bobby", clave: "BOBBY", inicial: "BO", semaforo: "amarillo" },
  { nombre: "Arturo (Curro)", clave: "CURRO", inicial: "AC", semaforo: "rojo" },
  { nombre: "Manolo", clave: "MANOLO", inicial: "MA", semaforo: "amarillo" },
  { nombre: "Montserrat", clave: "MONTSE", inicial: "MO", semaforo: "amarillo" },
  { nombre: "Israel Nazareno", clave: "ISRAEL", inicial: "IN", semaforo: "rojo" },
  { nombre: "Arturo Anaya", clave: "ARTURO_A", inicial: "AA", semaforo: "rojo" },
  { nombre: "Ing. Gerardo", clave: "GERARDO", inicial: "GE", semaforo: "rojo" },
  { nombre: "Jonathan", clave: "JONATHAN", inicial: "JO", semaforo: "verde" },
  { nombre: "Jorge Ramos", clave: "JORGE_R", inicial: "JR", semaforo: "rojo" },
  { nombre: "Marco", clave: "MARCO", inicial: "MR", semaforo: "amarillo" },
  { nombre: "Rodrigo", clave: "RODRIGO", inicial: "RO", semaforo: "rojo" },
  { nombre: "Ricardo Gárate", clave: "RICARDO", inicial: "RG", director: true },
];

const COLOR_SEMAFORO = { rojo: "#E5484D", amarillo: "#F5A623", verde: "#1FBF75" };

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
  const [busqueda, setBusqueda] = useState("");
  const [grabando, setGrabando] = useState(false);
  const reconocimientoRef = useRef(null);
  const chatRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensajes, enviando]);

  const seleccionarVendedor = (v) => {
    setVendedorSeleccionado(v);
    setPin("");
    setError("");
    setPantalla("pin");
  };

  const ingresarDigito = (d) => {
    if (pin.length < 4) {
      const np = pin + d;
      setPin(np);
      if (np.length === 4) validarPin(np);
    }
  };

  const borrarDigito = () => { setPin(pin.slice(0, -1)); setError(""); };

  const validarPin = async (p) => {
    if (intentos >= 3) { setError("Demasiados intentos. Espera un momento."); return; }
    setCargando(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: vendedorSeleccionado.clave, pin: p }),
      });
      const data = await res.json();
      if (data.ok) { setIntentos(0); await cargarMemoriaEIniciarChat(vendedorSeleccionado, data.esDirector); }
      else { setIntentos((i) => i + 1); setError(intentos >= 2 ? "Acceso bloqueado temporalmente." : "PIN incorrecto."); setPin(""); }
    } catch { setError("Error de conexión."); setPin(""); }
    setCargando(false);
  };

  const cargarMemoriaEIniciarChat = async (v, esDir) => {
    let mem = null;
    try {
      const res = await fetch(`/api/memory?action=get&clave=${v.clave}`);
      const data = await res.json();
      mem = data.memoria;
      setMemoria(mem);
    } catch { console.log("Sin memoria previa"); }

    const nombre = v.nombre.split(" ")[0];
    let inicial = "";
    if (esDir) {
      inicial = mem
        ? `Bienvenido Ricardo. Última sesión: ${new Date(mem.ultimaSesion).toLocaleDateString("es-MX")}.\n\n¿Qué revisamos hoy — equipo, un vendedor o las alertas del día?`
        : `Buenos días Ricardo. ¿Qué quieres revisar hoy — el estado general del equipo, un vendedor específico, o las alertas del día?`;
    } else if (mem && mem.sesiones > 0) {
      const lista = mem.pendientes?.length > 0
        ? `Tienes estos pendientes:\n${mem.pendientes.map((x) => `• ${x}`).join("\n")}\n\n¿Avanzaste con alguno?`
        : "No me quedaron pendientes anotados de la última vez. ¿Qué hiciste hoy?";
      inicial = `Hola ${nombre}, bienvenido de vuelta.\n\n${lista}`;
    } else {
      inicial = `Hola ${nombre}. Soy tu agente de ventas. ¿Qué hiciste hoy o qué tienes agendado? Cuéntame y yo te ayudo a registrarlo.`;
    }
    setMensajes([{ role: "assistant", content: inicial }]);
    setPantalla("agente");
  };

  const enviarMensaje = async (textoForzado) => {
    const texto = (textoForzado || inputTexto).trim();
    if (!texto || enviando) return;
    if (grabando && reconocimientoRef.current) {
      reconocimientoRef.current.stop();
      setGrabando(false);
    }
    const nuevo = { role: "user", content: texto };
    const hist = [...mensajes, nuevo];
    setMensajes(hist);
    setInputTexto("");
    setEnviando(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensajes: hist,
          vendedor: vendedorSeleccionado.nombre,
          esDirector: vendedorSeleccionado.director || false,
          memoria,
        }),
      });
      const data = await res.json();
      if (data.respuesta) setMensajes((p) => [...p, { role: "assistant", content: data.respuesta }]);
    } catch {
      setMensajes((p) => [...p, { role: "assistant", content: "Error de conexión. Intenta de nuevo." }]);
    }
    setEnviando(false);
    inputRef.current?.focus();
  };

  const cerrarSesion = async () => {
    if (vendedorSeleccionado && mensajes.length > 1) {
      try {
        const resumen = mensajes.slice(-6).map((m) => `${m.role === "user" ? "Vendedor" : "Agente"}: ${m.content}`).join(" | ");
        await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clave: vendedorSeleccionado.clave,
            datos: { resumen: resumen.slice(0, 400), pendientes: [] },
            conversacion: mensajes.slice(-10),
          }),
        });
      } catch (e) { console.error("Error guardando memoria:", e); }
    }
    setPantalla("inicio");
    setVendedorSeleccionado(null);
    setPin(""); setError(""); setIntentos(0);
    setMensajes([]); setInputTexto(""); setMemoria(null); setBusqueda("");
  };

  const toggleVoz = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta dictado por voz. Usa Safari o Chrome.");
      return;
    }
    if (grabando) {
      reconocimientoRef.current?.stop();
      setGrabando(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "es-MX";
    rec.continuous = false;
    rec.interimResults = true;

    let timeoutSilencio = null;

    rec.onresult = (e) => {
      // Tomar solo el último resultado reconocido (evita re-acumulación de Android)
      const ultimoResultado = e.results[e.results.length - 1];
      const texto = ultimoResultado[0].transcript.trim();
      setInputTexto(texto);

      if (timeoutSilencio) clearTimeout(timeoutSilencio);
      timeoutSilencio = setTimeout(() => {
        rec.stop();
      }, 2000);
    };

    rec.onerror = () => {
      if (timeoutSilencio) clearTimeout(timeoutSilencio);
      setGrabando(false);
    };
    rec.onend = () => {
      if (timeoutSilencio) clearTimeout(timeoutSilencio);
      setGrabando(false);
    };

    rec.start();
    reconocimientoRef.current = rec;
    setGrabando(true);
  };

  const manejarTecla = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensaje(); }
  };

  const vendedoresFiltrados = VENDEDORES.filter(
    (v) => !v.director && v.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );
  const director = VENDEDORES.find((v) => v.director);

  // ── INICIO ───────────────────────────────────────────────
  if (pantalla === "inicio") {
    return (
      <Marco>
        <div style={s.header}>
          <div style={s.brandRow}>
            <span style={s.brandDot} />
            <span style={s.brandText}>NANO SCHUTZ</span>
          </div>
          <div style={s.titulo}>Agente Ricardo</div>
          <div style={s.subtitulo}>Estándar de Lavado · seguimiento comercial</div>
        </div>

        <div style={s.buscadorWrap}>
          <div style={s.buscador}>
            <span style={s.lupa}>⌕</span>
            <input
              style={s.buscadorInput}
              placeholder="Buscar vendedor"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        <div style={s.lista}>
          {vendedoresFiltrados.map((v) => (
            <button key={v.clave} style={s.card} onClick={() => seleccionarVendedor(v)}>
              <div style={s.avatar}>{v.inicial}</div>
              <span style={s.nombreCard}>{v.nombre}</span>
              <span style={{ ...s.semaforoDot, backgroundColor: COLOR_SEMAFORO[v.semaforo] }} />
              <span style={s.chevron}>›</span>
            </button>
          ))}
          {vendedoresFiltrados.length === 0 && (
            <p style={s.sinResultados}>Sin coincidencias para "{busqueda}"</p>
          )}
          {busqueda === "" && (
            <button style={{ ...s.card, ...s.cardDirector }} onClick={() => seleccionarVendedor(director)}>
              <div style={{ ...s.avatar, ...s.avatarDirector }}>RG</div>
              <span style={s.nombreCard}>Ricardo Gárate</span>
              <span style={s.badge}>DIRECTOR</span>
            </button>
          )}
        </div>
      </Marco>
    );
  }

  // ── PIN ──────────────────────────────────────────────────
  if (pantalla === "pin") {
    const esDir = vendedorSeleccionado.director;
    return (
      <Marco>
        <button style={s.btnVolver} onClick={() => setPantalla("inicio")}>‹ Volver</button>
        <div style={s.pinHeader}>
          <div style={esDir ? { ...s.avatar, ...s.avatarDirector, ...s.avatarGrande } : { ...s.avatar, ...s.avatarGrande }}>
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
        {cargando && <p style={s.cargando}>Verificando…</p>}
        <div style={s.teclado}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} style={s.tecla} onClick={() => ingresarDigito(String(n))} disabled={cargando || pin.length === 4}>{n}</button>
          ))}
          <div />
          <button style={s.tecla} onClick={() => ingresarDigito("0")} disabled={cargando || pin.length === 4}>0</button>
          <button style={s.teclaBorrar} onClick={borrarDigito} disabled={cargando}>⌫</button>
        </div>
      </Marco>
    );
  }

  // ── AGENTE ───────────────────────────────────────────────
  if (pantalla === "agente") {
    const esDir = vendedorSeleccionado.director;
    const colorSem = esDir ? "#00D9C0" : COLOR_SEMAFORO[vendedorSeleccionado.semaforo];
    const chips = esDir
      ? ["Estado del equipo", "Alertas del día", "Quién está en riesgo"]
      : ["Registrar visita", "Agendar", "Mis pendientes"];

    return (
      <Marco noPad>
        <div style={s.agHeader}>
          <button style={s.agBack} onClick={cerrarSesion}>‹</button>
          <div style={s.agAvatarWrap}>
            <div style={esDir ? { ...s.avatarSm, ...s.avatarDirector } : s.avatarSm}>{vendedorSeleccionado.inicial}</div>
            <span style={{ ...s.agStatusDot, backgroundColor: colorSem }} />
          </div>
          <div style={s.agInfo}>
            <div style={s.agNombre}>{vendedorSeleccionado.nombre}</div>
            <div style={s.agMeta}>
              {esDir ? "MODO DIRECTOR" : `SESIÓN ${String((memoria?.sesiones || 0) + 1).padStart(2, "0")}`}
            </div>
          </div>
          <button style={s.agSalir} onClick={cerrarSesion}>Salir</button>
        </div>

        <div style={s.chatArea} ref={chatRef}>
          {mensajes.map((m, i) => (
            <div key={i} style={m.role === "user" ? s.bubbleUser : s.bubbleAgent}>
              <p style={s.bubbleTexto}>
                {m.content.split("\n").map((linea, idx, arr) => (
                  <span key={idx}>{linea}{idx < arr.length - 1 && <br />}</span>
                ))}
              </p>
            </div>
          ))}
          {enviando && (
            <div style={s.bubbleAgent}>
              <div style={s.typing}>
                <span style={{ ...s.typingDot, animationDelay: "0s" }} />
                <span style={{ ...s.typingDot, animationDelay: "0.2s" }} />
                <span style={{ ...s.typingDot, animationDelay: "0.4s" }} />
              </div>
            </div>
          )}
        </div>

        <div style={s.chipsRow}>
          {chips.map((c) => (
            <button key={c} style={s.chip} onClick={() => enviarMensaje(c)} disabled={enviando}>{c}</button>
          ))}
        </div>

        <div style={s.inputArea}>
          <button
            style={grabando ? { ...s.btnMic, ...s.btnMicActivo } : s.btnMic}
            onClick={toggleVoz}
            disabled={enviando}
            aria-label="Dictar por voz"
          >
            {grabando ? "■" : "🎤"}
          </button>
          <input
            ref={inputRef}
            style={s.inputChat}
            placeholder="Escribe aquí…"
            value={inputTexto}
            onChange={(e) => setInputTexto(e.target.value)}
            onKeyDown={manejarTecla}
            disabled={enviando}
          />
          <button style={enviando ? { ...s.btnEnviar, opacity: 0.5 } : s.btnEnviar} onClick={() => enviarMensaje()} disabled={enviando}>↑</button>
        </div>

        <style>{`
          @keyframes typingBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-4px); opacity: 1; }
          }
        `}</style>
      </Marco>
    );
  }
}

// ── MARCO (app shell centrado) ───────────────────────────────
function Marco({ children, noPad }) {
  return (
    <div style={s.fondo}>
      <div style={s.dispositivo}>
        <div style={noPad ? s.pantallaChat : s.pantalla}>{children}</div>
      </div>
    </div>
  );
}

const ACCENT = "#00D9C0";
const s = {
  fondo: { minHeight: "100vh", backgroundColor: "#05070A", display: "flex", alignItems: "center", justifyContent: "center", padding: "0", fontFamily: "'Inter', -apple-system, sans-serif" },
  dispositivo: { width: "100%", maxWidth: "430px", height: "100vh", maxHeight: "920px", backgroundColor: "#0A0D12", border: "1px solid #1A222C", borderRadius: "0", overflow: "hidden", display: "flex", flexDirection: "column" },
  pantalla: { flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", color: "#EAF0F3" },
  pantallaChat: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "#EAF0F3" },

  header: { padding: "40px 22px 16px", borderBottom: "1px solid #161D26" },
  brandRow: { display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" },
  brandDot: { width: "7px", height: "7px", borderRadius: "50%", backgroundColor: ACCENT, display: "inline-block" },
  brandText: { fontFamily: "ui-monospace, 'SF Mono', monospace", fontSize: "11px", letterSpacing: "3px", color: ACCENT },
  titulo: { fontSize: "26px", fontWeight: "700", color: "#EAF0F3" },
  subtitulo: { fontSize: "12px", color: "#6E7A88", marginTop: "4px" },

  buscadorWrap: { padding: "16px 18px 6px" },
  buscador: { display: "flex", alignItems: "center", gap: "8px", backgroundColor: "#141A22", border: "1px solid #232C37", borderRadius: "12px", padding: "10px 13px" },
  lupa: { fontSize: "16px", color: "#6E7A88" },
  buscadorInput: { flex: 1, background: "none", border: "none", outline: "none", color: "#EAF0F3", fontSize: "14px" },

  lista: { display: "flex", flexDirection: "column", gap: "4px", padding: "6px 14px 24px" },
  card: { display: "flex", alignItems: "center", gap: "11px", backgroundColor: "#131A22", border: "none", borderRadius: "13px", padding: "12px 13px", cursor: "pointer", textAlign: "left", width: "100%" },
  cardDirector: { marginTop: "10px", backgroundColor: "#0E1A18", border: "1px solid #14564C" },
  avatar: { width: "36px", height: "36px", borderRadius: "11px", backgroundColor: "#1C2530", color: "#9FB0BE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", fontFamily: "ui-monospace, monospace", flexShrink: 0 },
  avatarDirector: { backgroundColor: "#0F2A26", color: ACCENT },
  avatarGrande: { width: "66px", height: "66px", borderRadius: "20px", fontSize: "18px", margin: "0 auto 12px" },
  nombreCard: { flex: 1, fontSize: "14px", fontWeight: "500", color: "#E4EAEE" },
  semaforoDot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  chevron: { color: "#3C4754", fontSize: "20px" },
  badge: { fontSize: "10px", color: ACCENT, fontWeight: "600", fontFamily: "ui-monospace, monospace", letterSpacing: "1px", backgroundColor: "#0F2A26", padding: "4px 8px", borderRadius: "6px" },
  sinResultados: { color: "#6E7A88", fontSize: "13px", textAlign: "center", padding: "20px" },

  btnVolver: { background: "none", border: "none", color: "#6E7A88", fontSize: "15px", padding: "22px", cursor: "pointer", alignSelf: "flex-start" },
  pinHeader: { display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 24px 20px" },
  pinNombre: { fontSize: "20px", fontWeight: "700", margin: "0 0 4px", color: "#EAF0F3" },
  pinLabel: { fontSize: "13px", color: "#6E7A88", margin: 0 },
  puntos: { display: "flex", justifyContent: "center", gap: "16px", padding: "20px 0" },
  punto: { width: "13px", height: "13px", borderRadius: "50%", backgroundColor: "#1B232D", border: "2px solid #2A333F" },
  puntoActivo: { width: "13px", height: "13px", borderRadius: "50%", backgroundColor: ACCENT, border: `2px solid ${ACCENT}` },
  error: { color: "#E5484D", textAlign: "center", fontSize: "13px", margin: "0 0 14px", padding: "0 24px" },
  cargando: { color: ACCENT, textAlign: "center", fontSize: "13px", margin: "0 0 14px" },
  teclado: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", padding: "0 36px 36px", marginTop: "8px" },
  tecla: { backgroundColor: "#141A22", border: "1px solid #1F2832", borderRadius: "16px", color: "#EAF0F3", fontSize: "22px", fontWeight: "400", padding: "18px", cursor: "pointer" },
  teclaBorrar: { backgroundColor: "transparent", border: "none", borderRadius: "16px", color: "#6E7A88", fontSize: "20px", padding: "18px", cursor: "pointer" },

  agHeader: { display: "flex", alignItems: "center", gap: "10px", padding: "16px 14px 13px", borderBottom: "1px solid #161D26", flexShrink: 0 },
  agBack: { background: "none", border: "none", color: "#6E7A88", fontSize: "24px", cursor: "pointer", padding: "0 2px", lineHeight: 1 },
  agAvatarWrap: { position: "relative", flexShrink: 0 },
  avatarSm: { width: "34px", height: "34px", borderRadius: "10px", backgroundColor: "#1C2530", color: "#9FB0BE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", fontFamily: "ui-monospace, monospace" },
  agStatusDot: { position: "absolute", bottom: "-2px", right: "-2px", width: "10px", height: "10px", borderRadius: "50%", border: "2px solid #0A0D12" },
  agInfo: { flex: 1, minWidth: 0 },
  agNombre: { fontSize: "14px", fontWeight: "600", color: "#EAF0F3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  agMeta: { fontFamily: "ui-monospace, monospace", fontSize: "10px", color: "#6E7A88", letterSpacing: "1px", marginTop: "1px" },
  agSalir: { background: "none", border: "1px solid #232C37", borderRadius: "8px", color: "#6E7A88", fontSize: "12px", padding: "6px 11px", cursor: "pointer", flexShrink: 0 },

  chatArea: { flex: 1, padding: "16px 14px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "11px", minHeight: 0 },
  bubbleAgent: { backgroundColor: "#141A22", borderRadius: "15px 15px 15px 5px", padding: "11px 14px", maxWidth: "85%", alignSelf: "flex-start" },
  bubbleUser: { backgroundColor: "#0F2A26", border: "1px solid #1A4F47", borderRadius: "15px 15px 5px 15px", padding: "11px 14px", maxWidth: "85%", alignSelf: "flex-end" },
  bubbleTexto: { fontSize: "14px", color: "#DCE3E8", margin: 0, lineHeight: "1.55" },
  typing: { display: "flex", gap: "5px", padding: "3px 2px" },
  typingDot: { width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#566472", display: "inline-block", animation: "typingBounce 1.2s infinite ease-in-out" },

  chipsRow: { display: "flex", gap: "7px", padding: "8px 14px 0", overflowX: "auto", flexShrink: 0 },
  chip: { fontSize: "12.5px", color: "#9FB0BE", backgroundColor: "#141A22", border: "1px solid #232C37", borderRadius: "16px", padding: "7px 13px", whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0 },

  inputArea: { display: "flex", gap: "8px", padding: "11px 14px 16px", flexShrink: 0 },
  inputChat: { flex: 1, backgroundColor: "#141A22", border: "1px solid #232C37", borderRadius: "13px", color: "#EAF0F3", fontSize: "15px", padding: "12px 14px", outline: "none" },
  btnEnviar: { backgroundColor: ACCENT, border: "none", borderRadius: "13px", color: "#06201C", fontSize: "20px", fontWeight: "700", width: "46px", cursor: "pointer", flexShrink: 0 },
  btnMic: { backgroundColor: "#141A22", border: "1px solid #232C37", borderRadius: "13px", color: "#9FB0BE", fontSize: "18px", width: "46px", cursor: "pointer", flexShrink: 0 },
  btnMicActivo: { backgroundColor: "#E5484D", borderColor: "#E5484D", color: "#FFFFFF" },
};