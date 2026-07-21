'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) {
      setError('Correo o contraseña incorrectos. Intenta de nuevo.');
      return;
    }
    router.replace('/dashboard');
  };

  return (
    <div className="login-fondo">
      <div className="login-caja">
        <h1>Cobranza <em style={{ color: 'var(--oro)', fontStyle: 'normal' }}>Amarah</em></h1>
        <div className="marca">Grupo Ureca de México</div>
        <hr className="linea-oro" />
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={entrar}>
          <input type="email" placeholder="Correo" value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <input type="password" placeholder="Contraseña" value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <button className="btn oro" disabled={cargando} type="submit">
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
