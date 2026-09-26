# Politica de ramas

CampusOps usa dos ramas principales:

- `dev`: rama de integracion. Todo cambio nuevo entra primero aqui y debe ejecutar los checks acumulados antes de promoverse.
- `main`: rama estable para entregas y etiquetas finales. Solo recibe cambios que ya pasaron por `dev`.

## Flujo de trabajo

1. Crear una rama de trabajo desde `dev`.
2. Integrar el cambio hacia `dev`.
3. Revisar que los checks acumulados pasen en `dev`.
4. Promover `dev` hacia `main` cuando la version este lista para entrega.
5. Crear la etiqueta final de la semana desde el commit aprobado en `main`.

## Checks acumulados esperados

Al cierre de Semana 03 deben ejecutarse cuatro checks sobre `dev` y `main`:

- `Starter Public Feedback`
- `Week 01 Public Feedback`
- `Week 02 Academic Feedback`
- `Week 03 Academic Feedback`

Los workflows no deben usar bypasses como `continue-on-error: true`, `|| true` o `--passWithNoTests` para ocultar fallos.
