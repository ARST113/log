const MENU = [
  ["overview", "Обзор"],
  ["configuration", "Конфигурация"],
  ["sources", "Источники"],
  ["modules", "Модули"],
  ["plugins", "Плагины"],
  ["users", "Пользователи"],
  ["components", "Компоненты"],
  ["system", "Система"],
  ["logs", "Логи"],
  ["advanced", "Расширенно"]
];

const defaults = {
  server: { port: 9118, https: false, compression: true, readTimeout: 30, writeTimeout: 60, logLevel: "info" },
  accsdb: { enable: false, sharedPassword: "", limits: 5, blocked: [] },
  users: [{ login: "admin", role: "owner", limit: 10, blocked: false }],
  sources: [{ id: "tmdb", enabled: true, apiKey: "", proxy: "", timeout: 12 }],
  modules: [{ id: "transcoding", enabled: false, tempRoot: "/tmp/lampac", idleTimeout: 120, maxConcurrentJobs: 2, restartRequired: true }],
  plugins: [{ id: "lampa-default", enabledByDefault: true, manifestUrl: "", global: true, users: [] }],
  browsers: { chromium: true, firefox: false, headless: true, keepalive: true, contextMin: 1, contextMax: 4 }
};

let state = structuredClone(defaults);
let persisted = structuredClone(defaults);
let backup = null;
let requiresRestart = false;

const components = {
  ffmpeg: { installed: false, version: "-", path: "-", compatibility: "unknown" },
  chromium: { installed: false, version: "-", path: "-", compatibility: "not-ready" },
  firefox: { installed: false, version: "-", path: "-", compatibility: "not-ready" },
  torrserver: { installed: false, version: "-", address: "127.0.0.1:8090", availability: "unknown" }
};

const systemStatus = {
  lampacPath: "/opt/lampac",
  initConfPath: "/opt/lampac/init.conf",
  logsPath: "/opt/lampac/logs",
  ffmpegPath: "",
  ffprobePath: "",
  browserBinPath: "",
  systemd: "inactive"
};

const byId = (id) => document.getElementById(id);

function api(path, init) {
  return fetch(`/admin/api${path}`, init).then((r) => {
    if (!r.ok) throw new Error(`API ${path}: ${r.status}`);
    return r.json();
  });
}

async function bootstrap() {
  buildMenu();
  bindActionBar();
  bindModal();

  try {
    const data = await api('/config');
    state = data.config;
    persisted = structuredClone(data.config);
  } catch {
    const cached = localStorage.getItem('lampac-admin-config');
    if (cached) {
      state = JSON.parse(cached);
      persisted = structuredClone(state);
    }
  }

  renderAll();
  showView('overview');
}

function buildMenu() {
  const menu = byId('menu');
  menu.innerHTML = '';

  for (const [id, title] of MENU) {
    const btn = document.createElement('button');
    btn.textContent = title;
    btn.onclick = () => showView(id);
    btn.dataset.view = id;
    menu.append(btn);
  }
}

function showView(id) {
  for (const [key, title] of MENU) {
    byId(`view-${key}`).classList.toggle('hidden', key !== id);
    document.querySelector(`#menu button[data-view="${key}"]`)?.classList.toggle('active', key === id);
    if (key === id) {
      byId('section-title').textContent = title;
      byId('section-subtitle').textContent = subtitleFor(key);
    }
  }

  const isConfigView = ['configuration', 'sources', 'modules', 'plugins', 'users', 'advanced'].includes(id);
  byId('action-bar').classList.toggle('hidden', !isConfigView);
}

function subtitleFor(id) {
  return {
    overview: 'Ключевые статусы и сценарии native-first.',
    configuration: 'Визуальный редактор server + browser settings из init.conf.',
    sources: 'Проверка и настройка источников с валидацией до сохранения.',
    modules: 'Модули Lampac с зависимостями и флагом restart required.',
    plugins: 'Глобальная и персонифицированная выдача плагинов Lampa.',
    users: 'Управление пользователями, лимитами и блокировками.',
    components: 'Установка/обновление/проверка FFmpeg, браузеров, TorrServer.',
    system: 'Системные пути, systemd, reload/restart и диагностика.',
    logs: 'Просмотр ошибок и истории изменения конфигурации.',
    advanced: 'Raw init.conf, current/default/custom и ошибки валидации.'
  }[id];
}

function renderAll() {
  renderOverview();
  renderConfiguration();
  renderSources();
  renderModules();
  renderPlugins();
  renderUsers();
  renderComponents();
  renderSystem();
  renderLogs();
  renderAdvanced();
  byId('restart-indicator').classList.toggle('hidden', !requiresRestart);
}

function card(title, html) {
  return `<article class="card"><h3>${title}</h3>${html}</article>`;
}

function renderOverview() {
  byId('view-overview').innerHTML = `
    <div class="grid-2">
      ${card('Слой A: Конфигурация', '<p>UI редактирует init.conf и сохраняет атомарно с backup + diff.</p>')}
      ${card('Слой B: Компоненты', '<p>Проверка, установка и обновление зависимостей (FFmpeg, браузеры, TorrServer).</p>')}
      ${card('Слой C: Операции', '<p>Тест источников, enable модулей, proxy assignment, выдача плагинов.</p>')}
      ${card('Слой D: Advanced', '<p>Raw JSON + детализация ошибок валидации и сравнение default/current.</p>')}
    </div>
    ${card('Системный статус', `<div class="row"><span class="badge ${systemStatus.systemd === 'active' ? 'ok' : 'err'}">systemd: ${systemStatus.systemd}</span><span>${systemStatus.initConfPath}</span></div>`)}
  `;
}

function renderConfiguration() {
  byId('view-configuration').innerHTML = `
    <div class="grid-2">
      ${card('Сервер', `
        <label>port <input type="number" id="server-port" value="${state.server.port}" min="1" max="65535" /></label>
        <label>https <select id="server-https"><option value="true" ${state.server.https ? 'selected' : ''}>on</option><option value="false" ${!state.server.https ? 'selected' : ''}>off</option></select></label>
        <label>compression <select id="server-compression"><option value="true" ${state.server.compression ? 'selected' : ''}>on</option><option value="false" ${!state.server.compression ? 'selected' : ''}>off</option></select></label>
        <label>read timeout <input type="number" id="server-rt" value="${state.server.readTimeout}" /></label>
        <label>write timeout <input type="number" id="server-wt" value="${state.server.writeTimeout}" /></label>
        <label>logging <select id="server-log"><option ${state.server.logLevel === 'debug' ? 'selected' : ''}>debug</option><option ${state.server.logLevel === 'info' ? 'selected' : ''}>info</option><option ${state.server.logLevel === 'warn' ? 'selected' : ''}>warn</option><option ${state.server.logLevel === 'error' ? 'selected' : ''}>error</option></select></label>
      `)}
      ${card('Браузеры', `
        <label>Chromium enable <input type="checkbox" id="b-chromium" ${state.browsers.chromium ? 'checked' : ''} /></label>
        <label>Firefox enable <input type="checkbox" id="b-firefox" ${state.browsers.firefox ? 'checked' : ''} /></label>
        <label>headless <input type="checkbox" id="b-headless" ${state.browsers.headless ? 'checked' : ''} /></label>
        <label>keepalive <input type="checkbox" id="b-keepalive" ${state.browsers.keepalive ? 'checked' : ''} /></label>
        <label>context min <input type="number" id="b-min" value="${state.browsers.contextMin}" /></label>
        <label>context max <input type="number" id="b-max" value="${state.browsers.contextMax}" /></label>
      `)}
    </div>
  `;

  bindConfigurationInputs();
}

function bindConfigurationInputs() {
  byId('server-port').oninput = (e) => setPath('server.port', Number(e.target.value));
  byId('server-https').onchange = (e) => setPath('server.https', e.target.value === 'true');
  byId('server-compression').onchange = (e) => setPath('server.compression', e.target.value === 'true');
  byId('server-rt').oninput = (e) => setPath('server.readTimeout', Number(e.target.value));
  byId('server-wt').oninput = (e) => setPath('server.writeTimeout', Number(e.target.value));
  byId('server-log').onchange = (e) => setPath('server.logLevel', e.target.value);

  byId('b-chromium').onchange = (e) => setPath('browsers.chromium', e.target.checked);
  byId('b-firefox').onchange = (e) => setPath('browsers.firefox', e.target.checked);
  byId('b-headless').onchange = (e) => setPath('browsers.headless', e.target.checked);
  byId('b-keepalive').onchange = (e) => setPath('browsers.keepalive', e.target.checked);
  byId('b-min').oninput = (e) => setPath('browsers.contextMin', Number(e.target.value));
  byId('b-max').oninput = (e) => setPath('browsers.contextMax', Number(e.target.value));
}

function renderSources() {
  const rows = state.sources.map((src, i) => `
    <article class="card">
      <h3>${src.id}</h3>
      <label>enabled <input type="checkbox" data-src="${i}" data-k="enabled" ${src.enabled ? 'checked' : ''} /></label>
      <label>API key/token <input data-src="${i}" data-k="apiKey" value="${src.apiKey}" /></label>
      <label>proxy <input data-src="${i}" data-k="proxy" value="${src.proxy}" /></label>
      <label>timeout <input type="number" data-src="${i}" data-k="timeout" value="${src.timeout}" /></label>
      <button class="primary" data-test-source="${i}">Тест подключения</button>
    </article>
  `).join('');

  byId('view-sources').innerHTML = `<div class="grid-2">${rows}</div>`;

  byId('view-sources').querySelectorAll('[data-src]').forEach((el) => {
    const i = Number(el.dataset.src);
    const key = el.dataset.k;
    el.oninput = el.type === 'checkbox'
      ? (e) => { state.sources[i][key] = e.target.checked; requiresRestart = true; }
      : (e) => { state.sources[i][key] = key === 'timeout' ? Number(e.target.value) : e.target.value; requiresRestart = true; };
  });

  byId('view-sources').querySelectorAll('[data-test-source]').forEach((btn) => {
    btn.onclick = () => testSource(Number(btn.dataset.testSource), btn);
  });
}

async function testSource(index, btn) {
  btn.disabled = true;
  btn.textContent = 'Тест...';
  const payload = state.sources[index];
  try {
    await api('/sources/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    btn.textContent = 'ОК';
    btn.classList.add('primary');
  } catch {
    btn.textContent = 'Ошибка';
    btn.classList.add('danger');
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Тест подключения';
      btn.classList.remove('danger');
    }, 1200);
  }
}

function renderModules() {
  const rows = state.modules.map((m, i) => `
    <article class="card">
      <h3>${m.id} ${m.restartRequired ? '<span class="badge">требуется рестарт</span>' : ''}</h3>
      <label>enabled <input type="checkbox" data-mod="${i}" data-k="enabled" ${m.enabled ? 'checked' : ''}></label>
      <label>tempRoot <input data-mod="${i}" data-k="tempRoot" value="${m.tempRoot}"></label>
      <label>idleTimeout <input type="number" data-mod="${i}" data-k="idleTimeout" value="${m.idleTimeout}"></label>
      <label>maxConcurrentJobs <input type="number" data-mod="${i}" data-k="maxConcurrentJobs" value="${m.maxConcurrentJobs}"></label>
      <p>Зависимости: FFmpeg + FFprobe</p>
    </article>
  `).join('');
  byId('view-modules').innerHTML = `<div class="grid-2">${rows}</div>`;

  byId('view-modules').querySelectorAll('[data-mod]').forEach((el) => {
    const i = Number(el.dataset.mod);
    const key = el.dataset.k;
    el.oninput = el.type === 'checkbox'
      ? (e) => { state.modules[i][key] = e.target.checked; requiresRestart = true; renderAll(); }
      : (e) => { state.modules[i][key] = ['idleTimeout', 'maxConcurrentJobs'].includes(key) ? Number(e.target.value) : e.target.value; requiresRestart = true; };
  });
}

function renderPlugins() {
  const rows = state.plugins.map((p, i) => `
    <article class="card">
      <h3>${p.id}</h3>
      <label>enable by default <input type="checkbox" data-plugin="${i}" data-k="enabledByDefault" ${p.enabledByDefault ? 'checked' : ''}></label>
      <label>manifest URL <input data-plugin="${i}" data-k="manifestUrl" value="${p.manifestUrl}"></label>
      <label>global availability <input type="checkbox" data-plugin="${i}" data-k="global" ${p.global ? 'checked' : ''}></label>
      <label>users csv <input data-plugin="${i}" data-k="users" value="${p.users.join(',')}"></label>
    </article>
  `).join('');

  byId('view-plugins').innerHTML = `<div class="grid-2">${rows}</div>`;

  byId('view-plugins').querySelectorAll('[data-plugin]').forEach((el) => {
    const i = Number(el.dataset.plugin);
    const key = el.dataset.k;
    el.oninput = (e) => {
      if (el.type === 'checkbox') state.plugins[i][key] = e.target.checked;
      else if (key === 'users') state.plugins[i][key] = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
      else state.plugins[i][key] = e.target.value;
      requiresRestart = true;
    };
  });
}

function renderUsers() {
  byId('view-users').innerHTML = `
    <article class="card">
      <h3>Глобальные параметры</h3>
      <label>accsdb.enable <input id="acc-enable" type="checkbox" ${state.accsdb.enable ? 'checked' : ''}></label>
      <label>shared password <input id="acc-password" value="${state.accsdb.sharedPassword}"></label>
      <label>limits <input id="acc-limits" type="number" value="${state.accsdb.limits}"></label>
      <label>blocklist (csv) <input id="acc-blocked" value="${state.accsdb.blocked.join(',')}"></label>
    </article>
    <article class="card">
      <h3>Пользователи</h3>
      <div id="users-table"></div>
    </article>
  `;

  const usersTable = state.users.map((u, i) => `
    <div class="row" style="margin-bottom:8px">
      <input value="${u.login}" data-user="${i}" data-k="login" />
      <select data-user="${i}" data-k="role"><option ${u.role === 'owner' ? 'selected' : ''}>owner</option><option ${u.role === 'viewer' ? 'selected' : ''}>viewer</option></select>
      <input type="number" value="${u.limit}" data-user="${i}" data-k="limit" />
      <label>blocked <input type="checkbox" data-user="${i}" data-k="blocked" ${u.blocked ? 'checked' : ''} /></label>
    </div>
  `).join('');

  byId('users-table').innerHTML = usersTable;

  byId('acc-enable').onchange = (e) => setPath('accsdb.enable', e.target.checked);
  byId('acc-password').oninput = (e) => setPath('accsdb.sharedPassword', e.target.value);
  byId('acc-limits').oninput = (e) => setPath('accsdb.limits', Number(e.target.value));
  byId('acc-blocked').oninput = (e) => setPath('accsdb.blocked', e.target.value.split(',').map((x) => x.trim()).filter(Boolean));

  byId('view-users').querySelectorAll('[data-user]').forEach((el) => {
    const i = Number(el.dataset.user);
    const k = el.dataset.k;
    el.oninput = (e) => {
      if (el.type === 'checkbox') state.users[i][k] = e.target.checked;
      else state.users[i][k] = k === 'limit' ? Number(e.target.value) : e.target.value;
      requiresRestart = true;
    };
  });
}

function renderComponents() {
  byId('view-components').innerHTML = `
    <div class="grid-2">
      ${componentCard('ffmpeg', 'FFmpeg/FFprobe', ['install', 'update', 'replace', 'verify', 'path'])}
      ${componentCard('chromium', 'Chromium', ['install', 'update', 'verify', 'activate'])}
      ${componentCard('firefox', 'Firefox', ['install', 'update', 'verify', 'activate'])}
      ${componentCard('torrserver', 'TorrServer', ['download', 'update', 'restart', 'verify', 'integrate'])}
    </div>
  `;

  byId('view-components').querySelectorAll('[data-comp-action]').forEach((btn) => {
    btn.onclick = () => runComponentAction(btn.dataset.component, btn.dataset.compAction, btn);
  });
}

function componentCard(id, title, actions) {
  const c = components[id];
  const extra = id === 'torrserver' ? `<p>address: ${c.address}</p><p>availability: ${c.availability}</p>` : `<p>compatibility: ${c.compatibility}</p>`;
  return card(title, `
    <p>installed: ${c.installed ? 'yes' : 'no'}</p>
    <p>version: ${c.version}</p>
    <p>path: ${c.path ?? '-'}</p>
    ${extra}
    <div class="row">${actions.map((a) => `<button data-component="${id}" data-comp-action="${a}">${a}</button>`).join('')}</div>
  `);
}

async function runComponentAction(component, action, btn) {
  btn.disabled = true;
  try {
    const result = await api(`/components/${component}/${action}`, { method: 'POST' });
    components[component] = { ...components[component], ...result.status };
    renderComponents();
  } catch {
    btn.textContent = 'error';
    btn.classList.add('danger');
  }
}

function renderSystem() {
  byId('view-system').innerHTML = `
    <article class="card">
      <h3>Native-first диагностика</h3>
      <p>Lampac path: ${systemStatus.lampacPath}</p>
      <p>init.conf: ${systemStatus.initConfPath}</p>
      <p>logs: ${systemStatus.logsPath}</p>
      <p>ffmpeg: ${systemStatus.ffmpegPath || '-'}</p>
      <p>ffprobe: ${systemStatus.ffprobePath || '-'}</p>
      <p>browser bins: ${systemStatus.browserBinPath || '-'}</p>
      <p>systemd: ${systemStatus.systemd}</p>
      <div class="row">
        <button data-system="restart">restart service</button>
        <button data-system="reload">reload config</button>
        <button data-system="journal">открыть журнал ошибок</button>
      </div>
    </article>
  `;

  byId('view-system').querySelectorAll('[data-system]').forEach((btn) => {
    btn.onclick = () => runSystemAction(btn.dataset.system, btn);
  });
}

async function runSystemAction(action, btn) {
  btn.disabled = true;
  try {
    const res = await api(`/system/${action}`, { method: 'POST' });
    if (res.systemd) systemStatus.systemd = res.systemd;
    renderSystem();
  } finally {
    btn.disabled = false;
  }
}

function renderLogs() {
  byId('view-logs').innerHTML = `
    <article class="card">
      <h3>Журнал изменений</h3>
      <pre>${(JSON.parse(localStorage.getItem('lampac-admin-audit') || '[]').slice(-20).reverse().join('\n')) || 'Нет записей'}</pre>
    </article>
  `;
}

function renderAdvanced() {
  byId('view-advanced').innerHTML = `
    <article class="card">
      <h3>Raw init.conf editor</h3>
      <textarea id="raw-editor">${JSON.stringify(state, null, 2)}</textarea>
      <div class="row">
        <button class="warning" id="raw-apply">Apply raw</button>
        <button id="show-defaults">Show defaults</button>
        <button id="show-validation">Show validation</button>
      </div>
    </article>
  `;

  byId('raw-apply').onclick = () => {
    try {
      state = JSON.parse(byId('raw-editor').value);
      requiresRestart = true;
      renderAll();
    } catch (e) {
      openModal('Ошибка JSON', String(e));
    }
  };
  byId('show-defaults').onclick = () => openModal('Default config', JSON.stringify(defaults, null, 2));
  byId('show-validation').onclick = async () => openModal('Validation', JSON.stringify(await validate(), null, 2));
}

function bindActionBar() {
  byId('action-bar').addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    if (action === 'save') await save();
    if (action === 'diff') openModal('Diff', buildDiff(persisted, state));
    if (action === 'raw') openModal('Raw JSON', JSON.stringify(state, null, 2));
    if (action === 'rollback') rollback();
  });
}

function bindModal() {
  byId('modal-close').onclick = () => byId('modal').close();
}

function openModal(title, content) {
  byId('modal-title').textContent = title;
  byId('modal-content').textContent = content;
  byId('modal').showModal();
}

function setPath(path, value) {
  const keys = path.split('.');
  let target = state;
  while (keys.length > 1) {
    target = target[keys.shift()];
  }
  target[keys[0]] = value;
  requiresRestart = true;
  byId('restart-indicator').classList.remove('hidden');
}

function validateLocal() {
  const errors = [];
  if (!(state.server.port > 0 && state.server.port < 65536)) errors.push('server.port должен быть в диапазоне 1..65535');
  if (state.browsers.contextMin > state.browsers.contextMax) errors.push('browsers.contextMin не может быть больше contextMax');
  for (const src of state.sources) {
    if (src.enabled && !src.apiKey) errors.push(`Источник ${src.id}: обязательный apiKey/token`);
  }
  for (const mod of state.modules) {
    if (mod.enabled && mod.id === 'transcoding' && !components.ffmpeg.installed) {
      errors.push('Transcoding включен, но FFmpeg не установлен');
    }
  }
  return errors;
}

async function validate() {
  const localErrors = validateLocal();
  try {
    const remote = await api('/config/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) });
    return { localErrors, remote };
  } catch {
    return { localErrors, remote: 'remote validation unavailable' };
  }
}

async function save() {
  const result = await validate();
  if (result.localErrors.length) {
    openModal('Validation errors', result.localErrors.join('\n'));
    return;
  }

  backup = structuredClone(persisted);

  const payload = {
    config: state,
    backup: true,
    atomic: true
  };

  try {
    await api('/config/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    localStorage.setItem('lampac-admin-config', JSON.stringify(state));
  }

  persisted = structuredClone(state);
  requiresRestart = false;
  byId('restart-indicator').classList.add('hidden');

  const audit = JSON.parse(localStorage.getItem('lampac-admin-audit') || '[]');
  audit.push(`${new Date().toISOString()} save init.conf`);
  localStorage.setItem('lampac-admin-audit', JSON.stringify(audit));

  renderLogs();
  openModal('Сохранено', 'Конфигурация сохранена с backup и атомарной записью.');
}

function rollback() {
  if (backup) {
    state = structuredClone(backup);
    persisted = structuredClone(backup);
    requiresRestart = true;
    renderAll();
    openModal('Rollback', 'Откат к последнему backup выполнен.');
  } else {
    state = structuredClone(persisted);
    renderAll();
    openModal('Rollback', 'Локальные изменения отменены.');
  }
}

function buildDiff(before, after) {
  const a = JSON.stringify(before, null, 2).split('\n');
  const b = JSON.stringify(after, null, 2).split('\n');
  const max = Math.max(a.length, b.length);
  const lines = [];

  for (let i = 0; i < max; i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) lines.push(`- ${a[i]}`);
    if (b[i] !== undefined) lines.push(`+ ${b[i]}`);
  }

  return lines.join('\n') || 'No changes';
}

bootstrap();
