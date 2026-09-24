require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', require('./routes/auth'));
app.get('/api/users/:username', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, username, nickname, email, college, created_at FROM users WHERE username = ? LIMIT 1',
    [req.params.username]
  );
  const u = rows[0];
  if (!u) return res.status(404).json({ error: '用户不存在' });
  res.json({
    username: u.username,
    nickname: u.nickname || u.username,
    college: u.college || '未填写',
    role: 'user',
    joinedAt: u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : '',
    solved: 0,
    submissions: 0,
    accepted: 0,
    recent: [],
    contests: []
  });
});

// 测试接口：验证数据库连通
app.get('/api/ping', async (req, res) => {
  const [rows] = await pool.query('SELECT 1 AS ok');
  res.json({ message: '数据库连通', result: rows });
});

// 题目列表接口
app.get('/api/problems', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, title, difficulty FROM problems ORDER BY id'
  );
  const map = { easy: '简单', medium: '中等', hard: '困难' };
  res.json(rows.map(function (r) {
    return {
      code: 'P' + String(r.id).padStart(3, '0'),
      title: r.title,
      difficulty: map[r.difficulty] || '简单',
      tags: [],
      submissions: 0,
      accepted: 0,
      status: 'none'
    };
  }));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('后端已启动: http://localhost:' + port);
});
app.get('/api/contests', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, title, format, description, problem_count, participants, start_time, duration_minutes FROM contests ORDER BY start_time DESC'
  );
  const now = Date.now();
  res.json(rows.map(function (r) {
    return {
      id: r.id,
      title: r.title,
      format: r.format,
      desc: r.description || '',
      problems: r.problem_count,
      participants: r.participants,
      startOffset: Math.round((new Date(r.start_time).getTime() - now) / 60000),
      durationMinutes: r.duration_minutes
    };
  }));
});
const auth = require('./middleware/auth');

app.post('/api/contests/:id/register', auth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO contest_registrations (user_id, contest_id) VALUES (?, ?)',
      [req.user.id, req.params.id]
    );
    res.json({ ok: true, message: '报名成功' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '你已经报名了' });
    console.error(e);
    res.status(500).json({ error: '报名失败' });
  }
});
app.get('/api/rank', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT u.id, u.username, u.nickname, u.college,
      COUNT(s.id) AS submissions,
      SUM(CASE WHEN s.status = 'AC' THEN 1 ELSE 0 END) AS accepted,
      COUNT(DISTINCT CASE WHEN s.status = 'AC' THEN s.problem_id END) AS solved
    FROM users u
    LEFT JOIN submissions s ON s.user_id = u.id
    GROUP BY u.id, u.username, u.nickname, u.college
    ORDER BY solved DESC, submissions ASC
  `);
  res.json(rows.map(function (r) {
    return {
      username: r.username,
      nickname: r.nickname || r.username,
      college: r.college || '未填写',
      solved: Number(r.solved) || 0,
      submissions: Number(r.submissions) || 0,
      accepted: Number(r.accepted) || 0
    };
  }));
});
app.get('/api/topics', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT t.id, t.title, t.category, t.views, t.likes, t.replies,
           t.created_at, t.last_reply_at,
           u.nickname, u.username, u.college,
           p.id AS problem_id
    FROM topics t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN problems p ON p.id = t.problem_id
    ORDER BY t.last_reply_at DESC
  `);
  const now = Date.now();
  res.json(rows.map(function (r) {
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      author: r.nickname || r.username || '匿名用户',
      college: r.college || '未填写',
      problem: r.problem_id ? 'P' + String(r.problem_id).padStart(3, '0') : '',
      replies: r.replies,
      views: r.views,
      likes: r.likes,
      createdAgo: Math.round((now - new Date(r.created_at).getTime()) / 60000),
      lastReplyAgo: Math.round((now - new Date(r.last_reply_at).getTime()) / 60000)
    };
  }));
});
app.get('/api/topics/:id', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT t.*, u.nickname, u.username, u.college, p.id AS problem_id
    FROM topics t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN problems p ON p.id = t.problem_id
    WHERE t.id = ? LIMIT 1
  `, [req.params.id]);
  const t = rows[0];
  if (!t) return res.status(404).json({ error: '话题不存在' });

  const [replies] = await pool.query(`
    SELECT r.id, r.body, r.likes, r.created_at, u.nickname, u.username
    FROM replies r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.topic_id = ?
    ORDER BY r.created_at ASC
  `, [req.params.id]);

  const now = Date.now();
  res.json({
    id: t.id,
    title: t.title,
    category: t.category,
    author: t.nickname || t.username || '匿名用户',
    authorUsername: t.username || '',
    college: t.college || '',
    problem: t.problem_id ? 'P' + String(t.problem_id).padStart(3, '0') : '',
    replies: t.replies,
    views: t.views,
    likes: t.likes,
    createdAgo: Math.round((now - new Date(t.created_at).getTime()) / 60000),
    lastReplyAgo: Math.round((now - new Date(t.last_reply_at).getTime()) / 60000),
    body: t.content || '',
    replyList: replies.map(function (r) {
      return {
        id: r.id,
        author: r.nickname || r.username || '匿名用户',
        authorUsername: r.username || '',
        college: '',
        body: r.body,
        minutesAgo: Math.round((now - new Date(r.created_at).getTime()) / 60000),
        likes: r.likes,
        isOwner: false
      };
    })
  });
});
app.post('/api/topics/:id/like', auth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO topic_likes (topic_id, user_id) VALUES (?, ?)',
      [req.params.id, req.user.id]
    );
    await pool.query('UPDATE topics SET likes = likes + 1 WHERE id = ?', [req.params.id]);
    const [rows] = await pool.query('SELECT likes FROM topics WHERE id = ?', [req.params.id]);
    res.json({ ok: true, likes: rows[0].likes });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '你已经点过赞了' });
    console.error(e);
    res.status(500).json({ error: '点赞失败' });
  }
});
app.post('/api/topics/:id/replies', auth, async (req, res) => {
  const body = req.body && req.body.body;
  if (!body || !body.trim()) {
    return res.status(400).json({ error: '回复内容不能为空' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO replies (topic_id, user_id, body) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, body.trim()]
    );
    await pool.query(
      'UPDATE topics SET replies = replies + 1, last_reply_at = NOW() WHERE id = ?',
      [req.params.id]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '回复失败' });
  }
});
app.post('/api/topics', auth, async (req, res) => {
  const { title, category, content } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: '标题不能为空' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO topics (title, category, content, user_id) VALUES (?, ?, ?, ?)',
      [title.trim(), category || '闲聊', content || '', req.user.id]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '发帖失败' });
  }
});
