# Cobranza Amarah v2

Sistema de cobranza del proyecto Amarah — Grupo Ureca de México.
Next.js + Supabase (Postgres, Auth, Realtime), desplegado en Vercel.

## Desarrollo local

```bash
npm install
npm run dev        # abre http://localhost:3000
```

Las credenciales de Supabase están en `.env.local` (no se sube a git).

## Despliegue en Vercel

1. Sube este proyecto a un repo nuevo de GitHub (ej. `cobranza-amarah-v2`).
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo.
3. En **Environment Variables** agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://cszvlhtfitjuvumkabyk.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (la anon key)
4. **Deploy**. Cada push a `main` re-despliega solo.

## Estructura

- `app/login` — acceso con correo y contraseña (Supabase Auth)
- `app/(app)/dashboard` — KPIs de cartera
- `app/(app)/cartera` — cartera vencida con búsqueda, filtro de riesgo y modal de expediente
- `app/(app)/hoy` — vencidas sin resolver + programadas hoy (vista `v_pendientes_hoy`)
- `app/(app)/proximas` — compromisos y acciones futuras
- `components/ExpedienteModal.js` — gestión completa del folio
- `01_schema.sql` / `02_usuarios_y_realtime.sql` — base de datos

## Pendiente (fases siguientes)

- Fase 4: generación de cartas PDF + módulo de importación de reportes
- Fase 5: corte de la app vieja
- Fase 6: sincronización automática con la API de Adara CRM
