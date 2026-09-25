/* ============================================================
   SYLU OJ · 题目详情页（problem）脚本
   功能：从 ?code= 读取题号并渲染题面/样例/信息；提交区界面（预留 /api/problems）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    // 详情/列表接口：GET /api/problems?code=P001
    endpoint: 'http://localhost:3000/api/problems',
    // 提交接口：POST /api/submissions { problemCode, language, sourceCode }
    submitEndpoint: 'http://localhost:3000/api/submissions',
    demoMode: false
  };

  var DIFFICULTY_TAG_CLASS = {
    '简单': 'tag-easy',
    '中等': 'tag-mid',
    '困难': 'tag-hard'
  };

  var STATUS_LABEL = {
    solved: '已通过',
    attempted: '尝试过',
    none: '未尝试'
  };

  var els = {
    layout: document.getElementById('problemLayout'),
    missing: document.getElementById('problemMissing'),
    missingText: document.getElementById('problemMissingText'),
    crumb: document.getElementById('crumbCode'),
    title: document.getElementById('problemTitle'),
    meta: document.getElementById('problemMeta'),
    body: document.getElementById('problemBody'),
    samples: document.getElementById('problemSamples'),
    nav: document.getElementById('problemNav'),
    info: document.getElementById('problemInfo'),
    myStatus: document.getElementById('myStatus'),
    myStatusNote: document.getElementById('myStatusNote'),
    myStatusAction: document.getElementById('myStatusAction'),
    alertBox: document.getElementById('submitAlert'),
    language: document.getElementById('submitLanguage'),
    code: document.getElementById('submitCode'),
    submitBtn: document.getElementById('submitBtn')
  };
  if (!els.title) return;

  /* ---------- 提示条 ---------- */
  function showAlert(type, message) {
    if (!els.alertBox) return;
    els.alertBox.className = 'form-alert show ' + type;
    els.alertBox.textContent = message;
  }

  function hideAlert() {
    if (!els.alertBox) return;
    els.alertBox.className = 'form-alert';
    els.alertBox.textContent = '';
  }

  /* ---------- 查询参数 ---------- */
  // 缺省（直接打开本页）时回退到第一题，方便预览；指定了未知题号则显示「题目不存在」
  function codeFromUrl() {
    var match = /[?&]code=([^&#]+)/.exec(window.location.search);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
    } catch (e) {
      return '';
    }
  }

  function detailUrl(code) {
    return 'problem.html?code=' + encodeURIComponent(code);
  }

  /* ---------- 工具函数 ---------- */
  function rateOf(problem) {
    return problem.submissions > 0 ? problem.accepted / problem.submissions : 0;
  }

  function pctText(value) {
    return Math.round(value * 100) + '%';
  }

  function normalize(row, index) {
    var tags = row.tags;
    if (typeof tags === 'string') tags = tags.split(/[,，\s]+/);
    if (!Array.isArray(tags)) tags = [];

    var samples = Array.isArray(row.samples) ? row.samples : [];
    var status = row.status;
    if (status !== 'solved' && status !== 'attempted' && status !== 'none') status = 'none';

    return {
      code: String(row.code || row.id || ('#' + (index + 1))),
      title: String(row.title || '未命名题目'),
      difficulty: DIFFICULTY_TAG_CLASS[row.difficulty] ? String(row.difficulty) : '简单',
      tags: tags.map(function (tag) { return String(tag).trim(); }).filter(Boolean),
      submissions: Number(row.submissions) || 0,
      accepted: Number(row.accepted) || 0,
      status: status,
      timeLimitMs: Number(row.timeLimitMs) || 1000,
      memoryLimitMb: Number(row.memoryLimitMb) || 256,
      description: String(row.description || ''),
      inputFormat: String(row.inputFormat || ''),
      outputFormat: String(row.outputFormat || ''),
      hint: String(row.hint || ''),
      samples: samples.map(function (sample) {
        return {
          input: String(sample && sample.input != null ? sample.input : ''),
          output: String(sample && sample.output != null ? sample.output : '')
        };
      })
    };
  }

  /* ---------- 渲染 ---------- */

  function buildTag(text, className) {
    var tag = document.createElement('span');
    tag.className = 'tag ' + className;
    tag.textContent = text;
    return tag;
  }

  function renderMeta(problem) {
    els.meta.textContent = '';
    els.meta.appendChild(buildTag(problem.difficulty, DIFFICULTY_TAG_CLASS[problem.difficulty]));

    var code = document.createElement('span');
    code.className = 'chip chip-mono';
    code.textContent = problem.code;
    els.meta.appendChild(code);

    problem.tags.forEach(function (name) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = name;
      els.meta.appendChild(chip);
    });
  }

  // 题面按「标题 + 段落」渲染，统一用 textContent 防 XSS
  function renderBody(problem) {
    els.body.textContent = '';

    function section(heading, text) {
      if (!text) return;
      var h = document.createElement('h2');
      h.textContent = heading;
      var p = document.createElement('p');
      p.textContent = text;
      els.body.appendChild(h);
      els.body.appendChild(p);
    }

    section('题目描述', problem.description);
    section('输入格式', problem.inputFormat);
    section('输出格式', problem.outputFormat);
    section('提示', problem.hint);
  }

  function renderSamples(problem) {
    els.samples.textContent = '';

    problem.samples.forEach(function (sample, index) {
      var box = document.createElement('div');
      box.className = 'sample';

      var head = document.createElement('div');
      head.className = 'sample-head';
      head.textContent = '样例 ' + (index + 1);
      box.appendChild(head);

      var grid = document.createElement('div');
      grid.className = 'sample-grid';

      [['输入', sample.input], ['输出', sample.output]].forEach(function (pair) {
        var cell = document.createElement('div');
        var label = document.createElement('span');
        label.className = 'sample-label';
        label.textContent = pair[0];
        var pre = document.createElement('pre');
        pre.textContent = pair[1];
        cell.appendChild(label);
        cell.appendChild(pre);
        grid.appendChild(cell);
      });

      box.appendChild(grid);
      els.samples.appendChild(box);
    });
  }

  function renderInfo(problem) {
    els.info.textContent = '';

    var rows = [
      ['题号', problem.code],
      ['难度', problem.difficulty],
      ['知识点', problem.tags.length ? problem.tags.join('、') : '—'],
      ['时间限制', problem.timeLimitMs + ' ms'],
      ['内存限制', problem.memoryLimitMb + ' MB'],
      ['通过率', pctText(rateOf(problem))],
      ['提交次数', String(problem.submissions)]
    ];

    rows.forEach(function (row) {
      var li = document.createElement('li');
      var key = document.createElement('span');
      key.textContent = row[0];
      var value = document.createElement('b');
      value.textContent = row[1];
      li.appendChild(key);
      li.appendChild(value);
      els.info.appendChild(li);
    });
  }

  function renderMyStatus(problem) {
    els.myStatus.textContent = '';

    var dot = document.createElement('span');
    dot.className = 'bank-dot is-' + problem.status;
    var label = document.createElement('span');
    label.textContent = STATUS_LABEL[problem.status];
    els.myStatus.appendChild(dot);
    els.myStatus.appendChild(label);

    els.myStatusNote.textContent = '提交状态为占位示例，登录后显示本人真实进度。';
    els.myStatusAction.textContent = '登录查看进度';
    els.myStatusAction.setAttribute('href', 'login.html');
  }

  function renderNav(problems, current) {
    els.nav.textContent = '';
    var index = problems.indexOf(current);

    function addLink(target, text, className) {
      var link = document.createElement('a');
      link.className = 'btn ' + className;
      link.href = detailUrl(target.code);
      link.textContent = text;
      els.nav.appendChild(link);
    }

    // 用等宽占位保持左右对齐
    if (index > 0) {
      addLink(problems[index - 1], '← 上一题', 'btn-outline');
    } else {
      var left = document.createElement('span');
      els.nav.appendChild(left);
    }

    if (index !== -1 && index < problems.length - 1) {
      addLink(problems[index + 1], '下一题 →', 'btn-outline');
    }
  }

  function renderMissing(message) {
    if (els.layout) els.layout.setAttribute('hidden', 'hidden');
    if (els.missing) {
      els.missing.removeAttribute('hidden');
      if (els.missingText) els.missingText.textContent = message;
    }
    if (els.crumb) els.crumb.textContent = '题目不存在';
    document.title = '题目不存在 · SYLU OJ | 沈阳理工大学在线评测系统';
  }

  function render(problem, problems) {
    // 重新加载成功时恢复可见性（否则首次失败后重试会一直卡在缺失卡片上）
    if (els.layout) els.layout.removeAttribute('hidden');
    if (els.missing) els.missing.setAttribute('hidden', 'hidden');
    document.title = problem.code + ' ' + problem.title + ' · SYLU OJ | 沈阳理工大学在线评测系统';
    if (els.crumb) els.crumb.textContent = problem.code;
    els.title.textContent = problem.title;
    renderMeta(problem);
    renderBody(problem);
    renderSamples(problem);
    renderInfo(problem);
    renderMyStatus(problem);
    renderNav(problems, problem);
  }

  /* ---------- 数据获取 ---------- */

  function pickList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    return data.list || data.problems || data.rows || data.data || null;
  }

  // 演示模式返回本地占位数据；接后端时同时支持「列表里筛」与「单题对象」两种返回
  function requestProblems() {
    if (CONFIG.demoMode) {
      return new Promise(function (resolve) {
        resolve(window.SYLU_PROBLEMS || []);
      });
    }

    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('当前浏览器不支持 fetch，请升级浏览器后重试'));
    }

    var code = codeFromUrl();
    var url = CONFIG.endpoint + (code ? '?code=' + encodeURIComponent(code) : '');

    return fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!res.ok) {
          var msg = data && (data.message || data.error);
          throw new Error(msg || ('题目加载失败（HTTP ' + res.status + '）'));
        }
        // 允许后端直接返回单个题目对象
        if (data && !Array.isArray(data) && (data.code || (data.problem && data.problem.code))) {
          return [data.problem || data];
        }
        var list = pickList(data);
        if (!Array.isArray(list)) throw new Error('题目数据格式不正确');
        return list;
      });
    }, function () {
      // 第二个回调只接网络层失败，HTTP 错误不走这里
      throw new Error('无法连接题库服务，请确认后端已启动');
    });
  }

  /* ---------- 提交（界面已就绪，判题未接入） ---------- */

  if (els.submitBtn) {
    els.submitBtn.addEventListener('click', function () {
      hideAlert();

      var code = els.code ? els.code.value.trim() : '';
      if (!code) {
        showAlert('error', '请先输入代码再提交');
        if (els.code) els.code.focus();
        return;
      }

      var token = null;
      try { token = window.localStorage.getItem('sylu_token'); } catch (e) {}
      if (!token) { showAlert('error', '请先登录再提交代码'); return; }

      var language = els.language ? els.language.value : '';
      var problemCode = codeFromUrl();
      els.submitBtn.disabled = true;

      fetch(CONFIG.submitEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          problemCode: problemCode,
          language: language,
          sourceCode: code
        })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      }).then(function (result) {
        els.submitBtn.disabled = false;
        if (result.ok) {
          showAlert('info', '提交成功！状态：等待判题（PD）');
        } else {
          showAlert('error', result.data.message || result.data.error || '提交失败');
        }
      }).catch(function () {
        els.submitBtn.disabled = false;
        showAlert('error', '网络错误，请确认后端已启动');
      });
    });
  }

  /* ---------- 初始化 ---------- */

  function load() {
    return requestProblems().then(function (raw) {
      var problems = raw.map(normalize);
      if (!problems.length) {
        renderMissing('暂无题目数据。');
        return;
      }

      var wanted = codeFromUrl();
      if (!wanted) {
        // 未指定题号：回退到第一题，方便直接打开本页预览
        render(problems[0], problems);
        return;
      }

      var found = null;
      for (var i = 0; i < problems.length; i++) {
        if (problems[i].code === wanted) {
          found = problems[i];
          break;
        }
      }

      if (!found) {
        renderMissing('题目 ' + wanted + ' 不存在或已下线。');
        return;
      }

      render(found, problems);
    }).catch(function (err) {
      renderMissing((err && err.message) ? err.message : '题目加载失败，请稍后重试');
    });
  }

  // 方便联调时在控制台切换：SYLU_PROBLEM_CONFIG.demoMode = false; SYLU_PROBLEM_CONFIG.reload()
  CONFIG.reload = load;
  window.SYLU_PROBLEM_CONFIG = CONFIG;

  load();
})();
