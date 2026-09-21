/* ============================================================
   SYLU OJ · 讨论区（talk）脚本
   功能：占位话题渲染 / 搜索 / 分类筛选 / 排序 / 侧边栏（预留 /api/topics）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    // 后端接口地址：server/ 提供该接口后，把 demoMode 改为 false 即可联调
    endpoint: '/api/topics',
    // 演示模式：后端尚未接入时使用下方占位数据
    demoMode: true
  };

  /* ----------------------------------------------------------
     占位数据（接入后端后由 GET /api/topics 返回，字段同名即可）
     字段：title 标题 / category 分类 / author 作者 / college 学院
           problem 关联题目（可空） / replies 回复 / views 浏览 / likes 点赞
           createdAgo 发布于多少分钟前 / lastReplyAgo 最后回复于多少分钟前
     ---------------------------------------------------------- */
  var PLACEHOLDER_TOPICS = [
    { id: 1, title: '「A+B 问题」的三种读入方式与性能对比', category: '题解', author: '陈锐', college: '计算机科学与工程学院', problem: 'CS001-01-005', replies: 12, views: 240, likes: 18, createdAgo: 2880, lastReplyAgo: 45 },
    { id: 2, title: '评测结果是 Runtime Error，本地能过，求帮忙看看', category: '求助', author: '新同学', college: '信息科学与工程学院', problem: 'CS001-01-003', replies: 8, views: 156, likes: 3, createdAgo: 180, lastReplyAgo: 12 },
    { id: 3, title: '2026 秋季学期 OJ 平台升级公告', category: '公告', author: '系统管理员', college: '其他学院', problem: '', replies: 3, views: 512, likes: 9, createdAgo: 10080, lastReplyAgo: 4320 },
    { id: 4, title: '并查集路径压缩的两种写法与复杂度分析', category: '题解', author: '赵敏', college: '计算机科学与工程学院', problem: 'CS001-01-004', replies: 9, views: 198, likes: 14, createdAgo: 1440, lastReplyAgo: 120 },
    { id: 5, title: '大家平时都用什么编辑器写题？', category: '闲聊', author: '白云', college: '机械工程学院', problem: '', replies: 21, views: 330, likes: 11, createdAgo: 720, lastReplyAgo: 30 },
    { id: 6, title: '为什么浮点数比较总是 WA？', category: '求助', author: '闫宁', college: '其他学院', problem: 'CS001-01-002', replies: 6, views: 121, likes: 2, createdAgo: 300, lastReplyAgo: 90 },
    { id: 7, title: '二分答案的边界处理模板（附例题）', category: '题解', author: '周琳', college: '计算机科学与工程学院', problem: 'CS001-01-005', replies: 15, views: 287, likes: 23, createdAgo: 4320, lastReplyAgo: 60 },
    { id: 8, title: '第 X 届程序设计竞赛报名开启', category: '公告', author: '系统管理员', college: '其他学院', problem: '', replies: 5, views: 402, likes: 7, createdAgo: 8640, lastReplyAgo: 2880 },
    { id: 9, title: '内存超限该怎么优化？', category: '求助', author: '冯磊', college: '信息科学与工程学院', problem: 'CS001-01-004', replies: 4, views: 88, likes: 1, createdAgo: 240, lastReplyAgo: 150 },
    { id: 10, title: '前缀和与差分：从入门到熟练', category: '题解', author: '王珂', college: '信息科学与工程学院', problem: 'CS001-01-003', replies: 11, views: 205, likes: 16, createdAgo: 5760, lastReplyAgo: 240 },
    { id: 11, title: '新生赛都准备得怎么样了', category: '闲聊', author: '唐欣', college: '自动化与电气工程学院', problem: '', replies: 17, views: 190, likes: 8, createdAgo: 1440, lastReplyAgo: 20 },
    { id: 12, title: '编译错误看不懂，求翻译一下这几行', category: '求助', author: '孟琪', college: '计算机科学与工程学院', problem: 'CS001-01-001', replies: 2, views: 64, likes: 0, createdAgo: 90, lastReplyAgo: 55 },
    { id: 13, title: '动态规划状态设计的通用思路', category: '题解', author: '李昊', college: '自动化与电气工程学院', problem: 'CS001-01-005', replies: 13, views: 265, likes: 19, createdAgo: 7200, lastReplyAgo: 480 },
    { id: 14, title: '关于新生账号统一注册的通知', category: '公告', author: '系统管理员', college: '其他学院', problem: '', replies: 1, views: 356, likes: 4, createdAgo: 12960, lastReplyAgo: 12000 }
  ];

  var CATEGORY_ITEM_CLASS = {
    '题解': 'is-solution',
    '求助': 'is-help',
    '公告': 'is-notice',
    '闲聊': 'is-chat'
  };

  var CATEGORY_TAG_CLASS = {
    '题解': 'tag-solution',
    '求助': 'tag-help',
    '公告': 'tag-notice',
    '闲聊': 'tag-chat'
  };

  var SORT_LABEL = {
    lastReply: '最新回复',
    created: '最新发布',
    replies: '回复最多'
  };

  var els = {
    list: document.getElementById('talkList'),
    search: document.getElementById('talkSearch'),
    category: document.getElementById('talkCategory'),
    sort: document.getElementById('talkSort'),
    count: document.getElementById('talkCount'),
    hot: document.getElementById('hotTopics'),
    authors: document.getElementById('topAuthors')
  };
  if (!els.list) return;

  var state = {
    topics: [],
    keyword: '',
    category: '',
    sort: 'lastReply'
  };

  /* ---------- 工具函数 ---------- */

  function relativeTime(minutes) {
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + ' 分钟前';
    if (minutes < 1440) return Math.floor(minutes / 60) + ' 小时前';
    if (minutes < 43200) return Math.floor(minutes / 1440) + ' 天前';
    return Math.floor(minutes / 43200) + ' 个月前';
  }

  function truncate(text, max) {
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  function sortTopics(topics, key) {
    var copy = topics.slice();
    copy.sort(function (a, b) {
      if (key === 'created') {
        return a.createdAgo - b.createdAgo;
      }
      if (key === 'replies') {
        if (b.replies !== a.replies) return b.replies - a.replies;
        return a.lastReplyAgo - b.lastReplyAgo;
      }
      return a.lastReplyAgo - b.lastReplyAgo;
    });
    return copy;
  }

  function filterTopics(topics) {
    var keyword = state.keyword.trim().toLowerCase();
    return topics.filter(function (topic) {
      if (state.category && topic.category !== state.category) return false;
      if (!keyword) return true;
      var haystack = (topic.title + ' ' + topic.author + ' ' + topic.problem).toLowerCase();
      return haystack.indexOf(keyword) !== -1;
    });
  }

  function normalize(row, index) {
    var createdAgo = Number(row.createdAgo) || 0;
    return {
      id: row.id != null ? row.id : index,
      title: String(row.title || '未命名话题'),
      category: String(row.category || '闲聊'),
      author: String(row.author || row.nickname || '匿名用户'),
      college: String(row.college || ''),
      problem: row.problem ? String(row.problem) : '',
      replies: Number(row.replies) || 0,
      views: Number(row.views) || 0,
      likes: Number(row.likes) || 0,
      createdAgo: createdAgo,
      lastReplyAgo: Number(row.lastReplyAgo != null ? row.lastReplyAgo : createdAgo) || 0
    };
  }

  /* ---------- 列表渲染 ---------- */

  function buildMeta(topic) {
    var meta = document.createElement('p');
    meta.className = 'topic-meta';

    var tag = document.createElement('span');
    tag.className = 'tag' + (CATEGORY_TAG_CLASS[topic.category] ? ' ' + CATEGORY_TAG_CLASS[topic.category] : '');
    tag.textContent = topic.category;
    meta.appendChild(tag);

    var author = document.createElement('span');
    author.className = 'topic-author';
    author.textContent = topic.author;
    meta.appendChild(author);

    if (topic.college) {
      var college = document.createElement('span');
      college.textContent = topic.college;
      meta.appendChild(college);
    }

    var time = document.createElement('span');
    time.textContent = '最后回复 ' + relativeTime(topic.lastReplyAgo);
    meta.appendChild(time);

    if (topic.problem) {
      var ref = document.createElement('span');
      ref.className = 'topic-ref';
      ref.textContent = topic.problem;
      meta.appendChild(ref);
    }

    return meta;
  }

  function buildStat(value, label) {
    var wrap = document.createElement('span');
    wrap.className = 'topic-stat';
    var num = document.createElement('b');
    num.textContent = String(value);
    var text = document.createElement('span');
    text.textContent = label;
    wrap.appendChild(num);
    wrap.appendChild(text);
    return wrap;
  }

  function renderTopic(topic) {
    var item = document.createElement('article');
    item.className = 'topic-item' + (CATEGORY_ITEM_CLASS[topic.category] ? ' ' + CATEGORY_ITEM_CLASS[topic.category] : '');

    var main = document.createElement('div');
    main.className = 'topic-main';

    var title = document.createElement('h3');
    title.className = 'topic-title';
    // 话题详情页待做，先沿用站内其它占位链接的写法
    var link = document.createElement('a');
    link.href = '#';
    link.textContent = topic.title;
    title.appendChild(link);

    main.appendChild(title);
    main.appendChild(buildMeta(topic));
    item.appendChild(main);

    var stats = document.createElement('div');
    stats.className = 'topic-stats';
    stats.appendChild(buildStat(topic.replies, '回复'));
    stats.appendChild(buildStat(topic.views, '浏览'));
    item.appendChild(stats);

    return item;
  }

  function renderEmpty(message) {
    var box = document.createElement('div');
    box.className = 'talk-empty';
    box.textContent = message;
    els.list.appendChild(box);
  }

  function render(topics) {
    els.list.textContent = '';

    if (!topics.length) {
      renderEmpty(state.topics.length
        ? '没有匹配的话题，试试调整搜索关键词或分类筛选'
        : '暂无话题，登录后可以发布第一个话题');
      return;
    }

    var fragment = document.createDocumentFragment();
    topics.forEach(function (topic) {
      fragment.appendChild(renderTopic(topic));
    });
    els.list.appendChild(fragment);
  }

  /* ---------- 侧边栏 ---------- */

  function renderHotTopics(topics) {
    if (!els.hot) return;
    els.hot.textContent = '';

    topics.slice().sort(function (a, b) {
      return b.replies - a.replies || a.lastReplyAgo - b.lastReplyAgo;
    }).slice(0, 5).forEach(function (topic) {
      var li = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#';
      var title = document.createElement('strong');
      title.textContent = truncate(topic.title, 16);
      var rate = document.createElement('span');
      rate.className = 'rate';
      rate.textContent = topic.replies + ' 回复';
      link.appendChild(title);
      link.appendChild(rate);
      li.appendChild(link);
      els.hot.appendChild(li);
    });
  }

  function renderTopAuthors(topics) {
    if (!els.authors) return;
    els.authors.textContent = '';

    var counts = {};
    topics.forEach(function (topic) {
      counts[topic.author] = (counts[topic.author] || 0) + 1;
    });

    Object.keys(counts).map(function (name) {
      return { name: name, count: counts[name] };
    }).sort(function (a, b) {
      return b.count - a.count || a.name.localeCompare(b.name, 'zh');
    }).slice(0, 3).forEach(function (author) {
      var li = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#';
      var name = document.createElement('strong');
      name.textContent = author.name;
      var rate = document.createElement('span');
      rate.className = 'rate';
      rate.textContent = author.count + ' 帖';
      link.appendChild(name);
      link.appendChild(rate);
      li.appendChild(link);
      els.authors.appendChild(li);
    });
  }

  /* ---------- 应用筛选与排序 ---------- */

  function apply() {
    var rows = sortTopics(filterTopics(state.topics), state.sort);
    render(rows);

    if (els.count) {
      els.count.classList.remove('is-error');
      var total = state.topics.length;
      var text = '共 ' + total + ' 个话题';
      if (rows.length !== total) text += '（筛选出 ' + rows.length + ' 个）';
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

  // 兼容后端返回 [ ... ] 或 { list: [...] } / { topics: [...] } / { data: [...] }
  function pickList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    return data.list || data.topics || data.rows || data.data || null;
  }

  function requestTopics() {
    if (CONFIG.demoMode) {
      return new Promise(function (resolve) {
        resolve(PLACEHOLDER_TOPICS.slice());
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
          throw new Error(msg || ('讨论区加载失败（HTTP ' + res.status + '）'));
        }
        var list = pickList(data);
        if (!Array.isArray(list)) throw new Error('讨论区数据格式不正确');
        return list;
      });
    }, function () {
      // 第二个回调只接网络层失败，HTTP 错误不走这里
      throw new Error('无法连接讨论区服务，请确认后端已启动');
    });
  }

  /* ---------- 交互 ---------- */

  if (els.search) {
    els.search.addEventListener('input', function () {
      state.keyword = els.search.value;
      apply();
    });
  }

  if (els.category) {
    els.category.addEventListener('change', function () {
      state.category = els.category.value;
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
    return requestTopics().then(function (list) {
      state.topics = list.map(normalize);
      apply();
      renderHotTopics(state.topics);
      renderTopAuthors(state.topics);
    }).catch(function (err) {
      state.topics = [];
      showError((err && err.message) ? err.message : '讨论区加载失败，请稍后重试');
    });
  }

  // 方便联调时在控制台切换：SYLU_TALK_CONFIG.demoMode = false; SYLU_TALK_CONFIG.reload()
  CONFIG.reload = load;
  window.SYLU_TALK_CONFIG = CONFIG;

  load();
})();
