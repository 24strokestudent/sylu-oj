const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// 注册
router.post('/register', async (req, res) => {
  const { username, nickname, studentId, college, email, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  try {
    const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS) || 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, nickname, student_id, college, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [username, nickname || null, studentId || null, college || null, email || null, hash]
    );
    res.json({ id: result.insertId, username });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: '用户名或邮箱已被注册' });
    }
    console.error(e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  const { loginId, password } = req.body || {};
  if (!loginId || !password) {
    return res.status(400).json({ error: '请填写账号和密码' });
  }
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE username = ? OR email = ? OR student_id = ? LIMIT 1',
    [loginId, loginId, loginId]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: '账号或密码错误' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: '账号或密码错误' });
  const token = jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  res.json({ token, username: user.username, nickname: user.nickname });
});

module.exports = router;
