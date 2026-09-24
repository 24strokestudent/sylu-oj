/* ============================================================
   SYLU OJ · 话题详情页（topic）脚本
   功能：按 ?id= 渲染话题正文 / 回复列表 / 作者卡 / 关联题目 / 相关话题
        并实现点赞与回复的界面交互（预留 /api/topics/:id）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    // 后端接口地址：server/ 提供接口后，把 demoMode 改为 false 即可联调
    // 约定：GET  /api/topics/:id
    //       GET  /api/topics/:id/replies?page=1
    //       POST /api/topics/:id/replies  { body }
    //       POST /api/topics/:id/like
    endpoint: 'http://localhost:3000/api/topics',
    demoMode: false
  };

  var CATEGORY_TAG_CLASS = {
    '题解': 'tag-solution',
    '求助': 'tag-help',
    '公告': 'tag-notice',
    '闲聊': 'tag-chat'
  };

  var els = {
    layout: document.getElementById('topicLayout'),
    missing: document.getElementById('topicMissing'),
    missingText: document.getElementById('topicMissingText'),
    crumb: document.getElementById('crumbTopic'),
    category: document.getElementById('topicCategory'),
    title: document.getElementById('topicTitle'),
    meta: document.getElementById('topicMeta'),
    body: document.getElementById('topicBody'),
    likeBtn: document.getElementById('likeBtn'),
    likeCount: document.getElementById('likeCount'),
    replyCount: document.getElementById('replyCount'),
    replyNote: document.getElementById('replyNote'),
    replyList: document.getElementById('replyList'),
    replyAlert: document.getElementById('replyAlert'),
    replyBody: document.getElementById('replyBody'),
    replyBtn: document.getElementById('replyBtn'),
    authorCard: document.getElementById('authorCard'),
    authorNote: document.getElementById('authorNote'),
    authorAction: document.getElementById('authorAction'),
    problemNote: document.getElementById('problemNote'),
    problemAction: document.getElementById('problemAction'),
    related: document.getElementById('relatedTopics')
  };
  if (!els.title) return;

  /* ---------- 提示条 ---------- */
  function showAlert(type, message) {
    if (!els.replyAlert) return;
    els.replyAlert.className = 'form-alert show ' + type;
    els.replyAlert.textContent = message;
  }

  function hideAlert() {
    if (!els.replyAlert) return;
    els.replyAlert.className = 'form-alert';
    els.replyAlert.textContent = '';
  }

  /* ---------- 工具函数 ---------- */

  function relativeTime(minutes) {
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + ' 分钟前';
    if (minutes < 1440) return Math.floor(minutes / 60) + ' 小时前';
    if (minutes < 43200) return Math.floor(minutes / 1440) + ' 天前';
    return Math.floor(minutes / 43200) + ' 个月前';
  }

  function idFromUrl() {
    var match = /[?&]id=([^&#]+)/.exec(window.location.search);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
    } catch (e) {
      return '';
    }
  }

  function topicUrl(id) {
    return 'topic.html?id=' + encodeURIComponent(id);
  }

  function problemUrl(code) {
    return 'problem.html?code=' + encodeURIComponent(code);
  }

  function truncated(text, max) {
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  // 用户数据里存在该用户名时才返回主页地址（系统管理员等返回空串）
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

  function userOf(username) {
    var users = window.SYLU_USERS || [];
    for (var i = 0; i < users.length; i++) {
      if (users[i].username === username) return users[i];
    }
    return null;
  }

  function problemOf(code) {
    var problems = window.SYLU_PROBLEMS || [];
    for (var i = 0; i < problems.length; i++) {
      if (problems[i].code === code) return problems[i];
    }
    return null;
  }

  function normalizeReply(row, index) {
    return {
      id: row.id != null ? row.id : index,
      author: String(row.author || '匿名用户'),
      authorUsername: String(row.authorUsername || ''),
      college: String(row.college || ''),
      body: String(row.body || ''),
      minutesAgo: Number(row.minutesAgo) || 0,
      likes: Number(row.likes) || 0,
      isOwner: !!row.isOwner
    };
  }

  function normalizeTopic(row, index) {
    var replyList = Array.isArray(row.replyList) ? row.replyList : [];
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
      createdAgo: Number(row.createdAgo) || 0,
      lastReplyAgo: Number(row.lastReplyAgo != null ? row.lastReplyAgo : row.createdAgo) || 0,
      body: String(row.body || ''),
      replyList: replyList.map(normalizeReply)
    };
  }

  /* ---------- 渲染：主题帖 ---------- */

  function renderCategory(topic) {
    els.category.textContent = '';
    var tag = document.createElement('span');
    tag.className = 'tag ' + (CATEGORY_TAG_CLASS[topic.category] || 'tag-chat');
    tag.textContent = topic.category;
    els.category.appendChild(tag);
  }

  function renderMeta(topic) {
    els.meta.textContent = '';
    var profileUrl = profileUrlFor(topic.authorUsername);

    if (profileUrl) {
      var author = document.createElement('a');
      author.href = profileUrl;
      author.textContent = topic.author;
      els.meta.appendChild(author);
    } else {
      var name = document.createElement('span');
      name.className = 'topic-author';
      name.textContent = topic.author;
      els.meta.appendChild(name);
    }

    if (topic.college) {
      var college = document.createElement('span');
      college.textContent = topic.college;
      els.meta.appendChild(college);
    }

    var created = document.createElement('span');
    created.textContent = '发布于 ' + relativeTime(topic.createdAgo);
    els.meta.appendChild(created);

    var stats = document.createElement('span');
    stats.textContent = '浏览 ' + topic.views + ' · 回复 ' + topic.replies;
    els.meta.appendChild(stats);

    if (topic.problem) {
      var ref = document.createElement('a');
      ref.className = 'chip chip-mono';
      ref.href = problemUrl(topic.problem);
      ref.textContent = topic.problem;
      els.meta.appendChild(ref);
    }
  }

  // 正文按空行分段，全部用 textContent 渲染（防 XSS）
  function renderBody(topic) {
    els.body.textContent = '';
    var paragraphs = topic.body.split(/\n{2,}/);

    paragraphs.forEach(function (text) {
      var line = text.trim();
      if (!line) return;
      var p = document.createElement('p');
      // 段内单个换行保留成空格，避免长句被硬折行
      p.textContent = line.replace(/\n/g, ' ');
      els.body.appendChild(p);
    });
  }

  /* ---------- 渲染：回复列表 ---------- */

  function renderReplies(topic) {
    els.replyList.textContent = '';

    els.replyCount.textContent = '共 ' + topic.replies + ' 条';
    els.replyNote.textContent = topic.replyList.length
      ? '本页展示 ' + topic.replyList.length + ' 条占位回复（共 ' + topic.replies +
        ' 条）；接入后端后由 /api/topics/:id/replies 分页返回。'
      : '';

    if (!topic.replyList.length) {
      var empty = document.createElement('div');
      empty.className = 'data-empty';
      empty.textContent = '还没有回复，来抢沙发吧';
      els.replyList.appendChild(empty);
      return;
    }

    var fragment = document.createDocumentFragment();
    topic.replyList.forEach(function (reply, index) {
      var item = document.createElement('article');
      item.className = 'reply-item';

      var head = document.createElement('div');
      head.className = 'reply-head';

      var avatar = document.createElement('span');
      avatar.className = 'rank-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = reply.author.charAt(0).toUpperCase();
      head.appendChild(avatar);

      var profileUrl = profileUrlFor(reply.authorUsername);
      if (profileUrl) {
        var link = document.createElement('a');
        link.href = profileUrl;
        link.textContent = reply.author;
        head.appendChild(link);
      } else {
        var name = document.createElement('span');
        name.className = 'topic-author';
        name.textContent = reply.author;
        head.appendChild(name);
      }

      if (reply.isOwner) {
        var owner = document.createElement('span');
        owner.className = 'tag tag-easy';
        owner.textContent = '楼主';
        head.appendChild(owner);
      }

      if (reply.college) {
        var college = document.createElement('span');
        college.textContent = reply.college;
        head.appendChild(college);
      }

      var when = document.createElement('span');
      when.textContent = relativeTime(reply.minutesAgo);
      head.appendChild(when);

      var floor = document.createElement('span');
      floor.className = 'reply-floor';
      floor.textContent = (index + 2) + ' 楼';
      head.appendChild(floor);

      var body = document.createElement('p');
      body.className = 'reply-body';
      body.textContent = reply.body;

      var foot = document.createElement('div');
      foot.className = 'reply-foot';
      foot.textContent = '👍 ' + reply.likes;

      item.appendChild(head);
      item.appendChild(body);
      item.appendChild(foot);
      fragment.appendChild(item);
    });
    els.replyList.appendChild(fragment);
  }

  /* ---------- 渲染：侧边栏 ---------- */

  function renderAuthor(topic) {
    els.authorCard.textContent = '';
    var user = userOf(topic.authorUsername);

    var avatar = document.createElement('span');
    avatar.className = 'profile-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = topic.author.charAt(0).toUpperCase();
    els.authorCard.appendChild(avatar);

    var info = document.createElement('span');
    var name = document.createElement('b');
    name.textContent = topic.author;
    info.appendChild(name);
    var sub = document.createElement('span');
    sub.textContent = topic.college || '未填写学院';
    info.appendChild(sub);
    els.authorCard.appendChild(info);

    var profileUrl = profileUrlFor(topic.authorUsername);
    if (user && profileUrl) {
      els.authorNote.textContent = '通过 ' + user.solved + ' 题 · 提交 ' + user.submissions + ' 次';
      els.authorAction.href = profileUrl;
      els.authorAction.textContent = '查看主页';
      els.authorAction.removeAttribute('hidden');
    } else {
      // 系统管理员等不在用户数据里的账号，没有个人主页可去
      els.authorNote.textContent = '该账号没有公开的个人主页';
      els.authorAction.setAttribute('hidden', 'hidden');
    }
  }

  function renderProblem(topic) {
    if (!topic.problem) {
      els.problemNote.textContent = '这个话题没有关联题目。';
      els.problemAction.setAttribute('hidden', 'hidden');
      return;
    }

    var problem = problemOf(topic.problem);
    els.problemNote.textContent = problem
      ? topic.problem + ' ' + problem.title + '（' + problem.difficulty + '）'
      : topic.problem;
    els.problemAction.href = problemUrl(topic.problem);
    els.problemAction.textContent = problem ? '去做这道题' : '查看题目';
    els.problemAction.removeAttribute('hidden');
  }

  function renderRelated(topic, topics) {
    els.related.textContent = '';

    var related = topics.filter(function (item) {
      return item.id !== topic.id && item.category === topic.category;
    }).sort(function (a, b) {
      return b.replies - a.replies;
    }).slice(0, 3);

    if (!related.length) {
      var li = document.createElement('li');
      li.className = 'data-empty';
      li.textContent = '同类话题还没有其它内容';
      els.related.appendChild(li);
      return;
    }

    related.forEach(function (item) {
      var row = document.createElement('li');
      var link = document.createElement('a');
      link.href = topicUrl(item.id);
      var title = document.createElement('strong');
      title.textContent = truncated(item.title, 14);
      var rate = document.createElement('span');
      rate.className = 'rate';
      rate.textContent = item.replies + ' 回复';
      link.appendChild(title);
      link.appendChild(rate);
      row.appendChild(link);
      els.related.appendChild(row);
    });
  }

  /* ---------- 渲染：整体 ---------- */

  function render(topic, topics) {
    // 重新加载成功时恢复可见性（否则首次失败后重试会一直卡在缺失卡片上）
    if (els.layout) els.layout.removeAttribute('hidden');
    if (els.missing) els.missing.setAttribute('hidden', 'hidden');
    document.title = topic.title + ' · SYLU OJ | 沈阳理工大学在线评测系统';
    if (els.crumb) els.crumb.textContent = truncated(topic.title, 18);

    els.title.textContent = topic.title;
    renderCategory(topic);
    renderMeta(topic);
    renderBody(topic);
    renderReplies(topic);
    renderAuthor(topic);
    renderProblem(topic);
    renderRelated(topic, topics);

    if (els.likeCount) els.likeCount.textContent = String(topic.likes);
  }

  function renderMissing(message) {
    if (els.layout) els.layout.setAttribute('hidden', 'hidden');
    if (els.missing) {
      els.missing.removeAttribute('hidden');
      if (els.missingText) els.missingText.textContent = message;
    }
    if (els.crumb) els.crumb.textContent = '话题不存在';
    document.title = '话题不存在 · SYLU OJ | 沈阳理工大学在线评测系统';
  }

  /* ---------- 数据获取 ---------- */

  function pickList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    return data.list || data.topics || data.rows || data.data || null;
  }

  function requestTopics() {
    if (CONFIG.demoMode) {
      return new Promise(function (resolve) {
        resolve(window.SYLU_TOPICS || []);
      });
    }

    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('当前浏览器不支持 fetch，请升级浏览器后重试'));
    }

    var id = idFromUrl();
    var url = CONFIG.endpoint + (id ? '/' + encodeURIComponent(id) : '');

    return fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!res.ok) {
          var msg = data && (data.message || data.error);
          throw new Error(msg || ('话题加载失败（HTTP ' + res.status + '）'));
        }
        // 允许后端直接返回单个话题对象
        if (data && !Array.isArray(data) && (data.id || (data.topic && data.topic.id))) {
          return [data.topic || data];
        }
        var list = pickList(data);
        if (!Array.isArray(list)) throw new Error('话题数据格式不正确');
        return list;
      });
    }, function () {
      // 第二个回调只接网络层失败，HTTP 错误不走这里
      throw new Error('无法连接讨论区服务，请确认后端已启动');
    });
  }

  /* ---------- 交互 ---------- */

  if (els.likeBtn) {
    els.likeBtn.addEventListener('click', function () {
      var token = null;
      try { token = window.localStorage.getItem('sylu_token'); } catch (e) {}
      if (!token) { showAlert('info', '请先登录再点赞'); return; }

      var id = idFromUrl();
      fetch(CONFIG.endpoint + '/' + encodeURIComponent(id) + '/like', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          return { ok: r.ok, data: d };
        });
      }).then(function (res) {
        if (res.ok) {
          showAlert('ok', '点赞成功 👍');
          if (els.likeCount) els.likeCount.textContent = String(res.data.likes);
        } else {
          showAlert('info', res.data.error || '点赞失败');
        }
      }).catch(function () {
        showAlert('error', '网络错误，请确认后端已启动');
      });
    });
  }

  if (els.replyBtn) {
    els.replyBtn.addEventListener('click', function () {
      hideAlert();

      var text = els.replyBody ? els.replyBody.value.trim() : '';
      if (!text) {
        showAlert('error', '请先填写回复内容');
        if (els.replyBody) els.replyBody.focus();
        return;
      }

      var token = null;
      try { token = window.localStorage.getItem('sylu_token'); } catch (e) {}
      if (!token) { showAlert('info', '请先登录再回复'); return; }

      var id = idFromUrl();
      var btn = els.replyBtn;
      btn.disabled = true;

      fetch(CONFIG.endpoint + '/' + encodeURIComponent(id) + '/replies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ body: text })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          return { ok: r.ok, data: d };
        });
      }).then(function (res) {
        btn.disabled = false;
        if (res.ok) {
          showAlert('ok', '回复成功');
          if (els.replyBody) els.replyBody.value = '';
          load();
        } else {
          showAlert('info', res.data.error || '回复失败');
        }
      }).catch(function () {
        btn.disabled = false;
        showAlert('error', '网络错误，请确认后端已启动');
      });
    });
  }

  /* ---------- 初始化 ---------- */

  function load() {
    return requestTopics().then(function (rawTopics) {
      var topics = rawTopics.map(normalizeTopic);

      if (!topics.length) {
        renderMissing('暂无话题数据。');
        return;
      }

      var wanted = idFromUrl();
      if (!wanted) {
        // 未指定 id：回退到第一条，方便直接打开本页预览
        render(topics[0], topics);
        return;
      }

      var found = null;
      for (var i = 0; i < topics.length; i++) {
        if (String(topics[i].id) === wanted) {
          found = topics[i];
          break;
        }
      }

      if (!found) {
        renderMissing('话题 ' + wanted + ' 不存在或已删除。');
        return;
      }

      render(found, topics);
    }).catch(function (err) {
      renderMissing((err && err.message) ? err.message : '话题加载失败，请稍后重试');
    });
  }

  // 方便联调时在控制台切换：SYLU_TOPIC_CONFIG.demoMode = false; SYLU_TOPIC_CONFIG.reload()
  CONFIG.reload = load;
  window.SYLU_TOPIC_CONFIG = CONFIG;

  load();
})();
