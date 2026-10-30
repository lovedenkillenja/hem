/* Undertexter från Stremios OpenSubtitles-tillägg.
   För att få undertexter som är synkade med just den fil som spelas skickas
   filens OpenSubtitles-hash, storlek och filnamn med (samma sak som Stremio
   på datorn gör). SRT konverteras till WebVTT så att tv:ns spelare kan visa dem. */
var Subs = (function () {
  var BASE = "https://opensubtitles-v3.strem.io";
  var NAMES = { swe: "Svenska", eng: "Engelska", nor: "Norska", dan: "Danska", fin: "Finska", ger: "Tyska", spa: "Spanska", fre: "Franska" };
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

  function list(item, stream, want) {
    var type = item.type === "movie" ? "movie" : "series";
    var info = stream ? videoHash(stream.url, stream.videoSize) : Promise.resolve(null);
    return info.then(function (h) {
      var extra = [];
      if (h) extra.push("videoHash=" + h.hash, "videoSize=" + h.size);
      else if (stream && stream.videoSize) extra.push("videoSize=" + stream.videoSize);
      if (stream && stream.file) extra.push("filename=" + encodeURIComponent(stream.file));
      var url = BASE + "/subtitles/" + type + "/" + encodeURIComponent(Streams.idFor(item)) + (extra.length ? "/" + extra.join("&") : "") + ".json";
      return http(url, { timeout: 15000 }).then(function (r) { return { r: r, hashed: !!h }; });
    }).then(function (res) {
      want = want || ["eng", "swe"];
      // Tillägget sorterar redan bäst matchande först; behåll den ordningen inom varje språk
      var subs = ((res.r && res.r.subtitles) || []).filter(function (s) { return want.indexOf(s.lang) >= 0; });
      subs = subs.map(function (s, i) { s._i = i; return s; })
        .sort(function (a, b) { return (want.indexOf(a.lang) - want.indexOf(b.lang)) || (a._i - b._i); });
      var count = {};
      return subs.filter(function (s) { count[s.lang] = (count[s.lang] || 0) + 1; return count[s.lang] <= 5; })
        .map(function (s) { return { url: s.url, lang: s.lang, hashed: res.hashed }; });
    }).catch(function () { return []; });
  }

  function renumber(subs) {
    var c = {};
    subs.forEach(function (s) { c[s.lang] = (c[s.lang] || 0) + 1; s.name = (NAMES[s.lang] || s.lang) + (c[s.lang] > 1 ? " " + c[s.lang] : ""); });
    return subs;
  }

  function srtToVtt(srt) {
    var t = srt.replace(/^﻿/, "").replace(/\r+/g, "");
    t = t.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
    t = t.replace(/<\/?font[^>]*>/gi, "").replace(/\{\\an?\d\}/g, "");
    return "WEBVTT\n\n" + t.trim() + "\n";
  }

  function load(sub) {
    return http(sub.url, { text: true, timeout: 15000 }).then(function (txt) {
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
    st.textContent = "#video::cue{font-size:" + SIZES[n] + "px;background:transparent;background-color:transparent}";
  }
  function stepSize(d) { var n = Math.max(1, Math.min(7, (+Settings.get("subSize") || 3) + d)); Settings.set("subSize", n); applySize(); return n; }
  function cycleSize() { var n = (+Settings.get("subSize") || 3) % 7 + 1; Settings.set("subSize", n); applySize(); return n; }
  function sizeName() { return (+Settings.get("subSize") || 3) + " av 7"; }

  return { list: function (item, stream, want) { return list(item, stream, want).then(renumber); }, langsFor: langsFor,
    applySize: applySize, cycleSize: cycleSize, stepSize: stepSize, sizeName: sizeName, load: load, srtToVtt: srtToVtt, videoHash: videoHash };
})();
