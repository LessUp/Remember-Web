function loadAdaptive() {
  try { const v = localStorage.getItem(adaptiveKey()); return v ? JSON.parse(v) : { rating: 1000, lastDiff: 'easy' }; } catch { return { rating: 1000, lastDiff: 'easy' }; }
}

function getAdaptiveAssist(diff) {
  const baseHints = HINT_LIMITS[diff] || 0;
  const r = (loadAdaptive().rating || 1000);
  let preview = Number(settings.previewSeconds ?? 0);
  let hint = baseHints;
  if (!settings.adaptive) return { previewSec: preview, hintLimit: hint };
  if (r < 940) { preview = Math.max(preview, 2); hint = Math.min(5, baseHints + 1); }
  else if (r < 1040) { preview = Math.max(preview, 1); }
  else if (r < 1140) { preview = Math.min(preview, 1); }
  else { preview = 0; hint = Math.max(0, baseHints - 1); }
  return { previewSec: preview, hintLimit: hint };
}
function saveAdaptive(a) { localStorage.setItem(adaptiveKey(), JSON.stringify(a)); }
function expectedStarsFor(diff) { return diff === 'easy' ? 4 : diff === 'medium' ? 3.5 : 3; }
function updateAdaptiveOnEnd(win, stars, diff) {
  if (!settings.adaptive) return;
  const a = loadAdaptive();
  const exp = expectedStarsFor(diff);
  const perf = win ? stars : 1.5; // 失败视作较差表现
  const k = 12;
  a.rating = Math.max(600, Math.min(1600, Math.round(a.rating + k * (perf - exp))));
  a.lastDiff = diff;
  saveAdaptive(a);
}
function decideDifficulty() {
  const a = loadAdaptive();
  const r = a.rating || 1000;
  // 简易分段，可根据需求再细化
  if (r < 920) return 'easy';
  if (r < 1080) return 'medium';
  return 'hard';
}

function loadSpaced(theme) { try { const v = localStorage.getItem(spacedKey(theme)); return v ? JSON.parse(v) : {}; } catch { return {}; } }
function saveSpaced(theme, data) { localStorage.setItem(spacedKey(theme), JSON.stringify(data)); }

function applySpacedAfterWin(theme) {
  if (!settings.spaced) return;
  const weights = loadSpaced(theme);
  // 衰减旧权重，累加本局曝光（>1 次才计为“困难”）
  for (const k of Object.keys(weights)) weights[k] = Math.max(0, weights[k] * 0.8);
  seenCountMap.forEach((cnt, v) => {
    const extra = Math.max(0, cnt - 1);
    if (extra > 0) weights[v] = (weights[v] || 0) + extra;
  });
  saveSpaced(theme, weights);
}

function pickWithSpaced(theme, pool, pairs) {
  const weights = loadSpaced(theme);
  const copy = pool.slice();
  copy.sort((a, b) => (weights[b.v] || 0) - (weights[a.v] || 0));
  const topN = Math.min(Math.floor(pairs * 0.4), copy.length);
  const picksTop = copy.slice(0, topN);
  const rest = pool.filter(x => !picksTop.some(y => y.v === x.v));
  shuffle(rest);
  const picks = [...picksTop, ...rest.slice(0, pairs - picksTop.length)];
  return picks;
}
const difficulties = { easy: { rows: 4, cols: 4, pairs: 8 }, medium: { rows: 4, cols: 5, pairs: 10 }, hard: { rows: 6, cols: 6, pairs: 18 } };
const emojiPool = ["🍎","🍌","🍇","🍓","🍒","🍉","🍑","🍍","🥝","🍋","🍊","🍐","🍈","🥥","🥕","🍅","🌽","🥦","⭐","🌙","🔥","❄️","⚡","🌈","💧","🍄","🌻","🌵","🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🦁","🐯","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🐙","🐠","🐳","🐬","🐝","🦋","🚗","✈️","🚀","🚲","🏀","⚽","🎲","🎯","🎵","🎧","🎁","🔑","🔔","💡","❤️","💎"];

let gridEl, movesEl, timeEl, bestEl, difficultyEl, newGameBtn, winModal, winStatsEl, playAgainBtn, closeModalBtn;
let ratingStarsEl;
let comboToastEl;
let pauseBtn, hintBtn, hintLeftEl, settingsBtn, pauseOverlay, resumeBtn;
let settingsModal, settingSound, settingVibrate, settingPreview, settingsCancel, settingsSave;
let shareBtn, leaderboardList, pairsLeftEl, progressBarEl, settingAccent, confettiCanvas;
let settingTheme, settingMotion, settingVolume, settingVolumeValue, settingSoundPack;
let settingLanguage;
let settingAdaptive, settingSpaced;
let settingGameMode, settingCountdownEasy, settingCountdownMedium, settingCountdownHard, countdownConfigEl;
let settingCardFace, achievementsModal, achievementsBtn, achievementsClose, achievementsList, achievementsNew;
let exportBtn, importBtn, importFile, toastEl;
let nbackBtn, nbackModal, nbackStimEl, nbackNSelect, nbackSpeedSelect, nbackLenSelect, nbackStartBtn, nbackCloseBtn;
let recallModal, recallChoicesEl, recallSkipBtn, recallSubmitBtn;
let dailyModal, dailyBtn, dailyCloseBtn, dailyStartBtn, dailyInfoEl;
let loseModal, failRetryBtn, failCloseBtn;
let statsModal, statsBtn, statsClose, statsListEl, resetDataBtn;
let guideBtn, guideModal, guideCloseBtn, guideNoShow, guideBasicsList, guideAdvancedList, guideShortcutsList, guideNoShowLabel, guideOpenHintEl;
let firstCard = null;
let secondCard = null;
let lockBoard = false;
let moves = 0;
let matchedPairs = 0;
let elapsed = 0;
let countdownLeft = 0;
let timeUp = false;
let timerId = null;
let started = false;
let currentDifficulty = "easy";
const HINT_LIMITS = { easy: 3, medium: 2, hard: 1 };
const GUIDE_KEY = 'memory_match_onboarding_v1';
let paused = false;
let hintsLeft = 0;
let isPreviewing = false;
let hintsUsed = 0;
let audioCtx = null;
const DEFAULT_SETTINGS = { sound: true, vibrate: true, previewSeconds: 1, accent: "indigo", theme: "auto", motion: "auto", volume: 0.5, soundPack: "clear", cardFace: "emoji", gameMode: "classic", countdown: { easy: 90, medium: 150, hard: 240 }, language: 'auto', adaptive: false, spaced: false };
let settings = { ...DEFAULT_SETTINGS };
let dailyActive = false;
let dailySeed = 0;
let comboCount = 0;
let maxComboThisGame = 0;
let lastMatchAt = 0;
let seenCountMap = new Map();
let lastGameValues = [];
let recallCorrectSet = new Set();
// N-back state
let nbackRunning = false;
let nbackTimer = null;
let nbackSeq = [];
let nbackIdx = 0;
let nbackStepStart = 0;
let nbackResponded = false;
let nbackTargets = 0;
let nbackHits = 0;
let nbackMisses = 0;
let nbackFalseAlarms = 0;
let nbackRtSum = 0;
let nbackRtCount = 0;

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const r = (s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
}

function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
}

function beep(f, dur, type = "sine", vol = 0.05) {
  if (!audioCtx) ensureAudio();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.value = vol;
  o.connect(g);
  g.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  o.start(now);
  o.stop(now + dur);
}

function sfx(type) {
  if (!settings.sound) return;
  const pack = settings.soundPack || 'clear';
  const typeMap = pack === 'electro' ? 'square' : (pack === 'soft' ? 'triangle' : 'sine');
  const volFactor = Math.max(0, Math.min(1, Number(settings.volume ?? 0.5)));
  if (type === "flip") beep(660, 0.06, typeMap, 0.05 * (pack === 'soft' ? 0.7 : 1) * volFactor);
  else if (type === "match") beep(880, 0.12, typeMap, 0.07 * (pack === 'soft' ? 0.7 : 1) * volFactor);
  else if (type === "mismatch") beep(220, 0.12, typeMap, 0.06 * (pack === 'soft' ? 0.7 : 1) * volFactor);
  else if (type === "win") beep(1200, 0.2, typeMap, 0.1 * (pack === 'soft' ? 0.7 : 1) * volFactor);
}

function vibrateMs(ms) {
  if (settings.vibrate && navigator.vibrate) navigator.vibrate(ms);
}

const ACCENTS = {
  indigo: { frontBg: 'bg-indigo-100', frontText: 'text-indigo-700', progressBg: 'bg-indigo-500', ring: 'ring-indigo-400' },
  emerald: { frontBg: 'bg-emerald-100', frontText: 'text-emerald-700', progressBg: 'bg-emerald-500', ring: 'ring-emerald-400' },
  rose: { frontBg: 'bg-rose-100', frontText: 'text-rose-700', progressBg: 'bg-rose-500', ring: 'ring-rose-400' },
};

const numbersPool = Array.from({ length: 40 }, (_, i) => String(i + 1));
const lettersPool = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const shapesPool = ['▲','■','●','◆','★','⬤','⬟','⬢','⬣','⬥','◼','◻','◾','◽','▣','▧','▨','✦','✧','✪','✸','✹','✤','✥','⬠','⬡'];
const colorsPool = ['#EF4444','#F97316','#F59E0B','#84CC16','#22C55E','#10B981','#06B6D4','#3B82F6','#6366F1','#8B5CF6','#A855F7','#EC4899','#F43F5E','#14B8A6','#EAB308','#0EA5E9','#4ADE80','#FB7185','#34D399','#60A5FA','#D946EF','#F59E0B','#22C55E'];

function logLifecycle(event, detail = {}) {
  try {
    console.info(`[Remember] ${event}`, detail);
  } catch (_) {
    // eslint-disable-line no-empty
  }
}

function logError(event, detail = {}) {
  try {
    console.error(`[Remember] ${event}`, detail);
  } catch (_) {
    // eslint-disable-line no-empty
  }
}

function getAccent() {
  const a = settings.accent || 'indigo';
  return ACCENTS[a] || ACCENTS.indigo;
}

function removeClasses(el, list) {
  list.forEach(c => el.classList.remove(c));
}

function applyAccentToDOM() {
  const allProgress = [
    ACCENTS.indigo.progressBg, ACCENTS.emerald.progressBg, ACCENTS.rose.progressBg
  ];
  if (progressBarEl) {
    removeClasses(progressBarEl, allProgress);
    progressBarEl.classList.add(getAccent().progressBg);
  }
  const allFrontBg = [ACCENTS.indigo.frontBg, ACCENTS.emerald.frontBg, ACCENTS.rose.frontBg];
  const allFrontText = [ACCENTS.indigo.frontText, ACCENTS.emerald.frontText, ACCENTS.rose.frontText];
  const allRings = [ACCENTS.indigo.ring, ACCENTS.emerald.ring, ACCENTS.rose.ring];
  document.querySelectorAll('.card-front').forEach(el => {
    removeClasses(el, [...allFrontBg, ...allFrontText]);
    el.classList.add(getAccent().frontBg, getAccent().frontText);
  });
  document.querySelectorAll('.card.pointer-events-none').forEach(el => {
    removeClasses(el, allRings);
    el.classList.add(getAccent().ring);
  });
}

function updateProgressUI() {
  const need = difficulties[currentDifficulty].pairs;
  const done = matchedPairs;
  if (pairsLeftEl) pairsLeftEl.textContent = String(Math.max(0, need - done));
  const pct = need > 0 ? Math.min(100, Math.round((done / need) * 100)) : 0;
  if (progressBarEl) progressBarEl.style.width = pct + '%';
}

function applyTheme() {
  const theme = settings.theme || 'auto';
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'auto' && prefersDark);
  document.documentElement.classList.toggle('dark', !!isDark);
}

function isReducedMotion() {
  const prefReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (settings.motion === 'on') return true;
  if (settings.motion === 'off') return false;
  return !!prefReduce;
}

function applyMotionPreference() {
  document.body.classList.toggle('no-anim', isReducedMotion());
}

function resizeConfettiCanvas() {
  if (!confettiCanvas) return;
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}

function runConfetti(duration = 1400) {
  if (!confettiCanvas) return;
  if (isReducedMotion()) return;
  const ctx = confettiCanvas.getContext('2d');
  resizeConfettiCanvas();
  confettiCanvas.classList.remove('hidden');
  const colors = ['#6366F1','#A78BFA','#22C55E','#F43F5E','#F59E0B','#10B981','#EF4444'];
  const N = 120;
  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * confettiCanvas.width,
    y: -20 - Math.random() * confettiCanvas.height,
    r: 4 + Math.random() * 6,
    vx: -1 + Math.random() * 2,
    vy: 2 + Math.random() * 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI,
    vr: (-0.2 + Math.random() * 0.4),
  }));
  const start = performance.now();
  function frame(t) {
    const dt = 16;
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > confettiCanvas.height + 10) { p.y = -10; p.x = Math.random() * confettiCanvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
    }
    if (t - start < duration) requestAnimationFrame(frame);
    else confettiCanvas.classList.add('hidden');
  }
  requestAnimationFrame(frame);
}

function settingsKey() { return "memory_match_settings"; }
function lbKey(k) { return `memory_match_lb_${k}`; }
function achKey() { return 'memory_match_achievements'; }
function statsKey() { return 'memory_match_stats'; }
function adaptiveKey() { return 'memory_match_adaptive'; }
function spacedKey(theme) { return `memory_match_spaced_${theme}`; }
function dailyKey(dateStr, diff) { return `memory_match_daily_${dateStr}_${diff}`; }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function seedFromDate(dateStr, diff, theme) {
  // Simple hash: sum char codes with multipliers
  let h = 2166136261;
  const s = `${dateStr}|${diff}|${theme}`;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) >>> 0, h = Math.imul(h, 16777619) >>> 0;
  return h >>> 0;
}
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
function seededShuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isCountdownMode() { return (settings.gameMode || 'classic') === 'countdown'; }
function getCountdownFor(diff) {
  const c = settings.countdown || DEFAULT_SETTINGS.countdown;
  const n = Math.max(10, Math.min(999, parseInt((c && c[diff]) || DEFAULT_SETTINGS.countdown[diff])));
  return n;
}

function loadStats() {
  try {
    const v = localStorage.getItem(statsKey());
    if (v) {
      const s = JSON.parse(v);
      return { games: 0, wins: 0, timeSum: 0, movesSum: 0, hintsSum: 0, comboSum: 0, bestCombo: 0, recallAttempts: 0, precisionSum: 0, recallSum: 0, nbackAttempts: 0, nbackAccSum: 0, nbackRtSum: 0, nbackRtCount: 0, ...s };
    }
    return { games: 0, wins: 0, timeSum: 0, movesSum: 0, hintsSum: 0, comboSum: 0, bestCombo: 0, recallAttempts: 0, precisionSum: 0, recallSum: 0, nbackAttempts: 0, nbackAccSum: 0, nbackRtSum: 0, nbackRtCount: 0 };
  } catch { return { games: 0, wins: 0, timeSum: 0, movesSum: 0, hintsSum: 0, comboSum: 0, bestCombo: 0, recallAttempts: 0, precisionSum: 0, recallSum: 0, nbackAttempts: 0, nbackAccSum: 0, nbackRtSum: 0, nbackRtCount: 0 }; }
}
function saveStats(s) { localStorage.setItem(statsKey(), JSON.stringify(s)); }
function updateStatsOnNewGame() { const s = loadStats(); s.games += 1; saveStats(s); }
function updateStatsOnWin() { const s = loadStats(); s.wins += 1; s.timeSum += elapsed; s.movesSum += moves; s.hintsSum += hintsUsed; s.comboSum = (s.comboSum || 0) + (maxComboThisGame || 0); s.bestCombo = Math.max(s.bestCombo || 0, maxComboThisGame || 0); saveStats(s); }
function formatRate(a, b) { return b > 0 ? Math.round((a / b) * 100) + '%' : '—'; }
function updateStatsUI() {
  if (!statsListEl) return;
  const s = loadStats();
  const avgTime = s.wins > 0 ? formatTime(Math.round(s.timeSum / s.wins)) : '—';
  const avgMoves = s.wins > 0 ? Math.round(s.movesSum / s.wins) : '—';
  const avgHints = s.wins > 0 ? (s.hintsSum / s.wins).toFixed(2) : '—';
  const avgCombo = s.wins > 0 ? (s.comboSum / s.wins).toFixed(2) : '—';
  const winRate = formatRate(s.wins, s.games);
  const avgPrecision = s.recallAttempts > 0 ? Math.round((s.precisionSum / s.recallAttempts) * 100) + '%' : '—';
  const avgRecall = s.recallAttempts > 0 ? Math.round((s.recallSum / s.recallAttempts) * 100) + '%' : '—';
  const avgNBackAcc = s.nbackAttempts > 0 ? Math.round((s.nbackAccSum / s.nbackAttempts) * 100) + '%' : '—';
  const avgNBackRt = s.nbackRtCount > 0 ? Math.round(s.nbackRtSum / s.nbackRtCount) + 'ms' : '—';
  statsListEl.innerHTML = [
    `<li>总局数：<span class="font-semibold">${s.games}</span></li>`,
    `<li>胜局数：<span class="font-semibold">${s.wins}</span>（胜率 ${winRate}）</li>`,
    `<li>平均用时（胜局）：<span class="font-semibold">${avgTime}</span></li>`,
    `<li>平均步数（胜局）：<span class="font-semibold">${avgMoves}</span></li>`,
    `<li>平均提示（胜局）：<span class="font-semibold">${avgHints}</span></li>`,
    `<li>平均最高连击（胜局）：<span class="font-semibold">${avgCombo}</span>，历史最佳：<span class="font-semibold">${s.bestCombo || 0}</span></li>`,
    `<li>回忆测验（${s.recallAttempts || 0} 次）精确率：<span class=\"font-semibold\">${avgPrecision}</span> · 召回率：<span class=\"font-semibold\">${avgRecall}</span></li>`,
    `<li>N-back（${s.nbackAttempts || 0} 次）平均准确率：<span class=\"font-semibold\">${avgNBackAcc}</span> · 平均反应时：<span class=\"font-semibold\">${avgNBackRt}</span></li>`,
  ].join('');
}
function openStats() {
  updateStatsUI();
  if (!statsModal) return;
  statsModal.classList.remove('hidden');
  statsModal.classList.add('flex');
}
function closeStats() {
  if (!statsModal) return;
  statsModal.classList.add('hidden');
  statsModal.classList.remove('flex');
}

function getRating(elapsedSec, movesCount, diffKey, usedHints, comboMax = 0) {
  const parTime = diffKey === 'easy' ? 60 : diffKey === 'medium' ? 120 : 180;
  const parMoves = difficulties[diffKey].pairs;
  let score = 100;
  score -= Math.min(60, (elapsedSec / parTime) * 40);
  score -= Math.max(0, (movesCount - parMoves)) * 3;
  score -= usedHints * 10;
  score += Math.min(10, (comboMax || 0) * 2);
  score = Math.max(0, Math.min(100, score));
  const stars = Math.max(1, Math.min(5, Math.ceil(score / 20)));
  return stars;
}
function renderRating(stars) {
  if (!ratingStarsEl) return;
  const filled = '⭐'.repeat(stars);
  const empty = '☆'.repeat(5 - stars);
  ratingStarsEl.textContent = filled + empty;
  ratingStarsEl.setAttribute('aria-label', `${stars} 星`);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(settingsKey());
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw);
    return {
      sound: !!s.sound,
      vibrate: !!s.vibrate,
      previewSeconds: Math.max(0, Math.min(5, parseInt(s.previewSeconds ?? 1))) || 0,
      accent: (s.accent || 'indigo'),
      theme: (s.theme || 'auto'),
      motion: (s.motion || 'auto'),
      volume: Math.max(0, Math.min(1, Number(s.volume ?? 0.5))),
      soundPack: (s.soundPack || 'clear'),
      cardFace: (s.cardFace || 'emoji'),
      gameMode: (s.gameMode || 'classic'),
      countdown: {
        easy: Math.max(10, Math.min(999, parseInt((s.countdown && s.countdown.easy) ?? DEFAULT_SETTINGS.countdown.easy))),
        medium: Math.max(10, Math.min(999, parseInt((s.countdown && s.countdown.medium) ?? DEFAULT_SETTINGS.countdown.medium))),
        hard: Math.max(10, Math.min(999, parseInt((s.countdown && s.countdown.hard) ?? DEFAULT_SETTINGS.countdown.hard))),
      },
      language: (s.language || 'auto'),
      adaptive: !!s.adaptive,
      spaced: !!s.spaced,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  localStorage.setItem(settingsKey(), JSON.stringify(s));
}

function applySettingsToUI() {
  if (!settingsModal) return;
  settingSound.checked = !!settings.sound;
  settingVibrate.checked = !!settings.vibrate;
  settingPreview.value = String(settings.previewSeconds ?? 0);
  if (settingAccent) settingAccent.value = String(settings.accent || 'indigo');
  if (settingTheme) settingTheme.value = String(settings.theme || 'auto');
  if (settingMotion) settingMotion.value = String(settings.motion || 'auto');
  if (settingVolume) settingVolume.value = String(Math.round((settings.volume ?? 0.5) * 100));
  if (settingVolumeValue) settingVolumeValue.textContent = `${settingVolume.value}%`;
  if (settingSoundPack) settingSoundPack.value = String(settings.soundPack || 'clear');
  if (settingCardFace) settingCardFace.value = String(settings.cardFace || 'emoji');
  if (settingGameMode) settingGameMode.value = String(settings.gameMode || 'classic');
  if (settingCountdownEasy) settingCountdownEasy.value = String((settings.countdown && settings.countdown.easy) || DEFAULT_SETTINGS.countdown.easy);
  if (settingCountdownMedium) settingCountdownMedium.value = String((settings.countdown && settings.countdown.medium) || DEFAULT_SETTINGS.countdown.medium);
  if (settingCountdownHard) settingCountdownHard.value = String((settings.countdown && settings.countdown.hard) || DEFAULT_SETTINGS.countdown.hard);
  if (countdownConfigEl) countdownConfigEl.classList.toggle('hidden', !isCountdownMode());
  if (settingLanguage) settingLanguage.value = String(settings.language || 'auto');
  if (settingAdaptive) settingAdaptive.checked = !!settings.adaptive;
  if (settingSpaced) settingSpaced.checked = !!settings.spaced;
}

function loadLeaderboard(k) {
  try {
    const v = localStorage.getItem(lbKey(k));
    if (!v) return [];
    const arr = JSON.parse(v);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch {
    return [];
  }
}

function saveLeaderboard(k, arr) {
  localStorage.setItem(lbKey(k), JSON.stringify(arr));
}

function updateLeaderboardUI() {
  if (!leaderboardList) return;
  const list = loadLeaderboard(currentDifficulty);
  if (!list.length) {
    leaderboardList.innerHTML = '<li class="text-slate-500">暂无记录</li>';
    return;
  }
  const html = list.map((e, i) => {
    const d = new Date(e.at || Date.now());
    const dateStr = `${d.getMonth() + 1}-${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    return `<li>${i + 1}. ${formatTime(e.time)} · ${e.moves}步 <span class="text-slate-400">• ${dateStr}</span></li>`;
  }).join("");
  leaderboardList.innerHTML = html;
}

function updateHintUI() {
  if (!hintBtn || !hintLeftEl) return;
  hintLeftEl.textContent = String(hintsLeft);
  hintBtn.disabled = hintsLeft <= 0 || paused || isPreviewing;
}

function updateControlsUI() {
  const t = i18n();
  if (pauseBtn) pauseBtn.textContent = paused ? t.resume : t.pause;
  if (pauseOverlay) {
    if (paused) { pauseOverlay.classList.remove("hidden"); pauseOverlay.classList.add("flex"); }
    else { pauseOverlay.classList.add("hidden"); pauseOverlay.classList.remove("flex"); }
  }
  updateHintUI();
}

function togglePause() {
  if (paused) resumeGame(); else pauseGame();
}

function pauseGame() {
  if (paused) return;
  paused = true;
  stopTimer();
  lockBoard = true;
  updateControlsUI();
}

function resumeGame() {
  if (!paused) return;
  paused = false;
  if (started) startTimer();
  lockBoard = false;
  updateControlsUI();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function bestKey(k) {
  return `memory_match_best_${k}`;
}

function loadBest(k) {
  try {
    const v = localStorage.getItem(bestKey(k));
    if (!v) return null;
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function saveBest(k, data) {
  localStorage.setItem(bestKey(k), JSON.stringify(data));
}

function updateBestUI() {
  const b = loadBest(currentDifficulty);
  if (!b) {
    bestEl.textContent = "—";
  } else {
    bestEl.textContent = `${formatTime(b.time)} · ${b.moves}步`;
  }
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function resetTimer() {
  stopTimer();
  elapsed = 0;
  if (isCountdownMode()) {
    countdownLeft = getCountdownFor(currentDifficulty);
    timeEl.textContent = formatTime(countdownLeft);
  } else {
    timeEl.textContent = formatTime(elapsed);
  }
}

function startTimer() {
  if (timerId) return;
  timerId = setInterval(() => {
    elapsed += 1;
    if (isCountdownMode()) {
      countdownLeft = Math.max(0, countdownLeft - 1);
      timeEl.textContent = formatTime(countdownLeft);
      if (countdownLeft <= 0) {
        stopTimer();
        onTimeUp();
        return;
      }
    } else {
      timeEl.textContent = formatTime(elapsed);
    }
  }, 1000);
}

function setGridColumns(cols) {
  gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
}

function makeCard(item) {
  const btn = document.createElement("button");
  btn.className = "relative card w-full aspect-square rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500";
  btn.dataset.value = item.v;
  btn.dataset.id = item.id;

  const inner = document.createElement("div");
  inner.className = "card-inner relative w-full h-full";

  const front = document.createElement("div");
  const ac = getAccent();
  front.className = `card-face card-front rounded-xl ${ac.frontBg} ${ac.frontText} text-2xl sm:text-3xl`;
  front.textContent = "?";

  const back = document.createElement("div");
  back.className = "card-face card-back rounded-xl bg-white text-3xl sm:text-4xl";
  if (item.type === 'color') {
    back.style.backgroundColor = item.color;
    back.textContent = '';
  } else {
    back.textContent = item.v;
  }

  inner.appendChild(front);
  inner.appendChild(back);
  btn.appendChild(inner);

  btn.addEventListener("click", () => onFlip(btn));
  return btn;
}

function resetBoardState() {
  firstCard = null;
  secondCard = null;
  lockBoard = false;
}

function onFlip(cardEl) {
  if (paused || isPreviewing) return;
  if (lockBoard) return;
  if (cardEl.classList.contains("flipped")) return;
  if (!started) {
    started = true;
    startTimer();
  }
  cardEl.classList.add("flipped");
  sfx("flip");
  if (!firstCard) {
    firstCard = cardEl;
    return;
  }
  if (cardEl === firstCard) return;
  secondCard = cardEl;
  moves += 1;
  movesEl.textContent = String(moves);
  lockBoard = true;
  // 记录曝光
  const v1 = firstCard.dataset.value;
  const v2 = secondCard.dataset.value;
  seenCountMap.set(v1, (seenCountMap.get(v1) || 0) + 1);
  seenCountMap.set(v2, (seenCountMap.get(v2) || 0) + 1);
  const match = v1 === v2;
  if (match) {
    firstCard.classList.add("pointer-events-none", "ring-2", getAccent().ring, "match-pulse");
    secondCard.classList.add("pointer-events-none", "ring-2", getAccent().ring, "match-pulse");
    matchedPairs += 1;
    sfx("match");
    vibrateMs(40);
    // combo logic
    const now = performance.now();
    if (now - lastMatchAt <= 5000) comboCount += 1; else comboCount = 1;
    lastMatchAt = now;
    if (comboCount >= 2) { maxComboThisGame = Math.max(maxComboThisGame, comboCount); showCombo(comboCount); if (settings.sound) beep(1400, 0.08, 'sine', Math.max(0.03, (settings.volume || 0.5) * 0.08)); }
    resetBoardState();
    const need = difficulties[currentDifficulty].pairs;
    updateProgressUI();
    if (matchedPairs === need) onWin();
  } else {
    sfx("mismatch");
    vibrateMs(20);
    setTimeout(() => {
      firstCard.classList.remove("flipped");
      secondCard.classList.remove("flipped");
      resetBoardState();
    }, 700);
    comboCount = 0;
  }
}

function clearGrid() {
  gridEl.innerHTML = "";
}

function initGame(diffKey) {
  if (settings.adaptive) {
    const d = decideDifficulty();
    if (difficultyEl && difficultyEl.value !== d) { difficultyEl.value = d; }
    currentDifficulty = d;
  } else {
    currentDifficulty = diffKey;
  }
  const cfg = difficulties[currentDifficulty];
  clearGrid();
  setGridColumns(cfg.cols);
  const deck = createDeck(cfg.pairs);
  deck.forEach((item, idx) => { const el = makeCard(item); el.dataset.index = String(idx); gridEl.appendChild(el); });
  lastGameValues = Array.from(new Set(deck.map(d => d.v)));
  moves = 0;
  matchedPairs = 0;
  started = false;
  resetBoardState();
  resetTimer();
  movesEl.textContent = "0";
  updateBestUI();
  const assist = getAdaptiveAssist(currentDifficulty);
  logLifecycle('init_game', {
    difficulty: currentDifficulty,
    adaptive: !!settings.adaptive,
    previewSeconds: assist.previewSec,
    hintLimit: assist.hintLimit,
  });
  hintsLeft = assist.hintLimit || 0;
  hintsUsed = 0;
  paused = false;
  isPreviewing = false;
  timeUp = false;
  seenCountMap = new Map();
  comboCount = 0;
  maxComboThisGame = 0;
  lastMatchAt = 0;
  updateControlsUI();
  updateLeaderboardUI();
  updateProgressUI();
  applyAccentToDOM();
  updateStatsOnNewGame();
  if (winModal) { winModal.classList.add("hidden"); winModal.classList.remove("flex"); }
  const prevSec = Math.max(0, Number(assist.previewSec || 0));
  if (prevSec > 0) {
    isPreviewing = true;
    lockBoard = true;
    const cards = Array.from(gridEl.querySelectorAll('.card'));
    cards.forEach(c => c.classList.add('flipped'));
    setTimeout(() => {
      cards.forEach(c => c.classList.remove('flipped'));
      isPreviewing = false;
      lockBoard = false;
      updateControlsUI();
    }, prevSec * 1000);
  }
}

function onWin() {
  stopTimer();
  const prev = loadBest(currentDifficulty);
  const curr = { time: elapsed, moves };
  let better = false;
  if (!prev) better = true; else if (curr.time < prev.time) better = true; else if (curr.time === prev.time && curr.moves < prev.moves) better = true;
  if (better) saveBest(currentDifficulty, curr);
  updateBestUI();
  winStatsEl.textContent = `用时 ${formatTime(elapsed)} · ${moves} 步`;
  const stars = getRating(elapsed, moves, currentDifficulty, hintsUsed, maxComboThisGame);
  logLifecycle('game_win', {
    difficulty: currentDifficulty,
    elapsed,
    moves,
    stars,
    hintsUsed,
    maxCombo: maxComboThisGame,
  });
  renderRating(stars);
  winModal.classList.remove("hidden");
  winModal.classList.add("flex");
  sfx("win");
  vibrateMs(120);
  updateStatsOnWin();
  updateAdaptiveOnEnd(true, getRating(elapsed, moves, currentDifficulty, hintsUsed, maxComboThisGame), currentDifficulty);
  applySpacedAfterWin(settings.cardFace || 'emoji');
  const arr = loadLeaderboard(currentDifficulty);
  const updated = [...arr, { time: elapsed, moves, at: Date.now() }]
    .sort((a, b) => (a.time - b.time) || (a.moves - b.moves))
    .slice(0, 3);
  saveLeaderboard(currentDifficulty, updated);
  updateLeaderboardUI();
  runConfetti();
  const unlocked = checkAchievementsOnWin();
  if (unlocked.length) showToast(`解锁成就 ×${unlocked.length}`);
  updateAchievementsUI();
  openRecallTest();
  // Daily complete
  if (dailyActive) {
    const key = dailyKey(todayStr(), currentDifficulty);
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ done: true, at: Date.now() })); } catch {}
    showToast('每日挑战完成');
  }
}

function onTimeUp() {
  if (timeUp) return;
  timeUp = true;
  lockBoard = true;
  paused = true;
  logLifecycle('time_up', { difficulty: currentDifficulty, elapsed, moves });
  if (loseModal) { loseModal.classList.remove('hidden'); loseModal.classList.add('flex'); }
  sfx('mismatch');
  vibrateMs(100);
  updateAdaptiveOnEnd(false, 0, currentDifficulty);
}

function closeModal() {
  winModal.classList.add("hidden");
  winModal.classList.remove("flex");
}

function shouldAutoShowGuide() {
  try {
    const val = localStorage.getItem(GUIDE_KEY);
    return !val;
  } catch {
    return true;
  }
}

function markGuideSeen() {
  try { localStorage.setItem(GUIDE_KEY, 'seen'); } catch {}
}

function openGuideModal(isAuto) {
  if (!guideModal) return;
  if (guideNoShow) guideNoShow.checked = false;
  guideModal.classList.remove('hidden');
  guideModal.classList.add('flex');
  if (isAuto) {
    markGuideSeen();
  }
}

function closeGuideModal() {
  if (!guideModal) return;
  if (guideNoShow && guideNoShow.checked) {
    try { localStorage.setItem(GUIDE_KEY, 'hidden'); } catch {}
  }
  guideModal.classList.add('hidden');
  guideModal.classList.remove('flex');
}

function maybeShowGuideOnFirstVisit() {
  if (shouldAutoShowGuide()) openGuideModal(true);
}

if (typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded", () => {
  gridEl = document.getElementById("grid");
  movesEl = document.getElementById("moves");
  timeEl = document.getElementById("time");
  bestEl = document.getElementById("best");
  difficultyEl = document.getElementById("difficulty");
  newGameBtn = document.getElementById("newGameBtn");
  winModal = document.getElementById("winModal");
  winStatsEl = document.getElementById("winStats");
  playAgainBtn = document.getElementById("playAgain");
  closeModalBtn = document.getElementById("closeModal");
  ratingStarsEl = document.getElementById("ratingStars");
  comboToastEl = document.getElementById("comboToast");
  loseModal = document.getElementById("loseModal");
  failRetryBtn = document.getElementById("failRetry");
  failCloseBtn = document.getElementById("failClose");
  pauseBtn = document.getElementById("pauseBtn");
  hintBtn = document.getElementById("hintBtn");
  hintLeftEl = document.getElementById("hintLeft");
  settingsBtn = document.getElementById("settingsBtn");
  pauseOverlay = document.getElementById("pauseOverlay");
  resumeBtn = document.getElementById("resumeBtn");
  settingsModal = document.getElementById("settingsModal");
  settingSound = document.getElementById("settingSound");
  settingVibrate = document.getElementById("settingVibrate");
  settingPreview = document.getElementById("settingPreview");
  settingAccent = document.getElementById("settingAccent");
  settingCardFace = document.getElementById("settingCardFace");
  settingTheme = document.getElementById("settingTheme");
  settingMotion = document.getElementById("settingMotion");
  settingVolume = document.getElementById("settingVolume");
  settingVolumeValue = document.getElementById("settingVolumeValue");
  settingSoundPack = document.getElementById("settingSoundPack");
  settingLanguage = document.getElementById("settingLanguage");
  settingAdaptive = document.getElementById("settingAdaptive");
  settingSpaced = document.getElementById("settingSpaced");
  settingGameMode = document.getElementById("settingGameMode");
  settingCountdownEasy = document.getElementById("settingCountdownEasy");
  settingCountdownMedium = document.getElementById("settingCountdownMedium");
  settingCountdownHard = document.getElementById("settingCountdownHard");
  countdownConfigEl = document.getElementById("countdownConfig");
  settingsCancel = document.getElementById("settingsCancel");
  settingsSave = document.getElementById("settingsSave");
  shareBtn = document.getElementById("shareBtn");
  leaderboardList = document.getElementById("leaderboardList");
  pairsLeftEl = document.getElementById("pairsLeft");
  progressBarEl = document.getElementById("progressBar");
  confettiCanvas = document.getElementById("confettiCanvas");
  dailyModal = document.getElementById("dailyModal");
  dailyBtn = document.getElementById("dailyBtn");
  dailyCloseBtn = document.getElementById("dailyClose");
  dailyStartBtn = document.getElementById("dailyStart");
  dailyInfoEl = document.getElementById("dailyInfo");
  achievementsModal = document.getElementById("achievementsModal");
  achievementsBtn = document.getElementById("achievementsBtn");
  achievementsClose = document.getElementById("achievementsClose");
  achievementsList = document.getElementById("achievementsList");
  achievementsNew = document.getElementById("achievementsNew");
  exportBtn = document.getElementById("exportBtn");
  importBtn = document.getElementById("importBtn");
  importFile = document.getElementById("importFile");
  toastEl = document.getElementById("toast");
  statsModal = document.getElementById("statsModal");
  statsBtn = document.getElementById("statsBtn");
  statsClose = document.getElementById("statsClose");
  statsListEl = document.getElementById("statsList");
  resetDataBtn = document.getElementById("resetData");
  recallModal = document.getElementById('recallModal');
  recallChoicesEl = document.getElementById('recallChoices');
  recallSkipBtn = document.getElementById('recallSkip');
  recallSubmitBtn = document.getElementById('recallSubmit');
  nbackBtn = document.getElementById('nbackBtn');
  nbackModal = document.getElementById('nbackModal');
  nbackStimEl = document.getElementById('nbackStim');
  nbackNSelect = document.getElementById('nbackNSelect');
  nbackSpeedSelect = document.getElementById('nbackSpeedSelect');
  nbackLenSelect = document.getElementById('nbackLenSelect');
  nbackStartBtn = document.getElementById('nbackStart');
  nbackCloseBtn = document.getElementById('nbackClose');
  guideBtn = document.getElementById('guideBtn');
  guideModal = document.getElementById('guideModal');
  guideCloseBtn = document.getElementById('guideClose');
  guideNoShow = document.getElementById('guideNoShow');
  guideBasicsList = document.getElementById('guideBasicsList');
  guideAdvancedList = document.getElementById('guideAdvancedList');
  guideShortcutsList = document.getElementById('guideShortcutsList');
  guideNoShowLabel = document.getElementById('guideNoShowLabel');
  guideOpenHintEl = document.getElementById('guideOpenHint');

  difficultyEl.addEventListener("change", () => initGame(difficultyEl.value));
  newGameBtn.addEventListener("click", () => initGame(difficultyEl.value));
  playAgainBtn.addEventListener("click", () => { closeModal(); initGame(difficultyEl.value); });
  closeModalBtn.addEventListener("click", closeModal);
  pauseBtn.addEventListener("click", togglePause);
  resumeBtn.addEventListener("click", resumeGame);
  if (failRetryBtn) failRetryBtn.addEventListener('click', () => { if (loseModal) { loseModal.classList.add('hidden'); loseModal.classList.remove('flex'); } initGame(difficultyEl.value); });
  if (failCloseBtn) failCloseBtn.addEventListener('click', () => { if (loseModal) { loseModal.classList.add('hidden'); loseModal.classList.remove('flex'); } });
  hintBtn.addEventListener("click", useHint);
  settingsBtn.addEventListener("click", () => { applySettingsToUI(); settingsModal.classList.remove("hidden"); settingsModal.classList.add("flex"); });
  if (guideBtn) guideBtn.addEventListener('click', () => openGuideModal(false));
  if (guideCloseBtn) guideCloseBtn.addEventListener('click', () => closeGuideModal());
  if (guideModal) guideModal.addEventListener('click', (e) => { if (e.target === guideModal) closeGuideModal(); });
  settingsCancel.addEventListener("click", () => { settingsModal.classList.add("hidden"); settingsModal.classList.remove("flex"); });
  settingsSave.addEventListener("click", () => {
    const prevCardFace = settings.cardFace;
    settings.sound = !!settingSound.checked;
    settings.vibrate = !!settingVibrate.checked;
    settings.previewSeconds = Math.max(0, Math.min(5, parseInt(settingPreview.value || "0")));
    settings.accent = (settingAccent && settingAccent.value) || 'indigo';
    settings.theme = (settingTheme && settingTheme.value) || 'auto';
    settings.motion = (settingMotion && settingMotion.value) || 'auto';
    settings.volume = Math.max(0, Math.min(1, Number((settingVolume && settingVolume.value) ? (settingVolume.value / 100) : 0.5)));
    settings.soundPack = (settingSoundPack && settingSoundPack.value) || 'clear';
    settings.cardFace = (settingCardFace && settingCardFace.value) || 'emoji';
    settings.gameMode = (settingGameMode && settingGameMode.value) || 'classic';
    settings.countdown = {
      easy: Math.max(10, Math.min(999, parseInt((settingCountdownEasy && settingCountdownEasy.value) || DEFAULT_SETTINGS.countdown.easy))),
      medium: Math.max(10, Math.min(999, parseInt((settingCountdownMedium && settingCountdownMedium.value) || DEFAULT_SETTINGS.countdown.medium))),
      hard: Math.max(10, Math.min(999, parseInt((settingCountdownHard && settingCountdownHard.value) || DEFAULT_SETTINGS.countdown.hard))),
    };
    settings.language = (settingLanguage && settingLanguage.value) || 'auto';
    settings.adaptive = !!(settingAdaptive && settingAdaptive.checked);
    settings.spaced = !!(settingSpaced && settingSpaced.checked);
    saveSettings(settings);
    applyAccentToDOM();
    applyTheme();
    applyMotionPreference();
    if (countdownConfigEl) countdownConfigEl.classList.toggle('hidden', !isCountdownMode());
    settingsModal.classList.add("hidden");
    settingsModal.classList.remove("flex");
    applyLanguage();
    initGame(difficultyEl.value);
  });
  if (settingGameMode) settingGameMode.addEventListener('change', () => { if (countdownConfigEl) countdownConfigEl.classList.toggle('hidden', !(settingGameMode.value === 'countdown')); });
  if (settingVolume) {
    settingVolume.addEventListener('input', () => {
      if (settingVolumeValue) settingVolumeValue.textContent = `${settingVolume.value}%`;
    });
  }
  shareBtn.addEventListener("click", async () => {
    const text = `记忆翻牌 | 难度 ${difficultyEl.options[difficultyEl.selectedIndex].text} | 用时 ${formatTime(elapsed)} | 步数 ${moves}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "记忆翻牌成绩", text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        alert("已复制到剪贴板");
      } else {
        alert(text);
      }
    } catch {}
  });
  achievementsBtn.addEventListener('click', () => { openAchievements(); });
  achievementsClose.addEventListener('click', () => { if (!achievementsModal) return; achievementsModal.classList.add('hidden'); achievementsModal.classList.remove('flex'); achievementsNew?.classList.add('hidden'); });
  if (dailyBtn) dailyBtn.addEventListener('click', () => {
    if (dailyInfoEl) {
      const date = todayStr();
      const key = dailyKey(date, difficultyEl.value);
      let status = '未完成';
      try { const v = localStorage.getItem(key); if (v) status = '已完成'; } catch {}
      dailyInfoEl.textContent = `今日 ${date} · 难度：${difficultyEl.options[difficultyEl.selectedIndex].text} · 状态：${status}`;
    }
    if (dailyModal) { dailyModal.classList.remove('hidden'); dailyModal.classList.add('flex'); }
  });
  if (dailyCloseBtn) dailyCloseBtn.addEventListener('click', () => { if (dailyModal) { dailyModal.classList.add('hidden'); dailyModal.classList.remove('flex'); } });
  if (dailyStartBtn) dailyStartBtn.addEventListener('click', () => {
    dailyActive = true;
    dailySeed = seedFromDate(todayStr(), difficultyEl.value, settings.cardFace || 'emoji');
    if (dailyModal) { dailyModal.classList.add('hidden'); dailyModal.classList.remove('flex'); }
    showToast('已开启今日挑战');
    initGame(difficultyEl.value);
  });
  if (statsBtn) statsBtn.addEventListener('click', openStats);
  if (statsClose) statsClose.addEventListener('click', closeStats);
  if (nbackBtn) nbackBtn.addEventListener('click', () => { if (nbackModal) { nbackModal.classList.remove('hidden'); nbackModal.classList.add('flex'); } });
  if (nbackCloseBtn) nbackCloseBtn.addEventListener('click', () => { if (!nbackModal) return; if (nbackRunning) stopNBack(); nbackModal.classList.add('hidden'); nbackModal.classList.remove('flex'); });
  if (nbackStartBtn) nbackStartBtn.addEventListener('click', () => { if (nbackRunning) stopNBack(); else startNBack(); });
  if (resetDataBtn) resetDataBtn.addEventListener('click', () => {
    if (!confirm('确定清空本地所有成绩与设置吗？该操作不可恢复。')) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.forEach(k => { if (k && k.startsWith('memory_match_')) localStorage.removeItem(k); });
    // 也清理 best_* 兼容旧键（若存在）
    keys.forEach(k => { if (k && k.startsWith('memory_match_best_')) localStorage.removeItem(k); });
    location.reload();
  });
  exportBtn.addEventListener('click', exportData);
  importBtn.addEventListener('click', () => importFile && importFile.click());
  importFile.addEventListener('change', async () => {
    const f = importFile.files && importFile.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const obj = JSON.parse(text);
      importDataFromObj(obj);
      showToast('导入成功');
    } catch { showToast('导入失败'); }
    finally { importFile.value = ''; }
  });
  document.addEventListener("keydown", handleKeyDown);
  if (recallSkipBtn) recallSkipBtn.addEventListener('click', () => { if (recallModal) { recallModal.classList.add('hidden'); recallModal.classList.remove('flex'); } });
  if (recallSubmitBtn) recallSubmitBtn.addEventListener('click', submitRecallTest);

  settings = loadSettings();
  applyAccentToDOM();
  applyTheme();
  applyMotionPreference();
  updateProgressUI();
  updateStatsUI();
  applyLanguage();
  maybeShowGuideOnFirstVisit();
  window.addEventListener('resize', resizeConfettiCanvas);
  const mqlDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mqlDark && mqlDark.addEventListener) mqlDark.addEventListener('change', () => { if ((settings.theme || 'auto') === 'auto') applyTheme(); });
  const mqlReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (mqlReduce && mqlReduce.addEventListener) mqlReduce.addEventListener('change', () => { if ((settings.motion || 'auto') === 'auto') applyMotionPreference(); });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => logLifecycle('service_worker_registered', { scope: reg.scope }))
      .catch((err) => logError('service_worker_registration_failed', { message: err?.message }));
  }

  initGame(currentDifficulty);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadAdaptive,
    getAdaptiveAssist,
    saveAdaptive,
    updateAdaptiveOnEnd,
    decideDifficulty,
    shouldAutoShowGuide,
    markGuideSeen,
    adaptiveKey,
    DEFAULT_SETTINGS,
    __setSettings(partial) {
      if (!partial || typeof partial !== 'object') return;
      Object.assign(settings, partial);
    },
    __getSettings() {
      return { ...settings };
    },
  };
}

function startNBack() {
  if (!nbackModal || !nbackStimEl) return;
  const N = Math.max(1, parseInt(nbackNSelect.value || '2'));
  const L = Math.max(N + 5, parseInt(nbackLenSelect.value || '20'));
  const speed = Math.max(500, parseInt(nbackSpeedSelect.value || '900'));
  const pool = emojiPool.slice();
  nbackSeq = Array.from({ length: L }, () => pool[Math.floor(Math.random()*pool.length)]);
  nbackIdx = -1;
  nbackTargets = 0; nbackHits = 0; nbackMisses = 0; nbackFalseAlarms = 0; nbackRtSum = 0; nbackRtCount = 0;
  nbackRunning = true;
  if (nbackStartBtn) nbackStartBtn.textContent = i18n().nbackStop;
  tickNBack(N, speed);
}

function stopNBack() {
  nbackRunning = false;
  if (nbackTimer) { clearInterval(nbackTimer); nbackTimer = null; }
  if (nbackStartBtn) nbackStartBtn.textContent = i18n().nbackStart;
}

function tickNBack(N, speed) {
  if (nbackTimer) { clearInterval(nbackTimer); nbackTimer = null; }
  const period = speed;
  nbackTimer = setInterval(() => {
    // 统计上一拍漏报
    if (nbackIdx >= N) {
      const targetPrev = nbackSeq[nbackIdx] === nbackSeq[nbackIdx - N];
      if (targetPrev && !nbackResponded) nbackMisses++;
    }
    // 前进到下一拍
    nbackIdx += 1;
    if (nbackIdx >= nbackSeq.length) { finishNBack(); return; }
    const stim = nbackSeq[nbackIdx];
    if (nbackStimEl) nbackStimEl.textContent = stim;
    nbackResponded = false;
    nbackStepStart = performance.now();
    if (nbackIdx >= N && nbackSeq[nbackIdx] === nbackSeq[nbackIdx - N]) nbackTargets++;
  }, period);
}

function onNBackKey() {
  if (!nbackRunning) return;
  if (nbackResponded) return;
  nbackResponded = true;
  const rt = Math.max(0, Math.round(performance.now() - nbackStepStart));
  const N = Math.max(1, parseInt(nbackNSelect.value || '2'));
  const isTarget = nbackIdx >= N && nbackSeq[nbackIdx] === nbackSeq[nbackIdx - N];
  if (isTarget) { nbackHits++; nbackRtSum += rt; nbackRtCount++; sfx('match'); }
  else { nbackFalseAlarms++; sfx('mismatch'); }
}

function finishNBack() {
  stopNBack();
  const targets = nbackTargets;
  let acc;
  if (targets > 0) acc = nbackHits / targets; else acc = 1 - (nbackFalseAlarms / Math.max(1, nbackSeq.length));
  const avgRt = nbackRtCount > 0 ? Math.round(nbackRtSum / nbackRtCount) : 0;
  const s = loadStats();
  s.nbackAttempts = (s.nbackAttempts || 0) + 1;
  s.nbackAccSum = (s.nbackAccSum || 0) + acc;
  if (nbackRtCount > 0) { s.nbackRtSum = (s.nbackRtSum || 0) + nbackRtSum; s.nbackRtCount = (s.nbackRtCount || 0) + nbackRtCount; }
  saveStats(s);
  updateStatsUI();
  showToast(`N-back 结果 · 准确率 ${Math.round(acc*100)}%${nbackRtCount>0?` · 平均RT ${avgRt}ms`:''}`);
}

function openRecallTest() {
  if (!recallModal || !recallChoicesEl) return;
  const theme = settings.cardFace || 'emoji';
  const pool = getPoolForTheme(theme).map(x => x.v);
  const truth = [...new Set(lastGameValues)];
  // 构造 6 真 + 3 伪（若不足则按可用数量）
  const trueCount = Math.min(6, truth.length);
  const falseCandidates = pool.filter(v => !truth.includes(v));
  shuffle(truth);
  shuffle(falseCandidates);
  const trues = truth.slice(0, trueCount);
  const falses = falseCandidates.slice(0, Math.max(0, 9 - trueCount));
  const items = [...trues.map(v => ({ v, correct: true })), ...falses.map(v => ({ v, correct: false }))];
  shuffle(items);
  recallCorrectSet = new Set(trues);
  // 渲染
  recallChoicesEl.innerHTML = items.map((it, i) => {
    if (theme === 'colors') {
      return `<label class="flex items-center gap-2 border rounded-md p-2"><input type="checkbox" data-v="${it.v}" class="h-4 w-4"/><span class="inline-block w-6 h-6 rounded" style="background:${it.v}"></span></label>`;
    } else {
      return `<label class="flex items-center gap-2 border rounded-md p-2"><input type="checkbox" data-v="${it.v}" class="h-4 w-4"/><span class="text-xl">${it.v}</span></label>`;
    }
  }).join('');
  recallModal.classList.remove('hidden');
  recallModal.classList.add('flex');
}

function submitRecallTest() {
  if (!recallModal || !recallChoicesEl) return;
  const checks = Array.from(recallChoicesEl.querySelectorAll('input[type="checkbox"][data-v]'));
  const selected = new Set(checks.filter(c => c.checked).map(c => c.getAttribute('data-v')));
  let tp = 0, fp = 0, fn = 0;
  recallCorrectSet.forEach(v => { if (selected.has(v)) tp++; else fn++; });
  selected.forEach(v => { if (!recallCorrectSet.has(v)) fp++; });
  const prec = tp + fp > 0 ? tp / (tp + fp) : 1;
  const rec = tp + fn > 0 ? tp / (tp + fn) : 0;
  const s = loadStats();
  s.recallAttempts = (s.recallAttempts || 0) + 1;
  s.precisionSum = (s.precisionSum || 0) + prec;
  s.recallSum = (s.recallSum || 0) + rec;
  saveStats(s);
  updateStatsUI();
  showToast(`回忆测验 · 精确率 ${Math.round(prec*100)}% · 召回率 ${Math.round(rec*100)}%`);
  recallModal.classList.add('hidden');
  recallModal.classList.remove('flex');
}

function currentLang() {
  const pref = settings.language || 'auto';
  if (pref === 'zh') return 'zh';
  if (pref === 'en') return 'en';
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

function i18n() {
  const lang = currentLang();
  const dict = {
      zh: {
        pageTitle: '记忆力训练 · 翻牌配对', pageSubtitle: '选择难度，开始翻牌配对训练记忆。完成后将记录你的最佳成绩。',
        difficultyLabel: '难度', difficultyEasy: '简单 4×4', difficultyMedium: '中等 4×5', difficultyHard: '困难 6×6',
        leaderboardTitle: '排行榜（当前难度）',
        timeLabel: '用时', movesLabel: '步数', bestLabel: '最佳',
        newGame: '开始/重开', pause: '暂停', resume: '继续', hint: '提示', settings: '设置', achievements: '成就', stats: '统计', daily: '每日',
        winTitle: '太棒了！全部配对完成', share: '分享战绩', back: '返回', playAgain: '再来一局',
        loseTitle: '时间到，挑战失败', loseDesc: '可在设置中调整“限时时长”，或重试本局。', retry: '重试',
        statsTitle: '统计', achievementsTitle: '成就', dailyTitle: '每日挑战', close: '关闭', dailyStart: '开始挑战', today: '今日', difficulty: '难度', status: '状态', completed: '已完成', notCompleted: '未完成',
        settingsTitle: '设置',
        settingSound: '声音', settingVibrate: '震动', settingPreview: '开局预览秒数',
        settingAccent: '主题色', accentIndigo: '靛蓝', accentEmerald: '翡翠绿', accentRose: '玫瑰红',
        settingTheme: '暗色模式', themeAuto: '自动', themeLight: '浅色', themeDark: '深色',
        settingMotion: '减少动画', motionAuto: '自动', motionOn: '开启', motionOff: '关闭',
        settingVolume: '音量', settingSoundPack: '音效风格', soundPackClear: '清亮', soundPackElectro: '电子', soundPackSoft: '柔和',
        settingAdaptive: '自适应训练', settingSpaced: '间隔复现（易错卡）',
        settingLanguage: '语言', languageAuto: '自动', languageZh: '中文', languageEn: 'English',
        settingGameMode: '玩法', gameModeClassic: '经典', gameModeCountdown: '限时',
        countdownEasy: '简单(s)', countdownMedium: '中等(s)', countdownHard: '困难(s)',
        settingCardFace: '卡面主题', cardFaceEmoji: 'Emoji', cardFaceNumbers: '数字', cardFaceLetters: '字母', cardFaceShapes: '形状', cardFaceColors: '颜色',
        backupLabel: '数据备份', export: '导出', import: '导入', resetData: '重置数据', settingsCancel: '取消', settingsSave: '保存',
        recallTitle: '回忆测验', recallDesc: '请从下列选项中勾选本局中出现过的卡面。', recallSkip: '跳过', recallSubmit: '提交',
        nback: 'N-back', nbackTitle: 'N-back 训练', nbackNLabel: 'N 值', nbackSpeedLabel: '节奏(ms)', nbackLenLabel: '长度', nbackHint: '按 J 判定“与 N 步前相同”', nbackStart: '开始', nbackClose: '关闭', nbackStop: '停止',
        guide: '指南', guideTitle: '快速上手指南', guideIntro: '第一次游玩？按照下面的步骤开始训练。',
      guideBasicsTitle: '基础操作', guideBasics: [
        '选择上方的难度后，点击“开始/重开”或按 N 开局。',
        '翻开两张相同的卡片即可配对成功，配对后会自动锁定。',
        '提示按钮（或按 H）可暂时展示一对卡片，每局数量有限。'
      ],
      guideAdvancedTitle: '进阶技巧', guideAdvanced: [
        '在设置中启用“限时模式”，感受倒计时压力训练反应。',
        '每日挑战为所有玩家提供相同牌组，比较谁更快完成。',
        '通关后可查看星级表现、回忆测验与统计面板，帮助复盘。'
      ],
      guideShortcutsTitle: '常用快捷键', guideShortcuts: [
        { key: 'N', desc: '新开一局（保持当前难度）' },
        { key: 'P', desc: '暂停 / 继续当前局' },
        { key: 'H', desc: '使用提示（若仍有次数）' },
        { key: '方向键 + 回车/空格', desc: '使用键盘导航并翻牌' },
        { key: 'J', desc: '在 N-back 模式中判定匹配' }
      ],
      guideNoShow: '下次不再显示', guideOpenHint: '随时可点击上方“指南”查看', guideClose: '开始训练',
    },
      en: {
        pageTitle: 'Memory Training · Card Match', pageSubtitle: 'Pick a difficulty and start matching cards. Your best runs are recorded.',
        difficultyLabel: 'Difficulty', difficultyEasy: 'Easy 4×4', difficultyMedium: 'Medium 4×5', difficultyHard: 'Hard 6×6',
        leaderboardTitle: 'Leaderboard (current difficulty)',
        timeLabel: 'Time', movesLabel: 'Moves', bestLabel: 'Best',
        newGame: 'New/Restart', pause: 'Pause', resume: 'Resume', hint: 'Hint', settings: 'Settings', achievements: 'Achievements', stats: 'Stats', daily: 'Daily',
        winTitle: 'Great! All matched', share: 'Share', back: 'Back', playAgain: 'Play Again',
        loseTitle: 'Time Up', loseDesc: 'You can adjust countdown in Settings or retry this round.', retry: 'Retry',
        statsTitle: 'Statistics', achievementsTitle: 'Achievements', dailyTitle: 'Daily Challenge', close: 'Close', dailyStart: 'Start', today: 'Today', difficulty: 'Difficulty', status: 'Status', completed: 'Completed', notCompleted: 'Not Completed',
        settingsTitle: 'Settings',
        settingSound: 'Sound', settingVibrate: 'Vibration', settingPreview: 'Preview seconds',
        settingAccent: 'Accent color', accentIndigo: 'Indigo', accentEmerald: 'Emerald', accentRose: 'Rose',
        settingTheme: 'Theme mode', themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark',
        settingMotion: 'Motion', motionAuto: 'Auto', motionOn: 'On', motionOff: 'Off',
        settingVolume: 'Volume', settingSoundPack: 'Sound pack', soundPackClear: 'Clear', soundPackElectro: 'Electro', soundPackSoft: 'Soft',
        settingAdaptive: 'Adaptive assist', settingSpaced: 'Spaced reinforcement',
        settingLanguage: 'Language', languageAuto: 'Auto', languageZh: 'Chinese', languageEn: 'English',
        settingGameMode: 'Mode', gameModeClassic: 'Classic', gameModeCountdown: 'Countdown',
        countdownEasy: 'Easy (s)', countdownMedium: 'Medium (s)', countdownHard: 'Hard (s)',
        settingCardFace: 'Card face', cardFaceEmoji: 'Emoji', cardFaceNumbers: 'Numbers', cardFaceLetters: 'Letters', cardFaceShapes: 'Shapes', cardFaceColors: 'Colors',
        backupLabel: 'Backup', export: 'Export', import: 'Import', resetData: 'Reset data', settingsCancel: 'Cancel', settingsSave: 'Save',
        recallTitle: 'Recall Test', recallDesc: 'Please select all items that appeared this round.', recallSkip: 'Skip', recallSubmit: 'Submit',
        nback: 'N-back', nbackTitle: 'N-back Training', nbackNLabel: 'N', nbackSpeedLabel: 'Pace(ms)', nbackLenLabel: 'Length', nbackHint: 'Press J when it matches N-back', nbackStart: 'Start', nbackClose: 'Close', nbackStop: 'Stop',
        guide: 'Guide', guideTitle: 'Quick Start Guide', guideIntro: 'New here? Follow these steps to begin your training.',
      guideBasicsTitle: 'Basics', guideBasics: [
        'Pick a difficulty on the toolbar, then click “New/Restart” or press N.',
        'Flip two matching cards to lock them in. Clear all pairs to win.',
        'Use the hint button (or press H) to briefly reveal a pair. Hints are limited each round.'
      ],
      guideAdvancedTitle: 'Pro Tips', guideAdvanced: [
        'Enable Countdown mode in Settings to practice under time pressure.',
        'Daily Challenge shares the same deck for everyone—compare progress with friends.',
        'After finishing a round, review your stars, recall test, and stats to reflect on performance.'
      ],
      guideShortcutsTitle: 'Shortcuts', guideShortcuts: [
        { key: 'N', desc: 'Start a new round (keep current difficulty)' },
        { key: 'P', desc: 'Pause / resume the round' },
        { key: 'H', desc: 'Use a hint (when available)' },
        { key: 'Arrows + Enter/Space', desc: 'Navigate cards with keyboard and flip' },
        { key: 'J', desc: 'Mark a match during N-back mode' }
      ],
      guideNoShow: 'Don’t show again', guideOpenHint: 'You can reopen the guide anytime from the toolbar', guideClose: 'Start training',
    }
  };
  return dict[lang];
}

  function applyLanguage() {
    const t = i18n();
    const pageTitleEl = document.getElementById('pageTitle'); if (pageTitleEl) pageTitleEl.textContent = t.pageTitle;
    const pageSubtitleEl = document.getElementById('pageSubtitle'); if (pageSubtitleEl) pageSubtitleEl.textContent = t.pageSubtitle;
    const difficultyLabelEl = document.getElementById('difficultyLabel'); if (difficultyLabelEl) difficultyLabelEl.textContent = t.difficultyLabel;
    const difficultyEasyEl = document.getElementById('difficultyEasy'); if (difficultyEasyEl) difficultyEasyEl.textContent = t.difficultyEasy;
    const difficultyMediumEl = document.getElementById('difficultyMedium'); if (difficultyMediumEl) difficultyMediumEl.textContent = t.difficultyMedium;
    const difficultyHardEl = document.getElementById('difficultyHard'); if (difficultyHardEl) difficultyHardEl.textContent = t.difficultyHard;
    const timeLabelEl = document.getElementById('timeLabel'); if (timeLabelEl) timeLabelEl.textContent = t.timeLabel;
    const movesLabelEl = document.getElementById('movesLabel'); if (movesLabelEl) movesLabelEl.textContent = t.movesLabel;
    const bestLabelEl = document.getElementById('bestLabel'); if (bestLabelEl) bestLabelEl.textContent = t.bestLabel;
    const leaderboardTitleEl = document.getElementById('leaderboardTitle'); if (leaderboardTitleEl) leaderboardTitleEl.textContent = t.leaderboardTitle;
    const winTitleEl = document.getElementById('winTitle'); if (winTitleEl) winTitleEl.textContent = t.winTitle;
    const loseTitleEl = document.getElementById('loseTitle'); if (loseTitleEl) loseTitleEl.textContent = t.loseTitle;
    const loseDescEl = document.getElementById('loseDesc'); if (loseDescEl) loseDescEl.textContent = t.loseDesc;
    const statsTitleEl = document.getElementById('statsTitle'); if (statsTitleEl) statsTitleEl.textContent = t.statsTitle;
    const achievementsTitleEl = document.getElementById('achievementsTitle'); if (achievementsTitleEl) achievementsTitleEl.textContent = t.achievementsTitle;
    const dailyTitleEl = document.getElementById('dailyTitle'); if (dailyTitleEl) dailyTitleEl.textContent = t.dailyTitle;
    const settingsTitleEl = document.getElementById('settingsTitle'); if (settingsTitleEl) settingsTitleEl.textContent = t.settingsTitle;
    const recallTitleEl = document.getElementById('recallTitle'); if (recallTitleEl) recallTitleEl.textContent = t.recallTitle;
    const recallDescEl = document.getElementById('recallDesc'); if (recallDescEl) recallDescEl.textContent = t.recallDesc;
    const recallSkip = document.getElementById('recallSkip'); if (recallSkip) recallSkip.textContent = t.recallSkip;
  const recallSubmit = document.getElementById('recallSubmit'); if (recallSubmit) recallSubmit.textContent = t.recallSubmit;
  const nbackTitle = document.getElementById('nbackTitle'); if (nbackTitle) nbackTitle.textContent = t.nbackTitle;
  const nbackNLabel = document.getElementById('nbackNLabel'); if (nbackNLabel) nbackNLabel.textContent = t.nbackNLabel;
  const nbackSpeedLabel = document.getElementById('nbackSpeedLabel'); if (nbackSpeedLabel) nbackSpeedLabel.textContent = t.nbackSpeedLabel;
  const nbackLenLabel = document.getElementById('nbackLenLabel'); if (nbackLenLabel) nbackLenLabel.textContent = t.nbackLenLabel;
  const nbackHint = document.getElementById('nbackHint'); if (nbackHint) nbackHint.textContent = t.nbackHint;
  if (nbackStartBtn) nbackStartBtn.textContent = t.nbackStart;
  if (nbackCloseBtn) nbackCloseBtn.textContent = t.nbackClose;
  if (newGameBtn) newGameBtn.textContent = t.newGame;
  if (settingsBtn) settingsBtn.textContent = t.settings;
  if (achievementsBtn) achievementsBtn.textContent = t.achievements;
  if (statsBtn) statsBtn.textContent = t.stats;
  if (dailyBtn) dailyBtn.textContent = t.daily;
  const nbackBtnEl = document.getElementById('nbackBtn'); if (nbackBtnEl) nbackBtnEl.textContent = t.nback;
  if (playAgainBtn) playAgainBtn.textContent = t.playAgain;
  if (shareBtn) shareBtn.textContent = t.share;
  if (closeModalBtn) closeModalBtn.textContent = t.back;
  if (resumeBtn) resumeBtn.textContent = t.resume;
  if (failRetryBtn) failRetryBtn.textContent = t.retry;
  if (failCloseBtn) failCloseBtn.textContent = t.back;
    if (achievementsClose) achievementsClose.textContent = t.close;
    if (statsClose) statsClose.textContent = t.close;
    if (dailyCloseBtn) dailyCloseBtn.textContent = t.close;
    if (dailyStartBtn) dailyStartBtn.textContent = t.dailyStart;
    const settingsSoundLabelEl = document.getElementById('settingSoundLabel'); if (settingsSoundLabelEl) settingsSoundLabelEl.textContent = t.settingSound;
    const settingsVibrateLabelEl = document.getElementById('settingVibrateLabel'); if (settingsVibrateLabelEl) settingsVibrateLabelEl.textContent = t.settingVibrate;
    const settingsPreviewLabelEl = document.getElementById('settingPreviewLabel'); if (settingsPreviewLabelEl) settingsPreviewLabelEl.textContent = t.settingPreview;
    const settingsAccentLabelEl = document.getElementById('settingAccentLabel'); if (settingsAccentLabelEl) settingsAccentLabelEl.textContent = t.settingAccent;
    const accentIndigoEl = document.getElementById('accentIndigo'); if (accentIndigoEl) accentIndigoEl.textContent = t.accentIndigo;
    const accentEmeraldEl = document.getElementById('accentEmerald'); if (accentEmeraldEl) accentEmeraldEl.textContent = t.accentEmerald;
    const accentRoseEl = document.getElementById('accentRose'); if (accentRoseEl) accentRoseEl.textContent = t.accentRose;
    const settingsThemeLabelEl = document.getElementById('settingThemeLabel'); if (settingsThemeLabelEl) settingsThemeLabelEl.textContent = t.settingTheme;
    const themeAutoEl = document.getElementById('themeAuto'); if (themeAutoEl) themeAutoEl.textContent = t.themeAuto;
    const themeLightEl = document.getElementById('themeLight'); if (themeLightEl) themeLightEl.textContent = t.themeLight;
    const themeDarkEl = document.getElementById('themeDark'); if (themeDarkEl) themeDarkEl.textContent = t.themeDark;
    const settingsMotionLabelEl = document.getElementById('settingMotionLabel'); if (settingsMotionLabelEl) settingsMotionLabelEl.textContent = t.settingMotion;
    const motionAutoEl = document.getElementById('motionAuto'); if (motionAutoEl) motionAutoEl.textContent = t.motionAuto;
    const motionOnEl = document.getElementById('motionOn'); if (motionOnEl) motionOnEl.textContent = t.motionOn;
    const motionOffEl = document.getElementById('motionOff'); if (motionOffEl) motionOffEl.textContent = t.motionOff;
    const settingsVolumeLabelEl = document.getElementById('settingVolumeLabel'); if (settingsVolumeLabelEl) settingsVolumeLabelEl.textContent = t.settingVolume;
    const settingsSoundPackLabelEl = document.getElementById('settingSoundPackLabel'); if (settingsSoundPackLabelEl) settingsSoundPackLabelEl.textContent = t.settingSoundPack;
    const soundPackClearEl = document.getElementById('soundPackClear'); if (soundPackClearEl) soundPackClearEl.textContent = t.soundPackClear;
    const soundPackElectroEl = document.getElementById('soundPackElectro'); if (soundPackElectroEl) soundPackElectroEl.textContent = t.soundPackElectro;
    const soundPackSoftEl = document.getElementById('soundPackSoft'); if (soundPackSoftEl) soundPackSoftEl.textContent = t.soundPackSoft;
    const settingsAdaptiveLabelEl = document.getElementById('settingAdaptiveLabel'); if (settingsAdaptiveLabelEl) settingsAdaptiveLabelEl.textContent = t.settingAdaptive;
    const settingsSpacedLabelEl = document.getElementById('settingSpacedLabel'); if (settingsSpacedLabelEl) settingsSpacedLabelEl.textContent = t.settingSpaced;
    const settingsLanguageLabelEl = document.getElementById('settingLanguageLabel'); if (settingsLanguageLabelEl) settingsLanguageLabelEl.textContent = t.settingLanguage;
    const languageAutoEl = document.getElementById('languageAuto'); if (languageAutoEl) languageAutoEl.textContent = t.languageAuto;
    const languageZhEl = document.getElementById('languageZh'); if (languageZhEl) languageZhEl.textContent = t.languageZh;
    const languageEnEl = document.getElementById('languageEn'); if (languageEnEl) languageEnEl.textContent = t.languageEn;
    const settingsGameModeLabelEl = document.getElementById('settingGameModeLabel'); if (settingsGameModeLabelEl) settingsGameModeLabelEl.textContent = t.settingGameMode;
    const gameModeClassicEl = document.getElementById('gameModeClassic'); if (gameModeClassicEl) gameModeClassicEl.textContent = t.gameModeClassic;
    const gameModeCountdownEl = document.getElementById('gameModeCountdown'); if (gameModeCountdownEl) gameModeCountdownEl.textContent = t.gameModeCountdown;
    const countdownEasyLabelEl = document.getElementById('countdownEasyLabel'); if (countdownEasyLabelEl) countdownEasyLabelEl.textContent = t.countdownEasy;
    const countdownMediumLabelEl = document.getElementById('countdownMediumLabel'); if (countdownMediumLabelEl) countdownMediumLabelEl.textContent = t.countdownMedium;
    const countdownHardLabelEl = document.getElementById('countdownHardLabel'); if (countdownHardLabelEl) countdownHardLabelEl.textContent = t.countdownHard;
    const settingsCardFaceLabelEl = document.getElementById('settingCardFaceLabel'); if (settingsCardFaceLabelEl) settingsCardFaceLabelEl.textContent = t.settingCardFace;
    const cardFaceEmojiEl = document.getElementById('cardFaceEmoji'); if (cardFaceEmojiEl) cardFaceEmojiEl.textContent = t.cardFaceEmoji;
    const cardFaceNumbersEl = document.getElementById('cardFaceNumbers'); if (cardFaceNumbersEl) cardFaceNumbersEl.textContent = t.cardFaceNumbers;
    const cardFaceLettersEl = document.getElementById('cardFaceLetters'); if (cardFaceLettersEl) cardFaceLettersEl.textContent = t.cardFaceLetters;
    const cardFaceShapesEl = document.getElementById('cardFaceShapes'); if (cardFaceShapesEl) cardFaceShapesEl.textContent = t.cardFaceShapes;
    const cardFaceColorsEl = document.getElementById('cardFaceColors'); if (cardFaceColorsEl) cardFaceColorsEl.textContent = t.cardFaceColors;
    const backupLabelEl = document.getElementById('backupLabel'); if (backupLabelEl) backupLabelEl.textContent = t.backupLabel;
    const exportBtnEl = document.getElementById('exportBtn'); if (exportBtnEl) exportBtnEl.textContent = t.export;
    const importBtnEl = document.getElementById('importBtn'); if (importBtnEl) importBtnEl.textContent = t.import;
    const settingsCancelEl = document.getElementById('settingsCancel'); if (settingsCancelEl) settingsCancelEl.textContent = t.settingsCancel || t.close;
    const settingsSaveEl = document.getElementById('settingsSave'); if (settingsSaveEl) settingsSaveEl.textContent = t.settingsSave || t.save;
    const resetDataEl = document.getElementById('resetData'); if (resetDataEl) resetDataEl.textContent = t.resetData;
    const guideBtnEl = document.getElementById('guideBtn'); if (guideBtnEl) guideBtnEl.textContent = t.guide;
    const guideTitleEl = document.getElementById('guideTitle'); if (guideTitleEl) guideTitleEl.textContent = t.guideTitle;
    const guideIntroEl = document.getElementById('guideIntro'); if (guideIntroEl) guideIntroEl.textContent = t.guideIntro;
  const guideBasicsTitleEl = document.getElementById('guideBasicsTitle'); if (guideBasicsTitleEl) guideBasicsTitleEl.textContent = t.guideBasicsTitle;
  if (guideBasicsList) guideBasicsList.innerHTML = (t.guideBasics || []).map(item => `<li>${item}</li>`).join('');
  const guideAdvancedTitleEl = document.getElementById('guideAdvancedTitle'); if (guideAdvancedTitleEl) guideAdvancedTitleEl.textContent = t.guideAdvancedTitle;
  if (guideAdvancedList) guideAdvancedList.innerHTML = (t.guideAdvanced || []).map(item => `<li>${item}</li>`).join('');
  const guideShortcutsTitleEl = document.getElementById('guideShortcutsTitle'); if (guideShortcutsTitleEl) guideShortcutsTitleEl.textContent = t.guideShortcutsTitle;
  if (guideShortcutsList) guideShortcutsList.innerHTML = (t.guideShortcuts || []).map(sc => `<li class="flex items-center gap-2"><span class="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200">${sc.key}</span><span>${sc.desc}</span></li>`).join('');
  if (guideNoShowLabel) guideNoShowLabel.textContent = t.guideNoShow;
  if (guideOpenHintEl) guideOpenHintEl.textContent = t.guideOpenHint;
  if (guideCloseBtn) guideCloseBtn.textContent = t.guideClose;
  // hint button with remaining span
  if (hintBtn) {
    hintBtn.innerHTML = `${t.hint} <span id="hintLeft" class="ml-1">${hintsLeft}</span>`;
    hintLeftEl = document.getElementById('hintLeft');
  }
  updateControlsUI();
}

function useHint() {
  if (paused || isPreviewing) return;
  if (lockBoard) return;
  if (hintsLeft <= 0) return;
  if (firstCard || secondCard) return;
  const cards = Array.from(gridEl.querySelectorAll('.card'))
    .filter(c => !c.classList.contains('pointer-events-none') && !c.classList.contains('flipped'));
  if (cards.length < 2) return;
  const map = new Map();
  for (const c of cards) {
    const v = c.dataset.value;
    if (!map.has(v)) map.set(v, []);
    map.get(v).push(c);
  }
  const candidates = Array.from(map.values()).filter(list => list.length >= 2);
  if (!candidates.length) return;
  const pair = candidates[Math.floor(Math.random() * candidates.length)].slice(0, 2);
  lockBoard = true;
  pair[0].classList.add('flipped');
  pair[1].classList.add('flipped');
  sfx('flip');
  vibrateMs(10);
  setTimeout(() => {
    if (!pair[0].classList.contains('pointer-events-none')) pair[0].classList.remove('flipped');
    if (!pair[1].classList.contains('pointer-events-none')) pair[1].classList.remove('flipped');
    lockBoard = false;
  }, 800);
  hintsLeft -= 1;
  hintsUsed += 1;
  updateHintUI();
}

function handleKeyDown(e) {
  const key = e.key;
  if (guideModal && guideModal.classList.contains('flex')) {
    if (key === 'Escape') { e.preventDefault(); closeGuideModal(); }
    return;
  }
  if (nbackRunning && (key === 'j' || key === 'J')) { e.preventDefault(); onNBackKey(); return; }
  if (key === 'p' || key === 'P') { e.preventDefault(); togglePause(); return; }
  if (key === 'h' || key === 'H') { e.preventDefault(); useHint(); return; }
  if (key === 'n' || key === 'N') { e.preventDefault(); initGame(difficultyEl.value); return; }
  const cards = Array.from(gridEl.querySelectorAll('.card'));
  if (!cards.length) return;
  const cols = difficulties[currentDifficulty].cols;
  let idx = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.index ? parseInt(document.activeElement.dataset.index) : 0;
  if (key === 'ArrowLeft') { e.preventDefault(); idx = Math.max(0, idx - 1); cards[idx]?.focus(); }
  else if (key === 'ArrowRight') { e.preventDefault(); idx = Math.min(cards.length - 1, idx + 1); cards[idx]?.focus(); }
  else if (key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - cols); cards[idx]?.focus(); }
  else if (key === 'ArrowDown') { e.preventDefault(); idx = Math.min(cards.length - 1, idx + cols); cards[idx]?.focus(); }
  else if (key === 'Enter' || key === ' ') {
    if (document.activeElement && document.activeElement.classList.contains('card')) {
      e.preventDefault();
      onFlip(document.activeElement);
    }
  }
}

function getPoolForTheme(theme) {
  if (theme === 'numbers') return numbersPool.map(v => ({ v, type: 'text' }));
  if (theme === 'letters') return lettersPool.map(v => ({ v, type: 'text' }));
  if (theme === 'shapes') return shapesPool.map(v => ({ v, type: 'text' }));
  if (theme === 'colors') return colorsPool.map(c => ({ v: c, type: 'color', color: c }));
  return emojiPool.map(v => ({ v, type: 'text' }));
}

function createDeck(pairs) {
  const theme = settings.cardFace || 'emoji';
  const pool = getPoolForTheme(theme);
  let picks;
  if (dailyActive) {
    const rng = mulberry32(dailySeed);
    const poolCopy = pool.slice();
    seededShuffle(poolCopy, rng);
    picks = poolCopy.slice(0, pairs);
    const deck = [];
    picks.forEach((item, i) => {
      deck.push({ v: item.v, id: `${item.v}-${i}-a`, type: item.type, color: item.color });
      deck.push({ v: item.v, id: `${item.v}-${i}-b`, type: item.type, color: item.color });
    });
    return seededShuffle(deck, rng);
  } else {
    if (settings.spaced) {
      picks = pickWithSpaced(theme, pool, pairs);
    } else {
      shuffle(pool);
      picks = pool.slice(0, pairs);
    }
    const deck = [];
    picks.forEach((item, i) => {
      deck.push({ v: item.v, id: `${item.v}-${i}-a`, type: item.type, color: item.color });
      deck.push({ v: item.v, id: `${item.v}-${i}-b`, type: item.type, color: item.color });
    });
    return shuffle(deck);
  }
}

const achievementsDef = [
  { id: 'first_win', title: '初战告捷', desc: '完成任意一局' },
  { id: 'easy_under_60', title: '轻松高手', desc: '简单60秒内通关' },
  { id: 'medium_under_120', title: '熟能生巧', desc: '中等120秒内通关' },
  { id: 'hard_under_180', title: '记忆大师', desc: '困难180秒内通关' },
  { id: 'no_hint_win', title: '纯手动', desc: '不使用提示完成一局' },
  { id: 'perfect_moves', title: '完美效率', desc: '零失误（步数=配对数）' },
];

function loadAchievements() {
  try { const v = localStorage.getItem(achKey()); return v ? JSON.parse(v) : {}; } catch { return {}; }
}
function saveAchievements(obj) { localStorage.setItem(achKey(), JSON.stringify(obj)); }

function checkAchievementsOnWin() {
  const store = loadAchievements();
  const newly = [];
  const pairs = difficulties[currentDifficulty].pairs;
  const checks = [
    ['first_win', true],
    ['easy_under_60', currentDifficulty === 'easy' && elapsed <= 60],
    ['medium_under_120', currentDifficulty === 'medium' && elapsed <= 120],
    ['hard_under_180', currentDifficulty === 'hard' && elapsed <= 180],
    ['no_hint_win', hintsUsed === 0],
    ['perfect_moves', moves === pairs],
  ];
  for (const [id, cond] of checks) {
    if (cond && !store[id]) { store[id] = { unlocked: true, at: Date.now() }; newly.push(id); }
  }
  if (newly.length) saveAchievements(store);
  return newly;
}

function updateAchievementsUI() {
  if (!achievementsList) return;
  const store = loadAchievements();
  const html = achievementsDef.map(def => {
    const hit = !!store[def.id];
    const d = hit ? new Date(store[def.id].at) : null;
    const when = hit ? `${d.getMonth()+1}-${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}` : '';
    return `<li class="flex items-center justify-between ${hit ? 'text-emerald-600' : 'text-slate-500'}"><span>${hit ? '✅' : '⬜️'} ${def.title} <span class="text-xs text-slate-400">${def.desc}</span></span>${when ? `<span class="text-xs text-slate-400">${when}</span>` : ''}</li>`;
  }).join('');
  achievementsList.innerHTML = html;
}

function openAchievements(newIds) {
  updateAchievementsUI();
  if (!achievementsModal) return;
  achievementsModal.classList.remove('hidden');
  achievementsModal.classList.add('flex');
  if (achievementsNew) {
    if (newIds && newIds.length) { achievementsNew.textContent = `新解锁 ${newIds.length} 项`; achievementsNew.classList.remove('hidden'); }
    else achievementsNew.classList.add('hidden');
  }
}

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.add('hidden'), 2000);
}

function showCombo(n) {
  if (!comboToastEl) return;
  comboToastEl.textContent = `连击 ×${n}`;
  comboToastEl.classList.remove('hidden');
  clearTimeout(showCombo._t);
  showCombo._t = setTimeout(() => comboToastEl.classList.add('hidden'), 900);
}

function collectExportData() {
  return {
    version: 1,
    settings,
    bests: { easy: loadBest('easy'), medium: loadBest('medium'), hard: loadBest('hard') },
    leaderboards: { easy: loadLeaderboard('easy'), medium: loadLeaderboard('medium'), hard: loadLeaderboard('hard') },
    achievements: loadAchievements(),
    stats: loadStats(),
    adaptive: loadAdaptive(),
    spaced: {
      emoji: loadSpaced('emoji'),
      numbers: loadSpaced('numbers'),
      letters: loadSpaced('letters'),
      shapes: loadSpaced('shapes'),
      colors: loadSpaced('colors'),
    },
  };
}

function exportData() {
  const data = collectExportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'memory-match-backup.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function importDataFromObj(obj) {
  try {
    if (obj.settings) saveSettings({ ...DEFAULT_SETTINGS, ...obj.settings });
    if (obj.bests) {
      for (const k of ['easy','medium','hard']) { if (obj.bests[k]) saveBest(k, obj.bests[k]); }
    }
    if (obj.leaderboards) {
      for (const k of ['easy','medium','hard']) { if (obj.leaderboards[k]) saveLeaderboard(k, obj.leaderboards[k]); }
    }
    if (obj.achievements) saveAchievements(obj.achievements);
    if (obj.stats) saveStats(obj.stats);
    if (obj.adaptive) saveAdaptive(obj.adaptive);
    if (obj.spaced) {
      for (const t of ['emoji','numbers','letters','shapes','colors']) {
        if (obj.spaced[t]) saveSpaced(t, obj.spaced[t]);
      }
    }
    settings = loadSettings();
    applyAccentToDOM();
    applyTheme();
    applyMotionPreference();
    updateBestUI();
    updateLeaderboardUI();
    updateStatsUI();
    updateAchievementsUI();
    initGame(difficultyEl.value);
  } catch {}
}
