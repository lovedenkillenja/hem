/* Handplockade samlingar. Titlar slås upp i Stremios katalog första gången
   och sparas sedan på tv:n. Format: [titel, år, "movie"|"series"].
   Lägg gärna till egna – appen hittar rätt film via titel + år. */
var CURATED = {
  ww2: { title: "Andra världskriget", items: [
    ["Saving Private Ryan", 1998], ["Schindler's List", 1993], ["The Pianist", 2002], ["Come and See", 1985],
    ["Das Boot", 1981], ["Downfall", 2004], ["Inglourious Basterds", 2009], ["Dunkirk", 2017],
    ["Hacksaw Ridge", 2016], ["Letters from Iwo Jima", 2006], ["The Thin Red Line", 1998],
    ["The Bridge on the River Kwai", 1957], ["The Great Escape", 1963], ["Fury", 2014], ["The Imitation Game", 2014],
    ["Son of Saul", 2015], ["Jojo Rabbit", 2019], ["Land of Mine", 2015], ["Black Book", 2006],
    ["Ivan's Childhood", 1962], ["The Cranes Are Flying", 1957], ["The Boy in the Striped Pyjamas", 2008],
    ["Enemy at the Gates", 2001], ["Stalingrad", 1993], ["The Dirty Dozen", 1967], ["Where Eagles Dare", 1968],
    ["The Longest Day", 1962], ["Patton", 1970], ["Empire of the Sun", 1987], ["Kelly's Heroes", 1970],
    ["The Guns of Navarone", 1961], ["Judgment at Nuremberg", 1961], ["The Counterfeiters", 2007],
    ["Sophie Scholl: The Final Days", 2005], ["Max Manus", 2008], ["The 12th Man", 2017], ["The Unknown Soldier", 2017],
    ["The Winter War", 1989], ["The King's Choice", 2016], ["Atonement", 2007], ["Darkest Hour", 2017],
    ["A Hidden Life", 2019], ["Cross of Iron", 1977], ["Defiance", 2008], ["Valkyrie", 2008], ["Anthropoid", 2016],
    ["A Bridge Too Far", 1977], ["Tora! Tora! Tora!", 1970], ["Grave of the Fireflies", 1988], ["Life Is Beautiful", 1997],
    ["The Zone of Interest", 2023], ["Greyhound", 2020], ["Unbroken", 2014], ["The Great Dictator", 1940]
  ] },
  ww1: { title: "Första världskriget", items: [
    ["1917", 2019], ["All Quiet on the Western Front", 1930], ["All Quiet on the Western Front", 2022],
    ["Paths of Glory", 1957], ["Lawrence of Arabia", 1962], ["They Shall Not Grow Old", 2018], ["Gallipoli", 1981],
    ["Grand Illusion", 1937], ["Joyeux Noël", 2005], ["A Very Long Engagement", 2004], ["Journey's End", 2017],
    ["Sergeant York", 1941], ["The Lost Battalion", 2001], ["War Horse", 2011], ["Legends of the Fall", 1994],
    ["The African Queen", 1951], ["Johnny Got His Gun", 1971], ["The Big Parade", 1925], ["Wings", 1927],
    ["Testament of Youth", 2014], ["Frantz", 2016], ["The Water Diviner", 2014], ["Beneath Hill 60", 2010]
  ] },
  war: { title: "Fler krigsfilmer", items: [
    ["Apocalypse Now", 1979], ["Full Metal Jacket", 1987], ["Platoon", 1986], ["The Deer Hunter", 1978],
    ["The Killing Fields", 1984], ["We Were Soldiers", 2002], ["Rescue Dawn", 2006], ["Good Morning, Vietnam", 1987],
    ["Black Hawk Down", 2001], ["The Hurt Locker", 2008], ["Lone Survivor", 2013], ["Zero Dark Thirty", 2012],
    ["Jarhead", 2005], ["Beasts of No Nation", 2015], ["Waltz with Bashir", 2008], ["No Man's Land", 2001],
    ["Quo Vadis, Aida?", 2020], ["Hotel Rwanda", 2004], ["Incendies", 2010], ["A War", 2015], ["Restrepo", 2010],
    ["Tae Guk Gi: The Brotherhood of War", 2004], ["Braveheart", 1995], ["Gladiator", 2000], ["Kingdom of Heaven", 2005],
    ["Master and Commander: The Far Side of the World", 2003], ["The Last of the Mohicans", 1992], ["Glory", 1989],
    ["Gettysburg", 1993], ["Ran", 1985], ["Seven Samurai", 1954], ["Barry Lyndon", 1975], ["War and Peace", 1965],
    ["Waterloo", 1970], ["Zulu", 1964], ["The Last Samurai", 2003], ["Apocalypto", 2006], ["300", 2006], ["Troy", 2004]
  ] },
  warSeries: { title: "Krigsserier", items: [
    ["Band of Brothers", 2001, "series"], ["The Pacific", 2010, "series"], ["Generation War", 2013, "series"],
    ["The World at War", 1973, "series"], ["Apocalypse: The Second World War", 2009, "series"],
    ["Masters of the Air", 2024, "series"], ["Rome", 2005, "series"], ["Vikings", 2013, "series"],
    ["Das Boot", 2018, "series"], ["The Man in the High Castle", 2015, "series"]
  ] },

  // Regissörer – tre av dem visas per dag, de byts ut varje dygn
  kubrick: { title: "Stanley Kubrick", director: true, items: [
    ["2001: A Space Odyssey", 1968], ["A Clockwork Orange", 1971], ["Full Metal Jacket", 1987],
    ["Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", 1964], ["The Shining", 1980],
    ["Barry Lyndon", 1975], ["Paths of Glory", 1957], ["Eyes Wide Shut", 1999], ["Spartacus", 1960],
    ["The Killing", 1956], ["Lolita", 1962]
  ] },
  fincher: { title: "David Fincher", director: true, items: [
    ["Fight Club", 1999], ["Se7en", 1995], ["Zodiac", 2007], ["Gone Girl", 2014], ["The Social Network", 2010],
    ["The Game", 1997], ["The Girl with the Dragon Tattoo", 2011], ["The Curious Case of Benjamin Button", 2008],
    ["Mindhunter", 2017, "series"]
  ] },
  villeneuve: { title: "Denis Villeneuve", director: true, items: [
    ["Prisoners", 2013], ["Incendies", 2010], ["Sicario", 2015], ["Arrival", 2016], ["Blade Runner 2049", 2017],
    ["Enemy", 2013], ["Dune", 2021], ["Dune: Part Two", 2024], ["Polytechnique", 2009]
  ] },
  scorsese: { title: "Martin Scorsese", director: true, items: [
    ["Goodfellas", 1990], ["Taxi Driver", 1976], ["The Departed", 2006], ["Raging Bull", 1980], ["Casino", 1995],
    ["The Wolf of Wall Street", 2013], ["Shutter Island", 2010], ["The Irishman", 2019],
    ["Killers of the Flower Moon", 2023], ["The King of Comedy", 1982], ["The Aviator", 2004], ["Silence", 2016]
  ] },
  nolan: { title: "Christopher Nolan", director: true, items: [
    ["Memento", 2000], ["The Prestige", 2006], ["Inception", 2010], ["Interstellar", 2014], ["The Dark Knight", 2008],
    ["Oppenheimer", 2023], ["Dunkirk", 2017], ["Batman Begins", 2005], ["Insomnia", 2002], ["Tenet", 2020],
    ["The Dark Knight Rises", 2012]
  ] },
  park: { title: "Park Chan-wook", director: true, items: [
    ["Oldboy", 2003], ["The Handmaiden", 2016], ["Sympathy for Mr. Vengeance", 2002], ["Lady Vengeance", 2005],
    ["Decision to Leave", 2022], ["Joint Security Area", 2000], ["Thirst", 2009], ["Stoker", 2013]
  ] },

  korean: { title: "Koreanska thrillers", items: [
    ["Memories of Murder", 2003], ["Oldboy", 2003], ["Parasite", 2019], ["The Chaser", 2008], ["I Saw the Devil", 2010],
    ["Mother", 2009], ["The Wailing", 2016], ["Burning", 2018], ["A Bittersweet Life", 2005], ["The Yellow Sea", 2010],
    ["Train to Busan", 2016], ["Decision to Leave", 2022], ["Forgotten", 2017], ["The Man from Nowhere", 2010],
    ["New World", 2013], ["Inside Men", 2015], ["A Hard Day", 2014], ["Memoir of a Murderer", 2017],
    ["The Handmaiden", 2016], ["Joint Security Area", 2000]
  ] },
  nordic: { title: "Nordiska filmer", items: [
    ["The Hunt", 2012], ["Another Round", 2020], ["Let the Right One In", 2008], ["The Seventh Seal", 1957],
    ["Wild Strawberries", 1957], ["Fanny and Alexander", 1982], ["Persona", 1966], ["Autumn Sonata", 1978],
    ["Cries and Whispers", 1972], ["The Virgin Spring", 1960], ["Force Majeure", 2014], ["The Square", 2017],
    ["Triangle of Sadness", 2022], ["A Man Called Ove", 2015], ["The Girl with the Dragon Tattoo", 2009],
    ["Insomnia", 1997], ["Headhunters", 2011], ["The Guilty", 2018], ["Flame & Citron", 2008], ["Land of Mine", 2015],
    ["The Promised Land", 2023], ["A Royal Affair", 2012], ["Pelle the Conqueror", 1987], ["My Life as a Dog", 1985],
    ["The Worst Person in the World", 2021], ["Border", 2018], ["Kon-Tiki", 2012], ["Riders of Justice", 2020],
    ["Pusher", 1996], ["Show Me Love", 1998], ["Lilya 4-ever", 2002], ["Together", 2000], ["Max Manus", 2008],
    ["The Unknown Soldier", 2017], ["Songs from the Second Floor", 2000]
  ] },
  nordicSeries: { title: "Nordiska serier", items: [
    ["The Bridge", 2011, "series"], ["The Killing", 2007, "series"], ["Borgen", 2010, "series"],
    ["Caliphate", 2020, "series"], ["Young Royals", 2021, "series"], ["Scenes from a Marriage", 1973, "series"],
    ["Exit", 2019, "series"], ["Beforeigners", 2019, "series"], ["Bloodride", 2020, "series"]
  ] }
};
