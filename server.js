require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const ShortUrl = require("./models/shortUrl");
const User = require("./models/User");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.set("view engine", "ejs");

// --- MongoDB Connection ---
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// --- Middleware: Auth ---
const authenticate = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// --- Home Page (Protected) ---
app.get("/", authenticate, async (req, res) => {
  const shortUrls = await ShortUrl.find({ owner: req.user.id });
  res.render("index", { shortUrls, user: req.user });
});

// --- Signup Page ---
app.get("/signup", (req, res) => {
  res.render("signup");
});

// --- Handle Signup ---
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
    });

    return res.redirect("/login");
  } catch (err) {
    return res.status(500).json({ message: "Error creating user", error: err });
  }
});

// --- Login Page ---
app.get("/login", (req, res) => {
  res.render("login");
});

// --- Handle Login ---
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h",
    }
  );

  const refreshToken = jwt.sign({ id: user._id }, process.env.REFRESH_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("token", token, { httpOnly: true });
  res.cookie("refreshToken", refreshToken, { httpOnly: true });

  res.redirect("/");
});

// --- Refresh Access Token ---
app.post("/refresh", async (req, res) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken)
    return res.status(403).json({ message: "Refresh token missing" });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const newAccessToken = jwt.sign(
      { id: decoded.id },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.cookie("token", newAccessToken, { httpOnly: true });
    res.json({ token: newAccessToken });
  } catch (err) {
    res.status(403).json({ message: "Invalid refresh token" });
  }
});

// --- Create Short URL (with daily limit) ---
app.post("/shortUrls", authenticate, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const urlCount = await ShortUrl.countDocuments({
    owner: req.user.id,
    createdAt: { $gte: today },
  });

  if (urlCount >= 100) {
    return res.status(429).send("Daily URL limit (100) reached.");
  }

  await ShortUrl.create({
    full: req.body.fullUrl,
    owner: req.user.id,
  });

  res.redirect("/");
});

// --- Redirect Route ---
app.get("/:shortUrl", async (req, res) => {
  const shortUrl = await ShortUrl.findOne({ short: req.params.shortUrl });
  if (!shortUrl) return res.sendStatus(404);

  shortUrl.clicks++;
  await shortUrl.save();

  res.redirect(shortUrl.full);
});

// --- Start Server ---
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
