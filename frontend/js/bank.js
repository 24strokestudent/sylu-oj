/* ============================================================
   SYLU OJ · 题库页（bank）脚本
   功能：占位题目渲染 / 搜索 / 难度·知识点·状态筛选 / 排序（预留 /api/problems）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    endpoint: 'http://localhost:3000/api/problems',
    demoMode: false
  };

  /* ----------------------------------------------------------
     占位数据来自 js/problems-data.js（与题目详情页共用同一份）
     接入后端后由 GET /api/problems 返回，字段同名即可
     该文件缺失时列表显示空状态，不会报错
     ---------------------------------------------------------- */
  var PLACEHOLDER_PROBLEMS = window.SYLU_PROBLEMS || [];

  var DIFFICULTY_TAG_CLASS = {
    '简单': 'tag-easy',
    '中等': 'tag-mid',
    '困难': 'tag-hard'
  };

  var DIFFICULTY_RANK = {
    '简单': 0,
    '中等': 1,
    '困难': 2
  };

  var STATUS_LABEL = {
    solved: '已通过',
    attempted: '尝试过',
    none: '未尝试'
  };

  var SORT_LABEL = {
    'default': '默认题号',
    rate: '通过率',
    submissions: '提交次数',
    difficulty: '难度由易到难'
  };

  var els = {
    body: document.getElementById('bankBody'),
    search: document.getElementById('bankSearch'),
    difficulty: document.getElementById('bankDifficulty'),
    tag: document.getElementById('bankTag'),
    status: document.getElementById('bankStatus'),
    sort: document.getElementById('bankSort'),
    count: document.getElementById('bankCount')
  };
  if (!els.body) return;

  var state = {
    problems: [],
    keyword: '',
    difficulty: '',
    tag: '',
    status: '',
    sort: 'default'
  };

  /* ---------- 工具函数 ---------- */

  function rateOf(problem) {
    return problem.submissions > 0 ? problem.accepted / problem.submissions : 0;
  }

  function pctText(value) {
    return Math.round(value * 100) + '%';
  }

  // 题号形如 CS001-01-001，按字典序即为题号顺序
  function byCode(a, b) {
    return a.code.localeCompare(b.code);
  }

  function sortProblems(problems, key) {
    var copy = problems.slice();
    if (key === 'rate') {
      copy.sort(function (a, b) {
        return rateOf(b) - rateOf(a) || b.submissions - a.submissions || byCode(a, b);
      });
    } else if (key === 'submissions') {
      copy.sort(function (a, b) {
        return b.submissions - a.submissions || byCode(a, b);
      });
    } else if (key === 'difficulty') {
      copy.sort(function (a, b) {
        return DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || byCode(a, b);
      });
    } else {
      copy.sort(byCode);
    }
    return copy;
  }

  function filterProblems(problems) {
    var keyword = state.keyword.trim().toLowerCase();
    return problems.filter(function (problem) {
      if (state.difficulty && problem.difficulty !== state.difficulty) return false;
      if (state.status && problem.status !== state.status) return false;
      if (state.tag && problem.tags.indexOf(state.tag) === -1) return false;
      if (!keyword) return true;
      var haystack = (problem.code + ' ' + problem.title + ' ' + problem.tags.join(' ')).toLowerCase();
      return haystack.indexOf(keyword) !== -1;
    });
  }

  // 题目详情页地址（详情页从查询参数读取题号）
  function detailUrl(code) {
    return 'problem.html?code=' + encodeURIComponent(code);
  }

  function normalize(row, index) {
    var tags = row.tags;
    if (typeof tags === 'string') tags = tags.split(/[,，\s]+/);
    if (!Array.isArray(tags)) tags = [];

    var status = row.status;
    if (status !== 'solved' && status !== 'attempted' && status !== 'none') status = 'none';

    return {
      code: String(row.code || row.id || ('#' + (index + 1))),
      title: String(row.title || '未命名题目'),
      difficulty: DIFFICULTY_TAG_CLASS[row.difficulty] ? String(row.difficulty) : '简单',
      tags: tags.map(function (tag) { return String(tag).trim(); }).filter(Boolean),
      submissions: Number(row.submissions) || 0,
      accepted: Number(row.accepted) || 0,
      status: status
    };
  }

  /* ---------- 表格渲染 ---------- */

  function cell(text, className) {
    var td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function buildStatusCell(problem) {
    var td = document.createElement('td');
    var dot = document.createElement('span');
    dot.className = 'bank-dot is-' + problem.status;
    var label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = STATUS_LABEL[problem.status];
    dot.appendChild(label);
    td.appendChild(dot);
    return td;
  }

  function buildCodeCell(problem) {
    var td = document.createElement('td');
    var link = document.createElement('a');
    link.className = 'chip chip-mono bank-code';
    link.href = detailUrl(problem.code);
    link.textContent = problem.code;
    td.appendChild(link);
    return td;
  }

  function buildTitleCell(problem) {
    var td = document.createElement('td');
    var link = document.createElement('a');
    link.className = 'bank-title';
    link.href = detailUrl(problem.code);
    link.textContent = problem.title;
    td.appendChild(link);
    return td;
  }

  function buildDifficultyCell(problem) {
    var td = document.createElement('td');
    var tag = document.createElement('span');
    tag.className = 'tag ' + DIFFICULTY_TAG_CLASS[problem.difficulty];
    tag.textContent = problem.difficulty;
    td.appendChild(tag);
    return td;
  }

  function buildTagsCell(problem) {
    var td = document.createElement('td');
    problem.tags.forEach(function (name) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = name;
      td.appendChild(chip);
    });
    return td;
  }

  function buildRateCell(problem) {
    var td = document.createElement('td');
    var rate = rateOf(problem);
    var wrap = document.createElement('span');
    wrap.className = 'rate-cell';
    var bar = document.createElement('span');
    bar.className = 'rate-bar';
    bar.setAttribute('aria-hidden', 'true');
    var fill = document.createElement('i');
    fill.style.width = Math.round(Math.min(rate, 1) * 100) + '%';
    bar.appendChild(fill);
    var text = document.createElement('span');
    text.textContent = pctText(rate);
    wrap.appendChild(bar);
    wrap.appendChild(text);
    td.appendChild(wrap);
    return td;
  }

  function renderProblem(problem) {
    var tr = document.createElement('tr');
    tr.appendChild(buildStatusCell(problem));
    tr.appendChild(buildCodeCell(problem));
    tr.appendChild(buildTitleCell(problem));
    tr.appendChild(buildDifficultyCell(problem));
    tr.appendChild(buildTagsCell(problem));
    tr.appendChild(buildRateCell(problem));
    tr.appendChild(cell(String(problem.submissions), 'num'));
    return tr;
  }

  function renderEmpty(message) {
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.className = 'data-empty';
    td.colSpan = 7;
    td.textContent = message;
    tr.appendChild(td);
    els.body.appendChild(tr);
  }

  function render(problems) {
    els.body.textContent = '';

    if (!problems.length) {
      renderEmpty(state.problems.length
        ? '没有匹配的题目，试试调整搜索关键词或筛选条件'
        : '暂无题目');
      return;
    }

    var fragment = document.createDocumentFragment();
    problems.forEach(function (problem) {
      fragment.appendChild(renderProblem(problem));
    });
    els.body.appendChild(fragment);
  }

  function sum(list, key) {
    return list.reduce(function (total, item) { return total + item[key]; }, 0);
  }

  function apply() {
    var rows = sortProblems(filterProblems(state.problems), state.sort);
    render(rows);

    if (els.count) {
      els.count.classList.remove('is-error');
      var text = '共 ' + rows.length + ' 道题 · 累计提交 ' + sum(rows, 'submissions') +
        ' · 通过 ' + sum(rows, 'accepted');
      if (rows.length !== state.problems.length) {
        text += '（已从 ' + state.problems.length + ' 道中筛选）';
      }
      els.count.textContent = text + ' · 排序：' + SORT_LABEL[state.sort];
    }
  }

  function showError(message) {
    els.body.textContent = '';
    renderEmpty(message);
    if (els.count) {
      els.count.classList.add('is-error');
      els.count.textContent = message;
    }
  }

  /* ---------- 数据获取 ---------- */

  // 兼容后端返回 [ ... ] 或 { list: [...] } / { problems: [...] } / { data: [...] }
  function pickList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    return data.list || data.problems || data.rows || data.data || null;
  }

  function requestProblems() {
    if (CONFIG.demoMode) {
      return new Promise(function (resolve) {
        resolve(PLACEHOLDER_PROBLEMS.slice());
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
          throw new Error(msg || ('题库加载失败（HTTP ' + res.status + '）'));
        }
        var list = pickList(data);
        if (!Array.isArray(list)) throw new Error('题库数据格式不正确');
        return list;
      });
    }, function () {
      // 第二个回调只接网络层失败，HTTP 错误不走这里
      throw new Error('无法连接题库服务，请确认后端已启动');
    });
  }

  /* ---------- 交互 ---------- */

  if (els.search) {
    els.search.addEventListener('input', function () {
      state.keyword = els.search.value;
      apply();
    });
  }

  if (els.difficulty) {
    els.difficulty.addEventListener('change', function () {
      state.difficulty = els.difficulty.value;
      apply();
    });
  }

  if (els.tag) {
    els.tag.addEventListener('change', function () {
      state.tag = els.tag.value;
      apply();
    });
  }

  if (els.status) {
    els.status.addEventListener('change', function () {
      state.status = els.status.value;
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
    return requestProblems().then(function (list) {
      state.problems = list.map(normalize);
      apply();
    }).catch(function (err) {
      state.problems = [];
      showError((err && err.message) ? err.message : '题库加载失败，请稍后重试');
    });
  }

  // 方便联调时在控制台切换：SYLU_BANK_CONFIG.demoMode = false; SYLU_BANK_CONFIG.reload()
  CONFIG.reload = load;
  window.SYLU_BANK_CONFIG = CONFIG;

  load();
})();
