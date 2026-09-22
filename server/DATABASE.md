# SYLU OJ · 数据库设计（草案）

> 本文只描述**数据库层**的设计与落地步骤。后端路由（`server.js`）与判题机尚未实现。

## 0. 结论与环境事实

| 项 | 结论 |
|---|---|
| 引擎 | **MySQL**（本机已装 9.7.1，`brew services` 显示已启动） |
| 字符集 | `utf8mb4` / `utf8mb4_0900_ai_ci`（MySQL 9 默认，中文昵称与题解无问题） |
| 驱动 | `mysql2/promise` 连接池 + **手写 SQL**（不引入 ORM；表少、SQL 透明，便于答辩讲清） |
| 数据库名 | `sylu_oj` |
| 应用账号 | **专用账号 `sylu_oj`，不用 root**（本机 root 是空口令，这台机器上任何本地程序都能改你所有库） |

⚠️ **MySQL 9 已移除 `mysql_native_password`**：网上很多教程会让你 `IDENTIFIED WITH mysql_native_password`，在本机 9.7.1 上会直接报错。用默认的 `caching_sha2_password`，`mysql2` 支持它。

## 1. 建库与建账号

```sql
CREATE DATABASE IF NOT EXISTS sylu_oj
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'sylu_oj'@'localhost' IDENTIFIED BY '换成强口令';
GRANT ALL PRIVILEGES ON sylu_oj.* TO 'sylu_oj'@'localhost';
FLUSH PRIVILEGES;
```

连接参数放 `server/.env`（已被 `.gitignore` 忽略），键名见 `server/.env.example`。

## 2. 表清单总览

| 表 | 作用 | 关键索引 |
|---|---|---|
| `users` | 账号 | `username` / `email` / `student_id` 唯一 |
| `problems` | 题目 | `code` 唯一；`(is_visible, difficulty)` |
| `tags` / `problem_tags` | 知识点（多对多） | 复合主键 |
| `submissions` | **判题记录（唯一真相源）** | `(user_id, problem_id, created_at)`、`(problem_id, created_at)`、`(contest_id, user_id)` |
| `contests` | 比赛 | `(start_at, end_at)` |
| `contest_problems` | 比赛题目与分值 | 复合主键 |
| `contest_registrations` | 报名 | 复合主键 |
| `topics` / `topic_replies` / `topic_likes` | 讨论区 | `topics(last_reply_at)` |
| `user_problem_status` | 题库的「已通过 / 尝试过 / 未尝试」 | 复合主键 |

## 3. 建表 DDL

> 按依赖顺序执行；全部 `ENGINE=InnoDB`。`id` 一律 `INT UNSIGNED`（`submissions` 用 `BIGINT`）。

### 3.1 用户

```sql
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(20)  NOT NULL              COMMENT '登录名，3-20 位字母数字下划线',
  email         VARCHAR(120) NOT NULL,
  student_id    VARCHAR(20)  NOT NULL,
  nickname      VARCHAR(16)  NOT NULL              COMMENT '排行榜展示名',
  college       VARCHAR(40)  NOT NULL DEFAULT '',
  password_hash VARCHAR(100) NOT NULL              COMMENT 'bcrypt，60 字符',
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  status        ENUM('active','banned') NOT NULL DEFAULT 'active',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  UNIQUE KEY uk_users_email (email),
  UNIQUE KEY uk_users_student_id (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 3.2 题目与知识点

```sql
CREATE TABLE problems (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code             VARCHAR(24)  NOT NULL           COMMENT '题号，如 CS001-01-001',
  title            VARCHAR(120) NOT NULL,
  difficulty       TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1简单 2中等 3困难',
  description      MEDIUMTEXT NULL,
  input_format     TEXT NULL,
  output_format    TEXT NULL,
  time_limit_ms    INT UNSIGNED NOT NULL DEFAULT 1000,
  memory_limit_mb  INT UNSIGNED NOT NULL DEFAULT 256,
  is_visible       TINYINT(1) NOT NULL DEFAULT 1   COMMENT '0=草稿，题库不展示',
  submission_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '冗余计数，判题结束时更新',
  accepted_count   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '冗余计数，AC 时 +1',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_problems_code (code),
  KEY idx_problems_visible_diff (is_visible, difficulty)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tags (
  id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(24) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tags_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE problem_tags (
  problem_id INT UNSIGNED NOT NULL,
  tag_id     INT UNSIGNED NOT NULL,
  PRIMARY KEY (problem_id, tag_id),
  KEY idx_pt_tag (tag_id),
  CONSTRAINT fk_pt_problem FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag     FOREIGN KEY (tag_id)     REFERENCES tags(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

知识点用**多对多**，不要存成逗号字符串——前端 `tags` 是数组，而且题库页要按单个知识点筛选。

### 3.3 比赛

```sql
CREATE TABLE contests (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(120) NOT NULL,
  format      ENUM('ACM','OI','IOI') NOT NULL DEFAULT 'ACM',
  description TEXT NULL,
  start_at    DATETIME NOT NULL,
  end_at      DATETIME NOT NULL,
  is_public   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contests_time (start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE contest_problems (
  contest_id INT UNSIGNED NOT NULL,
  problem_id INT UNSIGNED NOT NULL,
  order_no   SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  score      SMALLINT UNSIGNED NOT NULL DEFAULT 100 COMMENT 'OI/IOI 该题满分',
  PRIMARY KEY (contest_id, problem_id),
  KEY idx_cp_problem (problem_id),
  CONSTRAINT fk_cp_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_problem FOREIGN KEY (problem_id) REFERENCES problems(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE contest_registrations (
  contest_id    INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contest_id, user_id),
  KEY idx_cr_user (user_id),
  CONSTRAINT fk_cr_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

「参赛人数」= `SELECT COUNT(*) FROM contest_registrations WHERE contest_id = ?`。

### 3.4 提交记录（核心表）

```sql
CREATE TABLE submissions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  problem_id     INT UNSIGNED NOT NULL,
  contest_id     INT UNSIGNED NULL              COMMENT '练习提交为 NULL',
  language       ENUM('c','cpp','java','python','go') NOT NULL,
  source_code    MEDIUMTEXT NOT NULL,
  verdict        ENUM('PD','JD','AC','WA','TLE','MLE','RE','CE','PE','OLE','SE')
                 NOT NULL DEFAULT 'PD'          COMMENT 'PD待判 JD判题中，其余为最终结果',
  score          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  time_used_ms   INT UNSIGNED NULL,
  memory_used_kb INT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sub_user_problem (user_id, problem_id, created_at),
  KEY idx_sub_problem_time (problem_id, created_at),
  KEY idx_sub_contest_user (contest_id, user_id, created_at),
  CONSTRAINT fk_sub_user    FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT fk_sub_problem FOREIGN KEY (problem_id) REFERENCES problems(id),
  CONSTRAINT fk_sub_contest FOREIGN KEY (contest_id) REFERENCES contests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

**所有统计都从这张表演化**：通过题数、提交次数、通过次数、通过率、排名、比赛榜单。
冗余计数器（`problems.submission_count` / `accepted_count`）和 `user_problem_status` 都是它的**缓存**，随时可以按第 5 节重算回来。

### 3.5 题库状态缓存

```sql
CREATE TABLE user_problem_status (
  user_id          INT UNSIGNED NOT NULL,
  problem_id       INT UNSIGNED NOT NULL,
  status           ENUM('attempted','solved') NOT NULL COMMENT 'solved 优先；无行=未尝试',
  submission_count INT UNSIGNED NOT NULL DEFAULT 0,
  first_ac_at      DATETIME NULL,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, problem_id),
  KEY idx_ups_problem_status (problem_id, status),
  CONSTRAINT fk_ups_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ups_problem FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

前端题库页的「提交状态」筛选就查这张表：有行且 `solved` → 已通过；有行 → 尝试过；无行 → 未尝试；**未登录一律按未尝试**（与前端 `demoMode` 的契约一致）。

### 3.6 讨论区

```sql
CREATE TABLE topics (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  problem_id    INT UNSIGNED NULL              COMMENT '关联题目，可空',
  category      ENUM('题解','求助','公告','闲聊') NOT NULL DEFAULT '闲聊',
  title         VARCHAR(150) NOT NULL,
  body          MEDIUMTEXT NOT NULL,
  views         INT UNSIGNED NOT NULL DEFAULT 0,
  reply_count   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '冗余计数',
  like_count    INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '冗余计数',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_reply_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '列表默认按它排序',
  PRIMARY KEY (id),
  KEY idx_topics_last_reply (last_reply_at),
  KEY idx_topics_category (category, last_reply_at),
  KEY idx_topics_problem (problem_id),
  CONSTRAINT fk_topics_user    FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT fk_topics_problem FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE topic_replies (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  topic_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  body       MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_replies_topic (topic_id, created_at),
  CONSTRAINT fk_replies_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_user  FOREIGN KEY (user_id)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE topic_likes (
  topic_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (topic_id, user_id),
  CONSTRAINT fk_likes_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## 4. 三个关键取舍

### 4.1 统计：写路径维护计数，读路径读缓存

列表页（题库、排行榜、讨论区）**不要**每次请求都 `COUNT(*)` 全表扫。判题结束的同一个事务里：

```sql
UPDATE problems SET submission_count = submission_count + 1 WHERE id = ?;

-- 首次 AC 时
UPDATE problems SET accepted_count = accepted_count + 1 WHERE id = ?;

INSERT INTO user_problem_status (user_id, problem_id, status, submission_count, first_ac_at)
VALUES (?, ?, 'solved', 1, NOW())
ON DUPLICATE KEY UPDATE
  status = IF(status = 'solved', 'solved', VALUES(status)),
  submission_count = submission_count + 1,
  first_ac_at = IFNULL(first_ac_at, VALUES(first_ac_at));

-- 回复 / 点赞同理维护 topics.reply_count / like_count / last_reply_at
```

### 4.2 时间：库内存 UTC 绝对时间，接口返回 ISO 字符串

`talk.js` / `competition.js` 现在吃的是「多少分钟前」的数值（`createdAgo` / `lastReplyAgo` / `startOffset`）。建议改为**接口返回 ISO 绝对时间**，前端自己算相对时间：

- 服务端可直接 `SELECT created_at` 并在序列化时 `toISOString()`；
- 前端把 `relativeTime(minutes)` 改成 `relativeTime(iso)` 即可，改动很小；
- 好处：响应可缓存、不受服务端时区影响、客户端时间显示更准。

不改也行——那就由服务端算好分钟数返回，保持现有契约（`CONTRIBUTING.md` 里已记录这条）。

### 4.3 枚举与前端取值对齐

| 领域 | DB | 前端 |
|---|---|---|
| 难度 | `TINYINT` 1/2/3 | `简单` / `中等` / `困难`（接口层翻译） |
| 赛制 | `ENUM('ACM','OI','IOI')` | 同名 |
| 帖子分类 | `ENUM('题解','求助','公告','闲聊')` | 同名 |
| 提交状态 | `solved` / `attempted` / `none` | 同名 |
| 判题结果 | `AC` / `WA` / `TLE` / `MLE` / `RE` / `CE` / `PE` / `OLE` / `SE` / `PD` / `JD` | 未展示，建议详情页用 |

难度用 `TINYINT` 比直接存中文更规范（便于排序、改文案），代价是接口层要写一次映射。嫌麻烦直接 `ENUM('简单','中等','困难')` 也能用。

## 5. 典型查询与对账

**排行榜**（`solved` 通过题数 / `submissions` 提交次数 / `accepted` 通过次数）：

```sql
SELECT u.id, u.username, u.nickname, u.college,
       COUNT(DISTINCT CASE WHEN s.verdict = 'AC' THEN s.problem_id END) AS solved,
       COUNT(*)            AS submissions,
       SUM(s.verdict='AC') AS accepted
FROM submissions s
JOIN users u ON u.id = s.user_id
WHERE u.status = 'active'
GROUP BY u.id
ORDER BY solved DESC, submissions ASC;
```

用户量上千后再换成物化汇总表（`user_stats`）或定时任务，接口形状不变。

**题库列表**（含状态与通过率，一行join解决）：

```sql
SELECT p.id, p.code, p.title, p.difficulty, p.submission_count, p.accepted_count,
       COALESCE(ups.status, 'none') AS my_status
FROM problems p
LEFT JOIN user_problem_status ups
       ON ups.problem_id = p.id AND ups.user_id = ?
WHERE p.is_visible = 1
ORDER BY p.code;
```

**计数对账 / 重算**（怀疑计数器漂移时执行）：

```sql
UPDATE problems p
LEFT JOIN (
  SELECT problem_id,
         COUNT(*) AS subs,
         SUM(verdict='AC') AS acc
  FROM submissions GROUP BY problem_id
) x ON x.problem_id = p.id
SET p.submission_count = COALESCE(x.subs, 0),
    p.accepted_count   = COALESCE(x.acc, 0);

INSERT INTO user_problem_status (user_id, problem_id, status, submission_count, first_ac_at)
SELECT user_id, problem_id,
       IF(SUM(verdict='AC') > 0, 'solved', 'attempted'),
       COUNT(*),
       MIN(CASE WHEN verdict='AC' THEN created_at END)
FROM submissions GROUP BY user_id, problem_id
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  submission_count = VALUES(submission_count),
  first_ac_at = VALUES(first_ac_at);
```

## 6. 迁移与种子

```
server/
├── db/
│   ├── schema.sql          # 建表（本文第 3 节）
│   ├── seed.sql            # 种子数据
│   └── migrations/         # 后续结构变更，编号文件：001_xxx.sql、002_xxx.sql
├── db.js                   # mysql2/promise 连接池
└── .env.example
```

`server/package.json` 建议加两个脚本：

```json
"db:init": "mysql -u sylu_oj -p sylu_oj < db/schema.sql",
"db:seed": "mysql -u sylu_oj -p sylu_oj < db/seed.sql"
```

**种子数据的取巧之处**：前端六页已经有完整占位数据（16 道题 / 10 场比赛 / 14 个话题 / 19 条排名记录）。直接把它导成 `seed.sql`，后端一上线页面看起来和现在**完全一样**，方便逐页对照验收，也方便写接口时比对字段。

## 7. 安全与备份

- 应用**不用 root**，只授权 `sylu_oj.*`；生产环境单独建库账号并限制来源 IP。
- `server/.env` 存口令与 `JWT_SECRET`，**已在 `.gitignore` 中忽略**（本次修复）；`.env.example` 只放键名可提交。
- 密码一律 `bcryptjs` 存 hash（cost 10~12），**绝不存明文**；`/api/auth/*` 加 `express-rate-limit` 限流（依赖已备好）。
- 校验放服务端：用户名/邮箱/学号唯一性、邮箱格式、密码强度（前端那套规则只是体验优化，不能当安全边界）。
- 备份：`mysqldump --single-transaction --routines sylu_oj > backup_$(date +%F).sql`，配 cron 每日一次 + 保留最近 7 份。
- 判题机隔离、源码大小限制（`source_code` 建议限制 64KB）等在实现 `server.js` 时一并考虑。

## 8. 落地顺序（建议）

1. [x] `.gitignore` 忽略 `.env`、补 `server/.env.example`（本文档同批完成）
2. [ ] 建库建账号（第 1 节 SQL），复制 `.env.example` 为 `.env` 并填口令
3. [ ] 写 `server/db/schema.sql`（第 3 节 DDL 可直接用）
4. [ ] 写 `server/db/seed.sql`（从前端占位数据转换）
5. [ ] 写 `server/db.js`（连接池 + 启动时自检连接）
6. [ ] 实现 `server.js` 的六个接口：`/api/auth/register`、`/api/auth/login`、`/api/rank`、`/api/topics`、`/api/contests`、`/api/problems`
7. [ ] 把六个页面的 `demoMode` 改为 `false`，逐页联调
8. [ ] 在此文档补一节「接口与字段映射」，与 `CONTRIBUTING.md` 的接口契约保持一致
