# Registro de riesgos — CampusOps

> Registren exactamente tres riesgos y ordénenlos del más al menos prioritario.

| Prioridad | Riesgo | Probabilidad | Impacto | Mitigación | Cómo comprobar la mitigación |
|---:|---|---|---|---|---|
| 1 | Conflicto de sincronización: técnico atiende sin conexión mientras coordinación reasigna | Alta — caso de conflicto obligatorio del proyecto | Alto — puede perder la reasignación real o imponer un estado viejo | Detectar el conflicto al sincronizar y notificarlo, no sobrescribir | Provocar el escenario y verificar que ambas intenciones queden registradas |
| 2 | Fuga de datos sensibles en logs (tokens, ubicación, fotos, nombres) | Media — depende de la disciplina al loguear | Alto — viola la política de privacidad del proyecto | Sanitizar logs desde el diseño; nunca loguear campos prohibidos | Revisar logs de una corrida real y confirmar que no aparecen esos campos |
| 3 | Falla o timeout del servicio de geocodificación/mapas | Media — servicios externos fallan seguido en pruebas | Bajo/medio — existe alternativa manual | Manejar timeout/429/desconexión y ofrecer captura manual | Ejecutar el doble de prueba en modo error y confirmar que se puede continuar manualmente |

## Riesgo que atenderíamos primero

Atenderíamos primero el **conflicto de sincronización** (prioridad 1): es el único caso marcado como obligatorio en `docs/CAMPUSOPS.md` y su impacto es el más severo, ya que puede perder una reasignación real. Los otros dos riesgos ya tienen mitigaciones más simples (sanitizar logs es preventivo, y la falla de mapas ya tiene ruta manual prevista).

# kevin omar


