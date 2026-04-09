const request = require("supertest");
const app = require("../app");

// -------------------------------------------------------
// Test Suite: GET /
// -------------------------------------------------------
describe("GET /", () => {
  it("should return welcome message and version", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Hello from CI/CD Demo App!");
    expect(res.body.version).toBe("2.0.0");
  });
});

// -------------------------------------------------------
// Test Suite: GET /health
// -------------------------------------------------------
describe("GET /health", () => {
  it("should return status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// -------------------------------------------------------
// Test Suite: POST /add
// -------------------------------------------------------
describe("POST /add", () => {
  it("should add two numbers correctly", async () => {
    const res = await request(app)
      .post("/add")
      .send({ a: 5, b: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.body.result).toBe(8);
  });

  it("should return 400 if inputs are not numbers", async () => {
    const res = await request(app)
      .post("/add")
      .send({ a: "hello", b: 3 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("should handle negative numbers", async () => {
    const res = await request(app)
      .post("/add")
      .send({ a: -10, b: 4 });
    expect(res.statusCode).toBe(200);
    expect(res.body.result).toBe(-6);
  });
});

// -------------------------------------------------------
// Test Suite: GET /users
// -------------------------------------------------------
describe("GET /users", () => {
  it("should return a list of users", async () => {
    const res = await request(app).get("/users");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
