# music-server

Backend independiente para exponer biblioteca, metadata, playlists y streaming de audio original para la app desktop y una futura app movil.

## Objetivo

Esta carpeta arranca la base del servidor que luego podra:

- indexar tu biblioteca musical
- servir metadata y caratulas
- hacer streaming del archivo original
- manejar autenticacion y sesiones
- abrir acceso remoto real mas adelante

## Estado actual

La base creada incluye:

- servidor HTTP en Rust con `axum`
- configuracion por variables de entorno
- lectura real de carpetas de musica
- deteccion automatica de rutas desde la base de datos de tu app desktop
- portada embebida por endpoint
- streaming del archivo original con soporte `Range`
- rutas iniciales:
  - `GET /health`
  - `GET /api/v1/library/tracks`
  - `GET /api/v1/library/tracks/:id`
  - `GET /api/v1/library/tracks/:id/cover`
  - `GET /api/v1/library/tracks/:id/stream`
  - `POST /api/v1/library/rescan`

## Variables de entorno

- `MUSIC_SERVER_HOST` default: `127.0.0.1`
- `MUSIC_SERVER_PORT` default: `4850`
- `MUSIC_LIBRARY_ROOT` opcional
- `MUSIC_SERVER_AUTH_TOKEN` opcional

Si `MUSIC_LIBRARY_ROOT` no se define, `music-server` intenta leer las carpetas de musica desde la base SQLite de tu app desktop en `%APPDATA%\\com.tauri.dev\\library_cache.db`.

## Ejecutar

```powershell
cd C:\Proyectos\app-desk-musica\music-server
cargo run
```

## Siguiente paso recomendado

Implementar el indexado real de canciones y el endpoint de streaming con soporte `Range`, para preservar la calidad original.
