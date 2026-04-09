const express = require("express");
const app = express();

app.use(express.json());

// --- Routes ---

app.get("/", (req, res) => {
  res.json({ message: "Hello from CI/CD Demo App!", version: "2.0.0" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.post("/add", (req, res) => {
  const { a, b } = req.body;
  if (typeof a !== "number" || typeof b !== "number") {
    return res.status(400).json({ error: "a and b must be numbers" });
  }
  res.json({ result: a + b });
});

app.get("/users", (req, res) => {
  res.json([
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ]);
});

// --- Start server (only when not in test) ---
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
