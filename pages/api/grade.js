export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let { scenarioId, prompt, answer, pasted, cps } = req.body || {};
  if (!answer || !prompt) return res.status(400).json({ error: "Missing prompt/answer" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

  // --- baseline result buckets ---
  let score = 60;
  let band = "Amber";
  let reasons = [];
  let feedback = "Thank you.";
  const flags = [];

  // --- simple behavior heuristics ---
  // Paste flag from frontend
  if (pasted) flags.push("Paste detected");
  // Very high chars-per-second likely indicates paste (threshold tuned conservatively)
  if (typeof cps === "number" && cps > 15) flags.push(`Unnatural typing speed (${cps} cps)`);

  // --- if no API key, run mock grading so UI still works ---
  if (!OPENAI_API_KEY) {
    score = naiveScore(answer, scenarioId);
    band = bandOf(score);
    if (score < 80) {
      reasons = ["Disclosure Gap"];
      feedback = "Good start; mention exclusions and waiting period more clearly.";
    } else {
      feedback = "Nice! Clear and compliant.";
    }
    // apply anti-cheat penalty
    ({ score, band, reasons, feedback } = applyAntiCheatPenalty({ score, band, reasons, feedback, flags }));
    return res.json({ score, band, reasons, feedback, flags });
  }

  try {
    const sys = `You are a QA grader for Term Life insurance.
Return STRICT JSON only with keys: rubric:{accuracy,clarity,empathy,data,nba}, feedback, reason_codes.
Each rubric key must be 0,1,2. reason_codes must be from this list only:
["Disclosure Gap","Suitability Risk","KYC/AML Risk","Objection Handling Gap","Data Privacy Risk","Empathy Gap","Process Adherence Gap"].`;

    const user = `Moment: ${scenarioId}
Prompt: ${prompt}
Agent answer: """${answer}"""`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        response_format: { type: "json_object" }
      })
    });

    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content || "{}";

    let graded;
    try { graded = JSON.parse(text); }
    catch { graded = { rubric:{accuracy:1,clarity:1,empathy:1,data:1,nba:1}, feedback:"Parsed fallback.", reason_codes:["Process Adherence Gap"]}; }

    const rub = graded.rubric || {};
    const raw = ["accuracy","clarity","empathy","data","nba"].reduce((sum,k)=> sum + (+rub[k]||0), 0);
    score = Math.round((raw/10)*100);
    band = bandOf(score);
    reasons = Array.isArray(graded.reason_codes) ? graded.reason_codes.slice(0,2) : [];
    feedback = graded.feedback || "Thank you.";

    // apply anti-cheat penalty
    ({ score, band, reasons, feedback } = applyAntiCheatPenalty({ score, band, reasons, feedback, flags }));

    return res.json({ score, band, reasons, feedback, flags });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Grading failed. Try again." });
  }
}

// ---------- helpers ----------
function bandOf(score){
  if (score >= 80) return "Green";
  if (score >= 65) return "Amber";
  return "Red";
}

function naiveScore(answer, scenarioId){
  const a = (answer || "").toLowerCase();
  let s = 60;
  if (scenarioId==="disclosures") {
    if (a.includes("exclusion")) s += 15;
    if (a.includes("waiting")) s += 10;
    if (a.includes("pre-existing")) s += 5;
  }
  if (scenarioId==="kyc") {
    ["passport","pan","aadhaar","address","nri"].forEach(k=>{ if(a.includes(k)) s+=5; });
  }
  if (scenarioId==="objection") {
    ["claim","settlement","ratio","trust","process"].forEach(k=>{ if(a.includes(k)) s+=4; });
  }
  if (scenarioId==="suitability") {
    ["term","sum assured","premium","benefit"].forEach(k=>{ if(a.includes(k)) s+=4; });
  }
  if (scenarioId==="privacy") {
    ["do not","whatsapp","mask","secure","consent","portal"].forEach(k=>{ if(a.includes(k)) s+=4; });
  }
  return Math.max(40, Math.min(95, s));
}

function applyAntiCheatPenalty({ score, band, reasons, feedback, flags }) {
  const suspicious = flags.length > 0;
  if (suspicious) {
    // cap at Amber, subtract up to 15 points
    if (score > 70) score = Math.max(55, score - 15);
    band = bandOf(score);
    if (!reasons.includes("AI/Copy-Paste Suspicion")) reasons = [...reasons, "AI/Copy-Paste Suspicion"];
    feedback = (feedback || "Thank you.") + " Note: Your response appears pasted or unnaturally fast. Please answer in your own words.";
  }
  return { score, band, reasons, feedback };
}
