# Estrategia de caché de CampusOps

## Alcance

El archivo `public/sw.js` se utiliza únicamente en la exportación web de Expo. El
registro en `index.ts` comprueba la disponibilidad de `navigator.serviceWorker`, por
lo que Android e iOS no dependen de APIs del navegador.

## Ciclo de vida

- **Install:** crea un caché estático versionado y precarga `/` y `/offline.html`.
  Cada precarga es tolerante a fallos para que una publicación parcial no deje al
  worker en estado de instalación fallida.
- **Activate:** elimina cachés `campusops-*` de versiones anteriores y reclama las
  páginas abiertas. El mensaje `SKIP_WAITING` permite que una actualización aprobada
  avance de forma explícita.
- **Fetch:** ignora métodos distintos de `GET` y solicitudes cross-origin.

## Estrategias

- Navegación HTML: **network-first**. La respuesta fresca se guarda en el caché de
  runtime; sin red se usa la navegación almacenada, luego `offline.html`.
- CSS, JavaScript, imágenes, fuentes y workers: **cache-first**, con descarga y
  almacenamiento de respaldo cuando el recurso aún no existe.
- Otras solicitudes GET del mismo origen: **network-first** con caché runtime como
  último recurso.

Las respuestas no exitosas no se almacenan. Los nombres incluyen una versión para
hacer atómica la limpieza durante `activate`.

## Supuestos y límites

Esta caché no reemplaza la persistencia de incidencias ni sincroniza mutaciones:
las peticiones `POST`, `PUT`, `PATCH` y `DELETE` siempre llegan a la red. No se
cachean respuestas cross-origin ni se pretende almacenar información sensible. El
shell inicial debe existir en la exportación web; si no existe, el navegador conserva
el comportamiento normal de error de red. La invalidación de datos de negocio queda
fuera del alcance de este worker y requiere una política de sincronización posterior.
