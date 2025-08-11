const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const JWT_SECRET = "your_jwt_secret";
const JWT_REFRESH_SECRET = "your_jwt_refresh_secret";

const createTokens = (user) => {
  const accessToken = jwt.sign({ id: user._id }, JWT_SECRET, {
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  const { email, password } = req.body;
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ message: "User already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({ email, password: hashedPassword });

  const tokens = createTokens(user);
  res.cookie("refreshToken", tokens.refreshToken, { httpOnly: true });
  res.json({ accessToken: tokens.accessToken });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ message: "Invalid credentials" });

  const tokens = createTokens(user);
  res.cookie("refreshToken", tokens.refreshToken, { httpOnly: true });
  res.json({ accessToken: tokens.accessToken });
};

exports.refresh = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.sendStatus(401);

  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.sendStatus(401);

    const tokens = createTokens(user);
    res.cookie("refreshToken", tokens.refreshToken, { httpOnly: true });
    res.json({ accessToken: tokens.accessToken });
  } catch (err) {
    return res.sendStatus(403);
  }
};
