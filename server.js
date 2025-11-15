const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// -------------------- SAMPLE DATABASE --------------------
let items = [
  { id: 1, name: "Rice", price: 50, floor: 1, location: { x: 2, y: 4 } },
  { id: 2, name: "Sugar", price: 40, floor: 1, location: { x: 6, y: 1 } }
];

let users = [
  { username: "admin", password: "$2b$10$A0Jq8AkbN3Jp7oBkHhVL8uFw0Txfy7C0u6aBP2igNGt25YwKCVT1." } 
  // password = admin123
];

// JWT Secret
const SECRET = "mybackendsecret";


// -------------------- LOGIN API --------------------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ message: "Invalid username" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: "Incorrect password" });

  const token = jwt.sign({ username }, SECRET, { expiresIn: "1h" });
  res.json({ message: "Login successful", token });
});


// Middleware: Check Token
function checkAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(403).json({ message: "Token missing" });

  try {
    jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(403).json({ message: "Invalid token" });
  }
}


// -------------------- ITEMS API --------------------

// A) Add Item (admin only)
app.post("/items", checkAuth, (req, res) => {
  const newItem = {
    id: items.length + 1,
    ...req.body
  };
  items.push(newItem);
  res.json({ message: "Item added", item: newItem });
});

// B) Get all items
app.get("/items", (req, res) => {
  res.json(items);
});

// Get one item
app.get("/items/:id", (req, res) => {
  const item = items.find(i => i.id == req.params.id);
  if (!item) return res.status(404).json({ message: "Item not found" });
  res.json(item);
});


// -------------------- SHORTEST PATH (G) --------------------
// Simple BFS shortest path in a grid (10x10)
app.post("/path", (req, res) => {
  const { start, end } = req.body;

  const gridSize = 10;
  const visited = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(false)
  );

  const queue = [{ x: start.x, y: start.y, path: [] }];
  visited[start.y][start.x] = true;

  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];

  while (queue.length > 0) {
    const { x, y, path } = queue.shift();

    if (x === end.x && y === end.y) {
      return res.json({ shortestPath: [...path, { x, y }] });
    }

    for (const d of directions) {
      const nx = x + d.x;
      const ny = y + d.y;

      if (
        nx >= 0 &&
        ny >= 0 &&
        nx < gridSize &&
        ny < gridSize &&
        !visited[ny][nx]
      ) {
        visited[ny][nx] = true;
        queue.push({ x: nx, y: ny, path: [...path, { x, y }] });
      }
    }
  }

  res.json({ message: "No path found" });
});


// -------------------- START SERVER --------------------
app.listen(3000, () => {
  console.log("Backend running on http://localhost:3000");
});
