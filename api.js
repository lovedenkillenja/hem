/* Datakällor: inställningar, Cinemeta (Stremios katalog), Trakt och undertexter. */

var Settings = (function () {
  var KEY = "hem.settings.v1";
  var s = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    Object.keys(saved).forEach(function (k) { if (saved[k] !== "" && saved[k] != null) s[k] = saved[k]; });
  } catch (e) {}
  // Nycklar från installationsskriptet gäller alltid (så att --nycklar på Macen slår igenom)
  Object.keys(CONFIG_LOCAL).forEach(function (k) { if (CONFIG_LOCAL[k]) s[k] = CONFIG_LOCAL[k]; });
  // Nya fält i DEFAULTS.apps (t.ex. guess) ska följa med även om sparade appar finns
  s.apps = DEFAULTS.apps.map(function (d) {
    var old = (s.apps || []).filter(function (a) { return a.name === d.name; })[0] || {};
    return { name: d.name, match: d.match, guess: d.guess, id: old.id || d.id };
  });
  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  // Ändrade standardval i nya versioner
  if ((s._v || 0) < 2) { s.subsOnByDefault = true; if (s.minRating == null) s.minRating = 7; if (s.hideSeen == null) s.hideSeen = true; s._v = 2; save(); }
  if (s._v < 3) { s.subMode = "auto"; delete s.subLangs; s._v = 3; save(); }
  if (s._v < 4) { s.subSize = 3; s._v = 4; save(); }
  return { get: function (k) { return s[k]; }, set: function (k, v) { s[k] = v; save(); }, all: s, save: save };
})();

var Store = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

function http(url, opts) {
  opts = opts || {};
  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, opts.timeout || 15000);
  return fetch(url, { method: opts.method || "GET", headers: opts.headers || {}, body: opts.body, signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) {
      clearTimeout(timer);
      if (r.status === 204) return null;
      if (!r.ok) { var err = new Error("HTTP " + r.status); err.status = r.status; err.response = r; throw err; }
      return opts.text ? r.text() : r.json();
    }, function (e) { clearTimeout(timer); throw e; });
}

/* ---------- Cinemeta ---------- */
var Cinemeta = (function () {
  var BASE = "https://v3-cinemeta.strem.io";
  var metaCache = {};

  function catalog(type, id, extra) {
    var ex = "";
    if (extra) {
      ex = "/" + Object.keys(extra).map(function (k) { return k + "=" + encodeURIComponent(extra[k]); }).join("&");
    }
    return http(BASE + "/catalog/" + type + "/" + id + ex + ".json").then(function (r) {
      var metas = (r && r.metas) || [];
      if (type === "movie" && typeof Runtimes !== "undefined") metas.forEach(function (m) { if (m.runtime) Runtimes.set(m.id, m.runtime); });
      return metas;
    });
  }

  function meta(type, imdb) {
    var key = type + ":" + imdb;
    if (metaCache[key]) return Promise.resolve(metaCache[key]);
    return http(BASE + "/meta/" + type + "/" + imdb + ".json").then(function (r) {
      var m = (r && r.meta) || null;
      if (m) { metaCache[key] = m; if (m.runtime && typeof Runtimes !== "undefined" && type === "movie") Runtimes.set(imdb, m.runtime); }
      return m;
    });
  }

  function search(q) {
    return Promise.all([
      catalog("movie", "top", { search: q }).catch(function () { return []; }),
      catalog("series", "top", { search: q }).catch(function () { return []; })
    ]);
  }

  return { catalog: catalog, meta: meta, search: search };
})();

/* ---------- Intro, sammanfattning och eftertexter (IntroDB, gemenskapsdata) ---------- */
var Segments = (function () {
  var cache = {};
  function get(item) {
    var key = item.type === "movie" ? item.id : item.id + ":" + item.season + ":" + item.episode;
    if (key in cache) return Promise.resolve(cache[key]);
    var q = item.type === "movie" ? "imdb_id=" + item.id + "&is_movie=true"
      : "imdb_id=" + item.id + "&season=" + item.season + "&episode=" + item.episode;
    return http("https://api.introdb.app/segments?" + q, { timeout: 6000 }).then(function (r) {
      var out = {};
      ["intro", "recap", "outro"].forEach(function (k) {
        var s = r && r[k];
        if (s && s.end_sec > s.start_sec) out[k] = { start: s.start_sec, end: s.end_sec };
      });
      cache[key] = out; return out;
    }).catch(function () { cache[key] = {}; return {}; });
  }
  return { get: get };
})();

var Img = {
  poster: function (imdb) { return "https://images.metahub.space/poster/medium/" + imdb + "/img"; },
  background: function (imdb) { return "https://images.metahub.space/background/medium/" + imdb + "/img"; },
  logo: function (imdb) { return "https://images.metahub.space/logo/medium/" + imdb + "/img"; },
  episode: function (imdb, s, e) { return "https://episodes.metahub.space/" + imdb + "/" + s + "/" + e + "/w780.jpg"; }
};

/* ---------- Trakt ---------- */
var Trakt = (function () {
  var API = "https://api.trakt.tv";
  var TOKEN_KEY = "hem.trakt.token";

  function token() { return Store.get(TOKEN_KEY, null); }
  function connected() { return !!(token() && Settings.get("traktClientId")); }

  function headers(auth) {
    var h = { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": Settings.get("traktClientId") };
    var t = token();
    if (auth && t) h.Authorization = "Bearer " + t.access_token;
    return h;
  }

  // Nyare Trakt-appar (PKCE) har ingen secret; skicka den bara om den finns
  function withSecret(b) { var sec = Settings.get("traktClientSecret"); if (sec) b.client_secret = sec; return b; }

  function refresh() {
    var t = token();
    if (!t || !t.refresh_token) return Promise.reject(new Error("Ingen token"));
    return http(API + "/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withSecret({ refresh_token: t.refresh_token, client_id: Settings.get("traktClientId"),
        redirect_uri: "http://localhost", grant_type: "refresh_token" }))
    }).then(function (nt) { Store.set(TOKEN_KEY, nt); return nt; });
  }

  function ensureFresh() {
    var t = token();
    if (!t) return Promise.resolve();
    var expires = (t.created_at + t.expires_in) * 1000;
    if (Date.now() > expires - 3600 * 1000) return refresh().catch(function () {});
    return Promise.resolve();
  }

  function req(path, opts) {
    opts = opts || {};
    return ensureFresh().then(function () {
      return http(API + path, { method: opts.method, headers: headers(true), body: opts.body ? JSON.stringify(opts.body) : undefined });
    }).catch(function (e) {
      if (e.status === 401 && !opts.retried) {
        return refresh().then(function () { opts.retried = true; return req(path, opts); });
      }
      throw e;
    });
  }

  // Enhetsinloggning: tv:n visar en kod, du godkänner på trakt.tv/activate i mobilen
  function deviceCode() {
    return http(API + "/oauth/device/code", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: Settings.get("traktClientId") }) });
  }
  function pollToken(code, interval, expiresIn, onTick) {
    var end = Date.now() + expiresIn * 1000;
    return new Promise(function (resolve, reject) {
      function tick() {
        if (Date.now() > end) { reject(new Error("Koden gick ut")); return; }
        if (onTick && onTick() === false) { reject(new Error("Avbrutet")); return; }
        http(API + "/oauth/device/token", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withSecret({ code: code, client_id: Settings.get("traktClientId") })) })
          .then(function (t) { Store.set(TOKEN_KEY, t); resolve(t); })
          .catch(function (e) {
            if (e.status === 400 || e.status === 429) setTimeout(tick, interval * 1000);
            else reject(e);
          });
      }
      setTimeout(tick, interval * 1000);
    });
  }
  function logout() { Store.set(TOKEN_KEY, null); }

  function toItem(entry) {
    var m = entry.movie, s = entry.show, ep = entry.episode;
    if (m && m.ids && m.ids.imdb) return { type: "movie", id: m.ids.imdb, name: m.title, year: m.year, trakt: m.ids.trakt };
    if (s && s.ids && s.ids.imdb) {
      var it = { type: "series", id: s.ids.imdb, name: s.title, year: s.year, trakt: s.ids.trakt };
      if (ep) { it.season = ep.season; it.episode = ep.number; it.epTitle = ep.title; }
      return it;
    }
    return null;
  }
  function compact(a) { return a.filter(function (x) { return x; }); }

  function watchlist() {
    return Promise.all([
      req("/sync/watchlist/movies/added?limit=250").catch(function () { return []; }),
      req("/sync/watchlist/shows/added?limit=250").catch(function () { return []; })
    ]).then(function (r) {
      var all = r[0].concat(r[1]);
      all.sort(function (a, b) { return new Date(b.listed_at) - new Date(a.listed_at); });
      return compact(all.map(toItem));
    });
  }

  // Påbörjade filmer/avsnitt (pausade mitt i)
  function playback() {
    return req("/sync/playback?limit=30").then(function (list) {
      return compact((list || []).map(function (p) {
        var it = toItem(p); if (!it) return null;
        it.progress = p.progress; it.playbackId = p.id; it.pausedAt = p.paused_at;
        return it;
      }));
    }).catch(function () { return []; });
  }

  // Nästa avsnitt i serier du tittat på nyligen
  function upNext() {
    return req("/sync/history/episodes?limit=60").then(function (hist) {
      var seen = {}, shows = [];
      (hist || []).forEach(function (h) {
        if (h.show && h.show.ids && h.show.ids.imdb && !seen[h.show.ids.trakt]) {
          seen[h.show.ids.trakt] = 1; shows.push({ show: h.show, at: h.watched_at });
        }
      });
      shows = shows.slice(0, 8);
      return Promise.all(shows.map(function (x) {
        return req("/shows/" + x.show.ids.trakt + "/progress/watched?hidden=false&specials=false").then(function (pr) {
          if (!pr || !pr.next_episode) return null;
          return { type: "series", id: x.show.ids.imdb, name: x.show.title, trakt: x.show.ids.trakt,
            season: pr.next_episode.season, episode: pr.next_episode.number, epTitle: pr.next_episode.title, at: x.at, next: true };
        }).catch(function () { return null; });
      })).then(compact);
    }).catch(function () { return []; });
  }

  function recommendations() {
    return Promise.all([
      req("/recommendations/movies?limit=25&ignore_collected=true&ignore_watchlisted=true").catch(function () { return []; }),
      req("/recommendations/shows?limit=15&ignore_collected=true&ignore_watchlisted=true").catch(function () { return []; })
    ]).then(function (r) {
      var out = [], a = r[0] || [], b = r[1] || [];
      for (var i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] && a[i].ids && a[i].ids.imdb) out.push({ type: "movie", id: a[i].ids.imdb, name: a[i].title, year: a[i].year });
        if (i % 2 === 0 && b[i / 2] && b[i / 2].ids && b[i / 2].ids.imdb) {
          var s = b[i / 2]; out.push({ type: "series", id: s.ids.imdb, name: s.title, year: s.year });
        }
      }
      return out;
    });
  }

  function watchedEpisodes(traktId) {
    return req("/shows/" + traktId + "/progress/watched?hidden=false&specials=false").then(function (pr) {
      var set = {};
      (pr && pr.seasons || []).forEach(function (s) { (s.episodes || []).forEach(function (e) { if (e.completed) set[s.number + ":" + e.number] = 1; }); });
      return { watched: set, next: pr && pr.next_episode };
    }).catch(function () { return { watched: {}, next: null }; });
  }

  function lookupShow(imdb) {
    return req("/search/imdb/" + imdb + "?type=show").then(function (r) {
      return r && r[0] && r[0].show ? r[0].show.ids.trakt : null;
    }).catch(function () { return null; });
  }

  function scrobbleBody(item, progress) {
    var b = { progress: Math.max(0, Math.min(100, progress)), app_version: "1.0" };
    if (item.type === "movie") b.movie = { ids: { imdb: item.id } };
    else { b.show = { ids: { imdb: item.id } }; b.episode = { season: item.season, number: item.episode }; }
    return b;
  }
  function scrobble(action, item, progress) {
    if (!connected()) return Promise.resolve();
    return req("/scrobble/" + action, { method: "POST", body: scrobbleBody(item, progress) }).catch(function () {});
  }

  function addToWatchlist(item, remove) {
    var body = item.type === "movie" ? { movies: [{ ids: { imdb: item.id } }] } : { shows: [{ ids: { imdb: item.id } }] };
    return req("/sync/watchlist" + (remove ? "/remove" : ""), { method: "POST", body: body });
  }

  // Originalspråk (t.ex. "sv", "en") – avgör vilka undertexter som väljs
  function language(item) {
    var key = "hem.lang", m = Store.get(key, {}), k = item.id;
    if (k in m) return Promise.resolve(m[k]);
    if (!Settings.get("traktClientId")) return Promise.resolve("");
    return req("/" + (item.type === "movie" ? "movies" : "shows") + "/" + item.id + "?extended=full").then(function (x) {
      var l = (x && x.language) || ""; m = Store.get(key, {}); m[k] = l;
      var ks = Object.keys(m); if (ks.length > 1500) delete m[ks[0]];
      Store.set(key, m); return l;
    }).catch(function () { return ""; });
  }

  function idsBody(item) {
    return item.type === "movie" ? { movies: [{ ids: { imdb: item.id } }] } : { shows: [{ ids: { imdb: item.id } }] };
  }

  // Filmer du sett (bara IMDb-id:n)
  function watchedMovies() {
    return req("/sync/watched/movies").then(function (l) {
      return (l || []).map(function (x) { return x.movie && x.movie.ids && x.movie.ids.imdb; }).filter(Boolean);
    }).catch(function () { return []; });
  }
  // Dina betyg på Trakt; 9–10 sparas som favoriter för "Eftersom du gillade …"
  function myRatings() {
    return req("/sync/ratings/movies").then(function (l) {
      var out = (l || []).map(function (x) { return x.movie && x.movie.ids && x.movie.ids.imdb ? { id: x.movie.ids.imdb, name: x.movie.title, rating: x.rating } : null; }).filter(Boolean);
      Store.set("hem.traktfav", out.filter(function (x) { return x.rating >= 9; }).slice(0, 100));
      return out;
    }).catch(function () { return []; });
  }
  function related(imdb) {
    return req("/movies/" + imdb + "/related?limit=30").then(function (l) {
      return (l || []).map(function (m) { return m.ids && m.ids.imdb ? { type: "movie", id: m.ids.imdb, name: m.title, year: m.year } : null; }).filter(Boolean);
    });
  }
  function calendar() {
    var d = new Date(Date.now() - 7 * 864e5), start = d.toISOString().slice(0, 10);
    return req("/calendars/my/shows/" + start + "/8").then(function (l) {
      var now = Date.now(), seen = {};
      return (l || []).filter(function (x) { return x.show && x.show.ids && x.show.ids.imdb && new Date(x.first_aired).getTime() <= now; })
        .sort(function (a, b) { return new Date(b.first_aired) - new Date(a.first_aired); })
        .filter(function (x) { var k = x.show.ids.imdb + ":" + x.episode.season + ":" + x.episode.number; if (seen[k]) return false; seen[k] = 1; return true; })
        .map(function (x) { return { type: "series", id: x.show.ids.imdb, name: x.show.title, trakt: x.show.ids.trakt,
          season: x.episode.season, episode: x.episode.number, epTitle: x.episode.title, isNew: true }; });
    }).catch(function () { return []; });
  }
  function mapListItems(l) {
    return (l || []).map(function (x) { var m = x.movie; return m && m.ids && m.ids.imdb ? { id: m.ids.imdb, name: m.title, year: m.year } : null; }).filter(Boolean);
  }
  function listItems(user, slug) { return req("/users/" + user + "/lists/" + slug + "/items/movie?limit=300").then(mapListItems); }
  function listItemsById(id) { return req("/lists/" + id + "/items/movie?limit=300").then(mapListItems); }
  function searchLists(q) {
    return req("/search/list?query=" + encodeURIComponent(q) + "&limit=20").then(function (l) {
      return (l || []).map(function (x) { return x.list; }).filter(Boolean);
    });
  }
  // Regissör(er) för en film och vad de regisserat
  function directors(imdb) {
    return req("/movies/" + imdb + "/people").then(function (r) {
      return ((r && r.crew && r.crew.directing) || []).filter(function (c) { return (c.jobs || [c.job]).indexOf("Director") >= 0; })
        .map(function (c) { return { name: c.person.name, slug: c.person.ids.slug }; });
    });
  }
  function directedBy(slug) {
    return req("/people/" + slug + "/movies").then(function (r) {
      return ((r && r.crew && r.crew.directing) || []).filter(function (c) { return (c.jobs || [c.job]).indexOf("Director") >= 0 && c.movie && c.movie.ids && c.movie.ids.imdb; })
        .map(function (c) { return { type: "movie", id: c.movie.ids.imdb, name: c.movie.title, year: c.movie.year }; });
    });
  }
  // Egen lista från en Trakt-länk: trakt.tv/users/<namn>/lists/<lista>
  function listFromUrl(url) {
    var m = String(url).match(/users\/([^\/]+)\/lists\/([^\/?#]+)/);
    if (!m) return Promise.reject(new Error("Okänd länk"));
    return req("/users/" + m[1] + "/lists/" + m[2] + "/items?limit=300").then(function (l) {
      return (l || []).map(function (x) {
        var o = x.movie || x.show; if (!o || !o.ids || !o.ids.imdb) return null;
        return { type: x.movie ? "movie" : "series", id: o.ids.imdb, name: o.title, year: o.year };
      }).filter(Boolean);
    });
  }
  function addHistory(item) { return req("/sync/history", { method: "POST", body: idsBody(item) }); }
  function removePlayback(id) { return req("/sync/playback/" + id, { method: "DELETE" }); }
  function rate(item, rating) {
    var b = idsBody(item);
    (b.movies || b.shows)[0].rating = rating;
    return req("/sync/ratings", { method: "POST", body: b });
  }

  return { connected: connected, deviceCode: deviceCode, pollToken: pollToken, logout: logout,
    watchlist: watchlist, playback: playback, upNext: upNext, recommendations: recommendations,
    watchedEpisodes: watchedEpisodes, lookupShow: lookupShow, scrobble: scrobble, addToWatchlist: addToWatchlist,
    watchedMovies: watchedMovies, myRatings: myRatings, related: related, calendar: calendar,
    listItems: listItems, listItemsById: listItemsById, searchLists: searchLists,
    addHistory: addHistory, removePlayback: removePlayback, rate: rate, language: language,
    directors: directors, directedBy: directedBy, listFromUrl: listFromUrl };
})();
