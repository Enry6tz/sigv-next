import Link from "next/link";

export default function SectionNotFound() {
  return <div className="empty-state"><strong>Sección no disponible</strong><p>Esta función no está habilitada para el rol o sprint seleccionado.</p><Link className="button dark" href="/">Volver al inicio</Link></div>;
}
