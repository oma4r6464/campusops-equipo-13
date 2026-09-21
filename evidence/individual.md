# Evidencia individual de la Semana 03

## Versión evaluada

- Equipo: `equipo-13`
- Rama: `main`
- SHA de la versión técnica evaluada: `ca5b0c330164255c8423e9351555e08534587be5`

## Decisión técnica

Se implementó un Service Worker versionado en `public/sw.js` con precache tolerante
para el shell web, caché estático cache-first y caché runtime network-first para
navegaciones y solicitudes GET del mismo origen. Las mutaciones nunca se cachean.
La activación elimina versiones anteriores y el mensaje `SKIP_WAITING` permite una
actualización explícita. El registro se mantiene opcional para no introducir APIs de
navegador en los targets nativos de Expo.

## Pruebas y resultados

Se ejecutaron `npm run typecheck` y las pruebas focalizadas de
`tests/service-worker.spec.ts` y `tests/offline.spec.ts`. El resultado observado fue
exitoso: el worker instala el caché estático, elimina versiones antiguas, acepta la
actualización explícita y entrega `offline.html` cuando una navegación no tiene red.
También se ejecutaron `make verify-week-03` y `make public-test-week-03`, con los
checks de estructura, secretos, esquema y workflow en estado `pass`.

## Limitaciones

La solución cubre navegación y recursos GET del mismo origen, pero no implementa
persistencia local de incidencias ni sincronización de mutaciones. La caché depende de
que la exportación web publique el shell y `offline.html`; tampoco sustituye la
autorización del backend ni debe almacenar datos sensibles.

## Uso declarado de inteligencia artificial

Se utilizó asistencia de inteligencia artificial para proponer y estructurar la
arquitectura del Service Worker, sugerir casos de prueba de ciclo de vida y modo
offline, y organizar los artefactos de documentación y evidencia. El equipo revisó
el código, ajustó la solución a los contratos del repositorio y verificó el resultado
con TypeScript, Jest y los evaluadores públicos de la asignatura.
