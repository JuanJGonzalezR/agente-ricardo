import { useState } from "react";

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
  const [pantalla, setPantalla] = useState("inicio"); // inicio | pin | agente
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [intentos, setIntentos] = useState(0);

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
      if (nuevoPin.length === 4) {
        validarPin(nuevoPin);
      }
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
        body: JSON.stringify({
          clave: vendedorSeleccionado.clave,
          pin: pinIngresado,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setPantalla("agente");
        setIntentos(0);
      } else {
        setIntentos((i) => i + 1);
        setError(intentos >= 2 ? "Acceso bloqueado temporalmente." : "PIN incorrecto. Intenta de nuevo.");
        setPin("");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setPin("");
    }
    setCargando(false);
  };

  const cerrarSesion = () => {
    setPantalla("inicio");
    setVendedorSeleccionado(null);
    setPin("");
    setError("");
    setIntentos(0);
  };

  // ── PANTALLA INICIO ──────────────────────────────────────────
  if (pantalla === "inicio") {
    return (
      <div style={estilos.contenedor}>
        <div style={estilos.header}>
          <div style={estilos.logo}>NANOSCHUTZ</div>
          <div style={estilos.logoSub}>Agente Ricardo</div>
        </div>
        <p style={estilos.instruccion}>¿Quién eres?</p>
        <div style={estilos.listaVendedores}>
          {VENDEDORES.filter(v => !v.director).map((v) => (
            <button
              key={v.clave}
              style={estilos.cardVendedor}
              onClick={() => seleccionarVendedor(v)}
            >
              <div style={estilos.avatar}>{v.inicial}</div>
              <span style={estilos.nombreVendedor}>{v.nombre}</span>
              <span style={estilos.chevron}>›</span>
            </button>
          ))}
          <button
            key="RICARDO"
            style={{ ...estilos.cardVendedor, ...estilos.cardDirector }}
            onClick={() => seleccionarVendedor(VENDEDORES.find(v => v.director))}
          >
            <div style={{ ...estilos.avatar, ...estilos.avatarDirector }}>RG</div>
            <span style={estilos.nombreVendedor}>Ricardo Gárate</span>
            <span style={{ ...estilos.badge }}>Director</span>
          </button>
        </div>
      </div>
    );
  }

  // ── PANTALLA PIN ─────────────────────────────────────────────
  if (pantalla === "pin") {
    return (
      <div style={estilos.contenedor}>
        <button style={estilos.btnVolver} onClick={() => setPantalla("inicio")}>
          ← Volver
        </button>
        <div style={estilos.pinHeader}>
          <div style={vendedorSeleccionado.director ? { ...estilos.avatar, ...estilos.avatarDirector, ...estilos.avatarGrande } : { ...estilos.avatar, ...estilos.avatarGrande }}>
            {vendedorSeleccionado.inicial}
          </div>
          <p style={estilos.pinNombre}>{vendedorSeleccionado.nombre}</p>
          <p style={estilos.pinLabel}>Ingresa tu PIN</p>
        </div>

        <div style={estilos.puntosContainer}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={pin.length > i ? estilos.puntoActivo : estilos.punto}
            />
          ))}
        </div>

        {error && <p style={estilos.error}>{error}</p>}
        {cargando && <p style={estilos.cargando}>Verificando...</p>}

        <div style={estilos.teclado}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              style={estilos.tecla}
              onClick={() => ingresarDigito(String(n))}
              disabled={cargando || pin.length === 4}
            >
              {n}
            </button>
          ))}
          <div style={estilos.teclaVacia} />
          <button
            style={estilos.tecla}
            onClick={() => ingresarDigito("0")}
            disabled={cargando || pin.length === 4}
          >
            0
          </button>
          <button
            style={estilos.teclaBorrar}
            onClick={borrarDigito}
            disabled={cargando}
          >
            ⌫
          </button>
        </div>
      </div>
    );
  }

  // ── PANTALLA AGENTE ──────────────────────────────────────────
  if (pantalla === "agente") {
    return (
      <div style={estilos.contenedor}>
        <div style={estilos.agenteHeader}>
          <div style={estilos.agenteInfo}>
            <span style={estilos.agenteNombre}>
              {vendedorSeleccionado.director ? "👔 " : "👋 "}
              {vendedorSeleccionado.nombre}
            </span>
            <button style={estilos.btnCerrar} onClick={cerrarSesion}>
              Salir
            </button>
          </div>
        </div>
        <div style={estilos.chatArea}>
          <div style={estilos.mensajeBienvenida}>
            {vendedorSeleccionado.director ? (
              <>
                <p style={estilos.mensajeTexto}>
                  Bienvenido Ricardo. Aquí tienes el estado del equipo comercial.
                  ¿Qué quieres revisar hoy?
                </p>
                <div style={estilos.opcionesDirector}>
                  <button style={estilos.opcion}>📊 Estado del equipo</button>
                  <button style={estilos.opcion}>🚨 Alertas del día</button>
                  <button style={estilos.opcion}>📈 Oportunidades en riesgo</button>
                </div>
              </>
            ) : (
              <>
                <p style={estilos.mensajeTexto}>
                  Hola {vendedorSeleccionado.nombre.split(" ")[0]}. ¿Qué hacemos hoy?
                </p>
                <div style={estilos.opcionesVendedor}>
                  <button style={estilos.opcion}>📋 Reportar actividades</button>
                  <button style={estilos.opcion}>🏢 Actualizar oportunidades</button>
                  <button style={estilos.opcion}>📅 Agendar visita</button>
                  <button style={estilos.opcion}>📍 Registrar llegada</button>
                </div>
              </>
            )}
          </div>
        </div>
        <div style={estilos.inputArea}>
          <input
            style={estilos.inputChat}
            placeholder="Escribe aquí..."
            disabled
          />
          <button style={estilos.btnEnviar}>›</button>
        </div>
      </div>
    );
  }
}

// ── ESTILOS ───────────────────────────────────────────────────
const estilos = {
  contenedor: {
    minHeight: "100vh",
    backgroundColor: "#0D0D0D",
    color: "#FFFFFF",
    fontFamily: "'Inter', -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
    maxWidth: "430px",
    margin: "0 auto",
    padding: "0 0 40px 0",
  },
  header: {
    padding: "40px 24px 16px",
    borderBottom: "1px solid #1A1A1A",
  },
  logo: {
    fontSize: "11px",
    letterSpacing: "4px",
    color: "#00C896",
    fontWeight: "700",
  },
  logoSub: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: "4px",
  },
  instruccion: {
    padding: "24px 24px 8px",
    fontSize: "13px",
    color: "#666666",
    letterSpacing: "1px",
    textTransform: "uppercase",
    margin: 0,
  },
  listaVendedores: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "0 16px",
  },
  cardVendedor: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    backgroundColor: "#141414",
    border: "none",
    borderRadius: "12px",
    padding: "14px 16px",
    cursor: "pointer",
    color: "#FFFFFF",
    textAlign: "left",
    transition: "background 0.15s",
    width: "100%",
  },
  cardDirector: {
    marginTop: "12px",
    backgroundColor: "#0F1F18",
    border: "1px solid #00C89633",
  },
  avatar: {
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    backgroundColor: "#1E1E1E",
    color: "#888888",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.5px",
    flexShrink: 0,
  },
  avatarDirector: {
    backgroundColor: "#00C89622",
    color: "#00C896",
  },
  avatarGrande: {
    width: "64px",
    height: "64px",
    borderRadius: "20px",
    fontSize: "18px",
    margin: "0 auto 12px",
  },
  nombreVendedor: {
    flex: 1,
    fontSize: "15px",
    fontWeight: "500",
    color: "#EEEEEE",
  },
  chevron: {
    color: "#444444",
    fontSize: "20px",
  },
  badge: {
    fontSize: "11px",
    color: "#00C896",
    fontWeight: "600",
    letterSpacing: "0.5px",
    backgroundColor: "#00C89615",
    padding: "3px 8px",
    borderRadius: "6px",
  },
  btnVolver: {
    background: "none",
    border: "none",
    color: "#666666",
    fontSize: "14px",
    padding: "24px",
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  pinHeader: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "8px 24px 24px",
  },
  pinNombre: {
    fontSize: "20px",
    fontWeight: "700",
    margin: "0 0 4px",
    color: "#FFFFFF",
  },
  pinLabel: {
    fontSize: "13px",
    color: "#666666",
    margin: 0,
  },
  puntosContainer: {
    display: "flex",
    justifyContent: "center",
    gap: "16px",
    padding: "24px 0",
  },
  punto: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "#222222",
    border: "2px solid #333333",
  },
  puntoActivo: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "#00C896",
    border: "2px solid #00C896",
  },
  error: {
    color: "#FF4444",
    textAlign: "center",
    fontSize: "13px",
    margin: "0 0 16px",
    padding: "0 24px",
  },
  cargando: {
    color: "#00C896",
    textAlign: "center",
    fontSize: "13px",
    margin: "0 0 16px",
  },
  teclado: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
    padding: "0 32px",
    marginTop: "8px",
  },
  tecla: {
    backgroundColor: "#1A1A1A",
    border: "none",
    borderRadius: "14px",
    color: "#FFFFFF",
    fontSize: "22px",
    fontWeight: "400",
    padding: "20px",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  teclaBorrar: {
    backgroundColor: "#1A1A1A",
    border: "none",
    borderRadius: "14px",
    color: "#888888",
    fontSize: "20px",
    padding: "20px",
    cursor: "pointer",
  },
  teclaVacia: {
    backgroundColor: "transparent",
  },
  agenteHeader: {
    borderBottom: "1px solid #1A1A1A",
    padding: "20px 20px 16px",
  },
  agenteInfo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agenteNombre: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#FFFFFF",
  },
  btnCerrar: {
    background: "none",
    border: "1px solid #2A2A2A",
    borderRadius: "8px",
    color: "#666666",
    fontSize: "12px",
    padding: "6px 12px",
    cursor: "pointer",
  },
  chatArea: {
    flex: 1,
    padding: "20px",
    overflowY: "auto",
  },
  mensajeBienvenida: {
    backgroundColor: "#141414",
    borderRadius: "16px",
    padding: "16px",
  },
  mensajeTexto: {
    fontSize: "15px",
    color: "#EEEEEE",
    margin: "0 0 16px",
    lineHeight: "1.5",
  },
  opcionesVendedor: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  opcionesDirector: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  opcion: {
    backgroundColor: "#1E1E1E",
    border: "1px solid #2A2A2A",
    borderRadius: "10px",
    color: "#EEEEEE",
    fontSize: "14px",
    padding: "12px 16px",
    cursor: "pointer",
    textAlign: "left",
  },
  inputArea: {
    display: "flex",
    gap: "8px",
    padding: "12px 16px",
    borderTop: "1px solid #1A1A1A",
  },
  inputChat: {
    flex: 1,
    backgroundColor: "#141414",
    border: "1px solid #2A2A2A",
    borderRadius: "12px",
    color: "#FFFFFF",
    fontSize: "15px",
    padding: "12px 16px",
    outline: "none",
  },
  btnEnviar: {
    backgroundColor: "#00C896",
    border: "none",
    borderRadius: "12px",
    color: "#000000",
    fontSize: "22px",
    fontWeight: "700",
    width: "48px",
    cursor: "pointer",
  },
};
