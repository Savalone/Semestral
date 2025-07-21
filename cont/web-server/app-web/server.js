const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const port = 3000;

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Middleware para parsear JSON y datos de formularios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de sesiones
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecretkey', // ¡Cambiar en producción a algo aleatorio y fuerte!
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // 'true' si usas HTTPS (recomendado en producción)
}));

// Servir archivos estáticos (CSS, JS, imágenes)
app.use(express.static(path.join(__dirname, 'public')));

// --- Middlewares de autenticación y autorización ---
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next(); // Usuario autenticado, continúa
  } else {
    res.redirect('/login'); // No autenticado, redirige al login
  }
};

const isAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length > 0 && result.rows[0].is_admin) {
      next(); // Usuario es admin, continúa
    } else {
      res.status(403).send('Acceso denegado: No tienes permisos de administrador.');
    }
  } catch (err) {
    console.error('Error verificando rol de admin:', err);
    res.status(500).send('Error interno del servidor.');
  }
};

// --- Rutas de la aplicación ---

// Ruta de inicio (redirige a login si no está autenticado)
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
  }
});

// Ruta de Login (GET: mostrar formulario, POST: procesar login)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log(`[LOGIN] Username: ${username} from ${req.ip}`);
  if (!username || !password) {
    return res.status(400).send('Usuario y contraseña son requeridos.');
  }

  try {
    const result = await pool.query('SELECT id, password_hash, is_admin FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).send('Credenciales inválidas.');
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (isMatch) {
      req.session.userId = user.id;
      req.session.isAdmin = user.is_admin;
      res.status(200).json({ message: 'Login exitoso', redirect: '/dashboard' });
    } else {
      res.status(401).send('Credenciales inválidas.');
    }
  } catch (err) {
    console.error('Error durante el login:', err);
    res.status(500).send('Error interno del servidor.');
  }
});

// Ruta de Registro (GET: mostrar formulario, POST: procesar registro)
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  console.log(`[REGISTER] Username ${username} from ${req.ip}`);
  if (!username || !password) {
    return res.status(400).send('Usuario y contraseña son requeridos.');
  }

  try {
    // Verificar si el usuario ya existe
    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(409).send('El nombre de usuario ya existe.');
    }

    // Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insertar nuevo usuario (el primer usuario registrado será administrador)
    const countUsers = await pool.query('SELECT COUNT(*) FROM users');
    const is_admin = (parseInt(countUsers.rows[0].count) === 0); // El primer usuario es admin

    const newUser = await pool.query(
      'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id',
      [username, passwordHash, is_admin]
    );

    req.session.userId = newUser.rows[0].id;
    req.session.isAdmin = is_admin;
    res.status(201).json({ message: 'Registro exitoso', redirect: '/dashboard' });
  } catch (err) {
    console.error('Error durante el registro:', err);
    res.status(500).send('Error interno del servidor.');
  }
});

// Ruta del Dashboard (requiere autenticación)
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// API para obtener usuarios (requiere autenticación)
app.get('/api/users', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error obteniendo usuarios:', err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// API para eliminar usuario (requiere autenticación y ser admin)
app.delete('/api/users/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // No permitir que un admin se auto-elimine accidentalmente si es el único admin
    const targetUser = await pool.query('SELECT is_admin FROM users WHERE id = $1', [id]);
    if (targetUser.rows.length > 0 && targetUser.rows[0].is_admin) {
        const adminCountResult = await pool.query('SELECT COUNT(*) FROM users WHERE is_admin = TRUE');
        if (parseInt(adminCountResult.rows[0].count) === 1 && req.session.userId == id) {
            return res.status(400).json({ error: 'No puedes eliminar el último usuario administrador.' });
        }
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length > 0) {
      res.status(200).json({ message: 'Usuario eliminado exitosamente.' });
    } else {
      res.status(404).json({ error: 'Usuario no encontrado.' });
    }
  } catch (err) {
    console.error('Error eliminando usuario:', err);
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

// Ruta de Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.status(500).send('Error al cerrar sesión.');
    }
    res.redirect('/login');
  });
});

// --- Inicialización de la base de datos ---
async function initializeDb() {
  try {
    const client = await pool.connect();
    // Crear la tabla 'users' si no existe
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tabla "users" verificada/creada.');

    // Crear un usuario administrador si no existe ninguno
    const adminExists = await client.query('SELECT COUNT(*) FROM users WHERE is_admin = TRUE');
    if (parseInt(adminExists.rows[0].count) === 0) {
      console.log('No se encontraron administradores. El primer registro será un administrador.');
    }

    client.release();
  } catch (err) {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1); // Salir si no se puede conectar/inicializar la DB
  }
}

// Iniciar el servidor después de inicializar la DB
app.listen(port, async () => {
  console.log(`Servidor Node.js escuchando en el puerto ${port}`);
  await initializeDb();
});
