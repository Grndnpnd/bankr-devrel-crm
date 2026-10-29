/**
 * The `window.claude` runtime injected into every rendered artifact.
 *
 * Mirrors claude.ai's runtime contract (0.2.66): `claude.use(name)` resolves a frozen
 * namespace or null. Served here: db, user, artifact (+ its old name self), downloads,
 * permissions, sample. Everything else (room, comments, mcp, assets, files) resolves null,
 * which well-written artifacts already handle.
 *
 * The page runs in a sandboxed frame with an opaque origin, so it has no cookies and
 * cannot call the app's API. Every call goes to the parent window by postMessage; the
 * parent (ArtifactFrame) checks the message came from its own frame and makes the
 * authenticated request for this one artifact.
 */
const SHIM = String.raw`(function () {
  if (window.claude && window.claude.__hub) return;
  var seq = 0, pending = {};
  function call(op, args) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({ __hub: 1, id: id, op: op, args: args || {} }, '*');
    });
  }
  window.addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || d.__hub !== 1) return;
    if (d.event === 'refresh') { refreshAll(); return; }
    var p = pending[d.id];
    if (!p) return;
    delete pending[d.id];
    if (d.ok) p.resolve(d.result); else p.reject(d.error || { code: 'unavailable', message: 'request failed' });
  });

  // Opaque-origin frames throw on localStorage; give old pages an in-memory stand-in.
  try { window.localStorage.getItem('x'); } catch (_) {
    var mem = {};
    var store = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] || null; },
      get length() { return Object.keys(mem).length; }
    };
    try { Object.defineProperty(window, 'localStorage', { value: store, configurable: true }); } catch (_) {}
    try { Object.defineProperty(window, 'sessionStorage', { value: store, configurable: true }); } catch (_) {}
  }

  var hello = null;
  function init() {
    // Framed by a host that never answers: every use() resolves null after 10 s.
    if (!hello) hello = Promise.race([
      call('init').catch(function () { return null; }),
      new Promise(function (r) { setTimeout(function () { r(null); }, 10000); })
    ]);
    return hello;
  }

  // ── db ──
  var SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  function checkPath(path, kind) {
    if (typeof path !== 'string' || !path) throw new TypeError('db path must be a non-empty string');
    var segs = path.split('/');
    if (segs.length > 16) throw new TypeError('db path has more than 16 segments');
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (!SEG.test(s) || s === '.' || s === '..') throw new TypeError('db path segment "' + s + '" is not allowed');
    }
    var even = segs.length % 2 === 0;
    if (kind === 'doc' && !even) throw new TypeError('a document path needs an even number of segments (got ' + segs.length + ')');
    if (kind === 'collection' && even) throw new TypeError('a collection path needs an odd number of segments (got ' + segs.length + ')');
    return segs;
  }
  function genId() {
    var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '';
    var b = new Uint8Array(20); crypto.getRandomValues(b);
    for (var i = 0; i < 20; i++) s += c[b[i] % 62];
    return s;
  }
  var snapCache = {};
  var versions = new WeakMap();
  function snap(d, pendingWrites) {
    var key = d.path + '@' + (d.exists ? d.version : 'x');
    var hit = snapCache[key];
    if (hit && hit.metadata.hasPendingWrites === !!pendingWrites) return hit;
    var data = d.exists ? deepFreeze(d.data) : undefined;
    var s = Object.freeze({
      id: d.id, exists: !!d.exists,
      data: function () { return data; },
      metadata: Object.freeze({ fromCache: false, hasPendingWrites: !!pendingWrites })
    });
    snapCache[key] = s;
    versions.set(s, d.exists ? d.version : 'x');
    return s;
  }
  function deepFreeze(o) {
    if (o && typeof o === 'object') { Object.keys(o).forEach(function (k) { deepFreeze(o[k]); }); Object.freeze(o); }
    return o;
  }
  function querySnap(docs, prev) {
    var prevIdx = {};
    (prev || []).forEach(function (d, i) { prevIdx[d.id] = { i: i, d: d }; });
    var changes = [];
    var seen = {};
    docs.forEach(function (d, i) {
      seen[d.id] = 1;
      var p = prevIdx[d.id];
      if (!p) changes.push({ type: 'added', doc: d, oldIndex: -1, newIndex: i });
      else if (p.d !== d) changes.push({ type: 'modified', doc: d, oldIndex: p.i, newIndex: i });
    });
    (prev || []).forEach(function (d, i) { if (!seen[d.id]) changes.push({ type: 'removed', doc: d, oldIndex: i, newIndex: -1 }); });
    return Object.freeze({
      docs: docs, size: docs.length, empty: docs.length === 0,
      docChanges: function () { return changes; },
      metadata: Object.freeze({ fromCache: false, hasPendingWrites: false })
    });
  }

  var subs = [], timer = null;
  function refreshAll() { subs.forEach(function (s) { s.poll(); }); }
  function startTimer() {
    if (timer) return;
    timer = setInterval(function () { if (!document.hidden) refreshAll(); }, 4000);
  }
  function wrote() { setTimeout(refreshAll, 0); }

  function subscribe(load, next, error) {
    if (subs.length >= 64) {
      setTimeout(function () { (error || reportErr)({ code: 'resource_exhausted', message: 'at most 64 subscriptions per view' }); }, 0);
      return function () {};
    }
    var alive = true, last = null, lastKey = null, busy = false;
    var sub = {
      poll: function () {
        if (!alive || busy) return;
        busy = true;
        load().then(function (r) {
          busy = false;
          if (!alive) return;
          var key = r.key;
          if (key === lastKey) return;
          lastKey = key;
          var out = r.make(last);
          last = r.value;
          try { next(out); } catch (e) { reportErr(e); }
        }, function (e) {
          busy = false;
          if (!alive) return;
          if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'resource_exhausted')) {
            alive = false; remove();
            (error || reportErr)(e);
          }
        });
      }
    };
    function remove() { subs = subs.filter(function (s) { return s !== sub; }); }
    subs.push(sub); startTimer();
    setTimeout(sub.poll, 0);
    return function () { alive = false; remove(); };
  }
  function reportErr(e) { try { (window.reportError || console.error)(e); } catch (_) {} }

  function docRef(path) {
    var segs = checkPath(path, 'doc');
    var ref = {
      id: segs[segs.length - 1], path: path,
      get: function () { return call('db.get', { path: path }).then(function (d) { return snap(d); }); },
      set: function (data) { return call('db.set', { path: path, data: data }).then(function () { wrote(); }); },
      update: function (data) { return call('db.update', { path: path, data: data }).then(function () { wrote(); }); },
      'delete': function () { return call('db.delete', { path: path }).then(function () { wrote(); }); },
      acquire: function (opts) { return call('db.acquire', { path: path, opts: opts }).then(function (r) { wrote(); return r; }); },
      onSnapshot: function (next, error) {
        return subscribe(function () {
          return call('db.get', { path: path }).then(function (d) {
            var s = snap(d);
            return { key: d.exists ? String(d.version) : 'x', value: s, make: function () { return s; } };
          });
        }, next, error);
      },
      collection: function (sub) { return collRef(path + '/' + sub); }
    };
    return Object.freeze(ref);
  }
  function query(coll, spec) {
    function run() {
      return call('db.query', { collection: coll, query: spec }).then(function (docs) {
        return docs.map(function (d) { return snap(d); });
      });
    }
    return {
      where: function (f, op, v) { return Object.freeze(query(coll, Object.assign({}, spec, { where: (spec.where || []).concat([[f, op, v]]) }))); },
      orderBy: function (f, dir) { return Object.freeze(query(coll, Object.assign({}, spec, { orderBy: { field: f, dir: dir || 'asc' } }))); },
      limit: function (n) { return Object.freeze(query(coll, Object.assign({}, spec, { limit: n }))); },
      get: function () { return run().then(function (docs) { return querySnap(docs, null); }); },
      onSnapshot: function (next, error) {
        return subscribe(function () {
          return run().then(function (docs) {
            var key = docs.map(function (d) { return d.id + ':' + (snapVersion(d)); }).join('|');
            return { key: key, value: docs, make: function (prev) { return querySnap(docs, prev); } };
          });
        }, next, error);
      }
    };
  }
  function snapVersion(s) { return versions.get(s); }
  function collRef(path) {
    checkPath(path, 'collection');
    var q = query(path, {});
    return Object.freeze(Object.assign({}, q, {
      path: path,
      doc: function (id) { return docRef(path + '/' + (id || genId())); },
      add: function (data) { var r = docRef(path + '/' + genId()); return r.set(data).then(function () { return r; }); }
    }));
  }
  var db = Object.freeze({
    doc: function (p) { return docRef(p); },
    collection: function (p) { return collRef(p); }
  });

  // ── user ──
  function userNs(v) {
    return Object.freeze({
      isOwner: function () { return Promise.resolve(!!v.isOwner); },
      canEdit: function () { return Promise.resolve(!!v.canEdit); },
      can: function (name) {
        if (name === 'data.write') return Promise.resolve(!!v.canWrite);
        return Promise.resolve(null);
      },
      me: function () { return Promise.resolve(Object.freeze(Object.assign({}, v.profile, { isOwner: !!v.isOwner, canEdit: !!v.canEdit }))); },
      id: function () { return Promise.resolve(v.profile.id); },
      name: function () { return Promise.resolve(v.profile.name || ''); },
      email: function () { return Promise.resolve(v.profile.email || null); },
      avatarUrl: function () { return Promise.resolve(v.profile.avatarUrl || null); },
      profiles: function (ids) { return call('user.profiles', { ids: [].concat(ids || []) }).catch(function () { return {}; }); },
      search: function (q) { return call('user.search', { q: String(q || '') }).catch(function () { return []; }); }
    });
  }

  // ── artifact (and its old name, self) ──
  var artifactNs = Object.freeze({
    publish: function (input) {
      var html = typeof input === 'string' ? input : (input && (input['index.html'] && (input['index.html'].content || input['index.html'])));
      if (typeof html !== 'string') return Promise.reject({ code: 'invalid_content', message: 'only a whole HTML document can be published here' });
      return call('artifact.publish', { html: html });
    },
    edit: function () { return Promise.reject({ code: 'capability_removed', message: 'edit is not supported here' }); },
    sync: function () { return Promise.reject({ code: 'capability_removed', message: 'sync is not supported here' }); }
  });

  // ── downloads ──
  function toText(data) {
    if (typeof data === 'string') return Promise.resolve({ text: data });
    var blob = data instanceof Blob ? data : new Blob([data]);
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res({ base64: String(r.result).split(',')[1] || '', type: blob.type }); };
      r.readAsDataURL(blob);
    });
  }
  var downloadsNs = Object.freeze({
    save: function (req) {
      return toText(req && req.data).then(function (payload) {
        return call('downloads.save', Object.assign({ filename: String((req && req.filename) || 'download') }, payload));
      });
    }
  });

  // ── sample (asks the hub's model) ──
  function sampleFn(input, opts) {
    opts = opts || {};
    if (opts.tools && opts.tools.length) return Promise.reject({ code: 'unavailable', message: 'tool use in sample() is not supported here' });
    if (opts.signal && opts.signal.aborted) return Promise.reject({ code: 'cancelled', message: 'aborted' });
    var p = call('sample', { input: input, modelTier: opts.modelTier || 'default' });
    return p.then(function (r) {
      if (opts.onText) try { opts.onText({ text: r.text, delta: r.text }); } catch (_) {}
      return r;
    });
  }
  sampleFn.json = function (input, opts) {
    return call('sample', { input: input, modelTier: (opts && opts.modelTier) || 'default', json: true }).then(function (r) { return r.json; });
  };
  sampleFn.limits = function () { return Promise.resolve({ images: false }); };

  // ── crm (live CRM data, read as the viewer) ──
  var crmNs = Object.freeze({
    sources: function () { return call('crm.sources', {}); },
    query: function (spec) { return call('crm.query', { spec: spec }); }
  });

  function permissionsNs() {
    return Object.freeze({
      state: function (name) {
        return init().then(function (h) {
          var g = (h && h.granted) || [];
          if (name) return g.indexOf(name) >= 0 ? 'granted' : 'unavailable';
          var out = {}; ['artifact', 'db', 'downloads', 'sample', 'user', 'crm'].forEach(function (n) { out[n] = g.indexOf(n) >= 0 ? 'granted' : 'unavailable'; });
          return out;
        });
      },
      request: function (names) {
        return this.state().then(function (all) {
          if (!names) return all;
          var out = {}; names.forEach(function (n) { out[n] = all[n] || 'unavailable'; }); return out;
        });
      }
    });
  }

  var cache = {};
  function use(name) {
    if (cache[name]) return cache[name];
    var p = init().then(function (h) {
      if (!h) return null;
      var g = h.granted || [];
      var n = name === 'self' ? 'artifact' : name;
      if (n === 'permissions') return permissionsNs();
      if (g.indexOf(n) < 0) return null;
      switch (n) {
        case 'db': return db;
        case 'user': return userNs(h.viewer);
        case 'artifact': return artifactNs;
        case 'downloads': return downloadsNs;
        case 'sample': return Object.freeze(sampleFn);
        case 'crm': return crmNs;
        default: return null;
      }
    });
    cache[name] = p;
    return p;
  }

  var claude = {
    __hub: true,
    use: use,
    // The flat chat-artifact API some older pages call.
    complete: function (prompt) { return sampleFn(String(prompt)).then(function (r) { return r.text; }); }
  };
  Object.defineProperty(window, 'claude', { value: Object.freeze(claude), configurable: false, writable: false });
})();`;

/** Put the shim first in the document so it runs before any page script. */
export function injectShim(html: string): string {
  const tag = `<script>${SHIM}</script>`;
  const head = html.match(/<head(\s[^>]*)?>/i);
  if (head && head.index !== undefined) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }
  const htmlTag = html.match(/<html(\s[^>]*)?>/i);
  if (htmlTag && htmlTag.index !== undefined) {
    const at = htmlTag.index + htmlTag[0].length;
    return html.slice(0, at) + `<head>${tag}</head>` + html.slice(at);
  }
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  if (doctype) return doctype[0] + tag + html.slice(doctype[0].length);
  return '<!doctype html>' + tag + html;
}

/** The sandbox the render route's CSP header applies. No allow-same-origin, ever. */
export const SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads';
