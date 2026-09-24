/* ============================================================
   SYLU OJ · 个人主页（user）脚本
   功能：按 ?username= 渲染资料/统计/难度与知识点分布/提交记录/比赛记录/已通过
        并实现 Tab 切换（预留 /api/users/:username）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    endpoint: 'http://localhost:3000/api/users',
    demoMode: false,
    defaultUsername: (function () {
      try { return window.localStorage.getItem('sylu_user') || 'sylu_2026'; }
      catch (e) { return 'sylu_2026'; }
    })()
  };

  var VERDICT_LABEL = {
    AC: '通过',
    WA: '答案错误',
    TLE: '运行超时',
    MLE: '内存超限',
    RE: '运行错误',
    CE: '编译错误',
    PE: '格式错误',
    OLE: '输出超限',
    SE: '系统错误',
    PD: '等待判题',
    JD: '判题中'
  };

  var VERDICT_CLASS = {
    AC: 'verdict-ok',
    WA: 'verdict-bad',
    TLE: 'verdict-warn',
    MLE: 'verdict-warn',
    RE: 'verdict-bad',
    CE: 'verdict-muted',
    PE: 'verdict-warn',
    OLE: 'verdict-bad',
    SE: 'verdict-bad',
    PD: 'verdict-muted',
    JD: 'verdict-muted'
  };

  var LANGUAGE_LABEL = {
    c: 'C',
    cpp: 'C++',
    java: 'Java',
    python: 'Python 3',
    go: 'Go'
  };

  var DIFFICULTY_TAG_CLASS = {
    '简单': 'tag-easy',
    '中等': 'tag-mid',
    '困难': 'tag-hard'
  };

  var els = {
    layout: document.getElementById('profileLayout'),
    missing: document.getElementById('profileMissing'),
    missingText: document.getElementById('profileMissingText'),
    crumb: document.getElementById('crumbUser'),
    avatar: document.getElementById('profileAvatar'),
    nickname: document.getElementById('profileNickname'),
    account: document.getElementById('profileAccount'),
    tags: document.getElementById('profileTags'),
    rank: document.getElementById('profileRank'),
    statSolved: document.getElementById('statSolved'),
    statSubmissions: document.getElementById('statSubmissions'),
    statAccepted: document.getElementById('statAccepted'),
    statRate: document.getElementById('statRate'),
    difficultyDist: document.getElementById('difficultyDist'),
    tagDist: document.getElementById('tagDist'),
    recentBody: document.getElementById('recentBody'),
    submissionBody: document.getElementById('submissionBody'),
    contestBody: document.getElementById('contestBody'),
    solvedList: document.getElementById('solvedList'),
    solvedNote: document.getElementById('solvedNote')
  };
  if (!els.nickname) return;

  /* ---------- 工具函数 ---------- */

  function relativeTime(minutes) {
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + ' 分钟前';
    if (minutes < 1440) return Math.floor(minutes / 60) + ' 小时前';
    if (minutes < 43200) return Math.floor(minutes / 1440) + ' 天前';
    return Math.floor(minutes / 43200) + ' 个月前';
  }

  function rateOf(user) {
    return user.submissions > 0 ? user.accepted / user.submissions : 0;
  }

  function pctText(value) {
    return Math.round(value * 100) + '%';
  }

  function profileUrl(username) {
    return 'user.html?username=' + encodeURIComponent(username);
  }

  function problemUrl(code) {
    return 'problem.html?code=' + encodeURIComponent(code);
  }

  function usernameFromUrl() {
    var match = /[?&]username=([^&#]+)/.exec(window.location.search);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
    } catch (e) {
      return '';
    }
  }

  function normalizeUser(row, index) {
    return {
      username: String(row.username || row.loginId || ('#' + (index + 1))),
      nickname: String(row.nickname || row.username || '未知用户'),
      college: String(row.college || '未填写'),
      role: row.role === 'admin' ? 'admin' : 'user',
      joinedAt: String(row.joinedAt || ''),
      solved: Number(row.solved) || 0,
      submissions: Number(row.submissions) || 0,
      accepted: Number(row.accepted) || 0,
      recent: Array.isArray(row.recent) ? row.recent : [],
      contests: Array.isArray(row.contests) ? row.contests : []
    };
  }

  function normalizeProblem(row, index) {
    var tags = row.tags;
    if (typeof tags === 'string') tags = tags.split(/[,，\s]+/);
    if (!Array.isArray(tags)) tags = [];
    return {
      code: String(row.code || row.id || ('#' + (index + 1))),
      title: String(row.title || '未命名题目'),
      difficulty: DIFFICULTY_TAG_CLASS[row.difficulty] ? String(row.difficulty) : '简单',
      tags: tags.map(function (tag) { return String(tag).trim(); }).filter(Boolean)
    };
  }

  /* ---------- 名次口径必须与排行榜页一致 ----------
     js/level.js 的 assignRanks：通过题数降序 → 提交次数升序 → 通过率降序 */
  function rankOf(users, target) {
    var ordered = users.slice().sort(function (a, b) {
      if (b.solved !== a.solved) return b.solved - a.solved;
      if (a.submissions !== b.submissions) return a.submissions - b.submissions;
      return rateOf(b) - rateOf(a);
    });
    for (var i = 0; i < ordered.length; i++) {
      if (ordered[i].username === target.username) return i + 1;
    }
    return 0;
  }

  /* ---------- 渲染：头部与数字条 ---------- */

  function renderHead(user, rank) {
    document.title = user.nickname + ' 的主页 · SYLU OJ | 沈阳理工大学在线评测系统';
    if (els.crumb) els.crumb.textContent = user.nickname;
    els.avatar.textContent = user.nickname.charAt(0).toUpperCase();
    els.nickname.textContent = user.nickname;
    els.account.textContent = '@' + user.username;

    els.tags.textContent = '';
    if (user.role === 'admin') {
      var adminTag = document.createElement('span');
      adminTag.className = 'tag tag-notice';
      adminTag.textContent = '管理员';
      els.tags.appendChild(adminTag);
    }
    var college = document.createElement('span');
    college.textContent = user.college;
    els.tags.appendChild(college);

    if (user.joinedAt) {
      var joined = document.createElement('span');
      joined.textContent = '注册于 ' + user.joinedAt;
      els.tags.appendChild(joined);
    }

    els.rank.textContent = rank > 0 ? '#' + rank : '—';

    els.statSolved.textContent = String(user.solved);
    els.statSubmissions.textContent = String(user.submissions);
    els.statAccepted.textContent = String(user.accepted);
    els.statRate.textContent = pctText(rateOf(user));
  }

  /* ---------- 渲染：分布 ---------- */

  function buildDistRow(label, done, total) {
    var row = document.createElement('div');
    row.className = 'dist-row';

    var name = document.createElement('span');
    name.textContent = label;

    var bar = document.createElement('span');
    bar.className = 'dist-bar';
    bar.setAttribute('aria-hidden', 'true');
    var fill = document.createElement('i');
    fill.style.width = (total > 0 ? Math.round(done / total * 100) : 0) + '%';
    bar.appendChild(fill);

    var count = document.createElement('span');
    count.className = 'dist-count';
    count.textContent = done + ' / ' + total;

    row.appendChild(name);
    row.appendChild(bar);
    row.appendChild(count);
    return row;
  }

  // 已通过题目：占位数据按题号顺序取前 solved 道推断（接后端后改为按 submissions 统计）
  function solvedProblemsOf(user, problems) {
    return problems.slice(0, Math.min(user.solved, problems.length));
  }

  function renderDistribution(user, problems) {
    var solved = solvedProblemsOf(user, problems);

    var byDifficulty = { '简单': 0, '中等': 0, '困难': 0 };
    var totalByDifficulty = { '简单': 0, '中等': 0, '困难': 0 };
    var byTag = {};

    problems.forEach(function (problem) {
      totalByDifficulty[problem.difficulty] = (totalByDifficulty[problem.difficulty] || 0) + 1;
    });

    solved.forEach(function (problem) {
      byDifficulty[problem.difficulty] = (byDifficulty[problem.difficulty] || 0) + 1;
      problem.tags.forEach(function (tag) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      });
    });

    els.difficultyDist.textContent = '';
    ['简单', '中等', '困难'].forEach(function (level) {
      els.difficultyDist.appendChild(buildDistRow(level, byDifficulty[level] || 0, totalByDifficulty[level] || 0));
    });

    els.tagDist.textContent = '';
    var tags = Object.keys(byTag).sort(function (a, b) { return byTag[b] - byTag[a]; });
    if (!tags.length) {
      var empty = document.createElement('span');
      empty.className = 'profile-note';
      empty.textContent = '还没有通过任何题目，暂无知识点数据。';
      els.tagDist.appendChild(empty);
      return;
    }
    tags.forEach(function (tag) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = tag + ' ' + byTag[tag];
      els.tagDist.appendChild(chip);
    });
  }

  /* ---------- 渲染：提交记录 ---------- */

  function buildSubmissionRow(item) {
    var tr = document.createElement('tr');

    var tdProblem = document.createElement('td');
    var link = document.createElement('a');
    link.className = 'bank-title';
    link.href = problemUrl(item.code);
    link.textContent = item.code;
    tdProblem.appendChild(link);
    tr.appendChild(tdProblem);

    var tdVerdict = document.createElement('td');
    var verdict = document.createElement('span');
    var key = String(item.verdict || 'PD');
    verdict.className = 'verdict ' + (VERDICT_CLASS[key] || 'verdict-muted');
    verdict.textContent = VERDICT_LABEL[key] || key;
    tdVerdict.appendChild(verdict);
    tr.appendChild(tdVerdict);

    var tdLang = document.createElement('td');
    tdLang.textContent = LANGUAGE_LABEL[item.language] || String(item.language || '—');
    tr.appendChild(tdLang);

    var tdTime = document.createElement('td');
    tdTime.className = 'num';
    tdTime.textContent = item.verdict === 'CE' ? '—' : (Number(item.timeUsedMs) || 0) + ' ms';
    tr.appendChild(tdTime);

    var tdMemory = document.createElement('td');
    tdMemory.className = 'num';
    tdMemory.textContent = item.verdict === 'CE' ? '—' : Math.round((Number(item.memoryUsedKb) || 0)) + ' KB';
    tr.appendChild(tdMemory);

    var tdWhen = document.createElement('td');
    tdWhen.textContent = relativeTime(Number(item.minutesAgo) || 0);
    tr.appendChild(tdWhen);

    return tr;
  }

  function renderSubmissionTable(tbody, items, emptyText) {
    tbody.textContent = '';

    if (!items.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.className = 'data-empty';
      td.colSpan = 6;
      td.textContent = emptyText;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    var fragment = document.createDocumentFragment();
    items.forEach(function (item) {
      fragment.appendChild(buildSubmissionRow(item));
    });
    tbody.appendChild(fragment);
  }

  /* ---------- 渲染：比赛记录 ---------- */

  function renderContests(user) {
    els.contestBody.textContent = '';

    if (!user.contests.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.className = 'data-empty';
      td.colSpan = 6;
      td.textContent = user.nickname + ' 暂无参赛记录';
      tr.appendChild(td);
      els.contestBody.appendChild(tr);
      return;
    }

    var fragment = document.createDocumentFragment();
    user.contests.forEach(function (contest) {
      var row = document.createElement('tr');

      var tdTitle = document.createElement('td');
      tdTitle.textContent = String(contest.title || '未命名比赛');
      row.appendChild(tdTitle);

      var tdFormat = document.createElement('td');
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = String(contest.format || 'ACM');
      tdFormat.appendChild(chip);
      row.appendChild(tdFormat);

      [['rank', '第 ' + (Number(contest.rank) || 0) + ' 名'], ['solved', String(Number(contest.solved) || 0)], ['score', String(Number(contest.score) || 0)]]
        .forEach(function (pair) {
          var td = document.createElement('td');
          td.className = 'num';
          td.textContent = pair[1];
          row.appendChild(td);
        });

      var tdWhen = document.createElement('td');
      tdWhen.textContent = relativeTime(Number(contest.minutesAgo) || 0);
      row.appendChild(tdWhen);

      fragment.appendChild(row);
    });
    els.contestBody.appendChild(fragment);
  }

  /* ---------- 渲染：已通过列表 ---------- */

  function renderSolved(user, problems) {
    var solved = solvedProblemsOf(user, problems);
    els.solvedList.textContent = '';

    if (!solved.length) {
      var li = document.createElement('li');
      li.className = 'data-empty';
      li.textContent = user.nickname + ' 还没有通过任何题目';
      els.solvedList.appendChild(li);
    } else {
      solved.forEach(function (problem) {
        var item = document.createElement('li');

        var code = document.createElement('span');
        code.className = 'chip chip-mono';
        code.textContent = problem.code;
        item.appendChild(code);

        var link = document.createElement('a');
        link.href = problemUrl(problem.code);
        link.textContent = problem.title;
        item.appendChild(link);

        var tag = document.createElement('span');
        tag.className = 'tag ' + DIFFICULTY_TAG_CLASS[problem.difficulty];
        tag.textContent = problem.difficulty;
        item.appendChild(tag);

        var when = document.createElement('span');
        when.className = 'num';
        when.textContent = '排名靠前';   // 占位：接入后端后显示首次通过时间
        item.appendChild(when);

        els.solvedList.appendChild(item);
      });
    }

    if (els.solvedNote) {
      els.solvedNote.textContent = '「已通过」按题号顺序取前 ' + user.solved +
        ' 道推断（占位示例）；接入后端后改为按 submissions 表统计首次通过时间。';
    }
  }

  /* ---------- Tab 切换 ---------- */

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  function activateTab(tab) {
    tabs.forEach(function (item) {
      var selected = item === tab;
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
      item.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(item.getAttribute('aria-controls'));
      if (panel) {
        if (selected) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', 'hidden');
        }
      }
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () {
      activateTab(tab);
    });

    // 左右方向键在 Tab 之间移动（无障碍要求）
    tab.addEventListener('keydown', function (event) {
      var offset = event.key === 'ArrowRight' ? 1 : (event.key === 'ArrowLeft' ? -1 : 0);
      if (!offset) return;
      event.preventDefault();
      var next = tabs[(index + offset + tabs.length) % tabs.length];
      activateTab(next);
      next.focus();
    });
  });

  /* ---------- 缺失状态 ---------- */

  function renderMissing(message) {
    if (els.layout) els.layout.setAttribute('hidden', 'hidden');
    if (els.missing) {
      els.missing.removeAttribute('hidden');
      if (els.missingText) els.missingText.textContent = message;
    }
    if (els.crumb) els.crumb.textContent = '用户不存在';
    document.title = '用户不存在 · SYLU OJ | 沈阳理工大学在线评测系统';
  }

  /* ---------- 数据获取 ---------- */

  function pickList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    return data.list || data.users || data.rows || data.data || null;
  }

  function requestUsers() {
    if (CONFIG.demoMode) {
      return new Promise(function (resolve) {
        resolve(window.SYLU_USERS || []);
      });
    }

    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('当前浏览器不支持 fetch，请升级浏览器后重试'));
    }

    var username = usernameFromUrl() || CONFIG.defaultUsername;
    var url = CONFIG.endpoint + '/' + encodeURIComponent(username);

    return fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!res.ok) {
          var msg = data && (data.message || data.error);
          throw new Error(msg || ('用户信息加载失败（HTTP ' + res.status + '）'));
        }
        // 允许后端返回单个用户对象，或返回列表
        if (data && !Array.isArray(data) && (data.username || (data.user && data.user.username))) {
          return [data.user || data];
        }
        var list = pickList(data);
        if (!Array.isArray(list)) throw new Error('用户数据格式不正确');
        return list;
      });
    }, function () {
      // 第二个回调只接网络层失败，HTTP 错误不走这里
      throw new Error('无法连接用户服务，请确认后端已启动');
    });
  }

  /* ---------- 初始化 ---------- */

  function render(user, users, problems) {
    // 重新加载成功时恢复可见性（否则首次失败后重试会一直卡在缺失卡片上）
    if (els.layout) els.layout.removeAttribute('hidden');
    if (els.missing) els.missing.setAttribute('hidden', 'hidden');
    renderHead(user, rankOf(users, user));
    renderDistribution(user, problems);
    renderSubmissionTable(els.recentBody, user.recent.slice(0, 5), user.nickname + ' 暂无提交记录');
    renderSubmissionTable(els.submissionBody, user.recent, user.nickname + ' 暂无提交明细（占位数据只为主要用户提供）');
    renderContests(user);
    renderSolved(user, problems);
  }

  function load() {
    return requestUsers().then(function (rawUsers) {
      var users = rawUsers.map(normalizeUser);
      var problems = (window.SYLU_PROBLEMS || []).map(normalizeProblem);

      if (!users.length) {
        renderMissing('暂无用户数据。');
        return;
      }

      var wanted = usernameFromUrl() || CONFIG.defaultUsername;
      var found = null;
      for (var i = 0; i < users.length; i++) {
        if (users[i].username === wanted) {
          found = users[i];
          break;
        }
      }

      if (!found) {
        renderMissing('用户 ' + wanted + ' 不存在。');
        return;
      }

      render(found, users, problems);
    }).catch(function (err) {
      renderMissing((err && err.message) ? err.message : '用户信息加载失败，请稍后重试');
    });
  }

  // 方便联调时在控制台切换：SYLU_USER_CONFIG.demoMode = false; SYLU_USER_CONFIG.reload()
  CONFIG.reload = load;
  window.SYLU_USER_CONFIG = CONFIG;

  load();
})();
