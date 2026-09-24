/* ============================================================
   SYLU OJ · 讨论区（talk）脚本
   功能：占位话题渲染 / 搜索 / 分类筛选 / 排序 / 侧边栏（预留 /api/topics）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    endpoint: 'http://localhost:3000/api/topics',
    demoMode: false
  };

  /* ----------------------------------------------------------
     占位数据来自 js/topics-data.js（与话题详情页共用同一份）
     接入后端后由 GET /api/topics 返回，字段同名即可
     该文件缺失时列表显示空状态，不会报错
     ---------------------------------------------------------- */
  var PLACEHOLDER_TOPICS = window.SYLU_TOPICS || [];

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

  // 话题详情页地址（详情页用 ?id= 定位）
  function topicUrl(id) {
    return 'topic.html?id=' + encodeURIComponent(id);
  }

  // 个人主页地址：用户数据里存在该用户名时才返回，否则返回空串（渲染成纯文本）
  function profileUrlFor(username) {
    if (!username) return '';
    var users = window.SYLU_USERS || [];
    for (var i = 0; i < users.length; i++) {
      if (users[i].username === username) {
        return 'user.html?username=' + encodeURIComponent(username);
      }
    }
    return '';
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
      authorUsername: String(row.authorUsername || ''),
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
    var authorLink = profileUrlFor(topic.authorUsername);
    if (authorLink) {
      // 有对应用户名时链到个人主页（系统管理员等不在用户数据里的保持纯文本）
      var link = document.createElement('a');
      link.className = 'topic-author';
      link.href = authorLink;
      link.textContent = topic.author;
      author = link;
    } else {
      author.textContent = topic.author;
    }
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
    var link = document.createElement('a');
    link.href = topicUrl(topic.id);
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
      link.href = topicUrl(topic.id);
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
    var usernameOf = {};
    topics.forEach(function (topic) {
      counts[topic.author] = (counts[topic.author] || 0) + 1;
      if (!usernameOf[topic.author] && topic.authorUsername) {
        usernameOf[topic.author] = topic.authorUsername;
      }
    });

    Object.keys(counts).map(function (name) {
      return { name: name, count: counts[name], username: usernameOf[name] || '' };
    }).sort(function (a, b) {
      return b.count - a.count || a.name.localeCompare(b.name, 'zh');
    }).slice(0, 3).forEach(function (author) {
      var li = document.createElement('li');
      var profileUrl = profileUrlFor(author.username);
      var link = document.createElement(profileUrl ? 'a' : 'span');
      if (profileUrl) link.href = profileUrl;
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
