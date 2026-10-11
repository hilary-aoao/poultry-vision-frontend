# PoultryVision

A chat-style web app for small-scale poultry farmers. Send a photo of a chicken dropping and PoultryVision gives you one clear result (Healthy, Coccidiosis, Salmonella or Newcastle disease), says how sure it is, explains what it means in plain words, and answers follow-up questions. A short report can be shared on WhatsApp or shown to a vet.

**Live app:** https://poultryvision.netlify.app

**Backend API:** https://poultryvision-api.onrender.com (code: https://github.com/hilary-aoao/poultry-vision-backend)

The server sleeps when nobody has used it for a while, so the first photo of the day can take up to a minute. The page wakes the server as soon as it opens.

## What it does

- **A landing section, then a chat.** The top of the page explains the idea, and "Start a check" scrolls down to the chat.
- **One result, in plain words.** The photo is sent to the backend, and the chat shows only the most likely result, with how sure it is: quite sure, moderately sure, or not sure. A weak result asks for a clearer photo. Newcastle disease results carry an extra "confirm with a vet" note, because that class is the hardest to judge from a photo.
- **An explanation.** The backend writes a short explanation from a checked knowledge base. It appears as a few short chat bubbles. If another result is a real possibility, the chat says so in words ("there is a fair chance it could also be healthy").
- **Follow-up questions.** Suggested questions can be tapped, or you can type your own. Answers come only from the verified knowledge base, and each one shows which entries it is based on. If the knowledge base has no answer, the bot says it doesn't have verified information and points to a vet.
- **A report to share.** The chat builds a short report with the date, the result, the explanation and the questions asked. On a phone, the share sheet sends it with the photo attached. Elsewhere it opens WhatsApp with the text ready, or copies it.
- **Built for real conditions.** Photos are shrunk before they are sent, to save mobile data. There are clear messages for no internet, a busy server, a photo that is too big, and a file that is not a photo.

## How it fits together

```
Browser (this repo)  ->  FastAPI backend on Render  ->  ResNet18 image model (Hugging Face)
  index.html                 /predict  /explain  /ask     Groq language model (gpt-oss-20b)
  style.css                                               + a verified knowledge base
  script.js
```

The frontend only decides the wording and layout. All the medical information comes from the backend, which takes it from the knowledge base.

## Files

| File | What it holds |
|---|---|
| `index.html` | The structure: the landing section and the chat |
| `style.css` | The look |
| `script.js` | The behaviour: sending the photo, showing results, questions, the report |

## Run it locally

It is plain HTML, CSS and JavaScript, so there is nothing to install. Open the folder in VS Code and use the Live Server extension, or open `index.html` in a browser.

The page talks to the live backend. To use a backend running on your own computer, change the `API` line at the top of `script.js` to `http://127.0.0.1:8000`.

## Limits

- **It is a guide from a photo, not a vet's diagnosis.** If birds are sick, speak to a vet or an agricultural extension officer.
- Results depend on photo quality. Take the photo in daylight, close up, of one fresh dropping.
- Newcastle disease is the least reliable class in testing.
- The backend runs on free services, so the first request can be slow and heavy use can hit rate limits.
- English only for now.

## Privacy

The backend reads the photo to make the check and does not save it.

## Credits

Built by Hilary Orefo as a personal learning project.

Image model: ResNet18 trained in a Kaggle notebook.

Knowledge base sources: public health and veterinary sources, including the Ohio Department of Health, King County Public Health, dvm360, UMN Extension, the Merck Veterinary Manual and peer-reviewed zoonotic disease research.
