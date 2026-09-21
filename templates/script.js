// FieldScan AI — shared interactions

document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // Password show/hide toggles
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'show' : 'hide';
    });
  });

  // Toast helper
  window.showToast = function (message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = '<span class="dot"></span><span class="toast-msg"></span>';
      document.body.appendChild(toast);
    }
    toast.querySelector('.toast-msg').textContent = message;
    toast.classList.add('show');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  };

  // Demo form handling (no backend — this is a front-end prototype)
  document.querySelectorAll('form[data-demo-form]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let valid = true;

      form.querySelectorAll('[required]').forEach((input) => {
        const field = input.closest('.field');
        if (!field) return;
        const ok = input.type === 'checkbox' ? input.checked : input.value.trim().length > 0;
        field.classList.toggle('invalid', !ok);
        if (!ok) valid = false;
      });

      const pw = form.querySelector('#password');
      const pw2 = form.querySelector('#confirm-password');
      if (pw && pw2 && pw.value !== pw2.value) {
        pw2.closest('.field').classList.add('invalid');
        pw2.closest('.field').querySelector('.field-error').textContent = "Passwords don't match";
        valid = false;
      }

      if (!valid) return;

      const successMessage = form.dataset.demoForm || 'Submitted';
      showToast(successMessage);
      form.reset();
    });

    form.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => {
        const field = input.closest('.field');
        if (field) field.classList.remove('invalid');
      });
    });
  });
});
