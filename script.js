let db, synth = window.speechSynthesis;
let chapters = [], currentSentences = [];
let curChapIdx = 0, curSentIdx = 0;
let isReading = false, curBookName = "", sleepTimer = null;
let countdownInterval = null; // Biến riêng cho bộ đếm lùi
let remainingSeconds = 0; // Thời gian còn lại (giây)

const silentAudio = document.getElementById('silentAudio');
const displayBox = document.getElementById('displayBox');
const chapterSelect = document.getElementById('chapterSelect');
const rateInput = document.getElementById('rate');
const rateVal = document.getElementById('rateVal');
const timerSelect = document.getElementById('timer');
const timerDisplay = document.createElement('div'); // Tạo hiển thị timer

// Tạo phần tử hiển thị timer đỏ
timerDisplay.id = 'timerDisplay';
timerDisplay.style.cssText = `
    color: #ff3b30;
    font-size: 14px;
    font-weight: 600;
    margin-top: 8px;
    text-align: center;
    padding: 8px;
    background: #fff5f5;
    border-radius: 8px;
    display: none;
`;
document.querySelector('.control-group').appendChild(timerDisplay);

// 1. DATABASE & THƯ VIỆN
const request = indexedDB.open("ProReaderDB", 2);

request.onupgradeneeded = function(e) {
    const db = e.target.result;
    if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "name" });
    }
};

request.onsuccess = function(e) {
    db = e.target.result;
    refreshLib();
};

request.onerror = function(e) {
    console.error("Database error:", e.target.error);
};

// Xử lý upload file
document.getElementById('fileInput').onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const transaction = db.transaction(["books"], "readwrite");
        transaction.objectStore("books").put({ name: file.name, data: ev.target.result });
        transaction.oncomplete = function() {
            loadBook(file.name);
            refreshLib();
        };
    };
    reader.readAsText(file);
};

function refreshLib() {
    const list = document.getElementById('bookList');
    list.innerHTML = "";
    const transaction = db.transaction(["books"], "readonly");
    const store = transaction.objectStore("books");
    const request = store.getAll();
    
    request.onsuccess = function(e) {
        e.target.result.forEach(book => {
            const item = document.createElement('div');
            item.className = `book-item ${book.name === curBookName ? 'active' : ''}`;
            item.innerHTML = `<span onclick="loadBook('${book.name.replace(/'/g, "\\'")}')" style="flex:1;">${escapeHtml(book.name)}</span>
                              <span class="delete-btn" onclick="deleteBook('${book.name.replace(/'/g, "\\'")}')">Xóa</span>`;
            list.appendChild(item);
        });
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function deleteBook(name) {
    if(confirm("Xóa truyện này khỏi thư viện?")) {
        const transaction = db.transaction(["books"], "readwrite");
        transaction.objectStore("books").delete(name);
        transaction.oncomplete = function() {
            if(curBookName === name) {
                curBookName = "";
                displayBox.innerText = "Đã xóa.";
            }
            refreshLib();
        };
    }
}

// 2. XỬ LÝ NỘI DUNG & CHƯƠNG
window.loadBook = function(name) {
    curBookName = name;
    const transaction = db.transaction(["books"], "readonly");
    const store = transaction.objectStore("books");
    const request = store.get(name);
    
    request.onsuccess = function(e) {
        const text = e.target.result.data;
        const chapterRegex = /(^\s*(?:Chương|Quyển|Mục|Phần)\s*[\dIVX\-\.]+|^\s*\d+\.\s+.*)/gim;
        let match, lastIdx = 0;
        chapters = [];
        chapterSelect.innerHTML = "";
        
        // Thêm option mặc định
        const defaultOpt = document.createElement('option');
        defaultOpt.value = "0";
        defaultOpt.innerText = "Đang xử lý...";
        chapterSelect.appendChild(defaultOpt);
        
        while ((match = chapterRegex.exec(text)) !== null) {
            if (match.index > lastIdx) {
                chapters.push(text.substring(lastIdx, match.index));
            }
            const opt = document.createElement('option');
            opt.value = chapters.length;
            let chapterTitle = match[0].trim().substring(0, 35);
            opt.innerText = chapterTitle;
            chapterSelect.appendChild(opt);
            lastIdx = match.index;
        }
        
        // Thêm phần còn lại
        if (lastIdx < text.length) {
            chapters.push(text.substring(lastIdx));
        }
        
        // Nếu không tìm thấy chương nào
        if (chapters.length === 0) {
            chapters = [text];
            chapterSelect.innerHTML = "<option value='0'>Nội dung chính</option>";
        } else {
            // Xóa option mặc định
            if (chapterSelect.options[0] && chapterSelect.options[0].value === "0") {
                chapterSelect.remove(0);
            }
        }
        
        const saved = localStorage.getItem("pos_" + name) || "0_0";
        curChapIdx = parseInt(saved.split("_")[0]);
        curSentIdx = parseInt(saved.split("_")[1]);
        
        if (chapterSelect.options[curChapIdx]) {
            chapterSelect.value = curChapIdx;
        } else {
            curChapIdx = 0;
            chapterSelect.value = 0;
        }
        
        loadChapter(curChapIdx, true);
        refreshLib();
    };
};

function loadChapter(idx, useSavedSent = false) {
    stopReading();
    curChapIdx = idx;
    if (!useSavedSent) curSentIdx = 0;
    const text = chapters[idx];
    if (!text) return;
    
    // Tách câu
    currentSentences = text.match(/[^.!?\n]+[.!?\n]?/g) || [text];
    currentSentences = currentSentences.map(s => s.trim()).filter(s => s.length > 0);
    renderText();
}

function renderText() {
    displayBox.innerHTML = '';
    currentSentences.forEach((s, i) => {
        const span = document.createElement('span');
        span.id = `s-${i}`;
        span.className = 'sentence' + (i === curSentIdx ? ' highlight' : '');
        span.innerText = s + ' ';
        span.onclick = (function(idx) {
            return function() {
                curSentIdx = idx;
                isReading = true;
                speak();
            };
        })(i);
        displayBox.appendChild(span);
    });
    scrollToSentence();
}

// 3. HỆ THỐNG TIMER CHÍNH XÁC
function startTimer(minutes) {
    // Dừng timer cũ nếu có
    stopTimer();
    
    if (minutes <= 0) return;
    
    // Khởi tạo thời gian còn lại
    remainingSeconds = minutes * 60;
    
    // Cập nhật hiển thị ngay lập tức
    updateTimerDisplay();
    timerDisplay.style.display = 'block';
    
    // Bắt đầu đếm lùi bằng setInterval riêng biệt
    countdownInterval = setInterval(function() {
        if (remainingSeconds > 0) {
            remainingSeconds--;
            updateTimerDisplay();
            
            // Hết giờ
            if (remainingSeconds === 0) {
                stopTimer();
                stopReading();
                timerDisplay.style.display = 'none';
                alert("⏰ Hết giờ! Audiobook đã dừng lại.");
            }
        } else {
            // Dừng timer nếu đã về 0
            stopTimer();
            timerDisplay.style.display = 'none';
        }
    }, 1000);
}

function stopTimer() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    if (sleepTimer) {
        clearTimeout(sleepTimer);
        sleepTimer = null;
    }
    remainingSeconds = 0;
    timerDisplay.style.display = 'none';
}

function updateTimerDisplay() {
    if (remainingSeconds > 0) {
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        timerDisplay.innerHTML = `⏰ Sẽ tắt sau: ${minutes}ph ${seconds.toString().padStart(2, '0')}s`;
        timerDisplay.style.display = 'block';
    } else {
        timerDisplay.style.display = 'none';
    }
}

function resetAndStartTimer() {
    // Lấy giá trị phút từ select
    const minutes = parseInt(timerSelect.value);
    
    // Dừng timer cũ
    stopTimer();
    
    // Nếu đang đọc và có hẹn giờ, khởi tạo timer mới
    if (isReading && minutes > 0) {
        startTimer(minutes);
    }
}

// 4. ĐIỀU KHIỂN ÂM THANH & CHẠY NỀN
function speak() {
    if (curSentIdx >= currentSentences.length) {
        if (curChapIdx < chapters.length - 1) {
            curChapIdx++;
            if (chapterSelect.options[curChapIdx]) {
                chapterSelect.value = curChapIdx;
            }
            loadChapter(curChapIdx, false);
            isReading = true;
            speak();
        }
        return;
    }
    if (!isReading) return;
    
    // Hủy đang đọc
    if (synth.speaking) {
        synth.cancel();
    }
    
    let utter = new SpeechSynthesisUtterance(currentSentences[curSentIdx]);
    utter.lang = 'vi-VN';
    utter.rate = parseFloat(rateInput.value);
    
    utter.onstart = function() {
        document.querySelectorAll('.sentence').forEach(el => el.classList.remove('highlight'));
        const currentSpan = document.getElementById(`s-${curSentIdx}`);
        if (currentSpan) currentSpan.classList.add('highlight');
        scrollToSentence();
        if (curBookName) {
            localStorage.setItem("pos_" + curBookName, `${curChapIdx}_${curSentIdx}`);
        }
        updateMediaSession();
    };
    
    utter.onend = function() {
        if (isReading) {
            curSentIdx++;
            speak();
        }
    };
    
    utter.onerror = function(e) {
        console.error("Speech error:", e);
        if (isReading) {
            curSentIdx++;
            speak();
        }
    };
    
    synth.speak(utter);
}

function updateMediaSession() {
    if ('mediaSession' in navigator && curBookName) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: curBookName,
            artist: `Chương ${curChapIdx + 1}`,
            artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/3844/3844721.png', sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.setActionHandler('play', function() {
            isReading = true;
            speak();
        });
        navigator.mediaSession.setActionHandler('pause', stopReading);
    }
}

function stopReading() {
    isReading = false;
    synth.cancel();
    silentAudio.pause();
    
    // KHÔNG dừng timer ở đây - timer vẫn chạy độc lập
    // Timer sẽ tiếp tục đếm và tự động dừng khi hết giờ
}

// 5. EVENT LISTENERS
document.getElementById('playBtn').onclick = function() {
    if (!curBookName) {
        alert("Vui lòng chọn hoặc tải lên một truyện!");
        return;
    }
    if (currentSentences.length === 0) {
        alert("Không có nội dung để đọc!");
        return;
    }
    
    // Nếu đang dừng và nhấn phát lại
    if (!isReading) {
        isReading = true;
        silentAudio.play().catch(e => console.log("Audio play error:", e));
        
        // Reset timer: dừng timer cũ và khởi tạo lại từ đầu
        const minutes = parseInt(timerSelect.value);
        if (minutes > 0) {
            startTimer(minutes); // Bắt đầu timer mới
        }
        
        speak(); // Tiếp tục đọc từ vị trí hiện tại
    }
};

document.getElementById('stopBtn').onclick = function() {
    stopReading();
    // Dừng timer khi nhấn nút Dừng
    stopTimer();
    timerDisplay.style.display = 'none';
};

chapterSelect.onchange = function(e) {
    loadChapter(parseInt(e.target.value), false);
    // Nếu đang đọc và đổi chương, reset timer
    if (isReading) {
        const minutes = parseInt(timerSelect.value);
        if (minutes > 0) {
            startTimer(minutes);
        }
    }
};

rateInput.oninput = function(e) {
    rateVal.innerText = e.target.value;
    // Nếu đang đọc, cập nhật tốc độ cho câu tiếp theo
};

// Khi người dùng thay đổi thời gian trong select, cập nhật timer nếu đang đọc
timerSelect.onchange = function() {
    if (isReading) {
        const minutes = parseInt(timerSelect.value);
        if (minutes > 0) {
            startTimer(minutes); // Reset timer với thời gian mới
        } else {
            stopTimer(); // Tắt timer nếu chọn "Không hẹn giờ"
            timerDisplay.style.display = 'none';
        }
    }
};

// Khởi tạo
rateVal.innerText = rateInput.value;