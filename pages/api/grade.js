export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { scenarioId, prompt, answer } = req.body || {};
  if (!answer || !prompt) return res.status(400).json({ error: "Missing prompt/answer" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

  // Fallback mock if no key
  if (!OPENAI_API_KEY) {
    const score = naiveScore(answer, scenarioId);
    const band = bandOf(score);
    return res.json({
      score, band,
      reasons: score < 80 ? ["Disclosure Gap"] : [],
      feedback: score < 80
        ? "Good start; mention exclusions and waiting period more clearly."
        : "Nice! Clear and compliant."
    });
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
    const score = Math.round((raw/10)*100);
    const band = bandOf(score);
    const reasons = Array.isArray(graded.reason_codes) ? graded.reason_codes.slice(0,2) : [];

    return res.json({
      score, band, reasons, feedback: graded.feedback || "Thank you."
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Grading failed. Try again." });
  }
}

function bandOf(score){
  if (score >= 80) return "Green";
  if (score >= 65) return "Amber";
  return "Red";
}

function naiveScore(answer, scenarioId){
  const a = answer.toLowerCase();
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
