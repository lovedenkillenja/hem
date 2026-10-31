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
      var seenC = {}, hidC = {}; try { hidC = JSON.parse(localStorage.getItem("hem.m.hiddenContinue") || "{}"); } catch (e) {}
      cont = cont.filter(function (x) { if (seenC[x.id] || (hidC[x.id] && hidC[x.id] >= x.at)) return false; seenC[x.id] = 1; return true; });
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
      '<div class="name">' + esc(it.name) + (it.season ? " · " + epCode(it.season, it.episode) : "") + "</div>" +
      (it.note ? '<div class="note">' + esc(it.note) + "</div>" : "");
    var img = c.firstChild;
    if (io) io.observe(img); else img.style.backgroundImage = "url('" + src + "')";
    c.onclick = function () { openSheet(it); };
    return c;
  }
  function render(list) {
    if (DESK && window.DeskUI) { DeskUI.render(list || rowsData, !!list); return; }
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
  // Är det en dator (stor skärm och mus) visas "Titta på datorn" med spelare i webbläsaren
  // Datorversionen (Hem på Macen, via den lokala servern) har egen spelare och ingen fjärrkontroll
  var DESK = !!window.HEM_DESKTOP;
  var isDesktop = DESK || (window.matchMedia && window.matchMedia("(min-width: 900px) and (pointer: fine)").matches);
  function tvPlaying() { return !DESK && now && now.playing && Date.now() - (now.at || 0) < 75 * 1000; }

  function phoneSources(item) {
    if (!Settings.get("realDebridKey")) { toast("Öppna den nya länken från installationen så kopplas Real-Debrid hit", 4000); return; }
    if (tvPlaying() && !confirm("Tv:n spelar just nu (" + now.playing.name + ").\n\nReal-Debrid kan varna eller stänga av kontot om två olika nätverk strömmar samtidigt. Är du hemma på samma wifi som tv:n är det okej.\n\nVill du ändå starta?")) return;
    $("s-eps").innerHTML = '<p class="dim">Hämtar källor…</p>'; $("s-seasons").innerHTML = "";
    if (DESK && item._auto) {
      // "▶ Spela" på datorn: välj bästa källan direkt och starta spelaren
      Streams.fetchFor(item).then(function (list) {
        var good = list.filter(function (s) { return s.cached && !s.junk; })
          .sort(function (a, b) { return ((a.res > 1080) - (b.res > 1080)) || (b.res - a.res) || (a.sizeGB - b.sizeGB); });
        if (!good.length) { $("s-eps").innerHTML = '<p class="dim">Hittade inga direktspelbara källor.</p>'; return; }
        closeSheet(); HemPlayer.open(item, good[0], good);
      }).catch(function (e) { $("s-eps").innerHTML = '<p class="dim">' + esc(e.message || "Kunde inte hämta källor") + "</p>"; });
      return;
    }
    $("s-eps").scrollIntoView({ behavior: "smooth", block: "start" });
    Streams.fetchFor(item).then(function (list) {
      // Telefonens spelare klarar alla ljudformat; föredra 1080p för att spara mobildata
      var good = list.filter(function (s) { return s.cached && !s.junk; })
        .sort(function (a, b) { return ((a.res > 1080) - (b.res > 1080)) || (b.res - a.res) || (a.sizeGB - b.sizeGB); }).slice(0, DESK ? 15 : 8);
      var box = $("s-eps"); box.innerHTML = "<h3 style=\"font-size:15px;margin:6px 0\">" + (isDesktop ? "Spela här i webbläsaren (synkas med Trakt) eller i IINA" : "Spela i " + player().name) + "</h3>";
      if (!good.length) { box.innerHTML += '<p class="dim">Hittade inga direktspelbara källor.</p>'; return; }
      good.forEach(function (s, i) {
        var row = document.createElement("div"); row.className = "ep";
        row.innerHTML = '<span class="t">' + (i === 0 ? "⭐ " : "") + esc(s.label) + ' <span class="dim small">' + (s.sizeGB ? s.sizeGB.toFixed(1) + " GB" : "") + "</span></span>";
        if (DESK) {
          var bd = document.createElement("button"); bd.textContent = "▶ Spela";
          bd.onclick = function () { closeSheet(); HemPlayer.open(item, s, good); };
          row.appendChild(bd);
        } else if (isDesktop) {
          var bh = document.createElement("button"); bh.textContent = "▶ Spela här";
          bh.onclick = function () { closeSheet(); browserPlay(item, s, good); };
          var bi = document.createElement("button"); bi.textContent = "IINA"; bi.style.marginLeft = "6px";
          bi.onclick = function () { location.href = "iina://weblink?url=" + encodeURIComponent(s.url); };
          row.appendChild(bh); row.appendChild(bi);
        } else {
          var b = document.createElement("button"); b.textContent = "▶ Spela";
          b.onclick = function () { location.href = player().url(s.url); };
          row.appendChild(b);
        }
        box.appendChild(row);
      });
      if (!DESK) box.insertAdjacentHTML("beforeend", '<p class="dim small" style="margin-top:8px">' + (isDesktop
        ? "Webbläsaren klarar inte alla filer (t.ex. vissa ljudformat). Blir det tyst eller svart: välj IINA, en gratis spelare för Mac från iina.io."
        : "Undertexter väljer du i " + player().name + ".") + " Real-Debrid tillåter bara en ström åt gången per IP-adress.</p>");
    }).catch(function (e) { $("s-eps").innerHTML = '<p class="dim">' + esc(e.message || "Kunde inte hämta källor") + "</p>"; });
  }

  function buildSheet() {
    var it = sheetItem; $("s-btns").innerHTML = "";
    if (DESK) {
      if (it.type === "movie") {
        btn("▶  Spela", function () { phoneSources(Object.assign({}, it, { _auto: true })); }, true);
        btn("Välj källa", function () { phoneSources(it); });
      } else {
        var deps = episodes(), dt = it.season ? { season: it.season, episode: it.episode } :
          it.nextEp ? { season: it.nextEp.season, episode: it.nextEp.number } : deps[0] ? { season: deps[0].season, episode: deps[0].episode } : null;
        if (dt) btn("▶  " + epCode(dt.season, dt.episode), function () { phoneSources({ type: "series", id: it.id, name: it.name, trakt: it.trakt, season: dt.season, episode: dt.episode, _auto: true }); }, true);
      }
    } else if (it.type === "movie") {
      btn("▶  Spela på tv:n", function () { send({ c: "play", item: slim(it) }, "Startar på tv:n…"); closeSheet(); }, true);
      btn(isDesktop ? "💻  Titta på datorn" : "📱  Titta i telefonen", function () { phoneSources(it); });
      btn("Öppna på tv:n", function () { send({ c: "open", item: slim(it) }, "Öppnad på tv:n"); closeSheet(); });
    } else {
      var eps = episodes(), target = it.season ? { season: it.season, episode: it.episode } :
        it.nextEp ? { season: it.nextEp.season, episode: it.nextEp.number } : eps[0] ? { season: eps[0].season, episode: eps[0].episode } : null;
      if (target) btn("▶  " + epCode(target.season, target.episode) + " på tv:n", function () {
        send({ c: "play", item: slim({ type: "series", id: it.id, name: it.name, trakt: it.trakt, season: target.season, episode: target.episode }) }, "Startar på tv:n…"); closeSheet();
      }, true);
      if (target) btn((isDesktop ? "💻  " : "📱  ") + epCode(target.season, target.episode) + (isDesktop ? " på datorn" : " i telefonen"), function () {
        phoneSources({ type: "series", id: it.id, name: it.name, season: target.season, episode: target.episode });
      });
      btn("Öppna på tv:n", function () { send({ c: "open", item: slim(it) }, "Öppnad på tv:n"); closeSheet(); });
    }
    if (Trakt.connected()) {
      btn("+ Watchlist", function () { Trakt.addToWatchlist(it).then(function () { toast("Tillagd i watchlist"); }, function () { toast("Kunde inte nå Trakt"); }); });
      if (DESK && window.DeskUI && DeskUI.rate) btn("★ Betygsätt", function () { DeskUI.rate(it); });
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
        if (DESK) {
          var bd = document.createElement("button"); bd.textContent = "▶ Spela";
          bd.onclick = function () { phoneSources({ type: "series", id: it.id, name: it.name, trakt: it.trakt, season: v.season, episode: v.episode, epTitle: v.name, _auto: true }); };
          var bk = document.createElement("button"); bk.textContent = "Källa"; bk.style.marginLeft = "6px";
          bk.onclick = function () { phoneSources({ type: "series", id: it.id, name: it.name, trakt: it.trakt, season: v.season, episode: v.episode, epTitle: v.name }); };
          row.appendChild(bd); row.appendChild(bk); box.appendChild(row); return;
        }
        var b = document.createElement("button"); b.textContent = "▶ Tv";
        b.onclick = function () {
          send({ c: "play", item: slim({ type: "series", id: it.id, name: it.name, trakt: it.trakt, season: v.season, episode: v.episode, epTitle: v.name }) }, "Startar " + epCode(v.season, v.episode) + " på tv:n…");
          closeSheet();
        };
        var b2 = document.createElement("button"); b2.textContent = isDesktop ? "💻" : "📱"; b2.style.marginLeft = "6px";
        b2.onclick = function () { phoneSources({ type: "series", id: it.id, name: it.name, season: v.season, episode: v.episode }); };
        row.appendChild(b); row.appendChild(b2); box.appendChild(row);
      });
    }
    draw();
  }
  function closeSheet() { $("sheet").classList.add("hidden"); sheetItem = null; }
  $("s-close").onclick = closeSheet; $("sheet").querySelector(".sheet-bg").onclick = closeSheet;

  /* ---------- Spelare i webbläsaren (datorn) – sparar position och synkar med Trakt ---------- */
  var bp = { item: null, saveT: null, ext: null };
  var BV = $("bp-video");
  function posKey(item) { return "hem.m.pos." + Streams.idFor(item); }
  function browserPlay(item, stream, alts) {
    bp.item = item; bp.stream = stream;
    $("bp").classList.remove("hidden"); $("bp-msg").classList.add("hidden");
    $("bp-title").textContent = item.name + (item.season ? " · " + epCode(item.season, item.episode) : "") + "  ·  " + stream.label;
    BV.innerHTML = ""; BV.src = stream.url;
    var saved = 0; try { saved = +localStorage.getItem(posKey(item)) || 0; } catch (e) {}
    BV.onloadedmetadata = function () { if (saved > 30 && saved < BV.duration - 60) BV.currentTime = saved; };
    BV.onplaying = function () { Trakt.scrobble("start", item, pct()); };
    BV.onpause = function () { if (!BV.ended) Trakt.scrobble("pause", item, pct()); save(); };
    BV.onended = function () { Trakt.scrobble("stop", item, 100); try { localStorage.removeItem(posKey(item)); } catch (e) {} };
    BV.onerror = function () { fail(); };
    clearInterval(bp.saveT); bp.saveT = setInterval(save, 15000);
    setTimeout(function () { if (BV.readyState < 2 && !BV.error && !$("bp").classList.contains("hidden")) fail(true); }, 25000);
    $("bp-iina").onclick = function () { location.href = "iina://weblink?url=" + encodeURIComponent(stream.url); };
    loadSubsFor(item, stream);
  }
  function pct() { return BV.duration ? BV.currentTime / BV.duration * 100 : 0; }
  function save() { if (bp.item && BV.duration && BV.currentTime > 30) try { localStorage.setItem(posKey(bp.item), String(Math.floor(BV.currentTime))); } catch (e) {} }
  function fail(slow) {
    $("bp-msg").innerHTML = (slow ? "Filmen startar inte i webbläsaren." : "Webbläsaren kan inte spela den här filen.") +
      "<br>Tryck <b>Öppna i IINA</b> (gratis från iina.io) eller välj en annan källa.";
    $("bp-msg").classList.remove("hidden");
  }
  /* Undertexter i webbspelaren: språk + version (som på tv:n), storlek, synk och automatisk synk */
  var MSIZES = { 1: 18, 2: 21, 3: 24, 4: 28, 5: 32, 6: 37, 7: 43 };
  function mApplySize() {
    var n = +Settings.get("subSize") || 3, st = document.getElementById("bp-cue-style");
    if (!st) { st = document.createElement("style"); st.id = "bp-cue-style"; document.head.appendChild(st); }
    st.textContent = "#bp video::cue{font-size:" + MSIZES[n] + "px;background:transparent}";
  }
  function loadSubsFor(item, stream) {
    var st = { subs: [], want: ["eng", "swe"], lang: null, idx: -1, off: 0, cues: null, picked: false, user: false };
    bp.st = st;
    var selL = $("bp-lang"), selV = $("bp-ver");
    mApplySize();
    function apply() {
      if (!st.cues) return;
      st.cues.forEach(function (c) { try { c.cue.startTime = Math.max(0, c.o0 + st.off); c.cue.endTime = Math.max(0.1, c.o1 + st.off); } catch (e) {} });
    }
    function show(i) {
      while (BV.firstChild) BV.removeChild(BV.firstChild);
      st.idx = i; st.cues = null;
      if (i < 0) return;
      var s = st.subs[i];
      Subs.load(s).then(function (u) {
        if (st.idx !== i || bp.st !== st) return;
        var t = document.createElement("track"); t.kind = "subtitles"; t.label = s.name; t.srclang = s.lang.slice(0, 2); t.src = u; t.default = true;
        t.addEventListener("load", function () {
          var L = [], cues = t.track.cues;
          for (var j = 0; j < cues.length; j++) L.push({ cue: cues[j], b0: cues[j].startTime, b1: cues[j].endTime, o0: cues[j].startTime, o1: cues[j].endTime });
          st.cues = L; apply();
          if (!s.match) autoSync(false);
        });
        BV.appendChild(t); setTimeout(function () { if (t.track) t.track.mode = "showing"; }, 50);
      }).catch(function () {});
    }
    function autoSync(loud) {
      var s = st.subs[st.idx]; if (!s) return;
      var ref = (st.all || []).filter(function (x) { return x.match && x !== s; })[0];
      if (!ref) { if (loud) alert("Hittade ingen undertext gjord för filen att jämföra med. Använd −¼ s / +¼ s."); return; }
      Promise.all([Subs.loadText(s), Subs.loadText(ref)]).then(function (t) {
        var r = Subs.align(Subs.times(t[0]), Subs.times(t[1]));
        if (!r) { if (loud) alert("Kunde inte synka automatiskt. Använd −¼ s / +¼ s."); return; }
        // webbspelaren flyttar bara; takten justeras genom att räkna om varje rad
        if (st.cues) st.cues.forEach(function (c) { c.o0 = c.b0 * r.a; c.o1 = c.b1 * r.a; });
        st.off = Math.round(r.b * 100) / 100; apply();
      });
    }
    function langs() {
      var have = {}; st.subs.forEach(function (x) { have[x.lang] = (have[x.lang] || 0) + 1; });
      return st.want.filter(function (l) { return true; }).map(function (l) { return { l: l, n: have[l] || 0 }; });
    }
    function fillLangs() {
      var cur = st.lang;
      selL.innerHTML = '<option value="">Undertexter: av</option>' + langs().map(function (x) {
        return '<option value="' + x.l + '"' + (x.l === cur ? " selected" : "") + ">" + Subs.langName(x.l) + " (" + x.n + ")</option>";
      }).join("");
      fillVers();
    }
    function fillVers() {
      var list = st.subs.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) { return o.x.lang === st.lang; });
      selV.innerHTML = list.map(function (o) {
        var tag = o.x.match ? " · ✓ gjord för filen" : o.x.rel ? " · ✓ samma utgåva" : "";
        return '<option value="' + o.i + '"' + (o.i === st.idx ? " selected" : "") + ">" + o.x.name + tag + (o.x.src && o.x.src !== "OpenSubtitles" ? " · " + o.x.src : "") + "</option>";
      }).join("");
      selV.style.display = list.length ? "" : "none";
    }
    selL.onchange = function () {
      st.user = true; st.lang = selL.value || null;
      var first = st.subs.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) { return o.x.lang === st.lang; })[0];
      show(first ? first.i : -1); fillVers();
    };
    selV.onchange = function () { st.user = true; show(+selV.value); };
    $("bp-sm").onclick = function () { Subs.stepSize(-1); mApplySize(); };
    $("bp-lg").onclick = function () { Subs.stepSize(1); mApplySize(); };
    $("bp-early").onclick = function () { st.off = Math.round((st.off - 0.25) * 100) / 100; apply(); };
    $("bp-late").onclick = function () { st.off = Math.round((st.off + 0.25) * 100) / 100; apply(); };
    $("bp-auto").onclick = function () { autoSync(true); };
    function autoPick(final) {
      if (st.user || Settings.get("subsOnByDefault") === false) return;
      for (var w = 0; w < st.want.length; w++) {
        if (w > 0 && !final) break;
        var l = st.want[w], best = -1;
        st.subs.forEach(function (x, i) { if (x.lang === l && best < 0) best = i; }); // listan är redan sorterad: bäst först
        if (best >= 0) { if (st.idx !== best && !(st.lang === l && st.idx >= 0 && w === 0)) { st.lang = l; show(best); } else st.lang = st.lang || l; return; }
      }
    }
    function update(list) {
      if (bp.st !== st) return;
      var cur = st.subs[st.idx];
      st.all = list;
      st.subs = list.filter(function (x) { return st.want.indexOf(x.lang) >= 0; });
      if (cur) st.idx = st.subs.indexOf(cur);
      autoPick(false); fillLangs();
    }
    fillLangs();
    Trakt.language(item).catch(function () { return ""; }).then(function (orig) {
      st.want = Subs.langsFor(orig);
      return Subs.search(item, stream, update);
    }).then(function (list) { update(list); autoPick(true); fillLangs(); }).catch(function () {});
  }
  function closePlayer() {
    if (bp.item && BV.duration && !BV.ended) { save(); Trakt.scrobble("stop", bp.item, pct()); }
    clearInterval(bp.saveT); BV.pause(); BV.removeAttribute("src"); BV.load(); bp.item = null; bp.st = null;
    while (BV.firstChild) BV.removeChild(BV.firstChild);
    $("bp").classList.add("hidden");
  }
  $("bp-close").onclick = closePlayer;
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("bp").classList.contains("hidden") && !document.fullscreenElement) closePlayer(); });

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

  /* ---------- Historik (allt du sett på alla enheter) ---------- */
  var hb = $("btn-history");
  if (hb) hb.onclick = function () {
    $("status").textContent = "Hämtar historik…";
    History.load(true).then(function (list) {
      $("status").textContent = list.length ? "" : (Trakt.connected() ? "Ingen historik än" : "Koppla Trakt under ⚙ för att se din historik");
      function items(key, type) { return History.sorted(list, key, type).slice(0, 150).map(function (x) { return { type: x.type, id: x.id, name: x.name, rating: Ratings.get(x.id), note: History.note(x) }; }); }
      render([
        { key: "h1", title: "Senast sedda", items: items("recent") },
        { key: "h2", title: "Mitt högsta betyg", items: items("mine") },
        { key: "h3", title: "Filmer A–Ö", items: items("title", "movie") },
        { key: "h4", title: "Serier A–Ö", items: items("title", "series") }
      ].filter(function (r) { return r.items.length; }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
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
    if (DESK) {
      row("Undertextstorlek", "Ändras också direkt i spelaren", Subs.sizeName(), function () { Subs.cycleSize(); drawSettings(); });
      row("Undertextspråk", "Auto = engelska, men svenska för filmer på svenska", { auto: "Auto", eng: "Engelska", swe: "Svenska" }[Settings.get("subMode") || "auto"], function () {
        var m = ["auto", "eng", "swe"]; Settings.set("subMode", m[(m.indexOf(Settings.get("subMode") || "auto") + 1) % 3]); drawSettings();
      });
      row("Felsökning", "Kopierar en rapport om senaste uppspelningen (inga nycklar) som du kan klistra in till Claude", "Kopiera rapport", function () {
        HemPlayer.report().then(function (txt) {
          var ta = document.createElement("textarea"); ta.id = "diag-box"; ta.readOnly = true; ta.value = txt;
          var old = $("diag-box"); if (old) old.remove(); box.appendChild(ta); ta.select();
          (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Rapporten är kopierad – klistra in den i chatten"); },
            function () { try { document.execCommand("copy"); toast("Rapporten är kopierad"); } catch (e) { toast("Markera texten och kopiera"); } });
        });
      });
      return;
    }
    row("Koppling till tv:n", topic ? "Klar ✓" : "Saknas – öppna länken från installationen", null);
    row("Spelare i telefonen", "Installera gratisappen VLC (eller Infuse) från App Store", player().name, function () {
      Settings.set("phonePlayer", Settings.get("phonePlayer") === "infuse" ? "vlc" : "infuse"); drawSettings();
    });
    row("Real-Debrid i telefonen", Settings.get("realDebridKey") ? "Klar ✓" : "Saknas – öppna den senaste länken från installationen", null);
    row("Felsökning", "Be tv:n skicka vad den ser (inga nycklar) och kopiera texten till Claude", "Be tv:n skicka", function () {
      send({ c: "diag" }, "Skickat – hämtar svaret om några sekunder…"); setTimeout(loadDiag, 6000);
    });
    row("", "", "Visa senaste", loadDiag);
    var ta = document.createElement("textarea"); ta.id = "diag-box"; ta.readOnly = true; ta.placeholder = "Här visas tv:ns felsökningsrapport"; ta.value = diagText;
    box.appendChild(ta);
    if (diagText) row("", "", "Kopiera", function () {
      var t = $("diag-box"); t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(diagText) : Promise.reject()).then(function () { toast("Kopierat – klistra in i chatten med Claude"); })
        .catch(function () { try { document.execCommand("copy"); toast("Kopierat"); } catch (e) { toast("Markera texten och kopiera"); } });
    });
  }
  var diagText = "";
  // Hämta tv:ns senaste felsökningsrapport från den privata kanalen (sparas där i några timmar)
  function loadDiag() {
    if (!topic) { toast("Mobilen är inte kopplad till tv:n"); return; }
    fetch("https://ntfy.sh/" + topic + "-d/json?poll=1&since=12h").then(function (r) { return r.text(); }).then(function (t) {
      var msgs = t.trim().split("\n").filter(Boolean).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } })
        .filter(function (m) { return m && m.event === "message"; });
      var m = msgs[msgs.length - 1];
      if (!m) { toast("Ingen rapport än – tryck Be tv:n skicka (Lflix måste vara öppen på tv:n)"); return; }
      // Långa rapporter sparar ntfy som bifogad fil
      return (m.attachment && m.attachment.url ? fetch(m.attachment.url).then(function (r) { return r.text(); }) : Promise.resolve(m.message || ""))
        .then(function (txt) { diagText = txt; drawSettings(); toast("Rapport från " + new Date(m.time * 1000).toLocaleTimeString("sv-SE")); });
    }).catch(function () { toast("Kunde inte hämta rapporten"); });
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

  $("tv-search").onsubmit = function (e) {
    e.preventDefault();
    var q = $("tv-q").value.trim(); if (q.length < 2) return;
    send({ c: "search", q: q }, "Söker på tv:n…"); $("tv-q").blur();
  };

  /* ---------- Start ---------- */
  try { var snap = JSON.parse(localStorage.getItem(SNAP) || "null"); if (snap && snap.length) { rowsData = snap; render(); } } catch (e) {}
  build();
  if (!DESK) listenStatus();
  // Mobilversionen öppnad på en dator: tipsa om datorversionen (egen spelare, ingen fjärrkontroll)
  if (!DESK && isDesktop) {
    var tip = document.createElement("div"); tip.className = "desk-tip";
    tip.innerHTML = 'Det här är <b>mobilversionen</b> (styr tv:n). På datorn finns en egen version med inbyggd spelare: ' +
      '<a href="http://127.0.0.1:8765">öppna Lflix för datorn</a> <span class="dim">(kör Uppdatera Lflix på Macen först)</span>';
    $("browse").insertBefore(tip, $("browse").firstChild);
  }
  window.HemMobil = { send: send, rows: function () { return rowsData; }, openSheet: openSheet,
    play: function (it) { phoneSources(Object.assign({}, it, { _auto: true })); }, rebuild: function () { render(); } };
})();
