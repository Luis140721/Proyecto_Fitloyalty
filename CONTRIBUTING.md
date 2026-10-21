# Cómo trabajamos en FitLoyalty

Guía corta para que el equipo trabaje sobre el mismo repositorio sin pisarse.
Si algo de aquí no te queda claro, pregunta en el grupo antes de hacer push.

---

## Tabla de contenido

- [Reglas básicas](#reglas-básicas)
- [Flujo de trabajo paso a paso](#flujo-de-trabajo-paso-a-paso)
- [Releases: de develop a main](#releases-de-develop-a-main)
- [Quién toca qué](#quién-toca-qué)
- [Nombres de rama](#nombres-de-rama)
- [Qué no se sube nunca](#qué-no-se-sube-nunca)
- [Sincronizar tu copia después de la limpieza de ramas](#sincronizar-tu-copia-después-de-la-limpieza-de-ramas)
- [Configuración del repositorio (solo el dueño)](#configuración-del-repositorio-solo-el-dueño)

---

## Reglas básicas

Trabajamos con dos ramas fijas y ramas cortas por tarea:

```
main          ← lo estable: lo que se despliega y se entrega
└── develop   ← integración: aquí se une el trabajo de todos
    ├── feat/rqf-11-rachas-hitos
    ├── fix/rqf-13-whatsapp-error
    └── docs/avance-2026-10-18
```

- **Nadie trabaja directo en `main` ni en `develop`.** Las dos están protegidas y solo reciben Pull Requests con el CI en verde (checks `rama`, `backend` y `frontend`).
- **Cada tarea es una rama nueva que sale de `develop`**, y su PR va **hacia `develop`**, no hacia `main`.
- **Lo revisa y lo prueba otra persona** antes de fusionar.
- **`main` solo recibe PR desde `develop`** (releases), probados por alguien que no escribió ese código. Nadie aprueba su propio PR a `main`.
- **Sincroniza con `develop` todos los días.** La mayoría de los conflictos grandes vienen de pasar días sin traer lo de los demás.
- Una rama = una tarea. Si el PR crece demasiado, divídelo. La rama se borra al fusionar.
- No trabajes sobre ramas viejas. Si necesitas algo de una, saca una rama nueva desde `develop`.

---

## Flujo de trabajo paso a paso

```bash
# 1. Parte siempre de develop actualizado
git checkout develop
git pull origin develop

# 2. Crea la rama de tu tarea
git checkout -b feat/check-in-qr

# 3. Trabaja y haz commits pequeños y frecuentes
git add <archivos>
git commit -m "feat(checkin): valida el QR antes de registrar la entrada"

# 4. Cada día, y antes de abrir el PR, trae lo nuevo de develop
git checkout develop
git pull origin develop
git checkout feat/check-in-qr
git merge develop            # si hay conflictos, se resuelven aquí, en tu rama

# 5. Sube la rama
git push -u origin feat/check-in-qr
```

6. En GitHub abre un **Pull Request hacia `develop`** y llena la plantilla, con la evidencia
   (archivo:línea, prueba o captura) para poder actualizar la documentación.
7. Espera el CI en verde y la revisión de otra persona. Si algo falla, corrige en la misma rama y vuelve a hacer push.
8. Al fusionar, GitHub borra la rama remota. Vuelve a `develop` y borra la local:
   ```bash
   git checkout develop
   git pull origin develop
   git branch -d feat/check-in-qr
   ```

---

## Releases: de develop a main

1. Cuando `develop` tiene un bloque de trabajo terminado, se abre un PR **`develop` → `main`**.
2. Lo prueba alguien que no escribió ese código:
   - ¿El proyecto corre sin errores?
   - ¿Lo nuevo hace lo que dice?
   - ¿Lo demás sigue funcionando?
   - ¿No hay conflictos raros ni archivos a medias?
3. Si todo está bien, esa persona aprueba el PR y se fusiona. Si algo falla, se devuelve a quien hizo el cambio,
   que lo arregla con una rama nueva hacia `develop`.

`main` exige una aprobación, así que nadie puede fusionar solo su propio trabajo en `main`.

---

## Quién toca qué

El mayor origen de conflictos no es Git, sino dos personas editando el mismo archivo a la vez.

- Cada archivo tiene un dueño. La tabla de dueños está en [`docs/plan-trabajo.md`](docs/plan-trabajo.md).
- **Antes de tocar un archivo de otra persona**, avisa en el grupo qué archivo y por qué, espera su OK y menciónalo en el PR.
- Los archivos binarios (`.xlsx`, `.docx`) no se pueden fusionar: solo los edita su dueño.
- Cada mañana, 5 minutos en el grupo: qué haces hoy, qué archivos tocas y qué te bloquea.

---

## Nombres de rama

En minúsculas, con prefijo y palabras separadas por guiones:

| Prefijo  | Para qué                                   | Ejemplo                     |
|----------|--------------------------------------------|-----------------------------|
| `feat/`  | Funcionalidad nueva                        | `feat/alertas-whatsapp`     |
| `fix/`   | Corrección de un error                     | `fix/login-token-expirado`  |
| `docs/`  | Solo documentación                         | `docs/guia-despliegue`      |
| `chore/` | Mantenimiento, dependencias, CI, config    | `chore/actualizar-vite`     |

También se acepta `feature/` como sinónimo de `feat/`. `develop` solo se usa como origen de los PR de release hacia `main`.

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

Después crea tu copia local de `develop`, que es desde donde salen las ramas de trabajo:

```bash
git checkout -b develop origin/develop
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

**Settings → Branches → Add rule** (o **Add branch ruleset**), una regla para `main` y otra para `develop`:

| Opción | `main` | `develop` |
|---|:---:|:---:|
| *Require a pull request before merging* | ✅ | ✅ |
| *Require approvals*: 1 (nadie aprueba su propio PR) | ✅ | — |
| *Require status checks to pass*: `backend`, `frontend` y `rama` | ✅ | ✅ |
| *Do not allow bypassing the above settings* | ✅ | ✅ |

Si los checks no aparecen en la lista es porque el CI no ha corrido todavía; abre un PR de prueba y vuelve.

**Settings → General:**

- [ ] *Default branch*: `develop`, para que los PR apunten ahí por defecto.
- [ ] *Automatically delete head branches* (sección Pull Requests).

> Si el repositorio es **privado** y la cuenta es gratuita, GitHub no aplica la protección
> de ramas. Se activa con GitHub Pro (gratis con el GitHub Student Developer Pack)
> o haciendo público el repositorio.
