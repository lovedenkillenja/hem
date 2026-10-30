/* Hem i mobilen: bläddra, skicka till tv:n och fjärrstyr. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function epCode(s, e) { return "S" + (s < 10 ? "0" : "") + s + "E" + (e < 10 ? "0" : "") + e; }
  function fmtTime(sec) { sec = Math.max(0, Math.floor(sec || 0)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? h + " h " + m + " min" : m + " min"; }
  var tt; function toast(m, ms) { var t = $("toast"); t.textContent = m; t.classList.remove("hidden"); clearTimeout(tt); tt = setTimeout(function () { t.classList.add("hidden"); }, ms || 2500); }

  var topic = ""; try { topic = localStorage.getItem("hem.remoteTopic") || ""; } catch (e) {}

  /* ---------- Kommandon till tv:n ---------- */
  function send(cmd, okMsg) {
    if (!topic) { toast("Öppna länken från installationen en gång så kopplas mobilen till tv:n"); return; }
    fetch("https://ntfy.sh/" + topic, { method: "POST", body: JSON.stringify(cmd) })
      .then(function (r) { if (!r.ok) throw 0; if (okMsg) toast(okMsg); })
      .catch(function () { toast("Kunde inte nå tv:n just nu"); });
  }
  function slim(it) {
    var o = {}; ["type", "id", "name", "season", "episode", "epTitle", "trakt"].forEach(function (k) { if (it[k] != null) o[k] = it[k]; });
    return o;
  }

  /* ---------- Vad spelas på tv:n ---------- */
  var now = null;
  function showNow(st) {
    now = st;
    var box = $("now");
    // Tv:n skickar ett livstecken var 30:e sekund; uteblir det är tv:n avstängd eller filmen stängd
    if (!st || !st.playing || Date.now() - (st.at || 0) > 75 * 1000) { box.classList.add("hidden"); return; }
    var p = st.playing;
    box.classList.remove("hidden");
    $("now-title").textContent = p.name + (p.season ? " · " + epCode(p.season, p.episode) : "");
    var t = st.t + (st.paused ? 0 : Math.round((Date.now() - st.at) / 1000));
    $("now-sub").textContent = (st.paused ? "Pausad · " : "Spelas på tv:n · ") + fmtTime(t) + (st.dur ? " av " + fmtTime(st.dur) : "");
    $("now-bar").firstChild.style.width = st.dur ? Math.min(100, t / st.dur * 100) + "%" : "0";
    $("now-toggle").textContent = st.paused ? "▶" : "❚❚";
  }
  function listenStatus() {
    if (!topic) return;
    fetch("https://ntfy.sh/" + topic + "-s/json?poll=1&since=6h").then(function (r) { return r.text(); }).then(function (txt) {
      var lines = txt.trim().split("\n").filter(Boolean), last = null;
      lines.forEach(function (l) { try { var d = JSON.parse(l); if (d.event === "message") last = JSON.parse(d.message); } catch (e) {} });
      if (last) showNow(last);
    }).catch(function () {});
    try {
      var es = new EventSource("https://ntfy.sh/" + topic + "-s/sse");
      es.onmessage = function (e) { try { var d = JSON.parse(e.data); if (d.event === "message") showNow(JSON.parse(d.message)); } catch (x) {} };
    } catch (e) {}
    setInterval(function () { if (now) showNow(now); }, 10000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && now) showNow(now); });
  }

  /* ---------- Rader ---------- */
  var SNAP = "hem.m.snapshot.v1", rowsData = [];
  function discover(items, used) {
    var min = +Settings.get("minRating") || 0, hide = Settings.get("hideSeen") !== false;
    return (items || []).filter(function (it) {
      if (!it || !it.id) return false;
      if (hide && Seen.has(it.id)) return false;
      var r = it.rating || Ratings.get(it.id);
      if (min && r && r < min) return false;
      if (used) { if (used[it.id]) return false; used[it.id] = 1; }
      return true;
    });
  }
  function byRating(a, b) { return (b.rating || Ratings.get(b.id)) - (a.rating || Ratings.get(a.id)); }
  function curatedSort(list) { return list.slice().sort(function (a, b) { return (Seen.has(a.id) - Seen.has(b.id)) || byRating(a, b); }); }
  function toCards(metas, type) {
    return (metas || []).filter(function (m) { return m.id && /^tt/.test(m.id); }).map(function (m) {
      if (m.imdbRating) Ratings.set(m.id, m.imdbRating);
      return { type: type, id: m.id, name: m.name, poster: m.poster, rating: parseFloat(m.imdbRating) || 0 };
    });
  }
  function settle(p, fb) { return p.then(function (v) { return v; }, function () { return fb; }); }

  function build() {
    $("status").textContent = rowsData.length ? "" : "Laddar…";
    var tr = Trakt.connected();
    var mine = (IMDB_DATA.watchlist || []).map(function (w) { return { type: w[1], id: w[0], name: w[3], rating: w[2] }; });
    var keys = ["ww2", "ww1", "war", "warSeries", "kubrick", "fincher", "villeneuve", "scorsese", "nolan", "park", "korean", "nordic", "nordicSeries"];
    return settle(Seen.refresh(), null).then(function () {
      return Promise.all([
        tr ? settle(Promise.all([Trakt.playback(), Trakt.upNext()]), [[], []]) : Promise.resolve([[], []]),
        tr ? settle(Trakt.watchlist(), []) : Promise.resolve([]),
        settle(Collections.top250(), []),
        settle(Cinemeta.catalog("movie", "top"), []),
        Promise.all(keys.map(function (k) { return settle(Collections.curated(k), []); }))
      ]);
    }).then(function (r) {
      var rows = [], used = {};
      function add(key, title, items, wide) { if (items && items.length) rows.push({ key: key, title: title, items: items, wide: !!wide }); }
      var cont = r[0][0].map(function (x) { x.at = new Date(x.pausedAt).getTime(); return x; })
        .concat(r[0][1].map(function (x) { x.at = new Date(x.at).getTime(); return x; }))
        .sort(function (a, b) { return b.at - a.at; });
      var seenC = {}; cont = cont.filter(function (x) { if (seenC[x.id]) return false; seenC[x.id] = 1; return true; });
      add("continue", "Fortsätt titta", cont.slice(0, 20), true);
      var wl = {}, all = [];
      r[1].concat(mine).forEach(function (x) { if (!wl[x.id]) { wl[x.id] = 1; all.push(x); } });
      all = all.filter(function (x) { return !Seen.has(x.id); });
      add("wlMovies", "Min watchlist", all.filter(function (x) { return x.type !== "series"; }).sort(byRating));
      add("wlSeries", "Serier på min watchlist", all.filter(function (x) { return x.type === "series"; }).sort(byRating));
      var top = r[2], seenTop = top.filter(function (x) { return Seen.has(x.id); }).length;
      add("top250", "IMDb Topp 250 · sett " + seenTop + " av " + top.length, top);
      var cur = r[4];
      keys.forEach(function (k, i) {
        var t = CURATED[k].director ? "Regi: " + CURATED[k].title : CURATED[k].title;
        add(k, t, curatedSort(cur[i]));
        if (k === "warSeries") add("popular", "Populärt just nu", discover(toCards(r[3], "movie"), used).slice(0, 30));
      });
      rowsData = rows;
      render();
      try { localStorage.setItem(SNAP, JSON.stringify(rows.map(function (row) { return { key: row.key, title: row.title, wide: row.wide, items: row.items.slice(0, 80).map(function (it) { var o = slim(it); o.poster = it.poster; o.rating = it.rating; o.progress = it.progress; return o; }) }; }))); } catch (e) {}
      $("status").textContent = rows.length ? "" : "Kunde inte hämta något just nu.";
      if (Collections.busy()) Collections.onIdle(function () { build(); });
    });
  }

  var io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(function (ents) {
    ents.forEach(function (e) {
      if (!e.isIntersecting) return;
      var d = e.target; io.unobserve(d);
      d.style.backgroundImage = "url('" + d.dataset.src + "')";
    });
  }, { rootMargin: "300px" }) : null;

  function cardEl(it, wide) {
    var c = document.createElement("button");
    c.className = "card" + (wide ? " wide" : "") + (!wide && Seen.has(it.id) ? " seen" : "");
    var r = it.rating || Ratings.get(it.id), len = it.type === "movie" ? Runtimes.fmt(Runtimes.get(it.id)) : "";
    var src = wide ? (it.season ? Img.episode(it.id, it.season, it.episode) : Img.background(it.id)) : (it.poster || Img.poster(it.id));
    c.innerHTML = '<div class="img" data-src="' + esc(src) + '">' +
      (r || len ? '<span class="rt">' + (r ? "★ " + (+r).toFixed(1) : "") + (r && len ? " · " : "") + len + "</span>" : "") +
      (!wide && Seen.has(it.id) ? '<span class="sn">✓</span>' : "") +
      (it.progress ? '<div class="bar"><i style="width:' + Math.min(100, it.progress).toFixed(0) + '%"></i></div>' : "") + "</div>" +
      '<div class="name">' + esc(it.name) + (it.season ? " · " + epCode(it.season, it.episode) : "") + "</div>";
    var img = c.firstChild;
    if (io) io.observe(img); else img.style.backgroundImage = "url('" + src + "')";
    c.onclick = function () { openSheet(it); };
    return c;
  }
  function render(list) {
    var box = $("rows"); box.innerHTML = "";
    (list || rowsData).forEach(function (row) {
      var r = document.createElement("section"); r.className = "row";
      r.innerHTML = "<h3>" + esc(row.title) + "</h3>";
      var sc = document.createElement("div"); sc.className = "scroller";
      row.items.forEach(function (it) { sc.appendChild(cardEl(it, row.wide)); });
      r.appendChild(sc); box.appendChild(r);
    });
  }

  /* ---------- Detaljark ---------- */
  var sheetItem = null, sheetMeta = null, sheetWatched = {};
  function openSheet(it) {
    sheetItem = it; sheetMeta = null; sheetWatched = {};
    $("s-hero").style.backgroundImage = "url('" + Img.background(it.id) + "')";
    $("s-title").textContent = it.name || "";
    $("s-meta").innerHTML = ""; $("s-desc").textContent = ""; $("s-btns").innerHTML = ""; $("s-seasons").innerHTML = ""; $("s-eps").innerHTML = "";
    $("sheet").classList.remove("hidden"); $("sheet").querySelector(".sheet-card").scrollTop = 0;
    var type = it.type === "series" ? "series" : "movie";
    Cinemeta.meta(type, it.id).then(function (m) {
      if (sheetItem !== it) return;
      sheetMeta = m;
      if (!m) { buildSheet(); return; }
      var bits = [];
      if (m.imdbRating) bits.push("<b>★ " + esc(m.imdbRating) + "</b>");
      if (m.releaseInfo) bits.push(esc(m.releaseInfo));
      if (m.runtime) bits.push(esc(m.runtime));
      if (m.genres) bits.push(esc(m.genres.slice(0, 3).join(", ")));
      if (m.director && m.director.length) bits.push("Regi: " + esc([].concat(m.director).slice(0, 2).join(", ")));
      if (Seen.has(it.id)) bits.push("<b>✓ Sedd</b>");
      $("s-meta").innerHTML = bits.join(" · ");
      $("s-desc").textContent = m.description || "";
      if (type === "series" && Trakt.connected()) {
        Trakt.lookupShow(it.id).then(function (tid) {
          if (!tid) return null; it.trakt = tid; return Trakt.watchedEpisodes(tid);
        }).then(function (w) { if (w && sheetItem === it) { sheetWatched = w.watched; it.nextEp = w.next; } buildSheet(); }, buildSheet);
      } else buildSheet();
    }).catch(buildSheet);
  }
  function btn(label, fn, primary) {
    var b = document.createElement("button"); b.textContent = label; if (primary) b.className = "primary"; b.onclick = fn; $("s-btns").appendChild(b);
  }
  function episodes() {
    return ((sheetMeta && sheetMeta.videos) || []).filter(function (v) { return v.season > 0; })
      .sort(function (a, b) { return a.season - b.season || a.episode - b.episode; });
  }
  /* ---------- Titta i telefonen (via VLC eller Infuse) ---------- */
  var PLAYERS = {
    vlc: { name: "VLC", url: function (u) { return "vlc-x-callback://x-callback-url/stream?url=" + encodeURIComponent(u); } },
    infuse: { name: "Infuse", url: function (u) { return "infuse://x-callback-url/play?url=" + encodeURIComponent(u); } }
  };
  function player() { return PLAYERS[Settings.get("phonePlayer")] || PLAYERS.vlc; }
  function phoneSources(item) {
    if (!Settings.get("realDebridKey")) { toast("Öppna den nya länken från installationen så kopplas Real-Debrid till telefonen", 4000); return; }
    $("s-eps").innerHTML = '<p class="dim">Hämtar källor…</p>'; $("s-seasons").innerHTML = "";
    $("s-eps").scrollIntoView({ behavior: "smooth", block: "start" });
    Streams.fetchFor(item).then(function (list) {
      // Telefonens spelare klarar alla ljudformat; föredra 1080p för att spara mobildata
      var good = list.filter(function (s) { return s.cached && !s.junk; })
        .sort(function (a, b) { return ((a.res > 1080) - (b.res > 1080)) || (b.res - a.res) || (a.sizeGB - b.sizeGB); }).slice(0, 8);
      var box = $("s-eps"); box.innerHTML = "<h3 style=\"font-size:15px;margin:6px 0\">Spela i " + player().name + "</h3>";
      if (!good.length) { box.innerHTML += '<p class="dim">Hittade inga direktspelbara källor.</p>'; return; }
      good.forEach(function (s, i) {
        var row = document.createElement("div"); row.className = "ep";
        row.innerHTML = '<span class="t">' + (i === 0 ? "⭐ " : "") + esc(s.label) + ' <span class="dim small">' + (s.sizeGB ? s.sizeGB.toFixed(1) + " GB" : "") + "</span></span>";
        var b = document.createElement("button"); b.textContent = "▶ Spela";
        b.onclick = function () { location.href = player().url(s.url); };
        row.appendChild(b); box.appendChild(row);
      });
      box.insertAdjacentHTML("beforeend", '<p class="dim small" style="margin-top:8px">Undertexter väljer du i ' + player().name + '. Real-Debrid tillåter bara en ström åt gången per IP-adress – titta inte i telefonen och på tv:n från olika nätverk samtidigt.</p>');
    }).catch(function (e) { $("s-eps").innerHTML = '<p class="dim">' + esc(e.message || "Kunde inte hämta källor") + "</p>"; });
  }

  function buildSheet() {
    var it = sheetItem; $("s-btns").innerHTML = "";
    if (it.type === "movie") {
      btn("▶  Spela på tv:n", function () { send({ c: "play", item: slim(it) }, "Startar på tv:n…"); closeSheet(); }, true);
      btn("📱  Titta i telefonen", function () { phoneSources(it); });
      btn("Öppna på tv:n", function () { send({ c: "open", item: slim(it) }, "Öppnad på tv:n"); closeSheet(); });
    } else {
      var eps = episodes(), target = it.season ? { season: it.season, episode: it.episode } :
        it.nextEp ? { season: it.nextEp.season, episode: it.nextEp.number } : eps[0] ? { season: eps[0].season, episode: eps[0].episode } : null;
      if (target) btn("▶  " + epCode(target.season, target.episode) + " på tv:n", function () {
        send({ c: "play", item: slim({ type: "series", id: it.id, name: it.name, trakt: it.trakt, season: target.season, episode: target.episode }) }, "Startar på tv:n…"); closeSheet();
      }, true);
      if (target) btn("📱  " + epCode(target.season, target.episode) + " i telefonen", function () {
        phoneSources({ type: "series", id: it.id, name: it.name, season: target.season, episode: target.episode });
      });
      btn("Öppna på tv:n", function () { send({ c: "open", item: slim(it) }, "Öppnad på tv:n"); closeSheet(); });
    }
    if (Trakt.connected()) {
      btn("+ Watchlist", function () { Trakt.addToWatchlist(it).then(function () { toast("Tillagd i watchlist"); }, function () { toast("Kunde inte nå Trakt"); }); });
      if (it.type === "movie" && !Seen.has(it.id)) btn("✓ Sedd", function () {
        Seen.mark(it.id); Trakt.addHistory(it).catch(function () {}); toast("Markerad som sedd"); closeSheet(); render();
      });
    }
    if (it.type === "series") buildSeasons(it);
  }
  function buildSeasons(it) {
    var eps = episodes(), seasons = [];
    eps.forEach(function (v) { if (seasons.indexOf(v.season) < 0) seasons.push(v.season); });
    var cur = it.season || (it.nextEp && it.nextEp.season) || seasons[0];
    function draw() {
      $("s-seasons").innerHTML = "";
      seasons.forEach(function (s) {
        var b = document.createElement("button"); b.textContent = "Säsong " + s; if (s === cur) b.className = "on";
        b.onclick = function () { cur = s; draw(); }; $("s-seasons").appendChild(b);
      });
      var box = $("s-eps"); box.innerHTML = "";
      eps.filter(function (v) { return v.season === cur; }).forEach(function (v) {
        var row = document.createElement("div"); row.className = "ep";
        row.innerHTML = '<span class="n">' + v.episode + '</span><span class="t">' + esc(v.name || v.title || "Avsnitt " + v.episode) + "</span>" +
          (sheetWatched[v.season + ":" + v.episode] ? '<span class="w">✓</span>' : "");
        var b = document.createElement("button"); b.textContent = "▶ Tv";
        b.onclick = function () {
          send({ c: "play", item: slim({ type: "series", id: it.id, name: it.name, trakt: it.trakt, season: v.season, episode: v.episode, epTitle: v.name }) }, "Startar " + epCode(v.season, v.episode) + " på tv:n…");
          closeSheet();
        };
        var b2 = document.createElement("button"); b2.textContent = "📱"; b2.style.marginLeft = "6px";
        b2.onclick = function () { phoneSources({ type: "series", id: it.id, name: it.name, season: v.season, episode: v.episode }); };
        row.appendChild(b); row.appendChild(b2); box.appendChild(row);
      });
    }
    draw();
  }
  function closeSheet() { $("sheet").classList.add("hidden"); sheetItem = null; }
  $("s-close").onclick = closeSheet; $("sheet").querySelector(".sheet-bg").onclick = closeSheet;

  /* ---------- Ikväll ---------- */
  $("btn-tonight").onclick = function () {
    var pool = {}, list = [];
    rowsData.forEach(function (row) {
      if (!/^(wlMovies|top250|ww1|ww2|war|korean|nordic|kubrick|fincher|villeneuve|scorsese|nolan|park)$/.test(row.key)) return;
      row.items.forEach(function (it) {
        var r = it.rating || Ratings.get(it.id);
        if (it.type !== "movie" || Seen.has(it.id) || pool[it.id] || r < 7.3) return;
        pool[it.id] = 1; list.push({ it: it, w: Math.pow(r - 6.5, 2) * (row.key === "wlMovies" ? 3 : 1) });
      });
    });
    var picks = [];
    while (picks.length < 3 && list.length) {
      var tot = list.reduce(function (a, x) { return a + x.w; }, 0), x = Math.random() * tot, i = 0;
      for (; i < list.length; i++) { x -= list[i].w; if (x <= 0) break; }
      picks.push(list.splice(Math.min(i, list.length - 1), 1)[0].it);
    }
    render([{ key: "tonight", title: "Förslag för ikväll", items: picks }].concat(rowsData));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ---------- Sök ---------- */
  var qt;
  $("q").addEventListener("input", function () {
    clearTimeout(qt);
    var q = this.value.trim();
    if (q.length < 2) { render(); return; }
    qt = setTimeout(function () {
      Cinemeta.search(q).then(function (r) {
        var rows = [];
        var m = toCards(r[0], "movie"), s = toCards(r[1], "series");
        if (m.length) rows.push({ key: "sm", title: "Filmer", items: m });
        if (s.length) rows.push({ key: "ss", title: "Serier", items: s });
        render(rows.length ? rows : []);
        $("status").textContent = rows.length ? "" : "Inga träffar";
      });
    }, 450);
  });

  /* ---------- Flikar och fjärrkontroll ---------- */
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll(".tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("on", t.id === b.dataset.tab); });
    };
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    if (b.dataset.key) send({ c: "key", k: b.dataset.key, s: b.dataset.s ? +b.dataset.s : undefined });
    else if (b.dataset.app) send({ c: "app", name: b.dataset.app }, "Öppnar " + b.dataset.app + " på tv:n");
    else if (b.dataset.cmd) send({ c: b.dataset.cmd });
    if (navigator.vibrate && (b.dataset.key || b.dataset.app || b.dataset.cmd)) navigator.vibrate(10);
  });

  /* ---------- Inställningar ---------- */
  var traktMsg = "";
  function drawSettings() {
    var box = $("set-list"); box.innerHTML = "";
    function row(l, s, btnText, fn) {
      var d = document.createElement("div"); d.className = "set";
      d.innerHTML = '<div><div class="l">' + esc(l) + "</div>" + (s ? '<div class="s">' + s + "</div>" : "") + "</div>";
      if (btnText) { var b = document.createElement("button"); b.textContent = btnText; b.onclick = fn; d.appendChild(b); }
      box.appendChild(d);
    }
    row("Trakt", traktMsg || (Trakt.connected() ? "Kopplad – visar Fortsätt titta och din Trakt-watchlist" : "Koppla för Fortsätt titta och watchlist"),
      Trakt.connected() ? "Koppla från" : "Koppla", function () { if (Trakt.connected()) { Trakt.logout(); drawSettings(); } else traktLogin(); });
    var v = +Settings.get("minRating") || 0;
    row("Minsta IMDb-betyg i förslag", "", v ? v.toFixed(1).replace(".", ",") + "+" : "Alla", function () {
      var steps = [0, 6.5, 7, 7.5, 8]; Settings.set("minRating", steps[(steps.indexOf(v) + 1) % steps.length]); drawSettings(); build();
    });
    row("Dölj filmer jag sett", "", Settings.get("hideSeen") !== false ? "På" : "Av", function () { Settings.set("hideSeen", Settings.get("hideSeen") === false); drawSettings(); build(); });
    row("Koppling till tv:n", topic ? "Klar ✓" : "Saknas – öppna länken från installationen", null);
    row("Spelare i telefonen", "Installera gratisappen VLC (eller Infuse) från App Store", player().name, function () {
      Settings.set("phonePlayer", Settings.get("phonePlayer") === "infuse" ? "vlc" : "infuse"); drawSettings();
    });
    row("Real-Debrid i telefonen", Settings.get("realDebridKey") ? "Klar ✓" : "Saknas – öppna den senaste länken från installationen", null);
  }
  function traktLogin() {
    if (!Settings.get("traktClientId")) { traktMsg = "Öppna länken från installationen först."; drawSettings(); return; }
    traktMsg = "Hämtar kod…"; drawSettings();
    Trakt.deviceCode().then(function (c) {
      traktMsg = 'Kod: <b style="font-size:20px;color:#e8c26a">' + esc(c.user_code) + '</b> – <a style="color:#e8c26a" href="' + esc(c.verification_url) + '" target="_blank">öppna trakt.tv/activate</a> och skriv in koden.';
      drawSettings();
      return Trakt.pollToken(c.device_code, c.interval || 5, c.expires_in || 600);
    }).then(function () { traktMsg = ""; toast("Trakt kopplat!"); drawSettings(); build(); })
      .catch(function (e) { traktMsg = "Misslyckades: " + esc(e.message || ""); drawSettings(); });
  }
  $("btn-settings").onclick = function () { drawSettings(); $("settings").classList.remove("hidden"); };
  $("set-close").onclick = function () { $("settings").classList.add("hidden"); };
  $("settings").querySelector(".sheet-bg").onclick = $("set-close").onclick;

  /* ---------- Start ---------- */
  try { var snap = JSON.parse(localStorage.getItem(SNAP) || "null"); if (snap && snap.length) { rowsData = snap; render(); } } catch (e) {}
  build();
  listenStatus();
  window.HemMobil = { send: send, rows: function () { return rowsData; } };
})();
