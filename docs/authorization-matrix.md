# Matriz de autorización (Semana 06, issue #23)

| Operación | Reportante | Técnico | Coordinador |
|---|---|---|---|
| Crear incidencia | Sí | No | No |
| Iniciar / resolver | No | Sí, solo si está asignado a él | No |
| Cerrar / reabrir | No | No | Sí |

Capas: la regla pura vive en `src/domain/incidents/authorization.ts`; el caso de uso
`src/application/incidents/incidentOperations.ts` la aplica con el actor de la sesión
antes de llamar al gateway; el backend didáctico vuelve a validar (403). La UI puede ocultar
botones, pero no es el único control. Los errores públicos son `unauthenticated` y
`forbidden` (`profile_not_allowed` | `not_assigned` | `server_denied`) y no incluyen token,
actor ni payload. Fixtures públicos del backend didáctico, no autenticación de producción.