// People and speech: the peoples of the country, their names, the languages
// spoken, and a phrase book.
//
// This is national content, not one town's. A zone says which peoples live
// in it and in what share; everything else comes from here.
//
// The phrase book holds each line in every supported language, so a line
// spoken in one language can be shown in another. Adding a language is one
// entry in LANGUAGES and one column in PHRASES; nothing else changes.
// Lines are everyday greetings and small talk. Tone marks are kept light, as
// people write them day to day.

export const LANGUAGES = Object.freeze({
  en: Object.freeze({ id: 'en', name: 'English', short: 'English' }),
  pcm: Object.freeze({ id: 'pcm', name: 'Nigerian Pidgin', short: 'Pidgin' }),
  ig: Object.freeze({ id: 'ig', name: 'Igbo', short: 'Igbo' }),
  yo: Object.freeze({ id: 'yo', name: 'Yoruba', short: 'Yoruba' }),
  ha: Object.freeze({ id: 'ha', name: 'Hausa', short: 'Hausa' }),
});
export const LANGUAGE_IDS = Object.freeze(Object.keys(LANGUAGES));

// A people: its home language (null where the phrase book has no column for
// it yet, in which case its members speak Pidgin and English here), its
// names, and the faiths its members mostly follow.
// `tongue` is the name of its own language, whether or not the phrase book has it: what a person of that people
// speaks at home. (A people whose language the phrase book does not hold talks with a stranger in Pidgin or English;
// no line is ever made up in a language the game does not know.)
const people = (id, name, language, male, female, surnames, faiths, tongue = name) => Object.freeze({ id, name, language, tongue, male: Object.freeze(male), female: Object.freeze(female), surnames: Object.freeze(surnames), faiths: Object.freeze(faiths) });

export const PEOPLES = Object.freeze({
  igbo: people('igbo', 'Igbo', 'ig',
    ['Chinedu', 'Emeka', 'Ikenna', 'Obinna', 'Chukwuma', 'Nnamdi', 'Uchenna', 'Ifeanyi', 'Kelechi', 'Chidi', 'Ebuka', 'Onyeka', 'Somto', 'Tobenna', 'Okechukwu', 'Chibuzo', 'Ugochukwu', 'Kenechukwu', 'Azubuike', 'Chijioke', 'Nonso', 'Obiora', 'Ekene', 'Chukwudi', 'Ikechukwu', 'Uzoma', 'Afam', 'Arinze', 'Ejike', 'Izuchukwu', 'Nnaemeka', 'Odinaka', 'Tochukwu', 'Zikora', 'Chimezie', 'Dubem', 'Ifechukwu', 'Jideofor', 'Munachi', 'Ogbonna', 'Nwachukwu', 'Okwudili', 'Chinonso', 'Ebube', 'Kamsi', 'Ndubuisi', 'Onyebuchi', 'Uchechukwu'],
    ['Ngozi', 'Chiamaka', 'Adaeze', 'Ifeoma', 'Nkechi', 'Ogechi', 'Chinwe', 'Uju', 'Amaka', 'Chioma', 'Nneka', 'Obiageli', 'Ebele', 'Chidinma', 'Oluchi', 'Nkiruka', 'Adanna', 'Ifunanya', 'Chinenye', 'Uchechi', 'Somadina', 'Nwanneka', 'Ukamaka', 'Ginika', 'Onyinye', 'Chizoba', 'Ezinne', 'Akunna', 'Nkem', 'Olaedo', 'Ujunwa', 'Chisom', 'Anulika', 'Njideka', 'Ogochukwu', 'Uzoamaka', 'Adaobi', 'Chinasa', 'Ebere', 'Ijeoma', 'Kosisochukwu', 'Mmesoma', 'Nwamaka', 'Obioma', 'Ozioma', 'Tobechukwu', 'Uloma', 'Zimuzo'],
    ['Okafor', 'Okeke', 'Nwosu', 'Eze', 'Nwankwo', 'Obi', 'Okoye', 'Nwabueze', 'Ezeani', 'Osakwe', 'Anyaegbu', 'Nnamani', 'Onuoha', 'Ibekwe', 'Chukwu', 'Agu', 'Nweke', 'Ezenwa', 'Okoli', 'Mbah', 'Umeh', 'Anozie', 'Ikem', 'Nzekwe', 'Obiora', 'Onyeama', 'Ugwu', 'Akabueze', 'Nwafor', 'Okpala', 'Ezeokoli', 'Onwuka', 'Aniebo', 'Emenike', 'Uzor', 'Egbuna', 'Ofoegbu', 'Nwachukwu', 'Ilozue', 'Anyanwu', 'Ezeigbo', 'Obidike', 'Okwuosa', 'Udoka', 'Chiekezie', 'Nwokolo', 'Igwe', 'Onyekwelu'],
    [['catholic', 0.6], ['anglican', 0.3], ['other', 0.1]]),
  igala: people('igala', 'Igala', null,
    ['Ojonugwa', 'Atabo', 'Enemona', 'Ocholi', 'Idoko', 'Ojochenemi', 'Akwu', 'Onuche'],
    ['Ojoma', 'Eleojo', 'Ufedo', 'Achenyo', 'Ajuma', 'Ojonoka', 'Enyo', 'Ojochide'],
    ['Ameh', 'Achimugu', 'Ocheja', 'Idakwo', 'Ejiga', 'Omale', 'Egwuda', 'Abuh'],
    [['catholic', 0.4], ['anglican', 0.25], ['muslim', 0.3], ['other', 0.05]]),
  yoruba: people('yoruba', 'Yoruba', 'yo',
    ['Adebayo', 'Olumide', 'Babatunde', 'Oluwaseun', 'Kayode', 'Femi', 'Tunde', 'Segun', 'Kunle', 'Ayodele', 'Gbenga', 'Damilare', 'Rotimi', 'Temitope', 'Adewale', 'Bolaji'],
    ['Folake', 'Yetunde', 'Bukola', 'Funmilayo', 'Omolara', 'Titilayo', 'Abimbola', 'Ronke', 'Modupe', 'Adenike', 'Temilade', 'Olabisi', 'Morenike', 'Sade', 'Kehinde', 'Taiwo'],
    ['Adeyemi', 'Ogunleye', 'Adebisi', 'Olatunji', 'Akinola', 'Balogun', 'Oyelaran', 'Ajayi', 'Odukoya', 'Afolabi', 'Oladipo', 'Bamidele', 'Adesina', 'Olaniyan', 'Oyebanji', 'Akintola'],
    [['anglican', 0.45], ['muslim', 0.3], ['catholic', 0.15], ['other', 0.1]]),
  hausa: people('hausa', 'Hausa', 'ha',
    ['Musa', 'Ibrahim', 'Abubakar', 'Sani', 'Aminu', 'Yusuf', 'Bello', 'Usman', 'Suleiman', 'Garba', 'Kabiru', 'Nasiru', 'Shehu', 'Aliyu', 'Danjuma', 'Haruna'],
    ['Aisha', 'Fatima', 'Zainab', 'Hauwa', 'Halima', 'Maryam', 'Rabi', 'Hadiza', 'Amina', 'Safiya', 'Bilkisu', 'Jamila', 'Khadija', 'Sadiya', 'Asabe', 'Ladi'],
    ['Abdullahi', 'Mohammed', 'Danladi', 'Yakubu', 'Lawal', 'Idris', 'Umar', 'Tanko', 'Shuaibu', 'Adamu', 'Ahmad', 'Isa', 'Dauda', 'Jibril', 'Maikudi', 'Gwarzo'],
    [['muslim', 0.95], ['other', 0.05]]),
  ijaw: people('ijaw', 'Ijaw (Izon)', null,
    ['Ebiowei', 'Tonye', 'Timi', 'Ebikeme', 'Tari', 'Boma', 'Seiyefa', 'Perekeme', 'Douye', 'Ebitimi'],
    ['Ebiere', 'Tariere', 'Ebiye', 'Preye', 'Ibinabo', 'Ayebatonye', 'Tamara', 'Ebimiere', 'Tonbra', 'Oyintari'],
    ['Dokubo', 'Sekibo', 'Amachree', 'Oyadonghan', 'Tebepah', 'Ogbise', 'Brisibe', 'Ekiye'],
    [['anglican', 0.5], ['catholic', 0.3], ['other', 0.2]]),
  urhobo: people('urhobo', 'Urhobo', null,
    ['Oghenekaro', 'Efe', 'Ejiro', 'Onoriode', 'Oghenetega', 'Ovie', 'Orode', 'Ufuoma'],
    ['Onome', 'Eloho', 'Efemena', 'Oghenekevwe', 'Ejiroghene', 'Akpevwe', 'Omamuyovwi', 'Rukevwe'],
    ['Akpobome', 'Edewor', 'Onojeta', 'Okpako', 'Ejovwo', 'Agbroko', 'Umukoro', 'Otobo'],
    [['catholic', 0.4], ['anglican', 0.4], ['other', 0.2]]),
  // The peoples of Delta State (added 13 October 2026). Enuani is the Igbo of the Anioma towns, and is spoken here with the phrase book's Igbo; Ika and Ukwuani are languages of their
  // own, as are Isoko and Itsekiri, and none of them is in the phrase book yet.
  enuani: people('enuani', 'Anioma (Enuani)', 'ig',
    ['Nwaka', 'Chukwuka', 'Nkem', 'Ifeanyi', 'Okwudili', 'Chiedu', 'Azuka', 'Chukwudi', 'Nnamdi', 'Emeka', 'Obi', 'Uche', 'Kenechukwu', 'Ikechukwu', 'Ndidi', 'Ogbogu'],
    ['Nwamaka', 'Nkechi', 'Ngozi', 'Azuka', 'Ebele', 'Ifeoma', 'Chinwe', 'Nneka', 'Uche', 'Ogochukwu', 'Chioma', 'Ijeoma', 'Nkiru', 'Obiageli', 'Adaku', 'Nwanne'],
    ['Okonjo', 'Nwajei', 'Odogwu', 'Mordi', 'Ogbogu', 'Nwanze', 'Ojogwu', 'Chukwura', 'Onyeobi', 'Isichei', 'Nwakobi', 'Okocha', 'Ogbemudia', 'Uzoka', 'Okolie', 'Nzekwu'],
    [['catholic', 0.55], ['anglican', 0.35], ['other', 0.1]], 'Enuani (Igbo)'),
  isoko: people('isoko', 'Isoko', null,
    ['Ogheneovo', 'Akpo', 'Efe', 'Ufuoma', 'Oghenero', 'Edafe', 'Ejiro', 'Okiemute', 'Onome', 'Otuedon'],
    ['Oghenevwogaga', 'Ese', 'Eguono', 'Onome', 'Ejiroghene', 'Oghenefejiro', 'Eruvwu', 'Ufuoma', 'Akpevwe', 'Oke'],
    ['Akpoveta', 'Ogbe', 'Esiri', 'Ofuoku', 'Abraye', 'Okpara', 'Ogiogio', 'Umukoro', 'Ekpekpe', 'Ovie'],
    [['anglican', 0.45], ['catholic', 0.35], ['other', 0.2]]),
  itsekiri: people('itsekiri', 'Itsekiri', null,
    ['Omagbemi', 'Toju', 'Ayiri', 'Omatsuli', 'Olu', 'Dore', 'Tuoyo', 'Ayo', 'Mene', 'Ebi'],
    ['Toritseju', 'Oritse', 'Ayiri', 'Temisan', 'Tsola', 'Morenike', 'Ebi', 'Oma', 'Ese', 'Tejiri'],
    ['Emiko', 'Ayomike', 'Ogbe', 'Rewane', 'Okotie', 'Eyesan', 'Uwawah', 'Omadeli', 'Arenyeka', 'Pessu'],
    [['anglican', 0.45], ['catholic', 0.35], ['other', 0.2]]),
  ika: people('ika', 'Ika', null,
    ['Chukwuka', 'Ifeanyi', 'Nnamdi', 'Okwudili', 'Ikenna', 'Uche', 'Kelechi', 'Azubuike', 'Obinna', 'Chidi'],
    ['Nkechi', 'Chinwe', 'Ifeoma', 'Nkiru', 'Ebele', 'Ngozi', 'Uju', 'Ada', 'Ogechi', 'Chioma'],
    ['Okafor', 'Odiase', 'Ehiwe', 'Ogbeide', 'Iyasere', 'Ozoemena', 'Agbonta', 'Onyemenam', 'Odili', 'Ekwueme'],
    [['catholic', 0.55], ['anglican', 0.3], ['other', 0.15]]),
  ukwuani: people('ukwuani', 'Ukwuani', null,
    ['Onyekachukwu', 'Chukwudi', 'Okwudili', 'Ifeanyi', 'Uche', 'Nwabueze', 'Obiora', 'Emeka', 'Azuka', 'Ndubuisi'],
    ['Nkem', 'Ngozi', 'Ifeoma', 'Uche', 'Chinwe', 'Nneka', 'Ogechi', 'Ebele', 'Ada', 'Ijeoma'],
    ['Okobi', 'Uti', 'Ossai', 'Onyeme', 'Nwaobi', 'Odiokwu', 'Egbo', 'Okpara', 'Ofili', 'Ukwu'],
    [['catholic', 0.5], ['anglican', 0.35], ['other', 0.15]]),
  efik: people('efik', 'Efik and Ibibio', null,
    ['Ekong', 'Effiong', 'Etim', 'Udo', 'Edet', 'Asuquo', 'Ubong', 'Aniekan', 'Okon', 'Nsikak'],
    ['Ekaette', 'Arit', 'Eno', 'Nkoyo', 'Uduak', 'Mfon', 'Idongesit', 'Emem', 'Affiong', 'Itoro'],
    ['Bassey', 'Udoh', 'Etuk', 'Essien', 'Inyang', 'Ekpo', 'Umoh', 'Archibong', 'Ita', 'Ekanem'],
    [['catholic', 0.35], ['anglican', 0.35], ['other', 0.3]]),
  edo: people('edo', 'Edo', null,
    ['Osagie', 'Osaze', 'Efosa', 'Nosa', 'Osahon', 'Eghosa', 'Uyi', 'Ehis'],
    ['Itohan', 'Eki', 'Isoken', 'Adesuwa', 'Omosede', 'Uwaila', 'Ehi', 'Osasere'],
    ['Osagiede', 'Aigbe', 'Omoregie', 'Ehigiator', 'Uwaifo', 'Okunbor', 'Ogbeide', 'Imasuen'],
    [['catholic', 0.4], ['anglican', 0.35], ['other', 0.25]]),
});

// Baptismal and English names, which many Christians go by day to day.
export const GIVEN_NAMES = Object.freeze({
  m: Object.freeze(['Emmanuel', 'Peter', 'Paul', 'John', 'Joseph', 'Michael', 'Anthony', 'Stephen', 'Daniel', 'Samuel', 'Sunday', 'Friday', 'Innocent', 'Godwin', 'Celestine', 'Augustine', 'Benedict', 'Cyprian', 'Vincent', 'Kingsley', 'Christian', 'Victor', 'Francis', 'Patrick', 'Raphael', 'Gabriel', 'Felix', 'Lawrence', 'Simon', 'Matthew', 'Clement', 'Dominic', 'Fidelis', 'Hyacinth', 'Linus', 'Marcel']),
  f: Object.freeze(['Mary', 'Blessing', 'Grace', 'Patience', 'Comfort', 'Mercy', 'Favour', 'Joy', 'Esther', 'Ruth', 'Rose', 'Theresa', 'Cecilia', 'Agnes', 'Veronica', 'Josephine', 'Gloria', 'Peace', 'Faith', 'Charity', 'Victoria', 'Catherine', 'Monica', 'Bridget', 'Felicia', 'Stella', 'Rita', 'Juliet', 'Martha', 'Lucy', 'Angela', 'Benedicta', 'Clara', 'Dorothy', 'Eucharia', 'Perpetua']),
});

export const TRAITS = Object.freeze(['cheerful', 'reserved', 'talkative', 'stern', 'generous', 'thrifty', 'devout', 'curious', 'proud', 'patient', 'quick-tempered', 'jovial', 'shy', 'industrious', 'gentle', 'shrewd']);

// --------------------------------------------------------------- phrases --
// id: [English, Pidgin, Igbo, Yoruba, Hausa]

const P = {
  morning: ['Good morning.', 'Good morning o.', 'Ụtụtụ ọma.', 'Ẹ káàárọ̀.', 'Ina kwana.'],
  morning_reply: ['Good morning. Did you sleep well?', 'Morning o. You sleep well?', 'Ụtụtụ ọma. Ị bọọla chi?', 'Ẹ káàárọ̀ o. Ṣé ẹ sùn dáadáa?', 'Lafiya lau. An tashi lafiya?'],
  afternoon: ['Good afternoon.', 'Good afternoon o.', 'Ehihie ọma.', 'Ẹ káàsán.', 'Barka da rana.'],
  evening: ['Good evening.', 'Good evening o.', 'Mgbede ọma.', 'Ẹ kúùrọ̀lẹ́.', 'Barka da yamma.'],
  night: ['Good night.', 'Good night o.', 'Ka chi fo.', 'Ó dàárọ̀.', 'Sai da safe.'],
  how_are_you: ['How are you?', 'How body?', 'Kedu ka ị mere?', 'Báwo ni?', 'Yaya dai?'],
  fine: ['I am fine, thank you.', 'I dey fine, thank you.', 'Adị m mma, daalụ.', 'Mo wà dáadáa, ẹ ṣé.', 'Lafiya lau, na gode.'],
  thank_god: ['We thank God.', 'We thank God o.', 'Anyị na-ekele Chukwu.', 'A dúpẹ́ lọ́wọ́ Ọlọ́run.', 'Mun gode wa Allah.'],
  welcome: ['You are welcome.', 'You welcome.', 'Nnọọ.', 'Ẹ káàbọ̀.', 'Barka da zuwa.'],
  family: ['How is your family?', 'How your people?', 'Kedu maka ndị ụlọ gị?', 'Báwo ni ẹbí?', 'Yaya iyali?'],
  family_well: ['They are all well.', 'Dem dey fine.', 'Ha dị mma.', 'Wọ́n wà dáadáa.', 'Suna lafiya.'],
  later: ['See you later.', 'We go see later.', 'Ka e mesịa.', 'Ó dàbọ̀.', 'Sai anjima.'],
  thanks: ['Thank you.', 'Thank you o.', 'Daalụ.', 'Ẹ ṣé.', 'Na gode.'],
  sorry: ['Sorry.', 'Sorry o.', 'Ndo.', 'Pẹ̀lẹ́.', 'Sannu.'],
  well_done: ['Well done.', 'Well done o.', 'Jisie ike.', 'Ẹ kú iṣẹ́.', 'Sannu da aiki.'],

  how_much: ['How much is this?', 'How much be this one?', 'Ego ole ka nke a bụ?', 'Èló ni èyí?', 'Nawa ne wannan?'],
  two_hundred: ['Two hundred.', 'Two hundred.', 'Narị abụọ.', 'Igba.', 'Dari biyu.'],
  too_dear: ['That is too dear. Reduce it.', 'Ah, e too cost. Reduce am.', 'Ọ dị oke ọnụ. Wedata ya.', 'Ó wọ́n jù. Ẹ dín in kù.', 'Ya yi tsada. Ka rage min.'],
  last_price: ['One hundred and fifty, last price.', 'One fifty, last price.', 'Otu narị na iri ise, nke ikpeazụ.', 'Àádọ́jọ, ìyẹn ni kẹ́yìn.', 'Dari da hamsin, na ƙarshe.'],
  take_it: ['All right, I will take it.', 'Okay, I go take am.', 'Ọ dị mma, aga m ewere ya.', 'Ó dáa, màá gbà á.', 'To, zan ɗauka.'],
  market_how: ['How is the market today?', 'How market today?', 'Kedu ka ahịa si aga taa?', 'Báwo ni ọjà lónìí?', 'Yaya kasuwa yau?'],
  market_slow: ['It is slow, but we thank God.', 'E dey slow, but we thank God.', 'Ọ na-aga nwayọọ, mana anyị na-ekele Chukwu.', 'Ó ń lọ díẹ̀díẹ̀, ṣùgbọ́n a dúpẹ́.', 'Tana tafiya a hankali, amma mun gode wa Allah.'],
  fresh_fish: ['The fish is fresh this morning.', 'The fish fresh well well this morning.', 'Azụ a dị ọhụrụ n\'ụtụtụ a.', 'Ẹja tútù ni èyí láàárọ̀ yìí.', 'Kifin nan sabo ne da safen nan.'],
  yam_farm: ['These yams came from the farm yesterday.', 'This yam come from farm yesterday.', 'Ji ndị a si n\'ugbo bịa ụnyaahụ.', 'Àwọn iṣu yìí ti oko dé lánàá.', 'Wannan doya ta zo daga gona jiya.'],

  rain_coming: ['It will rain today.', 'Rain go fall today o.', 'Mmiri ga-ezo taa.', 'Òjò máa rọ̀ lónìí.', 'Za a yi ruwa yau.'],
  rain_yes: ['Yes, the sky is darkening.', 'Na true, cloud don gather.', 'Ee, igwe na-agba ọchịchịrị.', 'Bẹ́ẹ̀ ni, ojú ọ̀run ti ṣú.', 'Eh, hadari ya taso.'],
  hot_sun: ['The sun is hot today.', 'Sun dey hot today.', 'Anwụ na-acha ọkụ taa.', 'Oòrùn mú lónìí.', 'Rana ta yi zafi yau.'],
  rain_falling: ['This rain will not stop.', 'This rain no wan stop.', 'Mmiri a agaghị akwụsị.', 'Òjò yìí kò ní dáwọ́ dúró.', 'Wannan ruwa ba zai tsaya ba.'],

  eaten: ['Have you eaten?', 'You don chop?', 'Ị riela nri?', 'Ṣé o ti jẹun?', 'Ka ci abinci?'],
  hungry: ['Not yet. I am hungry.', 'I never chop. Hunger dey catch me.', 'Mba. Agụụ na-agụ m.', 'Rárá. Ebi ń pa mí.', 'A\'a. Ina jin yunwa.'],
  lets_eat: ['Let us go and eat.', 'Make we go chop.', 'Ka anyị gaa rie nri.', 'Jẹ́ ká lọ jẹun.', 'Mu je mu ci abinci.'],

  work_how: ['How is work?', 'How work?', 'Kedu maka ọrụ?', 'Báwo ni iṣẹ́?', 'Yaya aiki?'],
  work_fine: ['Work is going well.', 'Work dey go well.', 'Ọrụ na-aga nke ọma.', 'Iṣẹ́ ń lọ dáadáa.', 'Aiki yana tafiya lafiya.'],
  no_work: ['There is no work these days.', 'Work no dey these days.', 'Ọrụ adịghị ugbu a.', 'Kò sí iṣẹ́ lásìkò yìí.', 'Babu aiki a yanzu.'],
  children_school: ['Are the children in school?', 'Your pikin dem dey school?', 'Ụmụaka gị nọ n\'ụlọ akwụkwọ?', 'Ṣé àwọn ọmọ wà ní ilé-ìwé?', 'Yara suna makaranta?'],
  children_yes: ['Yes, they went this morning.', 'Yes, dem go this morning.', 'Ee, ha gara n\'ụtụtụ a.', 'Bẹ́ẹ̀ ni, wọ́n lọ láàárọ̀ yìí.', 'Eh, sun tafi da safen nan.'],
  class_open: ['Open your books.', 'Open una book.', 'Meghee akwụkwọ unu.', 'Ẹ ṣí ìwé yín.', 'Ku buɗe littattafanku.'],
  class_yes: ['Yes, teacher.', 'Yes, teacher.', 'Ee, onye nkuzi.', 'Bẹ́ẹ̀ ni, olùkọ́.', 'To, malam.'],
  class_read: ['Read after me.', 'Read after me.', 'Soro m gụọ.', 'Ẹ kà á tẹ̀lé mi.', 'Ku karanta bayan ni.'],
  exam: ['The examination is next week.', 'Exam na next week.', 'Ule ga-abụ izu na-abịa.', 'Ìdánwò máa wáyé lọ́sẹ̀ tó ń bọ̀.', 'Jarrabawa za ta zo mako mai zuwa.'],
  study: ['Then we must read tonight.', 'Then we go read this night.', 'Mgbe ahụ anyị ga-agụ akwụkwọ n\'abalị a.', 'A jẹ́ pé a máa kàwé lálẹ́ yìí.', 'To, sai mu yi karatu yau da dare.'],

  unwell: ['I am not feeling well.', 'Body no dey fine.', 'Ahụ adịghị m mma.', 'Ara mi kò yá.', 'Ba ni da lafiya.'],
  see_doctor: ['Sorry. Go and see the doctor.', 'Sorry o. Go see doctor.', 'Ndo. Gaa hụ dọkịta.', 'Pẹ̀lẹ́. Lọ rí dókítà.', 'Sannu. Je ka ga likita.'],
  who_next: ['Who is next, please?', 'Who be next?', 'Onye na-esote?', 'Ta ló kàn?', 'Wane ne na gaba?'],
  my_turn: ['It is my turn.', 'Na my turn.', 'Ọ bụ nke m.', 'Èmi ló kàn.', 'Ni ne.'],
  medicine: ['Take this medicine after food.', 'Take this medicine after food.', 'Ṅụọ ọgwụ a mgbe i richara nri.', 'Lo oògùn yìí lẹ́yìn oúnjẹ.', 'Ka sha wannan magani bayan abinci.'],
  get_well: ['You will be well soon.', 'You go well soon.', 'Ị ga-agbake ngwa ngwa.', 'Ara rẹ á yá láìpẹ́.', 'Za ka warke da wuri.'],

  church_sunday: ['Will you come to church on Sunday?', 'You go come church Sunday?', 'Ị ga-abịa ụka n\'ụbọchị Sọnde?', 'Ṣé o máa wá sí ṣọ́ọ̀ṣì lọ́jọ́ Àìkú?', 'Za ka zo coci ranar Lahadi?'],
  church_yes: ['Yes, by God\'s grace.', 'Yes, by God grace.', 'Ee, site n\'amara Chukwu.', 'Bẹ́ẹ̀ ni, nípa oore-ọ̀fẹ́ Ọlọ́run.', 'Eh, da yardar Allah.'],
  peace: ['Peace be with you.', 'Peace be with you.', 'Udo dịrị gị.', 'Àlàáfíà fún ọ.', 'Salama a gare ka.'],
  and_also: ['And also with you.', 'And with you too.', 'Ya dịkwara gị.', 'Àti fún ìwọ náà.', 'Kai ma haka.'],
  choir: ['Choir practice is this evening.', 'Choir practice na this evening.', 'Ndị ukwe ga-amụ abụ na mgbede a.', 'Ìdánrawò ẹgbẹ́ akọrin wà ní ìrọ̀lẹ́ yìí.', 'Akwai atisayen mawaƙa da yammacin nan.'],

  where_to: ['Where are you going?', 'Where you dey go?', 'Ebee ka ị na-aga?', 'Níbo lo ń lọ?', 'Ina za ka?'],
  to_market: ['I am going to the market.', 'I dey go market.', 'Ana m aga ahịa.', 'Mo ń lọ sí ọjà.', 'Zan tafi kasuwa.'],
  to_home: ['I am going home.', 'I dey go house.', 'Ana m ala ụlọ.', 'Mo ń lọ sílé.', 'Zan tafi gida.'],
  to_farm: ['I am going to the farm.', 'I dey go farm.', 'Ana m aga ugbo.', 'Mo ń lọ sí oko.', 'Zan tafi gona.'],
  climb: ['Climb on. Hold tight.', 'Climb. Hold well o.', 'Rigoro. Jidesie ike.', 'Gùn ún. Dì í mú dáadáa.', 'Hau. Ka riƙe da kyau.'],
  fare_ask: ['How much to go there?', 'How much go reach there?', 'Ego ole ka ọ ga-abụ iru ebe ahụ?', 'Èló ni dé ibẹ̀?', 'Nawa ne zuwa can?'],
  no_okada: ['There is no okada this morning.', 'Okada no dey this morning.', 'Ọkada adịghị n\'ụtụtụ a.', 'Kò sí ọ̀kadà láàárọ̀ yìí.', 'Babu okada da safen nan.'],
  at_park: ['They are at the park. Wait a little.', 'Dem dey for park. Wait small.', 'Ha nọ na ọdụ ụgbọala. Chere ntakịrị.', 'Wọ́n wà ní gáréèjì. Dúró díẹ̀.', 'Suna tasha. Jira kaɗan.'],

  light_gone: ['The light has gone again.', 'Light don go again.', 'Ọkụ agaala ọzọ.', 'Iná ti lọ lẹ́ẹ̀kan sí i.', 'Wuta ta sake tafiya.'],
  generator: ['We will put on the generator.', 'Na generator we go on.', 'Anyị ga-amụnye jenereto.', 'A máa tan jẹnẹrétọ̀.', 'Za mu kunna janareta.'],
  water_fetch: ['Have you fetched water?', 'You don fetch water?', 'Ị kutela mmiri?', 'Ṣé o ti pọn omi?', 'Ka ɗebo ruwa?'],
  river_rising: ['The river is rising.', 'River dey rise.', 'Mmiri osimiri na-ebili.', 'Odò ń kún.', 'Kogi yana cika.'],
  play_ball: ['Let us play ball.', 'Make we play ball.', 'Ka anyị gbaa bọọlụ.', 'Jẹ́ ká gbá bọ́ọ̀lù.', 'Mu buga ƙwallo.'],
  pass_it: ['Pass it to me!', 'Pass am give me!', 'Nye m ya!', 'Gbé e fún mi!', 'Ba ni!'],
  home_time: ['It is getting late. Let us go home.', 'Time don go. Make we dey go house.', 'Chi ejiwela. Ka anyị laa.', 'Ilẹ̀ ti ń ṣú. Jẹ́ ká lọ sílé.', 'Dare ya yi. Mu tafi gida.'],
};

const COLUMN = { en: 0, pcm: 1, ig: 2, yo: 3, ha: 4 };
export const PHRASES = Object.freeze(Object.fromEntries(Object.entries(P).map(([id, row]) => [id, Object.freeze({ en: row[0], pcm: row[1], ig: row[2], yo: row[3], ha: row[4] })])));

export function phrase(id, lang) {
  const row = PHRASES[id];
  if (!row) return null;
  return row[lang] || row.en;
}

// Short exchanges between two people: who speaks (0 or 1) and which line.
// `where` says the kinds of place it belongs to; `when` narrows the time of
// day; `weather` narrows it to wet or dry.
const talk = (where, lines, more = {}) => Object.freeze({ where: Object.freeze(where), lines: Object.freeze(lines.map(Object.freeze)), ...more });
export const EXCHANGES = Object.freeze([
  talk(['any'], [[0, 'GREETING'], [1, 'morning_reply'], [0, 'thank_god']], { when: 'morning' }),
  talk(['any'], [[0, 'GREETING'], [1, 'how_are_you'], [0, 'fine']]),
  talk(['any'], [[0, 'how_are_you'], [1, 'fine'], [0, 'family'], [1, 'family_well']]),
  talk(['any'], [[0, 'GREETING'], [1, 'GREETING']]),
  talk(['street', 'home', 'market', 'park'], [[0, 'rain_coming'], [1, 'rain_yes']], { weather: 'dry' }),
  talk(['street', 'home', 'market', 'park', 'farm'], [[0, 'hot_sun'], [1, 'thank_god']], { weather: 'dry', when: 'afternoon' }),
  talk(['street', 'home', 'market', 'park'], [[0, 'rain_falling'], [1, 'sorry']], { weather: 'wet' }),
  talk(['street', 'home', 'market', 'park', 'campus'], [[0, 'eaten'], [1, 'hungry'], [0, 'lets_eat']], { when: 'afternoon' }),
  talk(['street', 'home', 'market', 'park'], [[0, 'work_how'], [1, 'work_fine']]),
  talk(['street', 'park', 'home'], [[0, 'work_how'], [1, 'no_work'], [0, 'sorry']]),
  talk(['street', 'home', 'market'], [[0, 'children_school'], [1, 'children_yes']], { when: 'morning' }),
  talk(['street', 'home'], [[0, 'light_gone'], [1, 'generator']], { when: 'evening' }),
  talk(['street', 'home'], [[0, 'water_fetch'], [1, 'later']]),
  talk(['street', 'home', 'shore'], [[0, 'where_to'], [1, 'to_market']], { when: 'morning' }),
  talk(['street', 'home', 'market'], [[0, 'where_to'], [1, 'to_home'], [0, 'later']], { when: 'evening' }),
  talk(['street', 'farm'], [[0, 'where_to'], [1, 'to_farm'], [0, 'well_done']], { when: 'morning' }),
  talk(['market'], [[0, 'how_much'], [1, 'two_hundred'], [0, 'too_dear'], [1, 'last_price'], [0, 'take_it']], { roles: ['customer', 'trader'] }),
  talk(['market'], [[0, 'how_much'], [1, 'two_hundred'], [0, 'take_it'], [1, 'thanks']], { roles: ['customer', 'trader'] }),
  talk(['market'], [[0, 'market_how'], [1, 'market_slow']]),
  talk(['market', 'shore'], [[1, 'fresh_fish'], [0, 'how_much'], [1, 'two_hundred']]),
  talk(['market', 'farm'], [[1, 'yam_farm'], [0, 'how_much'], [1, 'two_hundred'], [0, 'too_dear']]),
  talk(['shore'], [[0, 'river_rising'], [1, 'rain_yes']]),
  talk(['class'], [[0, 'class_open'], [1, 'class_yes']], { roles: ['teacher', 'pupil'] }),
  talk(['class'], [[0, 'class_read'], [1, 'class_yes']], { roles: ['teacher', 'pupil'] }),
  talk(['school', 'campus'], [[0, 'exam'], [1, 'study']]),
  talk(['school', 'play'], [[0, 'play_ball'], [1, 'pass_it']]),
  talk(['play'], [[0, 'home_time'], [1, 'later']], { when: 'evening' }),
  talk(['hospital'], [[0, 'who_next'], [1, 'my_turn']], { roles: ['staff', 'patient'] }),
  talk(['hospital'], [[1, 'unwell'], [0, 'medicine'], [0, 'get_well'], [1, 'thanks']], { roles: ['staff', 'patient'] }),
  talk(['hospital'], [[0, 'unwell'], [1, 'see_doctor']]),
  talk(['hospital'], [[0, 'how_are_you'], [1, 'unwell'], [0, 'get_well']]),
  talk(['church'], [[0, 'peace'], [1, 'and_also']]),
  talk(['church'], [[0, 'church_sunday'], [1, 'church_yes']]),
  talk(['church'], [[0, 'choir'], [1, 'church_yes']], { when: 'afternoon' }),
  talk(['park', 'street'], [[0, 'no_okada'], [1, 'at_park']], { when: 'morning' }),
  talk(['park'], [[0, 'fare_ask'], [1, 'two_hundred'], [0, 'too_dear'], [1, 'climb']], { roles: ['passenger', 'rider'] }),
  talk(['park'], [[0, 'where_to'], [1, 'to_market'], [0, 'climb']], { roles: ['rider', 'passenger'] }),
]);

// The part of the day a line of greeting belongs to.
export function dayPart(hour) {
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
}

export function greetingId(hour) {
  return dayPart(hour);
}

// The language two people talk in: the first language the speaker prefers
// that the listener also has. Offices, classrooms and consulting rooms are
// conducted in English when both have it.
export function sharedLanguage(a, b, formal = false) {
  if (formal && a.includes('en') && b.includes('en')) return 'en';
  for (const lang of a) if (b.includes(lang)) return lang;
  return 'en';
}

// ----------------------------------------------------------- translation --

const fold = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-̣ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
let phraseIndex = null;
function indexPhrases() {
  phraseIndex = new Map();
  for (const [id, row] of Object.entries(PHRASES)) for (const lang of LANGUAGE_IDS) { const key = fold(row[lang]); if (!phraseIndex.has(key)) phraseIndex.set(key, id); }
}

// Looks a line up in the phrase book. Returns the same line in another
// language, or null when the book does not have it. The original is never
// changed: a translation is something shown beside it.
export function translatePhrase(text, to) {
  if (!LANGUAGES[to]) return null;
  if (!phraseIndex) indexPhrases();
  const id = phraseIndex.get(fold(text));
  if (!id) return null;
  return { text: PHRASES[id][to], phraseId: id, source: 'phrasebook' };
}

// A translator with the phrase book in front and, optionally, a slower
// service behind it for anything the book does not hold. The service is only
// called when it is asked for by name, never on its own.
export function createTranslator({ service = null } = {}) {
  const memory = new Map();
  return {
    languages: LANGUAGES,
    lookup(text, to) { return translatePhrase(text, to); },
    get hasService() { return !!service && (!service.ready || service.ready()); },
    async request(text, from, to) {
      const quick = translatePhrase(text, to);
      if (quick) return quick;
      if (!service) return null;
      const key = `${from}>${to}:${text}`;
      if (memory.has(key)) return memory.get(key);
      const out = await service(String(text).slice(0, 200), LANGUAGES[from] ? LANGUAGES[from].name : 'the language it is written in', LANGUAGES[to].name);
      const result = out ? { text: String(out).slice(0, 300), source: 'machine' } : null;
      if (result) memory.set(key, result);
      return result;
    },
  };
}
