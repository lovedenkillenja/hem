/* Undertexter från Stremios OpenSubtitles-tillägg.
   För att få undertexter som är synkade med just den fil som spelas skickas
   filens OpenSubtitles-hash, storlek och filnamn med (samma sak som Stremio
   på datorn gör). SRT konverteras till WebVTT så att tv:ns spelare kan visa dem. */
var Subs = (function () {
  var BASE = "https://opensubtitles-v3.strem.io";
  var CHUNK = 65536;

  // OpenSubtitles-hash: filstorlek + summan av 64-bitarsord i första och sista 64 kB
  function rangeBytes(url, start, end) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    return fetch(url, { headers: { Range: "bytes=" + start + "-" + end }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (r.status !== 206) throw new Error("Inget range-stöd");
        var cr = r.headers.get("Content-Range") || "";
        var total = +(cr.split("/")[1] || 0);
        return r.arrayBuffer().then(function (buf) { clearTimeout(t); return { buf: buf, total: total }; });
      }, function (e) { clearTimeout(t); throw e; });
  }
  function sumWords(buf) {
    var dv = new DataView(buf), sum = BigInt(0), mask = (BigInt(1) << BigInt(64)) - BigInt(1);
    for (var i = 0; i + 8 <= buf.byteLength; i += 8) sum = (sum + dv.getBigUint64(i, true)) & mask;
    return sum;
  }
  function videoHash(url, knownSize) {
    if (typeof BigInt === "undefined") return Promise.resolve(null);
    return webHash(url, knownSize).then(function (h) {
      if (h || typeof Luna === "undefined" || !Luna.onTV) return h;
      // Webbläsaren får oftast inte läsa delar av Real-Debrids filer – låt Hems tjänst på tv:n räkna i stället
      return Luna.service("hash", { url: url, size: knownSize || 0 }, 30000)
        .then(function (r) { return r && r.hash ? { hash: r.hash, size: r.size, via: "tjänst" } : null; })
        .catch(function (e) { lastHashErr = (e && e.errorText) || "tjänsten svarade inte"; return null; });
    });
  }
  var lastHashErr = "";
  // Hämta JSON: först direkt, och om det misslyckas via tjänsten på tv:n
  function getJSON(url, timeout) {
    return http(url, { timeout: timeout }).catch(function (e) {
      if (typeof Luna === "undefined" || !Luna.onTV) throw e;
      return Luna.service("fetch", { url: url, timeout: 90000 }, 95000).then(function (r) { return JSON.parse(r.text); });
    });
  }
  function webHash(url, knownSize) {
    return rangeBytes(url, 0, CHUNK - 1).then(function (head) {
      var size = knownSize || head.total;
      if (!size || size < CHUNK * 2) throw new Error("Okänd storlek");
      return rangeBytes(url, size - CHUNK, size - 1).then(function (tail) {
        var mask = (BigInt(1) << BigInt(64)) - BigInt(1);
        var h = (BigInt(size) + sumWords(head.buf) + sumWords(tail.buf)) & mask;
        var hex = h.toString(16); while (hex.length < 16) hex = "0" + hex;
        return { hash: hex, size: size };
      });
    }).catch(function () { return null; });
  }

  // Alla språkkoder (en, eng, English …) görs om till en och samma kod
  var LANGS = {
    eng: ["Engelska", "en|eng|english"], swe: ["Svenska", "sv|swe|swedish"], nor: ["Norska", "no|nb|nn|nor|nob|nno|norwegian"],
    dan: ["Danska", "da|dan|danish"], fin: ["Finska", "fi|fin|finnish"], ice: ["Isländska", "is|ice|isl|icelandic"],
    ger: ["Tyska", "de|ger|deu|german"], fre: ["Franska", "fr|fre|fra|french"], spa: ["Spanska", "es|spa|spn|ea|spl|spanish"],
    ita: ["Italienska", "it|ita|italian"], dut: ["Nederländska", "nl|dut|nld|dutch"], por: ["Portugisiska", "pt|por|portuguese"],
    pob: ["Portugisiska (BR)", "pb|pob|pt-br|ptbr"], pol: ["Polska", "pl|pol|polish"], rus: ["Ryska", "ru|rus|russian"],
    ukr: ["Ukrainska", "uk|ukr"], cze: ["Tjeckiska", "cs|cze|ces|czech"], slo: ["Slovakiska", "sk|slo|slk"], hun: ["Ungerska", "hu|hun|hungarian"],
    rum: ["Rumänska", "ro|rum|ron|romanian"], bul: ["Bulgariska", "bg|bul"], gre: ["Grekiska", "el|gre|ell|greek"], tur: ["Turkiska", "tr|tur|turkish"],
    hrv: ["Kroatiska", "hr|hrv|scr"], srp: ["Serbiska", "sr|srp|scc"], slv: ["Slovenska", "sl|slv"], est: ["Estniska", "et|est"],
    lav: ["Lettiska", "lv|lav"], lit: ["Litauiska", "lt|lit"], heb: ["Hebreiska", "he|heb"], ara: ["Arabiska", "ar|ara|arabic"],
    per: ["Persiska", "fa|per|fas"], hin: ["Hindi", "hi|hin"], tha: ["Thai", "th|tha"], vie: ["Vietnamesiska", "vi|vie"],
    ind: ["Indonesiska", "id|ind"], may: ["Malajiska", "ms|may|msa"], jpn: ["Japanska", "ja|jpn|japanese"], kor: ["Koreanska", "ko|kor|korean"],
    chi: ["Kinesiska", "zh|chi|zho|zht|zhe|chinese"]
  };
  var ALIAS = {};
  Object.keys(LANGS).forEach(function (k) { LANGS[k][1].split("|").forEach(function (a) { ALIAS[a] = k; }); });
  function norm(code) {
    var c = String(code || "").toLowerCase().trim();
    return ALIAS[c] || ALIAS[c.split(/[-_]/)[0]] || c || "und";
  }
  function langName(code) { var c = norm(code); return LANGS[c] ? LANGS[c][0] : (c === "und" ? "Okänt språk" : c.toUpperCase()); }

  // Hämtar undertexter i två steg: först de som matchar just den här filen, sedan alla för filmen.
  // onUpdate anropas när varje svar kommer, så att menyn fylls på direkt.
  function search(item, stream, onUpdate) {
    var type = item.type === "movie" ? "movie" : "series";
    var base = BASE + "/subtitles/" + type + "/" + encodeURIComponent(Streams.idFor(item));
    var diag = { hash: null, match: "väntar", all: "väntar" };
    var seen = {}, out = [], matchedIds = {};
    function add(r, fromMatch) {
      ((r && r.subtitles) || []).forEach(function (s) {
        if (!s || !s.url) return;
        var k = s.id || s.url;
        if (seen[k]) return;
        seen[k] = 1;
        var lang = norm(s.lang);
        // "m" anger hur OpenSubtitles hittade undertexten; "h" = via filens hash (gjord för exakt den filen)
        var isMatch = s.m != null ? s.m === "h" : (!!fromMatch && !!diag.hash);
        out.push({ url: s.url, lang: lang, id: k, match: isMatch, src: "OpenSubtitles" });
        if (fromMatch) matchedIds[k] = 1;
        if (isMatch && !diag.refId) diag.refId = k;
      });
    }
    function emit() {
      var by = {}, order = [];
      out.forEach(function (s) { if (!by[s.lang]) { by[s.lang] = []; order.push(s.lang); } if (by[s.lang].length < 20) by[s.lang].push(s); });
      var res = [];
      order.forEach(function (l) {
        // Gjorda för filen först, sedan samma utgåva, sedan resten
        by[l].forEach(function (s, i) { s._o = i; });
        by[l].sort(function (a, b) { return ((b.match ? 2 : 0) + (b.rel ? 1 : 0)) - ((a.match ? 2 : 0) + (a.rel ? 1 : 0)) || a._o - b._o; });
        by[l].forEach(function (s, i) { s.name = langName(l) + " " + (i + 1); res.push(s); });
      });
      diag.total = out.length; diag.langs = order.length;
      try { onUpdate && onUpdate(res, diag); } catch (e) {}
      return res;
    }
    var info = stream ? videoHash(stream.url, stream.videoSize) : Promise.resolve(null);
    var matched = info.then(function (h) {
      diag.hash = !!h; diag.hashVia = h ? (h.via || "webb") : ""; diag.hashErr = h ? "" : lastHashErr;
      var extra = [];
      if (h) extra.push("videoHash=" + h.hash, "videoSize=" + h.size);
      else if (stream && stream.videoSize) extra.push("videoSize=" + stream.videoSize);
      if (stream && stream.file) extra.push("filename=" + encodeURIComponent(stream.file));
      if (!extra.length) { diag.match = "–"; return; }
      return getJSON(base + "/" + extra.join("&") + ".json", 40000)
        .then(function (r) { diag.match = "ok"; add(r, true); emit(); })
        .catch(function (e) { diag.match = /abort/i.test(String(e && (e.name || e.message))) ? "tidsgräns" : "fel"; emit(); });
    });
    // Den stora listan hämtas parallellt; populära filmer kan ha tusentals undertexter och ta tid
    var all = getJSON(base + ".json", 45000)
      .then(function (r) { return matched.then(function () { diag.all = "ok"; add(r, false); emit(); }); })
      .catch(function (e) { diag.all = /abort/i.test(String(e && (e.name || e.message))) ? "tidsgräns" : "fel"; return matched.then(emit); });
    // Andra källa: Podnapisi (via Hems tjänst på tv:n). Ger utgåvans namn, så vi kan hitta samma utgåva som filen.
    diag.pod = "–";
    var pod = (typeof Luna !== "undefined" && Luna.onTV) ? podnapisi(item, stream, diag).then(function (list) {
      list.forEach(function (s) { if (!seen[s.id]) { seen[s.id] = 1; out.push(s); } });
      emit();
    }) : Promise.resolve();
    // Tredje källa: YIFY Subtitles (bara filmer), också via tjänsten på tv:n
    diag.yify = "–";
    var yify = (typeof Luna !== "undefined" && Luna.onTV && item.type === "movie") ? yifySearch(item, stream, diag).then(function (list) {
      list.forEach(function (s) { if (!seen[s.id]) { seen[s.id] = 1; out.push(s); } });
      emit();
    }) : Promise.resolve();
    return Promise.all([matched, all, pod, yify]).then(function () { diag.done = true; return emit(); });
  }

  function yifySearch(item, stream, diag) {
    diag.yify = "letar";
    return Luna.service("yify", { imdb: item.id }, 45000).then(function (r) {
      var list = ((r && r.subtitles) || []).map(function (x) {
        return { url: "yify:" + x.slug, host: x.host, lang: norm(x.lang), id: "yify" + x.slug, src: "YIFY", release: x.release, rel: relMatch(x.release, stream && stream.file) };
      });
      // högst betygsatta först
      diag.yify = list.length + " st";
      return list;
    }).catch(function (e) { diag.yify = "fel" + (e && e.errorText ? " (" + e.errorText + ")" : ""); return []; });
  }

  var POD_LANG = { eng: "en", swe: "sv", nor: "no", dan: "da", fin: "fi", ger: "de", fre: "fr", spa: "es" };
  function podnapisi(item, stream, diag) {
    diag.pod = "letar";
    var want = (langsFor(diag.orig) || ["eng", "swe"]).map(function (l) { return POD_LANG[l]; }).filter(Boolean);
    return Cinemeta.meta(item.type === "movie" ? "movie" : "series", item.id).then(function (m) {
      var year = parseInt((m && (m.year || m.releaseInfo)) || "", 10) || 0;
      return Luna.service("podnapisi", { title: (m && m.name) || item.name, year: item.type === "movie" ? year : 0,
        season: item.season || 0, episode: item.episode || 0, langs: want }, 60000);
    }).then(function (r) {
      var list = ((r && r.subtitles) || []).map(function (x) {
        return { url: "pod:" + x.pid, lang: norm(x.lang), id: "pod" + x.pid, src: "Podnapisi", release: x.release, rel: relMatch(x.release, stream && stream.file) };
      });
      diag.pod = list.length + " st";
      return list;
    }).catch(function (e) { diag.pod = "fel" + (e && e.errorText ? " (" + e.errorText + ")" : ""); return []; });
  }
  // Är undertexten gjord för samma utgåva som filen? Jämför utgivargrupp, källa och upplösning.
  function relTokens(name) {
    var n = String(name || "").toLowerCase().replace(/\.(mkv|mp4|avi|srt|m4v)$/, "");
    var grp = (n.match(/-([a-z0-9]+)(\[[^\]]*\])?\s*$/) || [])[1] || "";
    var src = /blu-?ray|bdrip|brrip|bdremux|remux/.test(n) ? "bluray" : /web-?dl|webrip|\bweb\b|amzn|nf\b|dsnp|hmax/.test(n) ? "web" : /dvd/.test(n) ? "dvd" : /hdtv/.test(n) ? "hdtv" : "";
    return { grp: grp, src: src };
  }
  function relMatch(release, file) {
    if (!release || !file) return false;
    var f = relTokens(file);
    return String(release).split(/\s+/).some(function (r) {
      var t = relTokens(r);
      return !!t.grp && t.grp === f.grp && (!t.src || !f.src || t.src === f.src);
    });
  }

  // Tidpunkter (sekunder) där varje replik börjar, från SRT- eller VTT-text
  function times(txt) {
    var re = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->/g, m, out = [];
    while ((m = re.exec(txt))) out.push(+m[1] * 3600 + +m[2] * 60 + +m[3] + +("0." + m[4]));
    return out.sort(function (a, b) { return a - b; });
  }
  // Räkna ut hur en undertext ska flyttas (b) och sträckas (a) för att passa en referens som vi vet
  // är synkad mot filen. Provar vanliga bildfrekvensskillnader och letar den förskjutning där flest repliker
  // hamnar på samma ställe. Returnerar null om inget tydligt svar finns.
  function align(sub, ref) {
    if (sub.length < 20 || ref.length < 20) return null;
    function near(t) { // närmaste referenstid
      var lo = 0, hi = ref.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (ref[mid] < t) lo = mid + 1; else hi = mid; }
      var d = Math.abs(ref[lo] - t); if (lo > 0) d = Math.min(d, Math.abs(ref[lo - 1] - t)); return d;
    }
    var scales = [1, 25 / 23.976, 23.976 / 25, 24 / 23.976, 23.976 / 24, 25 / 24, 24 / 25], best = null;
    var step = Math.max(1, Math.floor(sub.length / 400));
    scales.forEach(function (a) {
      var hist = {};
      for (var i = 0; i < sub.length; i += step) {
        var s = a * sub[i];
        for (var j = 0; j < ref.length; j++) {
          var d = ref[j] - s; if (d < -180) continue; if (d > 180) break;
          var k = Math.round(d * 5); hist[k] = (hist[k] || 0) + 1;
        }
      }
      var bk = null, bv = 0;
      Object.keys(hist).forEach(function (k) { var v = hist[k] + (hist[+k - 1] || 0) + (hist[+k + 1] || 0); if (v > bv) { bv = v; bk = +k; } });
      if (bk == null) return;
      var b = bk / 5, score = 0;
      for (var q = 0; q < sub.length; q++) if (near(a * sub[q] + b) < 0.4) score++;
      if (!best || score > best.score) best = { a: a, b: b, score: score };
    });
    if (!best) return null;
    // Finjustera förskjutningen med medianen av avstånden för repliker som träffar
    var ds = [];
    sub.forEach(function (t) {
      var s = best.a * t + best.b, lo = 0, hi = ref.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (ref[mid] < s) lo = mid + 1; else hi = mid; }
      [lo - 1, lo].forEach(function (x) { if (x >= 0 && Math.abs(ref[x] - s) < 0.4) ds.push(ref[x] - s); });
    });
    ds.sort(function (x, y) { return x - y; });
    if (ds.length) best.b += ds[ds.length >> 1];
    best.ratio = best.score / Math.min(sub.length, ref.length);
    return best.ratio >= 0.3 && best.score >= 15 ? best : null;
  }

  // Läser SRT/VTT till en lista med repliker {s, e, text}
  function parseCues(txt) {
    var t = String(txt || "").replace(/^\uFEFF/, "").replace(/\r/g, ""), out = [];
    var blocks = t.split(/\n[ \t]*\n+/);
    var re = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
    function sec(h, m, s2, ms) { return (+h || 0) * 3600 + +m * 60 + +s2 + +("0." + ("00" + ms).slice(-3)); }
    blocks.forEach(function (b) {
      var lines = b.split("\n"), k = -1;
      for (var i = 0; i < lines.length; i++) if (lines[i].indexOf("-->") >= 0) { k = i; break; }
      if (k < 0) return;
      var m = re.exec(lines[k]); if (!m) return;
      var text = lines.slice(k + 1).join("\n").trim();
      if (!text) return;
      out.push({ s: sec(m[1], m[2], m[3], m[4]), e: sec(m[5], m[6], m[7], m[8]), text: text });
    });
    return out.sort(function (a, b) { return a.s - b.s; });
  }

  function srtToVtt(srt) {
    var t = srt.replace(/^﻿/, "").replace(/\r+/g, "");
    t = t.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
    t = t.replace(/<\/?font[^>]*>/gi, "").replace(/\{\\an?\d\}/g, "");
    return "WEBVTT\n\n" + t.trim() + "\n";
  }

  function loadText(sub) {
    if (sub._text) return Promise.resolve(sub._text);
    var p = /^pod:/.test(sub.url) ? Luna.service("podsub", { pid: sub.url.slice(4) }, 40000).then(function (r) { return r.text; })
      : /^yify:/.test(sub.url) ? Luna.service("yifysub", { slug: sub.url.slice(5), host: sub.host }, 40000).then(function (r) { return r.text; })
      : http(sub.url, { text: true, timeout: 15000 });
    return p.then(function (t) { sub._text = t; return t; });
  }
  function load(sub) {
    return loadText(sub).then(function (txt) {
      var vtt = /^WEBVTT/.test(txt) ? txt : srtToVtt(txt);
      return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
    });
  }

  // Vilka språk som ska prioriteras för en titel, utifrån inställning och originalspråk
  function langsFor(orig) {
    var mode = Settings.get("subMode") || "auto";
    if (mode === "swe") return ["swe", "eng"];
    if (mode === "eng") return ["eng", "swe"];
    return /^(sv|swe)$/i.test(orig || "") ? ["swe", "eng"] : ["eng", "swe"];
  }
  var SIZES = { 1: 30, 2: 36, 3: 42, 4: 48, 5: 56, 6: 66, 7: 78 };
  function applySize() {
    var n = +Settings.get("subSize") || 3, st = document.getElementById("cue-style");
    if (!st) { st = document.createElement("style"); st.id = "cue-style"; document.head.appendChild(st); }
    st.textContent = "#video::cue{font-size:" + SIZES[n] + "px;background:transparent;background-color:transparent}#p-cue{font-size:" + SIZES[n] + "px}";
  }
  function stepSize(d) { var n = Math.max(1, Math.min(7, (+Settings.get("subSize") || 3) + d)); Settings.set("subSize", n); applySize(); return n; }
  function cycleSize() { var n = (+Settings.get("subSize") || 3) % 7 + 1; Settings.set("subSize", n); applySize(); return n; }
  function fontPx() { return SIZES[+Settings.get("subSize") || 3]; }
  function sizeName() { return (+Settings.get("subSize") || 3) + " av 7"; }

  return { search: search, parseCues: parseCues, fontPx: fontPx, norm: norm, loadText: loadText, times: times, align: align, relMatch: relMatch, langName: langName, langsFor: langsFor,
    applySize: applySize, cycleSize: cycleSize, stepSize: stepSize, sizeName: sizeName, load: load, srtToVtt: srtToVtt, videoHash: videoHash };
})();
