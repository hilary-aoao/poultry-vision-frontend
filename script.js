const API = "https://poultryvision-api.onrender.com";

const chat = document.getElementById("chat");
const photoInput = document.getElementById("photoInput");
const photoBtn = document.getElementById("photoBtn");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");

let lastResult = null;    // the answer from /predict
let lastExplain = null;   // the answer from /explain
let asking = false;       // true while we wait for an answer to a question
let lastFile = null;      // the photo the farmer sent
let questionLog = [];     // the questions asked about this photo, and their answers

const TIER_WORDS = { high: "quite sure", moderate: "moderately sure", low: "not sure" };

const MAX_SIDE = 1024;          // photos are shrunk to this many pixels on the longest side
const SKIP_SHRINK_BELOW = 400 * 1024;   // photos already smaller than this (in bytes) are sent as they are

function scrollDown() {
  chat.scrollTop = chat.scrollHeight;
}

function addText(who, text) {
  const bubble = document.createElement("div");
  bubble.className = "msg " + who;
  bubble.textContent = text;
  chat.appendChild(bubble);
  scrollDown();
  return bubble;
}

function addPhoto(who, url) {
  const bubble = document.createElement("div");
  bubble.className = "msg " + who;
  const img = document.createElement("img");
  img.src = url;
  img.onload = scrollDown;
  bubble.appendChild(img);
  chat.appendChild(bubble);
  scrollDown();
}

function addTyping() {
  const bubble = document.createElement("div");
  bubble.className = "msg bot typing";
  bubble.innerHTML = "<span></span><span></span><span></span>";
  chat.appendChild(bubble);
  scrollDown();
  return bubble;
}

// ---------- problems and photos ----------
// Throw an error that remembers the server's status number, so we can explain it kindly.
function checkResponse(response) {
  if (!response.ok) {
    const error = new Error("The server answered with status " + response.status);
    error.status = response.status;
    throw error;
  }
}

function friendlyMessage(error) {
  if (error.name === "AbortError") return "The server is taking too long to wake up. Please wait a minute and send the photo again.";
  if (error.status === 413) return "That photo is too big. Please try a smaller one.";
  if (error.status === 400) return "I could not read that file. Please send a photo from your camera or gallery.";
  if (error.status === 429) return "Many people are using PoultryVision right now. Please try again in a minute.";
  if (error.status >= 500) return "Something went wrong on my side. Please try again in a moment.";
  return "Sorry, I could not check that photo. Please check your internet and try again.";
}

// Phone photos are big. Shrinking them makes the check faster and saves the farmer's data.
async function shrinkPhoto(file) {
  if (file.size < SKIP_SHRINK_BELOW) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, "image/jpeg", 0.85);
    });
    return blob || file;
  } catch (error) {
    console.log(error);
    return file;   // if anything goes wrong, just send the original photo
  }
}

// ---------- suggested questions ----------
function removeChips() {
  const old = chat.querySelector(".chips");
  if (old) old.remove();
}

function showSuggestions(list) {
  removeChips();
  if (!list || list.length === 0) return;

  const box = document.createElement("div");
  box.className = "chips";
  list.slice(0, 4).forEach(function (question) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = question;
    chip.addEventListener("click", function () {
      askQuestion(question);
    });
    box.appendChild(chip);
  });
  chat.appendChild(box);
  scrollDown();
}

// ---------- the result ----------
function prettyName(name) {
  if (name === "New Castle Disease") return "Newcastle disease";
  return name;
}

function describeResult(result) {
  const healthy = result.predicted_class === "Healthy";
  const name = healthy ? "healthy" : prettyName(result.predicted_class);
  const looks = healthy ? "This looks " : "This looks like ";
  const pct = Math.round(result.confidence);
  let text;

  if (result.tier === "high") {
    text = looks + name + ". I am quite sure (" + pct + "%).";
  } else if (result.tier === "moderate") {
    text = "This may be " + name + ". I am moderately sure (" + pct + "%).";
  } else {
    text = "I am not sure about this one. My best guess is " + name + " (" + pct + "%). Please send a clearer photo, taken close up in daylight.";
  }

  if (result.reliability !== "high") {
    text += " This kind of result is harder to judge from a photo, so please confirm it with a vet.";
  }
  return text;
}

// Cut a long text into short pieces, so the bot sends several small bubbles like a person would.
function splitIntoParts(text) {
  const blocks = text.split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean);
  if (blocks.length > 1) return blocks;

  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
  const parts = [];
  for (let i = 0; i < sentences.length; i += 2) {
    parts.push(sentences.slice(i, i + 2).join("").trim());
  }
  return parts;
}

async function explainResult(result) {
  const typing = addTyping();

  try {
    const response = await fetch(API + "/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        predicted_class: result.predicted_class,
        confidence: result.confidence,
        probabilities: result.probabilities
      })
    });
    checkResponse(response);

    const data = await response.json();
    lastExplain = data;
    typing.remove();

    splitIntoParts(data.explanation).forEach(function (part) {
      addText("bot", part);
    });
    addText("bot note", data.disclaimer);

    addText("bot", "You can ask me more about this. Tap a question, or type your own.");
    showSuggestions(data.suggestions);
    addReportButtons();
  } catch (error) {
    console.log(error);
    typing.remove();
    addText("bot", "I could not load the explanation just now, but your result is above.");
  }
}

async function checkPhoto(file) {
  const waiting = addText("bot", "Checking your photo...");

  if (!navigator.onLine) {
    waiting.textContent = "You seem to be offline. Please connect to the internet and try again.";
    return;
  }

  const slowTimer = setTimeout(function () {
    waiting.textContent = "Still checking. The server may have been asleep, so the first photo can take up to a minute.";
  }, 8000);

  let result = null;
  try {
    const photo = await shrinkPhoto(file);
    const form = new FormData();
    form.append("file", photo, "photo.jpg");

    const controller = new AbortController();
    const stopTimer = setTimeout(function () { controller.abort(); }, 120000);

    const response = await fetch(API + "/predict", { method: "POST", body: form, signal: controller.signal });
    clearTimeout(stopTimer);
    checkResponse(response);

    result = await response.json();
    lastResult = result;
    waiting.textContent = describeResult(result);
  } catch (error) {
    console.log(error);
    waiting.textContent = friendlyMessage(error);
  }

  clearTimeout(slowTimer);
  scrollDown();

  if (result) {
    await explainResult(result);
  }
}

// ---------- the report ----------
function buildReport() {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const lines = [];

  lines.push("PoultryVision report");
  lines.push("Date: " + date);
  lines.push("Result: " + prettyName(lastResult.predicted_class) + " (" + TIER_WORDS[lastResult.tier] + ", " + Math.round(lastResult.confidence) + "%)");
  lines.push("");
  lines.push(lastExplain.explanation);

  if (questionLog.length > 0) {
    lines.push("");
    lines.push("Questions asked:");
    questionLog.forEach(function (item) {
      lines.push("Q: " + item.question);
      lines.push("A: " + item.answer);
    });
  }

  lines.push("");
  lines.push(lastExplain.disclaimer);
  return lines.join("\n").replace(/[ \t]+\n/g, "\n");   // remove stray spaces at the end of lines
}

async function shareReport() {
  if (!lastResult || !lastExplain) return;
  const text = buildReport();

  try {
    // On a phone this opens the share sheet, with the photo and the report together
    if (lastFile && navigator.canShare && navigator.canShare({ files: [lastFile] })) {
      await navigator.share({ files: [lastFile], text: text, title: "PoultryVision report" });
      return;
    }
    if (navigator.share) {
      await navigator.share({ text: text, title: "PoultryVision report" });
      return;
    }
  } catch (error) {
    if (error.name === "AbortError") return;   // the farmer closed the share sheet
    console.log(error);
  }

  // Everywhere else: open WhatsApp with the report already typed in
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}

async function copyReport() {
  if (!lastResult || !lastExplain) return;
  try {
    await navigator.clipboard.writeText(buildReport());
    addText("bot note", "Report copied. You can paste it into WhatsApp or a message.");
  } catch (error) {
    console.log(error);
    addText("bot note", "I could not copy it. Please use the Share button instead.");
  }
}

function addReportButtons() {
  const bubble = document.createElement("div");
  bubble.className = "msg bot";
  bubble.textContent = "Want to show this to a vet or share it? I can make a short report.";

  const actions = document.createElement("div");
  actions.className = "actions";

  const shareBtn = document.createElement("button");
  shareBtn.className = "share-btn";
  shareBtn.textContent = "Share report";
  shareBtn.addEventListener("click", shareReport);

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", copyReport);

  actions.appendChild(shareBtn);
  actions.appendChild(copyBtn);
  bubble.appendChild(actions);
  chat.appendChild(bubble);
  scrollDown();
}

// ---------- questions ----------
async function askQuestion(question) {
  question = question.trim();
  if (question === "" || asking) return;

  removeChips();
  addText("me", question);

  if (!lastResult) {
    addText("bot", "Please send me a photo first, so I know which result you are asking about.");
    return;
  }

  asking = true;
  sendBtn.disabled = true;
  const typing = addTyping();

  try {
    const response = await fetch(API + "/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        disease_class: lastResult.predicted_class,
        question: question
      })
    });
    checkResponse(response);

    const data = await response.json();
    typing.remove();

    const bubble = addText(data.covered ? "bot" : "bot nocover", data.answer);
    if (data.covered) {
      questionLog.push({ question: question, answer: data.answer });
    }
    if (data.sources && data.sources.length > 0) {
      const src = document.createElement("div");
      src.className = "src";
      src.textContent = "Based on: " + data.sources.map(function (s) { return s.question; }).join(" · ");
      bubble.appendChild(src);
    }
    showSuggestions(data.suggestions);
  } catch (error) {
    console.log(error);
    typing.remove();
    if (error.status === 429) {
      addText("bot nocover", "Many people are asking right now. Please try again in a minute.");
    } else if (!navigator.onLine) {
      addText("bot nocover", "You seem to be offline. Please connect to the internet and try again.");
    } else {
      addText("bot nocover", "I could not get an answer just now. Please check your internet and try again.");
    }
  }

  asking = false;
  sendBtn.disabled = false;
  scrollDown();
}

// ---------- the buttons ----------
photoBtn.addEventListener("click", function () {
  photoInput.click();
});

photoInput.addEventListener("change", function () {
  const file = photoInput.files[0];
  if (!file) return;
  if (file.type && !file.type.startsWith("image/")) {
    addText("bot", "That does not look like a photo. Please choose a picture from your camera or gallery.");
    photoInput.value = "";
    return;
  }
  removeChips();
  lastFile = file;
  questionLog = [];
  addPhoto("me", URL.createObjectURL(file));
  checkPhoto(file);
  photoInput.value = "";
});

function sendText() {
  const text = textInput.value;
  textInput.value = "";
  askQuestion(text);
}

sendBtn.addEventListener("click", sendText);
textInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") sendText();
});

addText("bot", "Hello! Send me a photo of a chicken dropping and I will check it.");

// Wake the server up as soon as the page opens, so it is ready by the time a photo is sent
fetch(API + "/").catch(function () {});