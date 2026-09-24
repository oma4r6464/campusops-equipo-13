# Auditoria de seguridad Semana 4

## Datos de entrega

- Nombre: Samuel Jonathan Trujillo Bolanos
- Matricula: 3523110007
- GitHub: KIRA21M
- Repositorio: https://github.com/oma4r6464/campusops-equipo-13
- Rama de trabajo: week4/security-audit-samuel

## Alcance

Esta auditoria revisa el proyecto CampusOps en la rama individual de Semana 4. Se buscaron exposiciones de datos sensibles en telemetria, configuracion local, archivos versionados y dependencias. Todos los datos usados en pruebas son ficticios.

## Hallazgos

| # | Hallazgo | Riesgo | Solucion aplicada | Evidencia |
|---|---|---|---|---|
| 1 | `redactForTelemetry` seguia pendiente y no sanitizaba objetos reales | Tokens, correos, ubicacion, fotos, comentarios internos o historial podian quedar visibles en logs o reportes tecnicos | Se implemento `src/security/redactForTelemetry.ts` y el adaptador evaluable ahora llama esa logica real | `docs/evidence/sanitizacion-telemetria.txt` |
| 2 | `.env.example` contenia un valor local concreto en vez de funcionar como plantilla vacia | El equipo podia copiar configuraciones reales al repositorio o confundir una URL de desarrollo con configuracion entregable | Se dejo la variable sin valor y se agrego advertencia de no colocar secretos reales | `docs/evidence/gitignore-env.txt` |
| 3 | `npm audit` reporta vulnerabilidades altas transitivas en paquetes de la cadena Expo | Una dependencia vulnerable podria ampliar el riesgo si se usa fuera del entorno controlado o se procesa entrada no confiable | No se actualizo el lockfile porque el curso fija versiones; queda documentado como riesgo residual a revisar antes de distribucion | `docs/evidence/auditoria-dependencias.txt` |

## Hallazgo 1 Sanitizacion de telemetria

### Problema encontrado

La funcion `redactForTelemetry` en `src/course-evaluation/index.ts` lanzaba un error de pendiente. Eso dejaba sin implementar el contrato de privacidad descrito en `docs/CAMPUSOPS_API.md`.

### Riesgo

Si un flujo de error o diagnostico registra objetos completos, podrian quedar expuestos valores como `authorization`, `accessToken`, `email`, `displayName`, `location`, `photos`, `internalComments` o `assignmentHistory`.

### Correccion

Se creo `src/security/redactForTelemetry.ts` con recorrido recursivo de objetos y listas. La funcion no muta la entrada original, normaliza claves con guion o guion bajo, reemplaza campos sensibles por `[REDACTED]` y conserva contexto tecnico seguro como `incidentId`, `correlationId`, `status`, `attempt` y `durationMs`.

### Evidencia

Se ejecuto:

```bash
npm test -- --ci --runInBand course-tests/public/week-04.test.ts course-tests/week-04-security-audit.test.ts
```

Resultado observado: 2 suites pasaron, 3 pruebas pasaron.

## Hallazgo 2 Plantilla de entorno

### Problema encontrado

El proyecto usa `EXPO_PUBLIC_COURSE_BACKEND_URL` para configurar el backend didactico. La plantilla `.env.example` tenia un valor local concreto, lo que no es un secreto, pero si podia normalizar la practica de dejar valores reales escritos en archivos versionados.

### Riesgo

En Expo, cualquier variable `EXPO_PUBLIC_*` queda expuesta al cliente. Si en el futuro se coloca ahi un token, clave privada o credencial de proveedor, esa informacion quedaria visible.

### Correccion

Se dejo `.env.example` como plantilla sin valor y con una advertencia de no colocar secretos reales.

### Evidencia

Se reviso `.gitignore` y se confirmo que `.env` esta ignorado. Tambien se ejecuto un escaneo de patrones de secretos sin coincidencias.

## Hallazgo 3 Dependencias con avisos de seguridad

### Problema encontrado

`npm audit --omit=dev --audit-level=high` reporta vulnerabilidades altas transitivas relacionadas con `@xmldom/xmldom` y `js-yaml`.

### Riesgo

Aunque el proyecto usa dependencias fijadas por el curso y no procesa datos reales de produccion, estas alertas deben revisarse antes de un build distribuible fuera del entorno academico.

### Correccion o estado

No se modifico `package-lock.json` porque la actividad y el proyecto fijan versiones para reproducibilidad. El riesgo queda documentado como residual y debe revisarse cuando el curso permita actualizar dependencias.

### Evidencia

La salida resumida se conserva en `docs/evidence/auditoria-dependencias.txt`.

## Comprobacion final

- `npm run typecheck`: paso.
- Pruebas de sanitizacion y prueba publica de Semana 4: pasaron.
- Escaneo local de patrones de secretos: sin coincidencias.
- `.env` permanece cubierto por `.gitignore`.
- No se usaron datos reales.
