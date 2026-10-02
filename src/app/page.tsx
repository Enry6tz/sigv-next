import Link from "next/link";
import { appSprint, dataProvider } from "@/lib/sprint";

export default function Home() {
  const live = dataProvider === "supabase";
  return <>
    <header className="site-header">
      <Link href="/" className="brand"><span className="brand-mark">✈</span><span><strong>SIGV</strong><small>AEROLÍNEA NACIONAL</small></span></Link>
      <nav className="header-nav" aria-label="Navegación pública">
        <Link className="active" href="/">Buscar vuelos</Link>
        <Link href="/ingresar">Iniciar sesión</Link>
        <Link className="button dark small" href="/registro">Registrarse</Link>
      </nav>
    </header>
    <main>
      <section className="hero">
        <div className="container">
          <p className="kicker light">BUSCADOR DE VUELOS</p>
          <h1>¿A dónde vas hoy?</h1>
          <p>Explorá destinos, horarios y tarifas desde un solo lugar.</p>
          <form className="search-bar" action="/pasajero/buscar-vuelos">
            <label>Origen<select name="origin" defaultValue="EZE"><option value="EZE">Buenos Aires (EZE)</option><option value="AEP">Buenos Aires (AEP)</option><option value="COR">Córdoba (COR)</option><option value="MDZ">Mendoza (MDZ)</option></select></label>
            <label>Destino<select name="destination" defaultValue="BRC"><option value="BRC">Bariloche (BRC)</option><option value="MDZ">Mendoza (MDZ)</option><option value="SCL">Santiago (SCL)</option><option value="USH">Ushuaia (USH)</option></select></label>
            <label>Fecha de ida<input name="date" type="date" /></label>
            <label>Pasajeros<select name="passengers"><option value="1">1 pasajero</option><option value="2">2 pasajeros</option><option value="3">3 pasajeros</option></select></label>
            <button type="submit" className="button dark">Buscar vuelos</button>
          </form>
          <div className="hero-tabs"><span className="selected">Solo ida</span><span>Ida y vuelta · próximamente</span></div>
        </div>
      </section>
      <section className="container home-content">
        <div className="section-heading"><div><p className="kicker">EXPLORAR SIGV</p><h2>Tu viaje empieza acá</h2></div><span className="demo-tag">{live ? "SUPABASE" : "DEMO"} · SPRINT {appSprint}</span></div>
        <div className="feature-grid">
          <Link href="/pasajero/inicio" className="feature-card"><span className="feature-icon">01</span><h3>Portal de pasajeros</h3><p>Buscá vuelos, revisá tus reservas y seguí el estado de tu viaje.</p><span className="text-link">Ingresar →</span></Link>
          <Link href="/admin/inicio" className="feature-card"><span className="feature-icon">02</span><h3>Administración</h3><p>Programaciones, cupos, tarifas y operación de vuelos.</p><span className="text-link">Ingresar →</span></Link>
          {appSprint >= 2 && <Link href="/mostrador/inicio" className="feature-card"><span className="feature-icon">03</span><h3>Mostrador</h3><p>Manifiesto, check-in y emisión del pase de embarque.</p><span className="text-link">Ingresar →</span></Link>}
        </div>
        <p className="prototype-note">{live ? "Vuelos y cuentas conectados al proyecto SIGV. Los pagos siguen siendo de prueba y no procesan dinero." : "Los datos y respuestas son ficticios. Este entorno sirve para revisar la estructura y los recorridos antes de conectar servicios reales."}</p>
      </section>
    </main>
  </>;
}
