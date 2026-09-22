/* ============================================================
   SYLU OJ · 排名页（level）脚本
   功能：占位数据渲染 / 搜索 / 学院筛选 / 排序（预留 /api/rank）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    // 后端接口地址：server/ 提供该接口后，把 demoMode 改为 false 即可联调
    endpoint: '/api/rank',
    // 演示模式：后端尚未接入时使用下方占位数据
    demoMode: true
  };

  /* ----------------------------------------------------------
     占位数据（接入后端后由 GET /api/rank 返回，字段同名即可）
     字段：username 用户名 / nickname 昵称 / college 学院
           solved 通过题数 / submissions 提交次数 / accepted 通过次数
     ---------------------------------------------------------- */
  var PLACEHOLDER_RANK = [
    { username: 'chen_rui', nickname: '陈锐', college: '计算机科学与工程学院', solved: 16, submissions: 38, accepted: 29 },
    { username: 'sylu_2026', nickname: '算法小白', college: '信息科学与工程学院', solved: 15, submissions: 44, accepted: 30 },
    { username: 'zhao_min', nickname: '赵敏', college: '计算机科学与工程学院', solved: 14, submissions: 33, accepted: 24 },
    { username: 'li_hao', nickname: '李昊', college: '自动化与电气工程学院', solved: 13, submissions: 41, accepted: 27 },
    { username: 'wang_ke', nickname: '王珂', college: '信息科学与工程学院', solved: 12, submissions: 29, accepted: 21 },
    { username: 'sun_yi', nickname: '孙一', college: '机械工程学院', solved: 11, submissions: 35, accepted: 22 },
    { username: 'zhou_lin', nickname: '周琳', college: '计算机科学与工程学院', solved: 11, submissions: 26, accepted: 19 },
    { username: 'xiao_yu', nickname: '肖宇', college: '其他学院', solved: 10, submissions: 31, accepted: 18 },
    { username: 'huang_tao', nickname: '黄涛', college: '信息科学与工程学院', solved: 9, submissions: 24, accepted: 15 },
    { username: 'lin_xi', nickname: '林夕', college: '自动化与电气工程学院', solved: 8, submissions: 22, accepted: 14 },
    { username: 'gao_fan', nickname: '高帆', college: '机械工程学院', solved: 8, submissions: 30, accepted: 16 },
    { username: 'meng_qi', nickname: '孟琪', college: '计算机科学与工程学院', solved: 7, submissions: 19, accepted: 12 },
    { username: 'du_yu', nickname: '杜宇', college: '其他学院', solved: 6, submissions: 21, accepted: 11 },
    { username: 'feng_lei', nickname: '冯磊', college: '信息科学与工程学院', solved: 5, submissions: 16, accepted: 9 },
    { username: 'tang_xin', nickname: '唐欣', college: '自动化与电气工程学院', solved: 4, submissions: 13, accepted: 7 },
    { username: 'bai_yun', nickname: '白云', college: '机械工程学院', solved: 3, submissions: 11, accepted: 5 },
    { username: 'yan_ning', nickname: '闫宁', college: '其他学院', solved: 2, submissions: 9, accepted: 3 },
    { username: 'newbie_01', nickname: '新同学', college: '信息科学与工程学院', solved: 1, submissions: 5, accepted: 1 },
    { username: 'newbie_01', nickname: 'zhtjjk', college: '国际工程学院', solved: 1, submissions: 5, accepted: 1 }
  ];

  var els = {
    body: document.getElementById('rankBody'),
    search: document.getElementById('rankSearch'),
    college: document.getElementById('rankCollege'),
    sort: document.getElementById('rankSort'),
    count: document.getElementById('rankCount')
  };
  if (!els.body) return;

  var SORT_LABEL = {
    solved: '通过题数',
    submissions: '提交次数',
    rate: '通过率'
  };

  var state = {
    rows: [],
    keyword: '',
    college: '',
    sort: 'solved'
  };

  /* ---------- 工具函数 ---------- */

  function rateOf(row) {
    return row.submissions > 0 ? row.accepted / row.submissions : 0;
  }

  function pctText(value) {
    return Math.round(value * 100) + '%';
  }

  // 通过题数降序 → 提交次数升序 → 通过率降序
  function sortRows(rows, key) {
    var copy = rows.slice();
    copy.sort(function (a, b) {
      if (key === 'submissions') {
        if (b.submissions !== a.submissions) return b.submissions - a.submissions;
        return b.solved - a.solved;
      }
      if (key === 'rate') {
        var diff = rateOf(b) - rateOf(a);
        if (Math.abs(diff) > 1e-9) return diff;
        return b.solved - a.solved;
      }
      if (b.solved !== a.solved) return b.solved - a.solved;
      if (a.submissions !== b.submissions) return a.submissions - b.submissions;
      return rateOf(b) - rateOf(a);
    });
    return copy;
  }

  // 名次按「通过题数」这一官方口径固定下来，切换排序时名次不会跟着乱变
  function assignRanks(rows) {
    sortRows(rows, 'solved').forEach(function (row, index) {
      row.rank = index + 1;
    });
    return rows;
  }

  function filterRows(rows) {
    var keyword = state.keyword.trim().toLowerCase();
    return rows.filter(function (row) {
      if (state.college && row.college !== state.college) return false;
      if (!keyword) return true;
      return (row.nickname + ' ' + row.username).toLowerCase().indexOf(keyword) !== -1;
    });
  }

  function normalize(row) {
    var solved = Number(row.solved) || 0;
    var submissions = Number(row.submissions) || 0;
    return {
      username: String(row.username || row.loginId || ''),
      nickname: String(row.nickname || row.username || '未知用户'),
      college: String(row.college || '未填写'),
      solved: solved,
      submissions: submissions,
      accepted: Number(row.accepted != null ? row.accepted : row.solved) || 0,
      rank: 0
    };
  }

  /* ---------- 渲染 ---------- */

  function cell(text, className) {
    var td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function renderRow(row) {
    var tr = document.createElement('tr');

    var tdRank = document.createElement('td');
    var badge = document.createElement('span');
    badge.className = 'rank-no' + (row.rank <= 3 ? ' top' + row.rank : '');
    badge.textContent = String(row.rank);
    tdRank.appendChild(badge);
    tr.appendChild(tdRank);

    var tdUser = document.createElement('td');
    var wrap = document.createElement('div');
    wrap.className = 'rank-user';
    var avatar = document.createElement('span');
    avatar.className = 'rank-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = row.nickname.charAt(0).toUpperCase();
    var info = document.createElement('span');
    var name = document.createElement('strong');
    name.textContent = row.nickname;
    var account = document.createElement('small');
    account.textContent = '@' + row.username;
    info.appendChild(name);
    info.appendChild(account);
    wrap.appendChild(avatar);
    wrap.appendChild(info);
    tdUser.appendChild(wrap);
    tr.appendChild(tdUser);

    tr.appendChild(cell(row.college));
    tr.appendChild(cell(String(row.solved), 'num'));
    tr.appendChild(cell(String(row.submissions), 'num'));

    var tdRate = document.createElement('td');
    var rate = rateOf(row);
    var rateWrap = document.createElement('span');
    rateWrap.className = 'rate-cell';
    var bar = document.createElement('span');
    bar.className = 'rate-bar';
    bar.setAttribute('aria-hidden', 'true');
    var fill = document.createElement('i');
    fill.style.width = Math.round(Math.min(rate, 1) * 100) + '%';
    bar.appendChild(fill);
    var text = document.createElement('span');
    text.textContent = pctText(rate);
    rateWrap.appendChild(bar);
    rateWrap.appendChild(text);
    tdRate.appendChild(rateWrap);
    tr.appendChild(tdRate);

    return tr;
  }

  function renderEmpty(message) {
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.className = 'data-empty';
    td.colSpan = 6;
    td.textContent = message;
    tr.appendChild(td);
    els.body.appendChild(tr);
  }

  function render(rows) {
    els.body.textContent = '';

    if (!rows.length) {
      renderEmpty(state.rows.length
        ? '没有匹配的用户，试试调整搜索关键词或筛选条件'
        : '暂无排行数据');
      return;
    }

    var fragment = document.createDocumentFragment();
    rows.forEach(function (row) {
      fragment.appendChild(renderRow(row));
    });
    els.body.appendChild(fragment);
  }

  function apply() {
    var rows = sortRows(filterRows(state.rows), state.sort);
    render(rows);

    if (els.count) {
      els.count.classList.remove('is-error');
      var filtered = rows.length !== state.rows.length;
      els.count.textContent = '共 ' + rows.length + ' 位用户' +
        (filtered ? '（已从 ' + state.rows.length + ' 条中筛选）' : '') +
        ' · 排序：' + SORT_LABEL[state.sort];
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

  // 兼容后端返回 [ ... ] 或 { list: [...] } / { rows: [...] } / { data: [...] }
  function pickList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    return data.list || data.rows || data.data || null;
  }

  function requestRank() {
    if (CONFIG.demoMode) {
      return new Promise(function (resolve) {
        resolve(PLACEHOLDER_RANK.slice());
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
          throw new Error(msg || ('排行榜加载失败（HTTP ' + res.status + '）'));
        }
        var list = pickList(data);
        if (!Array.isArray(list)) throw new Error('排行榜数据格式不正确');
        return list;
      });
    }, function () {
      // 第二个回调只接网络层失败，HTTP 错误不走这里
      throw new Error('无法连接排行榜服务，请确认后端已启动');
    });
  }

  /* ---------- 交互 ---------- */

  if (els.search) {
    els.search.addEventListener('input', function () {
      state.keyword = els.search.value;
      apply();
    });
  }

  if (els.college) {
    els.college.addEventListener('change', function () {
      state.college = els.college.value;
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
    return requestRank().then(function (list) {
      state.rows = assignRanks(list.map(normalize));
      apply();
    }).catch(function (err) {
      state.rows = [];
      showError((err && err.message) ? err.message : '排行榜加载失败，请稍后重试');
    });
  }

  // 方便联调时在控制台切换：SYLU_LEVEL_CONFIG.demoMode = false; SYLU_LEVEL_CONFIG.reload()
  CONFIG.reload = load;
  window.SYLU_LEVEL_CONFIG = CONFIG;

  load();
})();
