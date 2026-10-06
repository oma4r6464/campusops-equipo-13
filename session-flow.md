# Session flow

## Flujo normal

```text
No autenticado
  |
  v
Login con actor CampusOps
  |
  v
Credenciales validas
  |
  v
Sesion valida
  |
  v
Peticiones al backend con Authorization: Bearer <accessToken>
```

La aplicacion conserva el estado de sesion en una frontera separada de la interfaz. Las pantallas pueden mostrar acciones por perfil, pero las operaciones tambien validan permisos antes de resolver, cerrar o reabrir una incidencia.

## Token expirado con tres peticiones concurrentes

```text
GET /profile      -> 401
GET /incidents    -> 401
GET /assignments  -> 401

Existe refresh en proceso?

No:
  crear refresh compartido
  guardar refreshPromise

Si:
  esperar refreshPromise existente

refresh correcto
  |
  v
guardar nuevo accessToken
  |
  v
reintentar cada peticion original una sola vez
```

El comportamiento esperado es que `refreshCount` sea `1`. La primera peticion que detecta el `401` inicia la renovacion, mientras que las demas esperan la misma promesa. Cuando el token nuevo queda disponible, las tres peticiones se reintentan con la nueva generacion.

## Refresh fallido

```text
Refresh
  |
  v
Error / 401 / token obsoleto
  |
  v
Eliminar accessToken y refreshToken
  |
  v
Limpiar usuario activo
  |
  v
Regresar a Login
```

Si la renovacion falla no se vuelve a intentar indefinidamente. La peticion original queda marcada como ya reintentada para evitar el ciclo `401 -> refresh -> 401 -> refresh`, y la sesion vuelve al estado no autenticado.

## Evidencia local controlada

Caso exitoso esperado:

```text
REQUEST /profile
REQUEST /incidents
REQUEST /assignments
401 /profile
401 /incidents
401 /assignments
REFRESH START
REFRESH SUCCESS
RETRY /profile
RETRY /incidents
RETRY /assignments
refreshCount: 1
```

Caso fallido esperado:

```text
REQUEST /profile
REQUEST /incidents
REQUEST /assignments
401 /profile
401 /incidents
401 /assignments
REFRESH START
REFRESH FAILED
CLEAR accessToken
CLEAR refreshToken
NAVIGATE login
refreshCount: 1
```

## Reflexion

Ejecutar un refresh diferente por cada peticion con `401` puede crear varios tokens nuevos al mismo tiempo y dejar a la aplicacion con un estado inconsistente. Tambien duplica llamadas al backend, complica los reintentos y abre condiciones de carrera. Un refresh compartido hace que las peticiones esperen el mismo resultado y evita ciclos o trabajo innecesario.
