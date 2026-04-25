// Scripted demo timeline for the AI sales copilot demo call.
// All timings in seconds from call-start.
// Generates: transcript chunks, AI suggestions, sentiment shifts,
// intake card appearance, compliance ticks, post-call summary.

const DEMO_TIMELINE = {
  // Total scripted call duration (seconds)
  duration: 92,

  // Transcript: speaker, text, time-relative-to-call-start (sec), durationToType
  transcript: [
    { t: 1.0,  speaker: "Operator", text: "Assalomu alaykum, SQB bankka qo'ng'iroq qilganingiz uchun rahmat. Mening ismim Diyora. Sizga qanday yordam bera olaman?" },
    { t: 6.5,  speaker: "Mijoz",    text: "Salom. Men kredit kartani ochmoqchi edim, lekin foiz stavkalari haqida savollarim bor." },
    { t: 11.5, speaker: "Operator", text: "Albatta, men sizga yordam beraman. Avval ismingiz va familiyangizni ayta olasizmi?" },
    { t: 15.0, speaker: "Mijoz",    text: "Bekzod Karimov. Toshkent shahridanman." },
    { t: 18.5, speaker: "Operator", text: "Rahmat, Bekzod aka. Bizda \"Premium Plus\" kredit kartasi mavjud, yillik 24% foiz bilan." },
    { t: 24.0, speaker: "Mijoz",    text: "24% — bu juda qimmat-ku! Boshqa banklar 18-19% taklif qilyapti. Bu haqida nima deysiz?" },
    { t: 30.0, speaker: "Operator", text: "Tushunaman, Bekzod aka. Lekin bizning kartamizda 60 kunlik foizsiz davr bor — agar shu muddatda to'lasangiz, foiz umuman olinmaydi." },
    { t: 38.0, speaker: "Mijoz",    text: "Hmm, qiziq. Lekin men hali ham qaror qabul qilolmayman. O'ylab ko'rishim kerak." },
    { t: 43.0, speaker: "Operator", text: "Albatta. Yana shuni aytishim kerak — bu hafta yangi mijozlar uchun yillik to'lov bekor qilinadi va 500 000 so'mlik cashback bonus beriladi." },
    { t: 51.0, speaker: "Mijoz",    text: "Cashback qancha bo'ladi? Va qaysi xaridlarda ishlaydi?" },
    { t: 56.0, speaker: "Operator", text: "Restoran, oziq-ovqat va yoqilg'i uchun 5%, qolganlariga 1% cashback. Oylik chegara — 200 000 so'm." },
    { t: 63.5, speaker: "Mijoz",    text: "Yaxshi. Pasport ma'lumotlarimni ham aytishim kerakmi?" },
    { t: 67.0, speaker: "Operator", text: "Ha, AB 1234567, Toshkent shahar. To'g'rimi?" },
    { t: 71.0, speaker: "Mijoz",    text: "To'g'ri. Keyingi qadam nima?" },
    { t: 74.0, speaker: "Operator", text: "Men sizga ariza linkini SMS orqali yuboraman. 24 soat ichida to'ldirsangiz, bonuslar saqlanib qoladi." },
    { t: 81.0, speaker: "Mijoz",    text: "Rahmat, juda yaxshi. Kutaman." },
    { t: 84.0, speaker: "Operator", text: "Sizga yaxshi kun tilayman, Bekzod aka. SQB bankni tanlaganingiz uchun rahmat." },
  ],

  // AI suggestions appear at specific moments
  suggestions: [
    {
      t: 26.0,
      trigger: "qimmat",
      bullets: [
        "Foizsiz 60 kunlik davrni eslatib o'ting — agar shu muddatda to'lansa, foiz olinmaydi.",
        "Boshqa banklar bilan solishtiring: SQB Premium Plus kartada hech qanday yashirin to'lov yo'q.",
        "Yillik xizmat haqi bekor qilinishini taklif qiling.",
      ],
    },
    {
      t: 39.5,
      trigger: "o'ylab ko'rishim kerak",
      bullets: [
        "Cheklangan vaqtli aksiyani eslatib o'ting (cashback bonus, yillik to'lov bekor qilinadi).",
        "Agar 24 soat ichida ariza topshirilsa, premium imtiyozlar saqlanishini ayting.",
        "Mijozning asosiy ehtiyojini aniqlashga harakat qiling — bu qarorga yordam beradi.",
      ],
    },
    {
      t: 52.5,
      trigger: "cashback qancha",
      bullets: [
        "5% — restoran, oziq-ovqat, yoqilg'i. 1% — qolgan xaridlar.",
        "Oylik maksimum chegarani aniq ayting: 200 000 so'm.",
        "Bonus avtomatik tarzda kartaga qaytarilishini ta'kidlang.",
      ],
    },
  ],

  // Sentiment shifts: negative → neutral → positive
  sentimentShifts: [
    { t: 0,    sentiment: "neutral" },
    { t: 25,   sentiment: "negative" },  // "qimmat-ku!"
    { t: 44,   sentiment: "neutral" },   // ko'rib chiqyapti
    { t: 65,   sentiment: "positive" },  // pasport so'rayapti — sotib olishga yaqin
  ],

  // Intake confirmation card — appears when AI extracts customer info
  intakeAppears: 19.5,
  intakeData: {
    name: "Bekzod Karimov",
    passport: "AB 1234567",
    region: "Toshkent sh.",
  },

  // Compliance checklist — items get ticked at given times
  compliance: [
    { id: "greet",     label: "Salomlashish",          tickAt: 4 },
    { id: "intro",     label: "O'zini tanishtirish",    tickAt: 4 },
    { id: "name",      label: "Mijoz ismini olish",     tickAt: 17 },
    { id: "rate",      label: "Foiz stavkasini aytish", tickAt: 20 },
    { id: "fees",      label: "Komissiyani tushuntirish", tickAt: 32 },
    { id: "promo",     label: "Aksiyani taklif qilish",  tickAt: 45 },
    { id: "passport",  label: "Pasport tasdiqlash",     tickAt: 68 },
    { id: "next-step", label: "Keyingi qadam",          tickAt: 75 },
    { id: "farewell",  label: "Xayrlashish",            tickAt: 86 },
  ],

  // Post-call summary
  summary: {
    natija: "Mijoz Premium Plus kredit kartasini ochishga rozi bo'ldi. SMS orqali ariza linki yuborildi.",
    eтirozlar: [
      "Foiz stavkasi yuqori (24%) — boshqa banklar bilan solishtirib bahsga kirdi.",
      "Qaror qabul qilishga shoshilmaslik — vaqt so'radi.",
    ],
    eтirozlarBartaraf: "Foizsiz 60 kunlik davr va aksiyaviy cashback orqali e'tirozlar muvaffaqiyatli bartaraf etildi.",
    keyingiQadam: "24 soat ichida ariza linkini to'ldirish. Diyora ertaga 14:00 da qayta qo'ng'iroq qiladi.",
    complianceHolati: { passed: 9, total: 9 },
    callDuration: "01:32",
    sentiment: "positive",
    sentimentJourney: ["neutral", "negative", "neutral", "positive"],
  },
};

// Other agents data for supervisor view
const SUPERVISOR_AGENTS = [
  { id: "a1", name: "Diyora Saidova",   duration: 92,  sentiment: "positive", topObjection: "Yuqori foiz",       active: true,  isHero: true },
  { id: "a2", name: "Aziz Yusupov",     duration: 215, sentiment: "negative", topObjection: "Komissiya",         active: true },
  { id: "a3", name: "Madina Toshmatova", duration: 47,  sentiment: "neutral",  topObjection: "Hujjatlar",         active: true },
  { id: "a4", name: "Sherzod Karimov",  duration: 308, sentiment: "positive", topObjection: "Cashback shartlari", active: true },
  { id: "a5", name: "Nodira Ergasheva", duration: 124, sentiment: "neutral",  topObjection: "Kredit limiti",      active: true },
  { id: "a6", name: "Jasur Rahimov",    duration: 62,  sentiment: "positive", topObjection: "Ariza muddati",      active: true },
];

// Completed (past) calls — for the supervisor history view
const SUPERVISOR_HISTORY = [
  { id: "h1", name: "Diyora Saidova",    duration: 184, sentiment: "positive", topObjection: "Yuqori foiz",        endedAt: "Bugun · 14:22", outcome: "won",   complianceScore: 5 },
  { id: "h2", name: "Aziz Yusupov",      duration: 312, sentiment: "negative", topObjection: "Komissiya",          endedAt: "Bugun · 13:58", outcome: "lost",  complianceScore: 4 },
  { id: "h3", name: "Madina Toshmatova", duration: 96,  sentiment: "neutral",  topObjection: "Hujjatlar",          endedAt: "Bugun · 13:41", outcome: "callback", complianceScore: 5 },
  { id: "h4", name: "Sherzod Karimov",   duration: 422, sentiment: "positive", topObjection: "Cashback shartlari", endedAt: "Bugun · 12:15", outcome: "won",   complianceScore: 5 },
  { id: "h5", name: "Nodira Ergasheva",  duration: 73,  sentiment: "neutral",  topObjection: "Kredit limiti",      endedAt: "Bugun · 11:48", outcome: "callback", complianceScore: 3 },
  { id: "h6", name: "Jasur Rahimov",     duration: 256, sentiment: "positive", topObjection: "Ariza muddati",      endedAt: "Bugun · 11:02", outcome: "won",   complianceScore: 5 },
  { id: "h7", name: "Diyora Saidova",    duration: 148, sentiment: "negative", topObjection: "Yillik to'lov",      endedAt: "Bugun · 10:33", outcome: "lost",  complianceScore: 4 },
  { id: "h8", name: "Aziz Yusupov",      duration: 207, sentiment: "positive", topObjection: "Cashback",           endedAt: "Bugun · 09:54", outcome: "won",   complianceScore: 5 },
];

window.DEMO_TIMELINE = DEMO_TIMELINE;
window.SUPERVISOR_AGENTS = SUPERVISOR_AGENTS;
window.SUPERVISOR_HISTORY = SUPERVISOR_HISTORY;

// Incoming call queue — customers waiting to be connected
// waitTime is seconds the customer has been on hold
const CALL_QUEUE = [
  { id: "q1", maskedPhone: "+998 90 ••• 23 45", region: "Toshkent", waitTime: 12,  topic: "Premium Plus karta", priority: "vip" },
  { id: "q2", maskedPhone: "+998 91 ••• 87 12", region: "Samarqand", waitTime: 38, topic: "Ipoteka maslahat", priority: "high" },
  { id: "q3", maskedPhone: "+998 99 ••• 41 03", region: "Toshkent", waitTime: 64,  topic: "Kredit kartasi", priority: "normal" },
  { id: "q4", maskedPhone: "+998 97 ••• 19 88", region: "Buxoro",   waitTime: 92,  topic: "Hisob qoldig'i", priority: "normal" },
  { id: "q5", maskedPhone: "+998 93 ••• 55 71", region: "Farg'ona", waitTime: 145, topic: "Karta blokirovkasi", priority: "high" },
  { id: "q6", maskedPhone: "+998 90 ••• 02 19", region: "Toshkent", waitTime: 187, topic: "Cashback shartlari", priority: "normal" },
];

// Reasons for skipping a call
const SKIP_REASONS = [
  "Texnik muammo (mikrofon/garnitura)",
  "Tushlik tanaffusi",
  "Boshqa mijoz bilan keyingi qadam",
  "Tibbiy tanaffus",
  "Boshqa sabab",
];

window.CALL_QUEUE = CALL_QUEUE;
window.SKIP_REASONS = SKIP_REASONS;
