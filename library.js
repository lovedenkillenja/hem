/* Bibliotek: betyg, sedda filmer, IMDb-data, topplistor och samlingar. */

/* ---------- IMDb-betyg (cache) ---------- */
var Ratings = (function () {
  var KEY = "hem.ratings", map = Store.get(KEY, {}), dirty = false, saveTimer;
  function set(id, r) {
    r = parseFloat(r);
    if (!id || !r) return;
    if (map[id] !== r) { map[id] = r; dirty = true; schedule(); }
  }
  function schedule() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!dirty) return;
      var keys = Object.keys(map);
      if (keys.length > 4000) keys.slice(0, keys.length - 4000).forEach(function (k) { delete map[k]; });
      Store.set(KEY, map); dirty = false;
    }, 2000);
  }
  function get(id) { return map[id] || 0; }
  // Hämta betyg för poster som saknar det (begränsat antal, några åt gången)
  function ensure(items, max) {
    var need = items.filter(function (it) { return it && it.id && !get(it.id) && !it.rating; }).slice(0, max || 40);
    var i = 0;
    function worker() {
      if (i >= need.length) return Promise.resolve();
      var it = need[i++];
      return Cinemeta.meta(it.type === "series" ? "series" : "movie", it.id)
        .then(function (m) { if (m && m.imdbRating) set(it.id, m.imdbRating); if (m && m.runtime && typeof Runtimes !== "undefined") Runtimes.set(it.id, m.runtime); if (m && !it.poster) it.poster = m.poster; })
        .catch(function () {}).then(worker);
    }
    return Promise.all([worker(), worker(), worker(), worker()]).then(function () {
      items.forEach(function (it) { if (it && !it.rating && get(it.id)) it.rating = get(it.id); });
      return items;
    });
  }
  // Fyll i från IMDb-exporten
  (IMDB_DATA.watchlist || []).forEach(function (w) { set(w[0], w[2]); });
  (IMDB_DATA.rated || []).forEach(function (w) { set(w[0], w[2]); });
  return { set: set, get: get, ensure: ensure };
})();

/* ---------- Speltid (minuter) ---------- */
var Runtimes = (function () {
  var KEY = "hem.runtimes", map = Store.get(KEY, {}), t;
  function set(id, v) {
    var n = typeof v === "number" ? v : parseInt(String(v || "").replace(/[^0-9]/g, ""), 10);
    if (!id || !n || n < 20 || n > 600 || map[id] === n) return;
    map[id] = n; clearTimeout(t); t = setTimeout(function () { Store.set(KEY, map); }, 2000);
  }
  function get(id) { return map[id] || 0; }
  function fmt(min) { if (!min) return ""; var h = Math.floor(min / 60), m = min % 60; return h ? h + " h" + (m ? " " + m : "") : m + " min"; }
  (IMDB_DATA.watchlist || []).forEach(function (w) { set(w[0], w[5]); });
  (IMDB_DATA.rated || []).forEach(function (w) { set(w[0], w[6]); });
  return { set: set, get: get, fmt: fmt };
})();

/* ---------- Sett / betygsatt ---------- */
var Seen = (function () {
  var KEY = "hem.seen", LOCAL = "hem.seen.local";
  var ids = {};
  function add(id) { if (id) ids[id] = 1; }
  (IMDB_DATA.rated || []).forEach(function (r) { add(r[0]); });
  (Store.get(KEY, []) || []).forEach(add);
  (Store.get(LOCAL, []) || []).forEach(add);

  function refresh() {
    if (!Trakt.connected()) return Promise.resolve();
    return Promise.all([Trakt.watchedMovies(), Trakt.myRatings()]).then(function (r) {
      var list = [];
      r[0].forEach(function (id) { add(id); list.push(id); });
      r[1].forEach(function (x) { add(x.id); list.push(x.id); });
      Store.set(KEY, list);
    }).catch(function () {});
  }
  function mark(id) {
    add(id);
    var l = Store.get(LOCAL, []); if (l.indexOf(id) < 0) { l.push(id); Store.set(LOCAL, l.slice(-2000)); }
  }
  return { has: function (id) { return !!ids[id]; }, refresh: refresh, mark: mark };
})();

/* ---------- Dina favoriter och smak ---------- */
var Taste = (function () {
  function favorites() {
    var fav = (IMDB_DATA.rated || []).filter(function (r) { return r[1] >= 9 && r[3] === "movie"; })
      .map(function (r) { return { id: r[0], name: r[5] || "", rating: r[1] }; });
    return fav.concat(Store.get("hem.traktfav", []));
  }
  // Viktning av genrer utifrån dina betyg och din watchlist
  function genreWeights() {
    var w = {};
    (IMDB_DATA.rated || []).forEach(function (r) {
      var pts = r[1] >= 9 ? 3 : r[1] >= 8 ? 2 : r[1] >= 7 ? 1 : r[1] <= 4 ? -1 : 0;
      (r[4] || "").split(",").forEach(function (g) { g = g.trim(); if (g) w[g] = (w[g] || 0) + pts; });
    });
    (IMDB_DATA.watchlist || []).forEach(function (r) {
      (r[4] || "").split(",").forEach(function (g) { g = g.trim(); if (g) w[g] = (w[g] || 0) + 0.5; });
    });
    return w;
  }
  return { favorites: favorites, genreWeights: genreWeights };
})();

/* ---------- Samlingar och topplistor ---------- */
var Collections = (function () {
  var CUR_KEY = "hem.curated.v1";
  var cache = Store.get(CUR_KEY, {});

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/^the /, "").replace(/[^a-z0-9]+/g, "");
  }
  function yearOf(m) { var y = String(m.releaseInfo || m.year || "").match(/\d{4}/); return y ? +y[0] : 0; }

  function resolveOne(entry) {
    var title = entry[0], year = entry[1], type = entry[2] || "movie";
    var key = type + "|" + title + "|" + year;
    if (key in cache) return Promise.resolve(cache[key]);
    return Cinemeta.catalog(type, "top", { search: title }).then(function (metas) {
      var best = null, bestScore = -1;
      (metas || []).forEach(function (m) {
        if (!m.id || !/^tt/.test(m.id)) return;
        var y = yearOf(m), dy = Math.abs(y - year);
        if (y && dy > 1) return;
        var sc = (norm(m.name) === norm(title) ? 10 : 0) + (dy === 0 ? 5 : 2);
        if (sc > bestScore) { bestScore = sc; best = m; }
      });
      var v = best ? { type: type, id: best.id, name: best.name, poster: best.poster, rating: parseFloat(best.imdbRating) || 0, year: yearOf(best) } : null;
      if (v && v.rating) Ratings.set(v.id, v.rating);
      cache[key] = v; Store.set(CUR_KEY, cache);
      return v;
    }).catch(function () { return null; });
  }

  // Gemensam kö så att tv:n inte skickar för många uppslag samtidigt
  var queue = [], active = 0, MAXQ = 5, pending = 0, idleCbs = [];
  function enqueue(entry) {
    return new Promise(function (resolve) { queue.push({ e: entry, done: resolve }); pending++; pump(); });
  }
  function pump() {
    while (active < MAXQ && queue.length) {
      var job = queue.shift(); active++;
      resolveOne(job.e).then(function (v) { return v; }, function () { return null; }).then((function (job) {
        return function (v) {
          active--; pending--; job.done(v); pump();
          if (!pending) { var cbs = idleCbs; idleCbs = []; cbs.forEach(function (f) { f(); }); }
        };
      })(job));
    }
  }
  function resolveList(entries) {
    return Promise.all(entries.map(function (e) {
      var key = (e[2] || "movie") + "|" + e[0] + "|" + e[1];
      return key in cache ? Promise.resolve(cache[key]) : enqueue(e);
    })).then(function (out) {
      var seen = {};
      return out.filter(function (v) { if (!v || seen[v.id]) return false; seen[v.id] = 1; return true; })
        .map(function (v) { return { type: v.type, id: v.id, name: v.name, poster: v.poster, rating: v.rating || Ratings.get(v.id), year: v.year }; });
    });
  }
  // Uppslag som inte hann klart ligger kvar i kön; anropa cb när allt är klart
  function onIdle(cb) { if (!pending) cb(); else idleCbs.push(cb); }

  function curated(key) { return resolveList(CURATED[key].items); }

  // IMDb Topp 250 via en Trakt-lista som speglar IMDb; annars Stremios lista sorterad på IMDb-betyg
  var TOP_KEY = "hem.top250.v1";
  function top250() {
    var c = Store.get(TOP_KEY, null);
    if (c && Date.now() - c.at < 5 * 24 * 3600 * 1000 && c.items.length > 200) return Promise.resolve(c.items);
    var fromTrakt = Settings.get("traktClientId") ? Trakt.listItems("justin", "imdb-top-rated-movies")
      .then(function (items) { if (items.length < 200) throw new Error("kort"); return items; })
      .catch(function () {
        return Trakt.searchLists("imdb top 250").then(function (lists) {
          var good = lists.filter(function (l) { return l.item_count >= 240 && l.item_count <= 260 && /imdb/i.test(l.name) && /250/.test(l.name); })
            .sort(function (a, b) { return (b.likes || 0) - (a.likes || 0); })[0];
          if (!good) throw new Error("ingen lista");
          return Trakt.listItemsById(good.ids.trakt);
        });
      }) : Promise.reject(new Error("ingen trakt"));
    return fromTrakt.then(function (items) {
      var out = items.slice(0, 250).map(function (x) { return { type: "movie", id: x.id, name: x.name, year: x.year, rating: Ratings.get(x.id) }; });
      Store.set(TOP_KEY, { at: Date.now(), items: out, source: "imdb" });
      return out;
    }).catch(function () {
      // Reserv: Stremios katalog sorterad på IMDb-betyg (nära, men inte exakt IMDb:s lista)
      return Promise.all([0, 100, 200].map(function (skip) {
        return Cinemeta.catalog("movie", "imdbRating", skip ? { skip: skip } : null).catch(function () { return []; });
      })).then(function (pages) {
        var seen = {}, out = [];
        pages.forEach(function (p) { p.forEach(function (m) {
          if (!m.id || seen[m.id] || !/^tt/.test(m.id)) return; seen[m.id] = 1;
          Ratings.set(m.id, m.imdbRating);
          out.push({ type: "movie", id: m.id, name: m.name, poster: m.poster, rating: parseFloat(m.imdbRating) || 0 });
        }); });
        out = out.slice(0, 250);
        if (out.length) Store.set(TOP_KEY, { at: Date.now(), items: out, source: "cinemeta" });
        return out;
      });
    });
  }

  function reset() { cache = {}; Store.set(CUR_KEY, {}); Store.set(TOP_KEY, null); }
  return { curated: curated, top250: top250, reset: reset, onIdle: onIdle, busy: function () { return pending > 0; } };
})();
