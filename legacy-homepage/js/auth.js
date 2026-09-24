/* ============================================================
   SYLU OJ · 注册页交互脚本
   功能：表单校验 / 密码强度与显隐 / 提交注册（预留后端接口）
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var CONFIG = {
    // 后端接口地址：server/ 提供该接口后，把 demoMode 改为 false 即可联调
    endpoint: 'http://localhost:3000/api/auth/register',
    demoMode: false,
    // 演示模式下模拟请求耗时
    minDelayMs: 900
  };

  var form = document.getElementById('registerForm');
  if (!form) return;

  var alertBox = document.getElementById('formAlert');
  var submitBtn = document.getElementById('submitBtn');
  var successBox = document.getElementById('registerSuccess');
  var successText = document.getElementById('registerSuccessText');
  var agreeInput = document.getElementById('agree');
  var agreeField = document.getElementById('agreeField');
  var agreeError = document.getElementById('agreeError');
  var passwordInput = document.getElementById('password');
  var confirmInput = document.getElementById('confirm');
  var strengthMeter = document.getElementById('passwordStrength');

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

  /* ---------- 字段与校验规则 ---------- */
  var fields = {
    username: document.getElementById('username'),
    nickname: document.getElementById('nickname'),
    studentId: document.getElementById('studentId'),
    college: document.getElementById('college'),
    email: document.getElementById('email'),
    password: passwordInput,
    confirm: confirmInput
  };

  var rules = {
    username: function (v) {
      v = v.trim();
      if (!v) return '请输入用户名';
      if (!/^[A-Za-z0-9_]{3,20}$/.test(v)) return '用户名需为 3–20 位字母、数字或下划线';
      if (!/[A-Za-z]/.test(v)) return '用户名需至少包含一个字母';
      return '';
    },
    nickname: function (v) {
      v = v.trim();
      if (!v) return '请输入昵称';
      if (v.length < 2 || v.length > 16) return '昵称长度需为 2–16 个字符';
      return '';
    },
    studentId: function (v) {
      v = v.trim();
      if (!v) return '请输入学号';
      if (!/^\d{6,20}$/.test(v)) return '学号应为 6–20 位数字';
      return '';
    },
    college: function (v) {
      if (!v.trim()) return '请选择所在学院';
      return '';
    },
    email: function (v) {
      v = v.trim();
      if (!v) return '请输入邮箱';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return '邮箱格式不正确，例如 name@example.com';
      return '';
    },
    password: function (v) {
      if (!v) return '请输入密码';
      if (v.length < 8) return '密码长度至少 8 位';
      if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return '密码需同时包含字母和数字';
      return '';
    },
    confirm: function (v, all) {
      if (!v) return '请再次输入密码';
      if (v !== all.password) return '两次输入的密码不一致';
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

  /* ---------- 协议勾选 ---------- */
  function validateAgree() {
    var ok = !!(agreeInput && agreeInput.checked);
    if (agreeField) agreeField.classList.toggle('error', !ok);
    if (agreeError) agreeError.textContent = ok ? '' : '请先阅读并勾选同意《用户协议》与《隐私政策》';
    if (agreeInput) agreeInput.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  /* ---------- 密码强度 ---------- */
  function strengthOf(value) {
    if (!value) return 0;
    var score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    if (score <= 2) return 1;
    if (score <= 3) return 2;
    return 3;
  }

  function updateStrength() {
    if (!strengthMeter) return;
    var level = strengthOf(passwordInput ? passwordInput.value : '');
    strengthMeter.setAttribute('data-level', String(level));
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

    // 失焦即校验，及早给出反馈
    el.addEventListener('blur', function () {
      validateField(name);
    });

    // 已出错的字段在输入时实时纠正
    el.addEventListener('input', function () {
      var wrap = el.closest ? el.closest('.field') : null;
      if (wrap && wrap.classList.contains('error')) {
        validateField(name);
      }
    });

    // 下拉框选择后立即校验
    el.addEventListener('change', function () {
      validateField(name);
    });
  });

  if (passwordInput) {
    passwordInput.addEventListener('input', function () {
      updateStrength();
      // 密码变化后重新校验确认密码
      if (confirmInput && confirmInput.value) validateField('confirm');
    });
  }

  if (agreeInput) {
    agreeInput.addEventListener('change', validateAgree);
  }

  /* ---------- 提交 ---------- */
  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? '注册中…' : '注册';
  }

  function requestRegister(payload) {
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
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!res.ok) {
          var msg = data && (data.message || data.error);
          throw new Error(msg || ('注册失败（HTTP ' + res.status + '）'));
        }
        return data;
      });
    }, function () {
      // 第二个回调只接网络层失败（DNS / 连接被拒 / 跨域等），HTTP 错误不走这里
      throw new Error('无法连接注册服务，请确认后端已启动');
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideAlert();

    var firstInvalid = validateAll();
    var agreeOk = validateAgree();

    if (firstInvalid) {
      showAlert('error', '请检查表单中标红的内容后再提交');
      firstInvalid.focus();
      return;
    }

    if (!agreeOk) {
      showAlert('error', '请先阅读并勾选同意《用户协议》与《隐私政策》');
      if (agreeInput) agreeInput.focus();
      return;
    }

    var values = readValues();
    var payload = {
      username: values.username.trim(),
      nickname: values.nickname.trim(),
      studentId: values.studentId.trim(),
      college: values.college,
      email: values.email.trim(),
      password: values.password
    };

    setLoading(true);

    requestRegister(payload).then(function () {
      setLoading(false);
      form.classList.add('is-hidden');
      if (successText) {
        successText.innerHTML = '账号 <strong>' + escapeHtml(payload.username) +
          '</strong> 已创建' + (CONFIG.demoMode ? '（演示模式，未写入数据库）' : '') +
          '，请使用该账号登录。';
      }
      if (successBox) {
        successBox.classList.add('show');
        if (successBox.scrollIntoView) {
          successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }).catch(function (err) {
      setLoading(false);
      showAlert('error', (err && err.message) ? err.message : '注册失败，请稍后重试');
      if (submitBtn) submitBtn.focus();
    });
  });

  /* ---------- 初始化 ---------- */
  updateStrength();

  if (CONFIG.demoMode) {
    showAlert('info', '演示模式：后端接口尚未接入，提交表单只做前端校验，不会真正创建账号。');
  }

  // 方便联调时在控制台切换：SYLU_AUTH_CONFIG.demoMode = false
  window.SYLU_AUTH_CONFIG = CONFIG;
})();
