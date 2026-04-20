let db, synth = window.speechSynthesis;
let chapters = [], currentSentences = [], voices = [];
let curChapIdx = 0, curSentIdx = 0;
let isReading = false, curBookName = "", timeLeft = 0, timerInterval = null;

const voiceSelect = document.getElementById('voiceSelect');
const silentAudio = document.getElementById('silentAudio');
const countdownDisplay = document.getElementById('countdown');

// Thay thế đoạn loadVoices cũ bằng đoạn này
function loadVoices() {
    // Lấy tất cả giọng nói có sẵn trên hệ thống
    voices = synth.getVoices();
    
    // Lọc ra các giọng Tiếng Việt (vi-VN)
    // Chúng ta dùng filter thông minh để bắt được cả Siri và Linh
    let viVoices = voices.filter(v => 
        v.lang.toLowerCase().includes('vi') || 
        v.lang.toLowerCase().includes('viet')
    );

    if (viVoices.length > 0) {
        // Sắp xếp để Siri hiện lên đầu cho dễ chọn
        viVoices.sort((a, b) => b.name.includes('Siri') - a.name.includes('Siri'));

        voiceSelect.innerHTML = viVoices.map(v => 
            `<option value="${v.name}">${v.name.replace('Microsoft', '').replace('Apple', '')}</option>`
        ).join('');
        
        console.log("Đã tìm thấy " + viVoices.length + " giọng Tiếng Việt.");
    } else {
        voiceSelect.innerHTML = "<option>Đang quét giọng đọc...</option>";
    }
}

// KHẮC PHỤC LỖI TRÌNH DUYỆT CHƯA KỊP LOAD
// Cứ mỗi 1 giây quét lại 1 lần (tổng cộng 5 lần) để ép iPhone nhả giọng Siri ra
let scanCount = 0;
let voiceScanner = setInterval(() => {
    loadVoices();
    scanCount++;
    if (scanCount > 5 || (voices.filter(v => v.lang.includes('vi')).length > 1)) {
        clearInterval(voiceScanner);
    }
}, 1000);

// Sự kiện tiêu chuẩn khi danh sách giọng thay đổi
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}


// Database
const request = indexedDB.open("ProTimerDB", 1);
request.onupgradeneeded = e => { e.target.result.createObjectStore("books", { keyPath: "name" }); };
request.onsuccess = e => { db = e.target.result; refreshLib(); };

function refreshLib() {
    const list = document.getElementById('bookList');
    list.innerHTML = "<h3>Thư viện:</h3>";
    db.transaction(["books"], "readonly").objectStore("books").getAll().onsuccess = e => {
        e.target.result.forEach(book => {
            const item = document.createElement('div');
            item.className = `book-item`;
            item.innerHTML = `<span onclick="loadBook('${book.name}')" style="flex:1;">${book.name}</span>`;
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
        let match, lastIdx = 0;
        chapters = []; 
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
    stopReading();
    curChapIdx = idx;
    if (!useSaved) curSentIdx = 0;
    const text = chapters[idx];
    currentSentences = text.match(/[^.!?\n]+[.!?\n]?/g) || [text];
    currentSentences = currentSentences.map(s => s.trim()).filter(s => s.length > 0);
    renderText();
}

function renderText() {
    const box = document.getElementById('displayBox');
    box.innerHTML = '';
    currentSentences.forEach((s, i) => {
        const span = document.createElement('span');
        span.id = `s-${i}`; span.className = 'sentence' + (i === curSentIdx ? ' highlight' : '');
        span.innerText = s + ' ';
        span.onclick = () => { curSentIdx = i; isReading = true; speak(); };
        box.appendChild(span);
    });
    scroll();
}

function speak() {
    if (curSentIdx >= currentSentences.length) {
        if (curChapIdx < chapters.length - 1) { curChapIdx++; loadChapter(curChapIdx); isReading = true; speak(); }
        else { stopReading(); }
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
    };
    utter.onend = () => { if (isReading) { curSentIdx++; speak(); } };
    synth.speak(utter);
}

function startTimer() {
    clearInterval(timerInterval);
    const minutes = parseInt(document.getElementById('timer').value);
    if (minutes === 0) { countdownDisplay.innerText = ""; return; }
    timeLeft = minutes * 60;
    updateTimerUI();
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerUI();
        if (timeLeft <= 0) { stopReading(); clearInterval(timerInterval); countdownDisplay.innerText = "Hết giờ!"; }
    }, 1000);
}

function updateTimerUI() {
    const m = Math.floor(timeLeft / 60), s = timeLeft % 60;
    countdownDisplay.innerText = `Sẽ tắt sau: ${m}ph ${s.toString().padStart(2, '0')}s`;
}

function stopReading() { isReading = false; synth.cancel(); silentAudio.pause(); clearInterval(timerInterval); countdownDisplay.innerText = ""; }

document.getElementById('playBtn').onclick = () => { if (!curBookName) return alert("Chọn truyện!"); isReading = true; silentAudio.play(); startTimer(); speak(); };
document.getElementById('stopBtn').onclick = stopReading;
document.getElementById('chapterSelect').onchange = e => loadChapter(parseInt(e.target.value));
document.getElementById('rate').oninput = e => document.getElementById('rateVal').innerText = e.target.value;
function scroll() { document.getElementById(`s-${curSentIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
