# Apex Dashboard — 50K Intraday Trailing Drawdown

Dashboard de trading para la cuenta **Apex Trader Funding 50K Intraday**. Calcula el suelo (trailing
drawdown) en tiempo real, dice cuánto arriesgar por trade, cuántos trades quedan antes de tocar el
suelo, registra el diario del día y sirve todas las tablas de referencia (ticks, símbolos, horarios,
reglas Apex). Todo funciona en el navegador — **sin servidor, sin backend** — y persiste en
`localStorage`. Funciona offline una vez cargada.

Plataforma de trading de referencia: **Wealthcharts** · contrato principal **MNQ1 / MNQU6**.

## Stack

- React + Vite
- TailwindCSS (tema oscuro `#0D1117`)
- Zustand con persistencia en `localStorage`
- Recharts (gráfico balance vs suelo vs objetivo)

## Puesta en marcha

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # build de producción en dist/
npm run preview  # sirve el build
```

## Pantallas

1. **Dashboard** — balance/peak/fecha, 8 tarjetas de métricas, banners de alerta, progreso al objetivo.
2. **Calculadora** — riesgo exacto en $, R:R, semáforo y texto del Bracket Order con botón *copiar*.
3. **Diario** — registro de trades, tabla del día con P&L acumulado, historial en acordeón, export CSV.
4. **Suelo** — tabla de seguimiento diario (peak arrastrado) y gráfico balance/suelo/objetivo.
5. **Referencia** — checklist pre-trade, tablas de ticks y brackets, símbolos, horarios y reglas Apex.
6. **Configuración** — parámetros de la cuenta y del plan de riesgo, export/import JSON, reset.

## Lógica del suelo (regla crítica)

El suelo sube también con ganancias **no realizadas**. El peak nunca baja: cada cierre por encima del
máximo histórico eleva el suelo de forma permanente.

```
suelo   = peakBalance − drawdownMáximo
margen  = balanceActual − suelo
trades  = floor(margen / riesgoPorTrade)
```

## Deploy (Vercel / Netlify)

El proyecto es 100% estático. En cualquiera de los dos:

- **Build command:** `npm run build`
- **Output directory:** `dist`

`vercel.json` y `netlify.toml` ya incluyen el *rewrite* de SPA.

## Datos

Todo vive en este navegador. Exporta el JSON desde **Configuración** de vez en cuando como copia de
seguridad; si borras los datos del sitio o cambias de dispositivo, se pierde el histórico.
