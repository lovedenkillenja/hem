/* Grundinställningar. Installationsskriptet på Macen skriver över värdena
   i CONFIG_LOCAL nedan (i den paketerade kopian) så att du slipper skriva
   långa nycklar med fjärrkontrollen. Allt kan också ändras i appens Inställningar. */
var CONFIG_LOCAL = {
  realDebridKey: "",
  traktClientId: "",
  traktClientSecret: "",
  remoteTopic: "",          // hemlig kanal för mobilappen (sätts av installationsskriptet)
  customLists: []           // egna Trakt-listor från listor.txt
};

var DEFAULTS = {
  realDebridKey: "",
  traktClientId: "",
  traktClientSecret: "",
  maxQuality: "2160p",        // "2160p" eller "1080p"
  minRating: 7.0,             // dölj förslag under detta IMDb-betyg (0 = visa allt)
  hideSeen: true,             // dölj filmer du redan sett i förslagsraderna
  subMode: "auto",            // "auto" = engelska, men svenska för svenskspråkiga filmer; "eng" eller "swe" = alltid
  subSize: 3,                 // undertextstorlek 1–7
  autoNext: true,            // starta nästa avsnitt automatiskt (även när eftertexterna börjar)
  autoSkipIntro: false,      // hoppa över intro/sammanfattning automatiskt (annars visas en knapp)
  seekPreview: true,         // liten förhandsbild när man spolar
  subsOnByDefault: true,     // slå på bästa undertexten (svenska före engelska) automatiskt
  ps5Hdmi: 1,                 // vilken HDMI-ingång PS5:an sitter i
  // Appar i toppraden. id fylls i automatiskt om tv:n tillåter det,
  // annars används gissade id:n. Kan ändras i Inställningar.
  // "guess" provas i tur och ordning om tv:n inte vill lista sina appar.
  apps: [
    { name: "Stremio",    match: "stremio", id: "", guess: ["com.stremio.app", "com.strem.io", "stremio", "com.stremio.stremio"] },
    { name: "YouTube",    match: "youtube", id: "", guess: ["youtube.leanback.v4", "youtube.leanback.v5"] },
    { name: "SVT Play",   match: "svt",     id: "", guess: ["se.svt.svtplay", "svtplay", "com.svt.svtplay", "se.svt.play"] },
    { name: "Tele2 Play", match: "tele2",   id: "", guess: ["com.tele2.play", "se.tele2.play", "tele2play", "com.tele2.tele2play"] }
  ]
};
