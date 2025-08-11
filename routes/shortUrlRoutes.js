const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const ShortUrl = require("../models/shortUrl");
const User = require("../models/User");

router.post("/shortUrls", auth, async (req, res) => {
  const userId = req.user.id;
  const { fullUrl } = req.body;

  const user = await User.findById(userId);
  const today = new Date().toISOString().split("T")[0];

  const countToday = user.dailyUrlCount.get(today) || 0;
  if (countToday >= 100) {
    return res.status(429).json({ message: "Daily limit reached (100 URLs)" });
  }

  const shortUrl = await ShortUrl.create({ full: fullUrl });
  user.dailyUrlCount.set(today, countToday + 1);
  await user.save();

  res.status(200).json(shortUrl);
});

module.exports = router;
