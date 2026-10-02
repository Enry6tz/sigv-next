import Link from "next/link";

export default function NotFound() {
  return <div className="error-page"><span>404</span><h1>Página no disponible</h1><p>La sección puede pertenecer a otro sprint o todavía no existir.</p><Link href="/" className="button dark">Volver al inicio</Link></div>;
}
