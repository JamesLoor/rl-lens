# RL Insights

App de escritorio local que se conecta a la Stats API de Rocket League y genera un post-match report con 3–5 insights reveladores por partida.

## Stack

- Electron 28 + TypeScript
- WebSocket client: `ws`
- UI: HTML + CSS vanilla (sin frameworks)
- Persistencia: SQLite via `better-sqlite3`

---

## 1. Activar la Stats API en Rocket League

Editá (o creá) el archivo:

**macOS / Linux**
```
~/Library/Application Support/Rocket League/TAGame/Config/DefaultStatsAPI.ini
```

**Windows**
```
%APPDATA%\Rocket League\TAGame\Config\DefaultStatsAPI.ini
```

Añadí estas líneas:

```ini
[LanStatsServer]
bEnabled=True
WebSocketEnabled=True
Port=49122
```

Reiniciá Rocket League. La app se conecta a `ws://localhost:49122`.

---

## 2. Correr en desarrollo

```bash
npm install
npm run dev
```

`npm run dev` compila TypeScript y abre Electron. Para desarrollo iterativo:

```bash
# Terminal 1 — watch mode
npx tsc -w

# Terminal 2 — una vez compilado
npx electron .
```

---

## 3. Build de producción

```bash
npm run build
```

Genera el instalador en `release/`.

---

## Estructura del proyecto

```
src/
  main.ts              # Electron main process
  preload.ts           # contextBridge API para el renderer
  socket/
    client.ts          # WebSocket client con reconnect exponencial
    events.ts          # Tipos de los eventos del socket
  match/
    collector.ts       # Acumula eventos durante el match
    analyzer.ts        # Genera insights desde el buffer
  insights/
    rules.ts           # Cada insight como función pura testeable
    baselines.json     # Promedios SSL hardcodeados (ver nota abajo)
  db/
    schema.sql
    queries.ts
  renderer/
    index.html
    styles.css
    app.js
```

---

## Insights generados

| ID | Qué mide |
|----|----------|
| `shooting_efficiency` | % de conversión (goals/shots) vs SSL y promedio propio |
| `boost_starvation` | % del partido con boost < 25 |
| `passivity` | Toques/minuto vs promedio propio |
| `defensive_solidity` | Saves vs promedio propio |
| `historical_comparison` | Si fue tu peor % de tiro en los últimos 20 partidos |

---

## Nota sobre los baselines SSL

Los valores en `src/insights/baselines.json` son aproximaciones de SSL. Para una v2, obtener promedios reales desde Ballchasing API o RLCS stats, diferenciados por playlist (1v1, 2v2, 3v3). Los números cambian significativamente entre modos.

---

## Datos y privacidad

Todo corre localmente. No se conecta a APIs externas. La base de datos SQLite se guarda en:

- **macOS**: `~/Library/Application Support/rocket-league-stats/matches.db`
- **Windows**: `%APPDATA%\rocket-league-stats\matches.db`
