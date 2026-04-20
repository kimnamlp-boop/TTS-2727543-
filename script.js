let synth = speechSynthesis;

let chapters = [], sentences = [];
let chapIdx = 0, sentIdx = 0;
let isReading = false;

let timerInterval = null;
let timeLeft = 0;

const displayBox = document.getElementById("displayBox");
const chapterSelect = document.getElementById("chapterSelect");
const rateInput = document.getElementById("rate");
const countdown = document.getElementById("countdown");
const silentAudio = document.getElementById("silentAudio");

// ===== LOAD FILE =====
document.getElementById("fileInput").onchange = e => {
    let file = e.target.files[0];
    let reader = new FileReader();

    reader.onload = ev => {
        let text = ev.target.result;

        chapters = text.split(/Chương\s+\d+/);
        if (chapters.length <= 1) chapters = [text];

        chapterSelect.innerHTML = chapters.map((_, i) =>
            `<option value="${i}">Chương ${i + 1}</option>`
        ).join("");

        loadChapter(0);
    };

    reader.readAsText(file);
};

// ===== LOAD CHAPTER =====
function loadChapter(i) {
    stopReading();

    chapIdx = i;
    sentIdx = 0;

    sentences = chapters[i]
        .match(/[^.!?]+[.!?]?/g)
        .map(s => s.trim());

    render();
}

chapterSelect.onchange = e => loadChapter(parseInt(e.target.value));

// ===== RENDER =====
function render() {
    displayBox.innerHTML = "";

    sentences.forEach((s, i) => {
        let span = document.createElement("span");

        span.innerText = s + " ";
        if (i === sentIdx) span.classList.add("highlight");

        span.onclick = () => {
            sentIdx = i;
            isReading = true;
            speak();
        };

        displayBox.appendChild(span);
    });
}

// ===== SPEAK =====
function speak() {
    if (!isReading) return;

    if (sentIdx >= sentences.length) {
        stopReading();
        return;
    }

    synth.cancel();

    let u = new SpeechSynthesisUtterance(sentences[sentIdx]);
    u.lang = "vi-VN";
    u.rate = parseFloat(rateInput.value);

    u.onstart = () => render();

    u.onend = () => {
        sentIdx++;
        speak();
    };

    synth.speak(u);
}

// ===== TIMER =====
function startTimer() {
    clearInterval(timerInterval);

    const mins = parseInt(document.getElementById("timer").value);

    if (mins === 0) {
        countdown.innerText = "";
        return;
    }

    timeLeft = mins * 60;

    updateCountdown();

    timerInterval = setInterval(() => {
        timeLeft--;

        updateCountdown();

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            stopReading();
            countdown.innerText = "Đã hết thời gian!";
        }

    }, 1000);
}

function updateCountdown() {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;

    countdown.innerText =
        `Sẽ tắt sau: ${m}ph ${s.toString().padStart(2, '0')}s`;
}

// ===== CONTROL =====
document.getElementById("playBtn").onclick = () => {
    if (!sentences.length) return alert("Chọn file!");

    isReading = true;

    silentAudio.play().catch(()=>{});

    startTimer(); // reset mỗi lần play

    speak();
};

function stopReading() {
    isReading = false;

    synth.cancel();
    silentAudio.pause();

    clearInterval(timerInterval);
    countdown.innerText = "";
}

document.getElementById("stopBtn").onclick = stopReading;

// ===== UI =====
rateInput.oninput = e =>
    document.getElementById("rateVal").innerText = e.target.value;

// ===== CHANGE TIMER WHEN RUNNING =====
document.getElementById("timer").onchange = () => {
    if (isReading) startTimer();
};

// ===== FIX iOS BACKGROUND =====
document.addEventListener("visibilitychange", () => {
    if (document.hidden && isReading) {
        silentAudio.play().catch(()=>{});
    }
});