'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const TABS = [
  ['/dashboard', 'Dashboard', '📊'],
  ['/cartera', 'Cartera', '📁'],
  ['/hoy', 'Hoy', '☀️'],
  ['/proximas', 'Próximas', '🗓️'],
];

export default function AppLayout({ children }) {
  const router = useRouter();
  const ruta = usePathname();
  const [perfil, setPerfil] = useState(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!activo) return;
      if (!session) { router.replace('/login'); return; }
      const { data } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
      if (!activo) return;
      if (!data || !data.activo) {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
      }
      setPerfil(data);
      setListo(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/login');
    });
    return () => { activo = false; sub.subscription.unsubscribe(); };
  }, [router]);

  const salir = async () => { await supabase.auth.signOut(); };

  if (!listo) return <div className="vacio" style={{ paddingTop: 80 }}>Cargando…</div>;

  return (
    <div className="marco">
      <header className="barra">
        <span className="logo">Cobranza <em>Amarah</em></span>
        <nav>
          {TABS.map(([href, nombre]) => (
            <Link key={href} href={href} className={ruta.startsWith(href) ? 'activa' : ''}>{nombre}</Link>
          ))}
        </nav>
        <span className="usuario">{perfil?.nombre}</span>
        <button className="salir" onClick={salir}>Salir</button>
      </header>
      <main className="contenido">{children}</main>
      <nav className="tabbar">
        {TABS.map(([href, nombre, ic]) => (
          <Link key={href} href={href} className={ruta.startsWith(href) ? 'activa' : ''}>
            <span className="ic">{ic}</span>{nombre}
          </Link>
        ))}
      </nav>
    </div>
  );
}
