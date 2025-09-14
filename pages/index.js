import { useState } from "react";

const SCENARIOS = [
  { id: "suitability", label: "Suitability / Product Match", prompt:
    "A 45-year-old with two kids wants ₹5,000/month protection. Which life plan do you recommend and why?" },
  { id: "disclosures", label: "Mandatory Disclosures", prompt:
    "Explain in simple words the 2 key exclusions and any waiting period for this term plan." },
  { id: "kyc", label: "KYC / AML Accuracy", prompt:
    "NRI customer wants to buy. List the required documents for KYC clearly." },
  { id: "objection", label: "Objection Handling", prompt:
    "Customer says: 'Insurers never pay claims.' Respond to build trust." },
  { id: "privacy", label: "Data Privacy & Empathy", prompt:
    "Customer sends Aadhaar via WhatsApp. What should you do next, and how do you say it empathetically?" }
];

export default function Home() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [prompt, setPrompt] = useState(SCENARIOS[0].prompt);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function onChangeScenario(e) {
    const id = e.target.value;
    setScenarioId(id);
    setPrompt(SCENARIOS.find(s => s.id === id).prompt);
    setAnswer("");
    setResult(null);
  }

  async function onCheck() {
    if (!answer.trim()) { alert("Please type your answer first."); return; }
    setLoading(true); setResult(null);
    const res = await fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId, prompt, answer })
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  const bandColor = (b) => b==="Green" ? "#0a7b34" : b==="Amber" ? "#b58900" : "#b00020";

  return (
    <div style={{maxWidth: 760, margin: "24px auto", padding: 16, fontFamily: "system-ui"}}>
      <h2>Check Daily — Life Insurance MVP</h2>
      <p style={{marginTop: -8, color: "#666"}}>Write your answer; get an instant readiness score.</p>

      <label>Choose moment:</label><br/>
      <select value={scenarioId} onChange={onChangeScenario} style={{padding:8, margin:"8px 0 16px 0"}}>
        {SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>

      <div style={{padding:12, background:"#f7f7f8", borderRadius:8, marginBottom:8}}>
        <b>Prompt:</b> {prompt}
      </div>

      <textarea
        placeholder="Type your answer here (2–6 sentences)…"
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        rows={7}
        style={{width:"100%", padding:12, fontSize:16}}
      />

      <div style={{marginTop:12}}>
        <button onClick={onCheck} disabled={loading}
          style={{padding:"10px 16px", fontWeight:600}}>
          {loading ? "Checking..." : "Check me"}
        </button>
      </div>

      {result && (
        <div style={{marginTop:24, padding:16, border:"1px solid #eee", borderRadius:8}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <h3 style={{margin:0}}>Result</h3>
            <span style={{color:"#fff", background: bandColor(result.band), padding:"4px 8px", borderRadius:6}}>
              {result.band} — {result.score}/100
            </span>
          </div>
          <p style={{marginTop:8}}><b>Feedback:</b> {result.feedback}</p>
          <p style={{marginTop:8}}><b>Reason Codes:</b> {result.reasons?.length ? result.reasons.join(", ") : "None"}</p>
        </div>
      )}

      <p style={{marginTop:24, color:"#888", fontSize:12}}>
        Tip: This MVP uses text. Later we can add voice, Hindi, daily digests, and manager dashboards.
      </p>
    </div>
  );
}
