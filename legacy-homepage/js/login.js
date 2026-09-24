/* ============================================================
   SYLU OJ · 登录页交互脚本
   功能：表单校验 / 密码显隐 / 记住用户名 / 提交登录（预留后端接口）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    endpoint: 'http://localhost:3000/api/auth/login',
    demoMode: false,
    redirectOnSuccess: 'index.html',
    // 演示模式下模拟请求耗时（demoMode 为 true 时生效）
    minDelayMs: 900,
    // 「记住我的用户名」使用的本地存储键（代码里引用了，必须定义）
    rememberKey: 'sylu_oj_login_id'
  };

  var form = document.getElementById('loginForm');
  if (!form) return;

  var alertBox = document.getElementById('formAlert');
  var submitBtn = document.getElementById('submitBtn');
  var successBox = document.getElementById('loginSuccess');
  var successText = document.getElementById('loginSuccessText');
  var rememberInput = document.getElementById('remember');
  var passwordInput = document.getElementById('password');

  /* ---------- 提示条 ---------- */
  function showAlert(type, message) {
    if (!alertBox) return;
    alertBox.className = 'form-alert show ' + type;
    alertBox.textContent = message;
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.className = 'form-alert';
    alertBox.textContent = '';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ---------- 本地存储（file:// 或隐私模式下可能不可用，故全部兜底） ---------- */
  var storage = {
    get: function (key) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) { /* 忽略：不影响登录流程 */ }
    },
    remove: function (key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) { /* 忽略 */ }
    }
  };

  /* ---------- 字段与校验规则 ---------- */
  var fields = {
    loginId: document.getElementById('loginId'),
    password: passwordInput
  };

  var rules = {
    loginId: function (v) {
      v = v.trim();
      if (!v) return '请输入用户名或邮箱';
      if (v.length < 3 || v.length > 64) return '用户名或邮箱长度应在 3–64 个字符之间';
      // 含 @ 时按邮箱格式校验，否则按用户名处理
      if (v.indexOf('@') !== -1 && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        return '邮箱格式不正确，例如 name@example.com';
      }
      return '';
    },
    password: function (v) {
      // 登录只校验非空：老账号密码规则可能与本页无关
      if (!v) return '请输入密码';
      return '';
    }
  };

  function readValues() {
    var out = {};
    Object.keys(fields).forEach(function (name) {
      out[name] = fields[name] ? fields[name].value : '';
    });
    return out;
  }

  function setFieldError(name, message) {
    var el = fields[name];
    if (!el) return;
    var wrap = el.closest ? el.closest('.field') : null;
    var box = document.getElementById(el.id + 'Error');

    if (message) {
      if (wrap) wrap.classList.add('error');
      el.setAttribute('aria-invalid', 'true');
      if (box) box.textContent = message;
    } else {
      if (wrap) wrap.classList.remove('error');
      el.removeAttribute('aria-invalid');
      if (box) box.textContent = '';
    }
  }

  function validateField(name) {
    var all = readValues();
    var message = rules[name](all[name], all);
    setFieldError(name, message);
    return !message;
  }

  function validateAll() {
    var firstInvalid = null;
    Object.keys(fields).forEach(function (name) {
      if (!validateField(name) && !firstInvalid) {
        firstInvalid = fields[name];
      }
    });
    return firstInvalid;
  }

  /* ---------- 密码显隐 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.pw-toggle'), function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('data-target'));
      if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      btn.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      btn.textContent = show ? '🙈' : '👁';
      input.focus();
    });
  });

  /* ---------- 实时校验 ---------- */
  Object.keys(fields).forEach(function (name) {
    var el = fields[name];
    if (!el) return;

    el.addEventListener('blur', function () {
      validateField(name);
    });

    el.addEventListener('input', function () {
      var wrap = el.closest ? el.closest('.field') : null;
      if (wrap && wrap.classList.contains('error')) {
        validateField(name);
      }
    });
  });

  /* ---------- 记住我的用户名 ---------- */
  function restoreRemembered() {
    if (!fields.loginId) return;
    var saved = storage.get(CONFIG.rememberKey);
    if (saved) {
      fields.loginId.value = saved;
      if (rememberInput) rememberInput.checked = true;
    }
  }

  function persistRemembered(value) {
    if (!rememberInput) return;
    if (rememberInput.checked) {
      storage.set(CONFIG.rememberKey, value);
    } else {
      storage.remove(CONFIG.rememberKey);
    }
  }

  /* ---------- 提交 ---------- */
  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? '登录中…' : '登录';
  }

  // 后端返回的提示优先，其次按 HTTP 状态码兜底
  function messageForStatus(status, data) {
    if (data && (data.message || data.error)) return data.message || data.error;
    if (status === 400) return '请求参数有误，请检查后重试';
    if (status === 401) return '用户名或密码错误';
    if (status === 403) return '账号不可用，请联系系统管理员';
    if (status === 429) return '登录尝试过于频繁，请稍后再试';
    if (status >= 500) return '服务器异常，请稍后重试';
    return '登录失败（HTTP ' + status + '）';
  }

  function requestLogin(payload) {
    if (CONFIG.demoMode) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ demo: true });
        }, CONFIG.minDelayMs);
      });
    }

    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('当前浏览器不支持 fetch，请升级浏览器后重试'));
    }

    return fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // 需要携带会话 Cookie 时保持 same-origin
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!res.ok) {
          throw new Error(messageForStatus(res.status, data));
        }
        return data;
      });
    }, function () {
      // 第二个回调只接网络层失败（DNS / 连接被拒 / 跨域等），HTTP 错误不走这里
      throw new Error('无法连接登录服务，请确认后端已启动');
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideAlert();

    var firstInvalid = validateAll();
    if (firstInvalid) {
      showAlert('error', '请填写用户名和密码后再登录');
      firstInvalid.focus();
      return;
    }

    var values = readValues();
    var loginId = values.loginId.trim();
    var payload = {
      loginId: loginId,
      password: values.password,
      remember: !!(rememberInput && rememberInput.checked)
    };

    setLoading(true);

    requestLogin(payload).then(function (data) {
      setLoading(false);
      persistRemembered(loginId);

      // 保存登录令牌，之后请求带上它
      if (data && data.token) {
        try {
          window.localStorage.setItem('sylu_token', data.token);
          window.localStorage.setItem('sylu_user', data.username || loginId);
        } catch (e) {}
      }

      form.classList.add('is-hidden');

      if (CONFIG.redirectOnSuccess) {
        window.location.href = CONFIG.redirectOnSuccess;
        return;
      }

      if (successText) {
        successText.innerHTML = '欢迎回来，<strong>' + escapeHtml(loginId) + '</strong>！' +
          (CONFIG.demoMode ? '（演示模式，未连接后端）' : '') + ' 正在进入 SYLU OJ…';
      }
      if (successBox) {
        successBox.classList.add('show');
        if (successBox.scrollIntoView) {
          successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }).catch(function (err) {
      setLoading(false);
      showAlert('error', (err && err.message) ? err.message : '登录失败，请稍后重试');
      if (passwordInput) {
        passwordInput.focus();
        passwordInput.select();
      }
    });
  });

  /* ---------- 初始化 ---------- */
  restoreRemembered();

  if (CONFIG.demoMode) {
    showAlert('info', '演示模式：后端接口尚未接入，登录只做前端校验，不会真正验证账号。');
  }

  // 方便联调时在控制台切换：SYLU_LOGIN_CONFIG.demoMode = false
  window.SYLU_LOGIN_CONFIG = CONFIG;
})();
