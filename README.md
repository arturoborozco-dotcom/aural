# Tu compañero personal

App de acompañamiento personal con 6 modos: Mañana, Estrés, Hábitos, Foco, Cierre, Libre.

## Deploy en Railway

### 1. Sube el proyecto a GitHub

```bash
git init
git add .
git commit -m "primer deploy"
```

Crea un repo en github.com y sigue las instrucciones para subir.

### 2. Conecta en Railway

1. Ve a railway.app
2. "New Project" → "Deploy from GitHub repo"
3. Selecciona tu repo
4. Railway detecta Node.js automáticamente

### 3. Agrega tu API key

En Railway, ve a tu proyecto → Variables → Add Variable:

```
ANTHROPIC_API_KEY = sk-ant-...tu-key-aquí...
```

### 4. Deploy

Railway despliega automáticamente. En 2-3 minutos tienes tu URL.

## Estructura

```
companion/
├── server.js        # Backend Express (protege tu API key)
├── package.json
└── public/
    └── index.html   # Interfaz completa
```
