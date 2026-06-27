const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3001;

const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = Number(process.env.DB_PORT || 3306);

const requiredDbVariables = {
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
};

for (const [name, value] of Object.entries(requiredDbVariables)) {
  if (!value) {
    console.error(`Falta la variable de entorno obligatoria: ${name}`);
    process.exit(1);
  }
}

app.use(cors());
app.use(express.json());

let pool;

// Inicializar pool de conexiones
async function initDb() {
  if (!/^[a-zA-Z0-9_]+$/.test(DB_NAME)) {
    throw new Error("DB_NAME contiene caracteres no permitidos.");
  }

  const bootstrapConnection = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT,
    connectTimeout: 10000,
  });

  try {
    await bootstrapConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``
    );
  } finally {
    await bootstrapConnection.end();
  }

  pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
  });

  const connection = await pool.getConnection();

  try {
    await connection.ping();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion VARCHAR(255),
        precio DECIMAL(10,2) NOT NULL,
        stock INT NOT NULL
      )
    `);

    const [rows] = await connection.query(
      "SELECT COUNT(*) AS total FROM productos"
    );

    if (rows[0].total === 0) {
      await connection.query(
        `
          INSERT INTO productos (nombre, descripcion, precio, stock)
          VALUES
            (?, ?, ?, ?),
            (?, ?, ?, ?),
            (?, ?, ?, ?),
            (?, ?, ?, ?),
            (?, ?, ?, ?)
        `,
        [
          "Notebook Corporativo",
          "Notebook para gestion administrativa y trabajo remoto",
          799990,
          12,

          "Monitor Profesional 24 pulgadas",
          "Monitor Full HD para estaciones de trabajo",
          189990,
          20,

          "Teclado Mecanico",
          "Teclado ergonomico para desarrollo y soporte tecnico",
          59990,
          35,

          "Mouse Inalambrico",
          "Mouse optico para oficina y teletrabajo",
          24990,
          50,

          "Licencia Software Gestion",
          "Licencia anual de plataforma de gestion empresarial",
          149990,
          10,
        ]
      );

      console.log("Datos iniciales de Innovatech cargados.");
    }

    console.log("Conexion MySQL y estructura de base de datos validadas.");
  } finally {
    connection.release();
  }
}

// Helper para manejar errores
function handleError(res, error, message = "Error interno del servidor") {
  console.error(error);
  res.status(500).json({ message });
}

// Obtener todos los productos
app.get("/api/productos", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nombre, descripcion, precio, stock FROM productos ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    handleError(res, err, "No se pudieron obtener los productos.");
  }
});

// Obtener un producto por ID
app.get("/api/productos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query("SELECT id, nombre, descripcion, precio, stock FROM productos WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    res.json(rows[0]);
  } catch (err) {
    handleError(res, err, "No se pudo obtener el producto.");
  }
});

// Crear un nuevo producto
app.post("/api/productos", async (req, res) => {
  const { nombre, descripcion, precio, stock } = req.body;

  if (!nombre || precio == null || stock == null) {
    return res.status(400).json({ message: "Nombre, precio y stock son obligatorios." });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO productos (nombre, descripcion, precio, stock) VALUES (?, ?, ?, ?)",
      [nombre, descripcion || null, precio, stock]
    );
    const nuevoId = result.insertId;
    const [rows] = await pool.query("SELECT id, nombre, descripcion, precio, stock FROM productos WHERE id = ?", [nuevoId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    handleError(res, err, "No se pudo crear el Producto.");
  }
});

// Actualizar un producto
app.put("/api/productos/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, precio, stock } = req.body;

  if (!nombre || precio == null || stock == null) {
    return res.status(400).json({ message: "Nombre, Precio y Stock son obligatorios." });
  }

  try {
    const [result] = await pool.query(
      "UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, stock = ? WHERE id = ?",
      [nombre, descripcion || null, precio, stock, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }

    const [rows] = await pool.query("SELECT id, nombre, descripcion, precio, stock FROM productos WHERE id = ?", [id]);
    res.json(rows[0]);
  } catch (err) {
    handleError(res, err, "No se pudo actualizar el Producto.");
  }
});

// Eliminar un producto
app.delete("/api/productos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM productos WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    res.json({ message: "Producto eliminado correctamente." });
  } catch (err) {
    handleError(res, err, "No se pudo eliminar el Producto.");
  }
});

// Endpoint de salud
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "innovatech-backend",
    message: "Backend de Innovatech Chile en ejecución."
  });
});

// Iniciar servidor
async function startServer() {
  try {
    await initDb();

    app.listen(PORT, () => {
      console.log(`Backend Innovatech escuchando en puerto ${PORT}`);
    });
  } catch (error) {
    console.error("No fue posible iniciar el backend:", error);
    process.exit(1);
  }
}

startServer();