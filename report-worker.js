/**
 * Optional Cloudflare Worker for disclosed owner email reports.
 *
 * Required Worker secrets / vars:
 *   RESEND_API_KEY  = re_...
 *   REPORT_TO       = you@example.com
 *   REPORT_FROM     = Planner <planner@your-verified-domain.com>
 *   ALLOWED_ORIGIN  = https://YOURNAME.github.io
 *
 * After deployment, put the Worker URL in config.js -> reportEndpoint.
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const cors = {
      "Access-Control-Allow-Origin": origin === allowed ? origin : allowed,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status:204, headers:cors });
    if (request.method !== "POST") return new Response("Method not allowed", { status:405, headers:cors });
    if (allowed && origin !== allowed) return new Response("Origin not allowed", { status:403, headers:cors });

    let data;
    try { data = await request.json(); } catch { return new Response("Bad JSON", { status:400, headers:cors }); }
    const s = data.summary || {};
    const usd = n => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(Number(n)||0);
    const subject = `Move Out Meter run: ${data.planName || "Unnamed plan"}`;
    const html = `
      <h2>${escapeHtml(subject)}</h2>
      <table cellpadding="7" cellspacing="0" border="0">
        <tr><td><b>Target move date</b></td><td>${escapeHtml(s.targetMoveDate || "")}</td></tr>
        <tr><td><b>Current savings</b></td><td>${usd(s.currentSavings)}</td></tr>
        <tr><td><b>Monthly income</b></td><td>${usd(s.monthlyIncome)}</td></tr>
        <tr><td><b>Monthly wants</b></td><td>${usd(s.monthlyWants)}</td></tr>
        <tr><td><b>Move-out cash needed</b></td><td>${usd(s.moveOutCashNeeded)}</td></tr>
        <tr><td><b>Cash at target</b></td><td>${usd(s.cashAtTarget)}</td></tr>
        <tr><td><b>Surplus / shortfall</b></td><td>${usd(s.surplusShortfall)}</td></tr>
        <tr><td><b>Post-move monthly leftover</b></td><td>${usd(s.postMoveMonthlyLeftover)}</td></tr>
        <tr><td><b>Earliest cash-ready date</b></td><td>${escapeHtml(s.earliestCashReadyDate || "Not reached")}</td></tr>
      </table>
      <p style="color:#667085;font-size:12px">Generated ${escapeHtml(data.sentAt || "")}</p>`;

    const res = await fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{"Authorization":`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({from:env.REPORT_FROM,to:[env.REPORT_TO],subject,html})
    });
    if(!res.ok) return new Response("Email provider error", { status:502, headers:cors });
    return new Response(JSON.stringify({ok:true}), { status:200, headers:{...cors,"Content-Type":"application/json"} });
  }
};
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
