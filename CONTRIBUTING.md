# Cómo trabajamos en FitLoyalty

Guía corta para que el equipo trabaje sobre el mismo repositorio sin pisarse.
Si algo de aquí no te queda claro, pregunta en el grupo antes de hacer push.

---

## Tabla de contenido

- [Reglas básicas](#reglas-básicas)
- [Flujo de trabajo paso a paso](#flujo-de-trabajo-paso-a-paso)
- [Nombres de rama](#nombres-de-rama)
- [Qué no se sube nunca](#qué-no-se-sube-nunca)
- [Sincronizar tu copia después de la limpieza de ramas](#sincronizar-tu-copia-después-de-la-limpieza-de-ramas)
- [Configuración del repositorio (solo el dueño)](#configuración-del-repositorio-solo-el-dueño)

---

## Reglas básicas

- En GitHub **solo vive `main`**. Todo lo demás son ramas cortas que se borran al fusionar.
- **Nada de push directo a `main`.** Todo entra por Pull Request.
- Un PR se fusiona solo con el CI en verde (checks `backend` y `frontend`).
- Una rama = un cambio. Si el PR crece demasiado, divídelo.
- No trabajes sobre ramas viejas. Si necesitas algo de una, saca una rama nueva desde `main`.

---

## Flujo de trabajo paso a paso

```bash
# 1. Parte siempre de main actualizado
git checkout main
git pull

# 2. Crea tu rama
git checkout -b feat/check-in-qr

# 3. Trabaja y haz commits pequeños
git add <archivos>
git commit -m "feat(checkin): valida el QR antes de registrar la entrada"

# 4. Sube la rama
git push -u origin feat/check-in-qr
```

5. En GitHub abre un **Pull Request hacia `main`** y llena la plantilla.
6. Espera a que el CI quede en verde. Si falla, corrige en la misma rama y vuelve a hacer push.
7. Al fusionar, **borra la rama** (GitHub lo hace solo si está activado
   "Automatically delete head branches").
8. Vuelve a `main`, actualízalo y borra tu rama local:
   ```bash
   git checkout main
   git pull
   git branch -d feat/check-in-qr
   ```

Si `main` avanzó mientras trabajabas, tráelo a tu rama antes de pedir revisión:

```bash
git fetch origin
git merge origin/main
```

---

## Nombres de rama

En minúsculas, con prefijo y palabras separadas por guiones:

| Prefijo  | Para qué                                   | Ejemplo                     |
|----------|--------------------------------------------|-----------------------------|
| `feat/`  | Funcionalidad nueva                        | `feat/alertas-whatsapp`     |
| `fix/`   | Corrección de un error                     | `fix/login-token-expirado`  |
| `docs/`  | Solo documentación                         | `docs/guia-despliegue`      |
| `chore/` | Mantenimiento, dependencias, CI, config    | `chore/actualizar-vite`     |

El CI revisa el nombre de la rama en cada PR (check `rama`). Si no cumple, renómbrala:

```bash
git branch -m nombre-viejo feat/nombre-nuevo
git push origin -u feat/nombre-nuevo
git push origin --delete nombre-viejo
```

Los mensajes de commit siguen la misma idea: `tipo(área): qué cambia`, por ejemplo
`fix(contrato): reporta exito=false si WhatsApp no está autenticado`.

---

## Qué no se sube nunca

Ya están en el `.gitignore`, pero revisa `git status` antes de cada commit:

- `.env` y cualquier archivo con claves o contraseñas. Usa `.env.example` para documentar variables nuevas.
- `node_modules/`
- Cachés y sesiones de WhatsApp: `backend/.wwebjs_auth/`, `backend/.wwebjs_cache/`
- Builds (`dist/`, `build/`, `.dart_tool/`) y archivos temporales de Office (`~$*.docx`)

Si subiste un secreto por error, **avisa de inmediato**: hay que cambiar esa clave.
Borrar el archivo en un commit nuevo no basta, porque sigue en el historial.

---

## Sincronizar tu copia después de la limpieza de ramas

En octubre de 2026 se integró todo en `main` y se borraron las ramas viejas
(`Luis`, `luis-frontend`, `santiago`, `daniel/bloqueo-membresia`, `desarrollo-santiago`,
`principal`, `pr/1`, `pr/2`, `santiago-alertas-whatsapp`, `santiago-limpio`,
`feature/santiago-app-cliente`, `docs/kanban-testing`). Si tu copia local es anterior
a esa limpieza, haz esto **una sola vez**.

**1. Guarda tu trabajo.** Si tienes cambios sin commit:

```bash
git add -A
git commit -m "wip: cambios pendientes"
```

Si tienes commits que nunca subiste, súbelos a una rama nueva y avisa en el grupo para integrarlos:

```bash
git checkout -b feat/lo-que-sea
git push -u origin feat/lo-que-sea
```

**2. Sincroniza:**

```bash
git fetch --all --prune
git checkout main
git pull
```

Si `git pull` falla con *divergent branches*, deja tu `main` igual al de GitHub.
**Hazlo solo después del paso 1**, porque descarta lo que no hayas guardado:

```bash
git reset --hard origin/main
```

**3. Borra tus ramas locales viejas.** `git branch -vv` marca como `gone` las que ya no existen en GitHub:

```bash
git branch -vv
git branch -D <rama>
```

> ⚠️ `-D` borra la rama aunque tenga commits que no están en ningún otro lado.
> Úsalo solo después del paso 1.

---

## Configuración del repositorio (solo el dueño)

Esto no se puede hacer desde el código, lo activa quien administra el repo en GitHub.

**Settings → Branches → Add rule** (o **Add branch ruleset**), para la rama `main`:

- [ ] *Require a pull request before merging*
- [ ] *Require status checks to pass* → agrega `backend`, `frontend` y `rama`.
      Si no aparecen en la lista es porque el CI no ha corrido todavía; abre un PR de prueba y vuelve.
- [ ] *Do not allow bypassing the above settings*, para que tampoco el administrador pueda hacer push directo.

**Settings → General → Pull Requests:**

- [ ] *Automatically delete head branches*

> Si el repositorio es **privado** y la cuenta es gratuita, GitHub no aplica la protección
> de ramas. Se activa con GitHub Pro (gratis con el GitHub Student Developer Pack)
> o haciendo público el repositorio.
