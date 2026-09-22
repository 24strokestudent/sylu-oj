/* ============================================================
   SYLU OJ · 比赛页（competition）脚本
   功能：占位赛事渲染 / 状态推导 / 搜索 / 筛选 / 排序（预留 /api/contests）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    // 后端接口地址：server/ 提供该接口后，把 demoMode 改为 false 即可联调
    endpoint: '/api/contests',
    // 演示模式：后端尚未接入时使用下方占位数据
    demoMode: true
  };

  /* ----------------------------------------------------------
     占位数据（接入后端后由 GET /api/contests 返回，字段同名即可）
     字段：title 名称 / format 赛制 / desc 简介 / problems 题目数
           participants 参赛人数
           startOffset 距现在多少分钟开始（正数=还没开始，负数=已开始）
           durationMinutes 比赛时长（分钟）
     状态由 startOffset 与 durationMinutes 推导，接口若直接返回
     status（ongoing / upcoming / ended）则以接口为准
     ---------------------------------------------------------- */
  var PLACEHOLDER_CONTESTS = [
    { id: 1, title: '2026-2027 第一学期周赛 #1', format: 'ACM', desc: '每周常规赛，覆盖基础算法与数据结构，适合保持手感与查漏补缺。', problems: 8, participants: 47, startOffset: -1440, durationMinutes: 10080 },
    { id: 2, title: '新生程序设计入门赛', format: 'OI', desc: '面向零基础新生的入门赛，语法与简单算法为主，赛后提供官方题解。', problems: 10, participants: 63, startOffset: -2880, durationMinutes: 12960 },
    { id: 3, title: '字符串专题训练', format: 'IOI', desc: 'KMP、哈希、字典树等字符串算法专项训练，可反复提交取最高分。', problems: 4, participants: 23, startOffset: -1800, durationMinutes: 2880 },
    { id: 4, title: '动态规划专项赛', format: 'OI', desc: '线性 DP、区间 DP 与背包问题专项，按测试点得分累加。', problems: 5, participants: 0, startOffset: 2880, durationMinutes: 10800 },
    { id: 5, title: '第 X 届程序设计竞赛（校赛）', format: 'ACM', desc: '校内选拔赛，成绩优异者可进入校队集训，支持封榜滚榜。', problems: 12, participants: 0, startOffset: 12960, durationMinutes: 18000 },
    { id: 6, title: '模拟赛（IOI 赛制）', format: 'IOI', desc: '赛前热身模拟，实时显示分数与排名，帮助熟悉比赛节奏。', problems: 3, participants: 0, startOffset: 1440, durationMinutes: 3600 },
    { id: 7, title: '2025-2026 第二学期周赛 #12', format: 'ACM', desc: '上学期收官周赛，含两道图论综合题，赛后开放题解讨论。', problems: 8, participants: 52, startOffset: -43200, durationMinutes: 10080 },
    { id: 8, title: '数据结构实验赛', format: 'OI', desc: '配合课程实验的阶段性比赛，覆盖栈、队列、树与并查集。', problems: 6, participants: 41, startOffset: -60480, durationMinutes: 7200 },
    { id: 9, title: '寒假算法集训选拔', format: 'ACM', desc: '寒假集训队选拔，题目难度偏高，含构造与思维题。', problems: 10, participants: 38, startOffset: -86400, durationMinutes: 14400 },
    { id: 10, title: '图论专题训练', format: 'IOI', desc: '最短路、最小生成树与拓扑排序专题，适合系统复习图论。', problems: 6, participants: 29, startOffset: -10080, durationMinutes: 7200 }
  ];

  var STATUS_LABEL = {
    ongoing: '进行中',
    upcoming: '未开始',
    ended: '已结束'
  };

  var STATUS_TAG_CLASS = {
    ongoing: 'tag-live',
    upcoming: 'tag-soon',
    ended: 'tag-ended'
  };

  var STATUS_RANK = {
    ongoing: 0,
    upcoming: 1,
    ended: 2
  };

  // 不同状态下的操作按钮（详情页与参赛流程待做，先指向登录页 / 总榜单）
  var STATUS_ACTION = {
    ongoing: { label: '立即参加', className: 'btn-primary', href: 'login.html' },
    upcoming: { label: '报名', className: 'btn-outline', href: 'login.html' },
    ended: { label: '查看榜单', className: 'btn-ghost', href: 'level.html' }
  };

  var SORT_LABEL = {
    status: '进行中优先',
    participants: '参赛人数',
    problems: '题目数量'
  };

  // 剩余不足 1 天时把倒计时标红
  var URGENT_MINUTES = 1440;

  var els = {
    list: document.getElementById('compList'),
    search: document.getElementById('compSearch'),
    status: document.getElementById('compStatus'),
    format: document.getElementById('compFormat'),
    sort: document.getElementById('compSort'),
    count: document.getElementById('compCount')
  };
  if (!els.list) return;

  var state = {
    contests: [],
    keyword: '',
    status: '',
    format: '',
    sort: 'status'
  };

  /* ---------- 工具函数 ---------- */

  function relativeTime(minutes) {
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + ' 分钟';
    if (minutes < 1440) return Math.floor(minutes / 60) + ' 小时';
    if (minutes < 43200) return Math.floor(minutes / 1440) + ' 天';
    return Math.floor(minutes / 43200) + ' 个月';
  }

  function formatDuration(minutes) {
    if (minutes < 60) return minutes + ' 分钟';
    var days = Math.floor(minutes / 1440);
    var hours = Math.floor((minutes % 1440) / 60);
    if (!days) return hours + ' 小时';
    return days + ' 天' + (hours ? ' ' + hours + ' 小时' : '');
  }

  function deriveStatus(row) {
    if (row.status === 'ongoing' || row.status === 'upcoming' || row.status === 'ended') return row.status;
    if (row.startOffset > 0) return 'upcoming';
    if (row.startOffset + row.durationMinutes > 0) return 'ongoing';
    return 'ended';
  }

  // 距离「有意义的时刻」还有多久：进行中=剩余，未开始=距开始，已结束=已结束多久
  function proximity(contest) {
    if (contest.status === 'ongoing') return contest.startOffset + contest.durationMinutes;
    if (contest.status === 'upcoming') return contest.startOffset;
    return -(contest.startOffset + contest.durationMinutes);
  }

  function elapsedPercent(contest) {
    var elapsed = -contest.startOffset;
    var ratio = contest.durationMinutes > 0 ? elapsed / contest.durationMinutes : 0;
    return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  }

  function normalize(row, index) {
    var item = {
      id: row.id != null ? row.id : index,
      title: String(row.title || '未命名比赛'),
      format: String(row.format || 'ACM'),
      desc: String(row.desc || row.description || ''),
      problems: Number(row.problems) || 0,
      participants: Number(row.participants) || 0,
      startOffset: Number(row.startOffset) || 0,
      durationMinutes: Number(row.durationMinutes) || 0,
      status: row.status
    };
    item.status = deriveStatus(item);
    return item;
  }

  function sortContests(contests, key) {
    var copy = contests.slice();
    if (key === 'participants') {
      copy.sort(function (a, b) { return b.participants - a.participants; });
      return copy;
    }
    if (key === 'problems') {
      copy.sort(function (a, b) { return b.problems - a.problems; });
      return copy;
    }
    copy.sort(function (a, b) {
      var rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      return rank !== 0 ? rank : proximity(a) - proximity(b);
    });
    return copy;
  }

  function filterContests(contests) {
    var keyword = state.keyword.trim().toLowerCase();
    return contests.filter(function (contest) {
      if (state.status && contest.status !== state.status) return false;
      if (state.format && contest.format !== state.format) return false;
      if (!keyword) return true;
      return (contest.title + ' ' + contest.format).toLowerCase().indexOf(keyword) !== -1;
    });
  }

  /* ---------- 卡片渲染 ---------- */

  function buildTag(text, className) {
    var tag = document.createElement('span');
    tag.className = 'tag ' + className;
    tag.textContent = text;
    return tag;
  }

  function buildMetaRow(label, value) {
    var row = document.createElement('div');
    row.className = 'comp-meta-item';
    var key = document.createElement('span');
    key.textContent = label;
    var val = document.createElement('b');
    val.textContent = value;
    row.appendChild(key);
    row.appendChild(val);
    return row;
  }

  function renderContest(contest) {
    var card = document.createElement('article');
    card.className = 'comp-card';

    var head = document.createElement('div');
    head.className = 'comp-card-head';
    head.appendChild(buildTag(STATUS_LABEL[contest.status], STATUS_TAG_CLASS[contest.status]));
    head.appendChild(buildTag(contest.format, 'tag-format'));
    card.appendChild(head);

    var title = document.createElement('h3');
    title.textContent = contest.title;
    card.appendChild(title);

    var desc = document.createElement('p');
    desc.className = 'comp-desc';
    desc.textContent = contest.desc;
    card.appendChild(desc);

    var remaining = contest.startOffset + contest.durationMinutes;

    var time = document.createElement('div');
    time.className = 'comp-time';
    if (contest.status === 'ongoing') {
      var started = document.createElement('span');
      started.textContent = '已进行 ' + relativeTime(-contest.startOffset);
      var left = document.createElement('span');
      left.textContent = '剩余 ' + relativeTime(remaining);
      if (remaining < URGENT_MINUTES) left.className = 'is-urgent';
      time.appendChild(started);
      time.appendChild(left);
    } else if (contest.status === 'upcoming') {
      var soon = document.createElement('span');
      soon.textContent = relativeTime(contest.startOffset) + '后开始';
      time.appendChild(soon);
    } else {
      var over = document.createElement('span');
      over.textContent = relativeTime(remaining) + '前结束';
      time.appendChild(over);
    }
    card.appendChild(time);

    if (contest.status === 'ongoing') {
      var bar = document.createElement('div');
      bar.className = 'comp-progress-bar';
      bar.setAttribute('aria-hidden', 'true');
      var fill = document.createElement('i');
      fill.style.width = elapsedPercent(contest) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
    }

    var meta = document.createElement('div');
    meta.className = 'comp-meta';
    meta.appendChild(buildMetaRow('比赛时长', formatDuration(contest.durationMinutes)));
    meta.appendChild(buildMetaRow('题目数量', contest.problems + ' 题'));
    meta.appendChild(buildMetaRow('参赛人数', contest.participants + ' 人'));
    card.appendChild(meta);

    var foot = document.createElement('div');
    foot.className = 'comp-card-foot';
    var action = STATUS_ACTION[contest.status];
    var button = document.createElement('a');
    button.className = 'btn ' + action.className;
    button.href = action.href;
    button.textContent = action.label;
    foot.appendChild(button);
    card.appendChild(foot);

    return card;
  }

  function renderEmpty(message) {
    var box = document.createElement('div');
    box.className = 'comp-empty';
    box.textContent = message;
    els.list.appendChild(box);
  }

  function render(contests) {
    els.list.textContent = '';

    if (!contests.length) {
      renderEmpty(state.contests.length
        ? '没有匹配的比赛，试试调整搜索关键词或筛选条件'
        : '暂无比赛，稍后再来看看');
      return;
    }

    var fragment = document.createDocumentFragment();
    contests.forEach(function (contest) {
      fragment.appendChild(renderContest(contest));
    });
    els.list.appendChild(fragment);
  }

  function apply() {
    var rows = sortContests(filterContests(state.contests), state.sort);
    render(rows);

    if (els.count) {
      els.count.classList.remove('is-error');
      var total = state.contests.length;
      var ongoing = state.contests.filter(function (c) { return c.status === 'ongoing'; }).length;
      var text = '共 ' + total + ' 场比赛 · ' + ongoing + ' 场进行中';
      if (rows.length !== total) text += '（筛选出 ' + rows.length + ' 场）';
      els.count.textContent = text + ' · 排序：' + SORT_LABEL[state.sort];
    }
  }

  function showError(message) {
    els.list.textContent = '';
    renderEmpty(message);
    if (els.count) {
      els.count.classList.add('is-error');
      els.count.textContent = message;
    }
  }

  /* ---------- 数据获取 ---------- */

  // 兼容后端返回 [ ... ] 或 { list: [...] } / { contests: [...] } / { data: [...] }
  function pickList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    return data.list || data.contests || data.rows || data.data || null;
  }

  function requestContests() {
    if (CONFIG.demoMode) {
      return new Promise(function (resolve) {
        resolve(PLACEHOLDER_CONTESTS.slice());
      });
    }

    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('当前浏览器不支持 fetch，请升级浏览器后重试'));
    }

    return fetch(CONFIG.endpoint, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!res.ok) {
          var msg = data && (data.message || data.error);
          throw new Error(msg || ('比赛列表加载失败（HTTP ' + res.status + '）'));
        }
        var list = pickList(data);
        if (!Array.isArray(list)) throw new Error('比赛数据格式不正确');
        return list;
      });
    }, function () {
      // 第二个回调只接网络层失败，HTTP 错误不走这里
      throw new Error('无法连接比赛服务，请确认后端已启动');
    });
  }

  /* ---------- 交互 ---------- */

  if (els.search) {
    els.search.addEventListener('input', function () {
      state.keyword = els.search.value;
      apply();
    });
  }

  if (els.status) {
    els.status.addEventListener('change', function () {
      state.status = els.status.value;
      apply();
    });
  }

  if (els.format) {
    els.format.addEventListener('change', function () {
      state.format = els.format.value;
      apply();
    });
  }

  if (els.sort) {
    els.sort.addEventListener('change', function () {
      state.sort = els.sort.value;
      apply();
    });
  }

  /* ---------- 初始化 ---------- */

  function load() {
    return requestContests().then(function (list) {
      state.contests = list.map(normalize);
      apply();
    }).catch(function (err) {
      state.contests = [];
      showError((err && err.message) ? err.message : '比赛列表加载失败，请稍后重试');
    });
  }

  // 方便联调时在控制台切换：SYLU_COMP_CONFIG.demoMode = false; SYLU_COMP_CONFIG.reload()
  CONFIG.reload = load;
  window.SYLU_COMP_CONFIG = CONFIG;

  load();
})();
