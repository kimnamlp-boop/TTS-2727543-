let db, synth = window.speechSynthesis;
let chapters = [], currentSentences = [], voices = [];
let curChapIdx = 0, curSentIdx = 0;
let isReading = false, curBookName = "", timeLeft = 0, timerInterval = null;

const voiceSelect = document.getElementById('voiceSelect');
const silentAudio = document.getElementById('silentAudio');
const countdownDisplay = document.getElementById('countdown');

// --- QUẢN LÝ GIỌNG ĐỌC (ƯU TIÊN SIRI) ---
function loadVoices() {
    const allVoices = synth.getVoices();
    if (allVoices.length === 0) return;

    let viVoices = allVoices.filter(v => v.lang.toLowerCase().includes('vi'));
    let fallbackVoices = allVoices.filter(v => v.lang.includes('en') && (v.name.toLowerCase().includes('siri') || v.name.toLowerCase().includes('enhanced')));
    let finalVoices = viVoices.length > 0 ? viVoices : fallbackVoices;

    finalVoices.sort((a, b) => {
        const score = v => (v.name.toLowerCase().includes('siri') ? 10 : 0) + (v.name.toLowerCase().includes('enhanced') ? 5 : 0);
        return score(b) - score(a);
    });

    voices = allVoices;
    voiceSelect.innerHTML = finalVoices.map(v => `<option value="${v.name}">${v.name.replace(/Apple|Microsoft|Google/gi, '').trim()} (${v.lang})</option>`).join('');
    autoSelectBestVoice();
}

function autoSelectBestVoice() {
    const best = voices.find(v => v.name.toLowerCase().includes('siri') && v.lang.includes('vi')) || voices.find(v => v.lang.includes('vi'));
    if (best) voiceSelect.value = best.name;
}

// Quét giọng liên tục trong 10 giây (Fix lỗi iOS Safari load chậm)
let voiceScan = setInterval(() => {
    loadVoices();
    if (voices.some(v => v.name.toLowerCase().includes('siri')) || voiceScan > 10) clearInterval(voiceScan);
}, 1000);
if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;

// --- DATABASE & FILE ---
const request = indexedDB.open("StoryProDB", 1);
request.onupgradeneeded = e => e.target.result.createObjectStore("books", { keyPath: "name" });
request.onsuccess = e => { db = e.target.result; refreshLib(); };

function refreshLib() {
    const list = document.getElementById('bookList');
    list.innerHTML = "<h3>Thư viện:</h3>";
    db.transaction(["books"], "readonly").objectStore("books").getAll().onsuccess = e => {
        e.target.result.forEach(book => {
            const item = document.createElement('div');
            item.className = `book-item`;
            item.innerHTML = `<span onclick="loadBook('${book.name}')" style="flex:1; cursor:pointer;">📖 ${book.name}</span>`;
            list.appendChild(item);
        });
    };
}

document.getElementById('fileInput').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        db.transaction(["books"], "readwrite").objectStore("books").put({ name: file.name, data: ev.target.result });
        loadBook(file.name);
        refreshLib();
    };
    reader.readAsText(file);
};

function loadBook(name) {
    curBookName = name;
    db.transaction(["books"], "readonly").objectStore("books").get(name).onsuccess = e => {
        const text = e.target.result.data;
        const chapterRegex = /(^\s*(?:Chương|Quyển|Mục|Phần)\s*[\dIVX\-\.]+|^\s*\d+\.\s+.*)/gim;
        let match, lastIdx = 0; chapters = []; 
        document.getElementById('chapterSelect').innerHTML = "";
        while ((match = chapterRegex.exec(text)) !== null) {
            if (match.index > 0) chapters.push(text.substring(lastIdx, match.index));
            const opt = document.createElement('option');
            opt.value = chapters.length;
            opt.innerText = match[0].trim().substring(0, 30);
            document.getElementById('chapterSelect').appendChild(opt);
            lastIdx = match.index;
        }
        chapters.push(text.substring(lastIdx));
        const saved = localStorage.getItem("pos_" + name) || "0_0";
        curChapIdx = parseInt(saved.split("_")[0]);
        curSentIdx = parseInt(saved.split("_")[1]);
        document.getElementById('chapterSelect').value = curChapIdx;
        loadChapter(curChapIdx, true);
    };
}

function loadChapter(idx, useSaved = false) {
    stopReading(); curChapIdx = idx;
    if (!useSaved) curSentIdx = 0;
    const text = chapters[idx];
    currentSentences = text.match(/[^.!?\n]+[.!?\n]?/g) || [text];
    currentSentences = currentSentences.map(s => s.trim()).filter(s => s.length > 0);
    renderText();
}

function renderText() {
    const box = document.getElementById('displayBox'); box.innerHTML = '';
    currentSentences.forEach((s, i) => {
        const span = document.createElement('span');
        span.id = `s-${i}`; span.className = 'sentence' + (i === curSentIdx ? ' highlight' : '');
        span.innerText = s + ' ';
        span.onclick = () => { curSentIdx = i; isReading = true; speak(); };
        box.appendChild(span);
    });
    scroll();
}

// --- ĐIỀU KHIỂN ĐỌC ---
function speak() {
    if (curSentIdx >= currentSentences.length) {
        if (curChapIdx < chapters.length - 1) { curChapIdx++; loadChapter(curChapIdx); isReading = true; speak(); }
        else stopReading();
        return;
    }
    if (!isReading) return;
    synth.cancel();
    let utter = new SpeechSynthesisUtterance(currentSentences[curSentIdx]);
    utter.voice = voices.find(v => v.name === voiceSelect.value);
    utter.rate = parseFloat(document.getElementById('rate').value);
    utter.onstart = () => {
        document.querySelectorAll('.sentence').forEach(el => el.classList.remove('highlight'));
        document.getElementById(`s-${curSentIdx}`)?.classList.add('highlight');
        scroll();
        localStorage.setItem("pos_" + curBookName, `${curChapIdx}_${curSentIdx}`);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({ title: curBookName, artist: `Chương ${curChapIdx + 1}` });
        }
    };
    utter.onend = () => { if (isReading) { curSentIdx++; speak(); } };
    synth.speak(utter);
}

// --- HẸN GIỜ ĐẾM NGƯỢC ---
function startTimer() {
    clearInterval(timerInterval);
    const mins = parseInt(document.getElementById('timer').value);
    if (mins === 0) { countdownDisplay.innerText = ""; return; }
    timeLeft = mins * 60;
    updateTimerUI();
    timerInterval = setInterval(() => {
        timeLeft--; updateTimerUI();
        if (timeLeft <= 0) { stopReading(); clearInterval(timerInterval); countdownDisplay.innerText = "Đã hết giờ!"; }
    }, 1000);
}

function updateTimerUI() {
    const m = Math.floor(timeLeft / 60), s = timeLeft % 60;
    countdownDisplay.innerText = `⏱ Tự tắt sau: ${m}ph ${s.toString().padStart(2, '0')}s`;
}

function stopReading() { isReading = false; synth.cancel(); silentAudio.pause(); clearInterval(timerInterval); countdownDisplay.innerText = ""; }

document.getElementById('playBtn').onclick = () => { if (!curBookName) return alert("Chọn truyện!"); isReading = true; silentAudio.play(); startTimer(); speak(); };
document.getElementById('stopBtn').onclick = stopReading;
document.getElementById('chapterSelect').onchange = e => loadChapter(parseInt(e.target.value));
document.getElementById('rate').oninput = e => document.getElementById('rateVal').innerText = e.target.value;
function scroll() { document.getElementById(`s-${curSentIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
document.addEventListener('visibilitychange', () => { if (document.hidden && isReading) silentAudio.play().catch(()=>{}); });
