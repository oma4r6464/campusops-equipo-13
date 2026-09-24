# Auditoría de seguridad — Semana 4

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Credenciales escritas directamente en el código | Una persona con acceso al repositorio podría obtener la API Key. | Se movió la clave a una variable de entorno (`.env`). | [Antes](./evidence/hallazgo-1-antes.png) / [Después](./evidence/hallazgo-1-despues.png) |
| 2 | Información sensible enviada a consola | Los logs podían revelar contraseñas y tokens en texto plano. | Se eliminaron los datos sensibles y se dejó un mensaje genérico. | [Antes](./evidence/hallazgo-2-antes.png) / [Después](./evidence/hallazgo-2-despues.png) |
| 3 | Mensaje de error con credenciales de base de datos | Los errores podían revelar la IP y la contraseña de la DB a los usuarios. | Se cambió a un mensaje genérico de "Fallo en conexión". | [Antes](./evidence/hallazgo-3-antes.png) / [Después](./evidence/hallazgo-3-despues.png) |

---

## Hallazgo 1 — Credenciales expuestas en el código

### Problema encontrado
La clave `API_KEY` estaba escrita directamente en el archivo `App.tsx`.

### Riesgo
Cualquier persona con acceso al repositorio podría obtener esta clave y utilizar los servicios a nombre de la aplicación sin autorización.

### Solución
Se eliminó la clave quemada en el código y se configuró para que se lea desde una variable de entorno `process.env.EXPO_PUBLIC_API_KEY`. También se verificó que `.env` está en `.gitignore` y se creó un `.env.example`.

### Antes
```ts
const API_KEY = "demo_key_123";
```

### Después
```ts
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;
```

---

## Hallazgo 2 — Información sensible en consola

### Problema encontrado
Se estaba imprimiendo información completa del usuario incluyendo su `password` y su `token` de sesión usando `console.log()` en `App.tsx`.

### Riesgo
Si la aplicación guarda logs en un servidor o un tercero tiene acceso a la consola, los tokens y contraseñas quedarían expuestos en texto plano.

### Solución
Se modificó el mensaje para registrar únicamente el estatus de éxito, sin revelar ningún dato privado.

### Antes
```ts
console.log({ user: "Juan", password: "password123", token: "ABC1234" });
```

### Después
```ts
console.log("Usuario autenticado correctamente", { status: "success" });
```

---

## Hallazgo 3 — Mensaje de error revelador

### Problema encontrado
Al fallar la conexión a la base de datos, se estaba lanzando un error (Exception) que incluía la cadena de conexión completa (IP, usuario y contraseña) en `App.tsx`.

### Riesgo
Si el mensaje de error llega a ser visto por el usuario final o un atacante, se le estaría entregando directamente el acceso a la base de datos.

### Solución
Se reemplazó la cadena técnica por un mensaje genérico para el usuario ("No fue posible conectar con el servicio.").

### Antes
```ts
throw new Error("Fallo conectando con mysql://admin:password123@192.168.1.20");
```

### Después
```ts
throw new Error("No fue posible conectar con el servicio.");
```
