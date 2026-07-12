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

const COLOR_SEMAFORO = { rojo: "#E5484D", amarillo: "#F5A623", verde: "#1FBF75", gris: "#3A4450" };

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
  const [odooContext, setOdooContext] = useState(null);
  const [teamContext, setTeamContext] = useState(null);
  const [semaforos, setSemaforos] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [grabando, setGrabando] = useState(false);
  const reconocimientoRef = useRef(null);
  const chatRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensajes, enviando]);

  useEffect(() => {
    const cargarSemaforos = async () => {
      try {
        const res = await fetch('/api/odoo/team');
        const data = await res.json();
        if (!data || data.sinDatosOdoo || !data.vendedores) return;
        const mapa = {};
        for (const v of data.vendedores) {
          if (v.oportunidades === 0) {
            mapa[v.clave] = "gris";
          } else {
            const pctVaradas = v.varadas / v.oportunidades;
            if (pctVaradas > 0.6 || v.actividadesVencidas > 0) mapa[v.clave] = "rojo";
            else if (pctVaradas >= 0.3) mapa[v.clave] = "amarillo";
            else mapa[v.clave] = "verde";
          }
        }
        setSemaforos(mapa);
      } catch { /* si falla, se usan los colores por defecto */ }
    };
    cargarSemaforos();
  }, []);

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

    let ctxOdoo = null;
    try {
      const resOdoo = await fetch(`/api/odoo/summary?clave=${v.clave}`);
      const dataOdoo = await resOdoo.json();
      if (dataOdoo && !dataOdoo.sinDatosOdoo && !dataOdoo.error) {
        ctxOdoo = dataOdoo;
        setOdooContext(dataOdoo);
      } else {
        setOdooContext(null);
      }
    } catch { setOdooContext(null); }

    const nombre = v.nombre.split(" ")[0];
    if (esDir) {
      let ctxTeam = null;
      try {
        const resTeam = await fetch('/api/odoo/team');
        const dataTeam = await resTeam.json();
        if (dataTeam && !dataTeam.sinDatosOdoo && !dataTeam.error) {
          ctxTeam = dataTeam;
          setTeamContext(dataTeam);
        }
      } catch { setTeamContext(null); }

      setMensajes([{ role: "assistant", content: "..." }]);
      setPantalla("agente");
      setEnviando(true);
      try {
        const resSaludo = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mensajes: [{ role: "user", content: "[SALUDO_INICIAL] Dame el estado del equipo para arrancar el día. Breve y directo: total de oportunidades, cuántas varadas hay en total, quién es el vendedor más crítico y por qué, y las actividades vencidas. Termina con una acción concreta para hoy. No menciones que esto es un saludo automático." }],
            vendedor: v.nombre,
            esDirector: true,
            memoria: mem,
            teamContext: ctxTeam,
          }),
        });
        const dataSaludo = await resSaludo.json();
        setMensajes([{ role: "assistant", content: dataSaludo.respuesta || "Bienvenido Ricardo. ¿Qué revisamos hoy?" }]);
      } catch {
        setMensajes([{ role: "assistant", content: "Bienvenido Ricardo. ¿Qué revisamos hoy?" }]);
      }
      setEnviando(false);
    } else {
      setMensajes([{ role: "assistant", content: "..." }]);
      setPantalla("agente");
      setEnviando(true);

      try {
        const resSaludo = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mensajes: [{ role: "user", content: "[SALUDO_INICIAL] Salúdame para arrancar la sesión. Usa mi pipeline real y mis pendientes. Sé breve y directo: menciona el total de oportunidades, la etapa con más volumen, la oportunidad varada más crítica y las actividades vencidas si las hay. Termina con una pregunta que me empuje a la acción. No menciones que esto es un saludo automático." }],
            vendedor: v.nombre,
            esDirector: false,
            memoria: mem,
            odooContext: ctxOdoo,
          }),
        });
        const dataSaludo = await resSaludo.json();
        const texto = dataSaludo.respuesta || `Hola ${nombre}. ¿Qué hiciste hoy?`;
        setMensajes([{ role: "assistant", content: texto }]);
      } catch {
        setMensajes([{ role: "assistant", content: `Hola ${nombre}. ¿Qué hiciste hoy?` }]);
      }
      setEnviando(false);
    }
  };

  const enviarMensaje = async (texto) => {
    const contenido = (texto || "").trim();
    if (!contenido || enviando) return;
    if (grabando && reconocimientoRef.current) {
      reconocimientoRef.current.stop();
      setGrabando(false);
    }
    const nuevo = { role: "user", content: contenido };
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
          odooContext,
          teamContext,
        }),
      });
      const data = await res.json();
      if (data.respuesta) {
        const { textoLimpio, registro } = extraerRegistro(data.respuesta);
        setMensajes((p) => [...p, { role: "assistant", content: textoLimpio || "Listo.", registro, confirmado: false }]);
      }
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
    setMensajes([]); setInputTexto(""); setMemoria(null); setOdooContext(null); setTeamContext(null); setBusqueda("");
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

  const confirmarRegistro = (idx) => {
    setMensajes((prev) => prev.map((m, i) => (i === idx ? { ...m, confirmado: true } : m)));
  };
  const editarRegistro = () => { inputRef.current?.focus(); };

  const manejarTecla = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensaje(inputTexto); }
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
              <span style={{ ...s.semaforoDot, backgroundColor: COLOR_SEMAFORO[(semaforos && semaforos[v.clave]) || v.semaforo] }} />
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
    const colorSem = esDir ? "#00D9C0" : COLOR_SEMAFORO[(semaforos && semaforos[vendedorSeleccionado.clave]) || vendedorSeleccionado.semaforo];
    const chips = esDir
      ? ["Quién está en riesgo", "Top de varadas", "¿Cómo va Rodrigo?"]
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
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: "7px" }}>
              <div style={m.role === "user" ? s.bubbleUser : s.bubbleAgent}>
                <p style={s.bubbleTexto}>
                  {m.content.split("\n").map((linea, idx, arr) => (
                    <span key={idx}>{linea}{idx < arr.length - 1 && <br />}</span>
                  ))}
                </p>
              </div>
              {m.registro && !m.confirmado && (
                <div style={s.registroCard}>
                  <div style={s.registroTipo}>{m.registro.tipo || "REGISTRO"}</div>
                  <div style={s.registroCampos}>
                    {Object.entries(m.registro)
                      .filter(([k, v]) => k !== "tipo" && typeof v === "string" && v.trim() !== "")
                      .map(([k, v]) => (
                        <div key={k} style={s.registroFila}>
                          <span style={s.registroLabel}>{({ oportunidad: "Oportunidad", detalle: "Detalle", proximoPaso: "Próximo paso", contacto: "Contacto", etapa: "Etapa" })[k] || k}</span>
                          <span style={s.registroValor}>{v}</span>
                        </div>
                      ))}
                  </div>
                  <div style={s.registroBotones}>
                    <button style={s.registroConfirmar} onClick={() => confirmarRegistro(i)}>✓ Confirmar</button>
                    <button style={s.registroEditar} onClick={editarRegistro}>Editar</button>
                  </div>
                </div>
              )}
              {m.registro && m.confirmado && (
                <div style={s.registroConfirmado}>✓ Registrado · {m.registro.tipo} {m.registro.oportunidad || ""}</div>
              )}
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
            <button
              key={c}
              style={enviando ? { ...s.chip, opacity: 0.5, cursor: "not-allowed" } : s.chip}
              onClick={() => { if (!enviando) enviarMensaje(c); }}
              disabled={enviando}
            >
              {c}
            </button>
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
          <button style={enviando ? { ...s.btnEnviar, opacity: 0.5 } : s.btnEnviar} onClick={() => enviarMensaje(inputTexto)} disabled={enviando}>↑</button>
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

function extraerRegistro(texto) {
  const match = texto.match(/<<<REGISTRO\s*([\s\S]*?)\s*REGISTRO>>>/);
  if (!match) return { textoLimpio: texto, registro: null };
  let registro = null;
  try { registro = JSON.parse(match[1].trim()); } catch (e) { registro = null; }
  const textoLimpio = texto.replace(match[0], "").trim();
  return { textoLimpio, registro };
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
  fondo: { minHeight: "100dvh", height: "100dvh", backgroundColor: "#05070A", display: "flex", alignItems: "center", justifyContent: "center", padding: "0", fontFamily: "'Inter', -apple-system, sans-serif" },
  dispositivo: { width: "100%", maxWidth: "430px", height: "100dvh", maxHeight: "100dvh", backgroundColor: "#0A0D12", border: "1px solid #1A222C", borderRadius: "0", overflow: "hidden", display: "flex", flexDirection: "column" },
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
  registroCard: { backgroundColor: "#0E1A18", border: "1px solid #14564C", borderRadius: "14px", padding: "13px 14px", maxWidth: "88%" },
  registroTipo: { fontFamily: "ui-monospace, monospace", fontSize: "11px", letterSpacing: "2px", color: ACCENT, marginBottom: "10px" },
  registroCampos: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "13px" },
  registroFila: { display: "flex", gap: "10px" },
  registroLabel: { fontSize: "12px", color: "#6E7A88", minWidth: "92px", flexShrink: 0 },
  registroValor: { fontSize: "13px", color: "#DCE3E8", fontWeight: "500" },
  registroBotones: { display: "flex", gap: "8px" },
  registroConfirmar: { flex: 1, backgroundColor: ACCENT, border: "none", borderRadius: "10px", color: "#06201C", fontSize: "13px", fontWeight: "600", padding: "9px", cursor: "pointer" },
  registroEditar: { backgroundColor: "transparent", border: "1px solid #232C37", borderRadius: "10px", color: "#9FB0BE", fontSize: "13px", padding: "9px 16px", cursor: "pointer" },
  registroConfirmado: { backgroundColor: "#0F2A1C", border: "1px solid #1A4F38", borderRadius: "10px", padding: "8px 12px", fontSize: "12.5px", color: "#1FBF75", fontWeight: "500" },
  btnEnviar: { backgroundColor: ACCENT, border: "none", borderRadius: "13px", color: "#06201C", fontSize: "20px", fontWeight: "700", width: "46px", cursor: "pointer", flexShrink: 0 },
  btnMic: { backgroundColor: "#141A22", border: "1px solid #232C37", borderRadius: "13px", color: "#9FB0BE", fontSize: "18px", width: "46px", cursor: "pointer", flexShrink: 0 },
  btnMicActivo: { backgroundColor: "#E5484D", borderColor: "#E5484D", color: "#FFFFFF" },
};