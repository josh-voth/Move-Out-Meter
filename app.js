(() => {
  const CONFIG = window.MOVE_OUT_CONFIG || {};
  const STORAGE_KEY = "moveOutMeter.scenarios.v1";
  const MONTHS_TO_FORECAST = 36;

  const defaultState = {
    name: "Travis - Base Plan",
    paycheck: 963.25,
    paychecksPerYear: 26,
    extraIncome: 250,
    currentSavings: 1825,
    modelStartDate: "2026-10-01",
    targetMoveDate: "2027-01-01",
    expenses: [
      { id:"rent", name:"Rent", amount:750, type:"need", timing:"move", customDate:"" },
      { id:"utilities", name:"Utilities", amount:200, type:"need", timing:"move", customDate:"" },
      { id:"truck-insurance", name:"Truck insurance", amount:297.77, type:"need", timing:"now", customDate:"" },
      { id:"truck-maintenance", name:"Truck maintenance", amount:50, type:"need", timing:"now", customDate:"" },
      { id:"phone", name:"Phone", amount:45, type:"need", timing:"date", customDate:"2027-07-01" },
      { id:"groceries", name:"Groceries", amount:200, type:"need", timing:"move", customDate:"" },
      { id:"gas", name:"Gas", amount:200, type:"need", timing:"now", customDate:"" },
      { id:"restaurants", name:"Restaurants", amount:200, type:"want", timing:"now", customDate:"" },
      { id:"entertainment", name:"Entertainment", amount:250, type:"want", timing:"now", customDate:"" },
      { id:"gym", name:"Gym membership", amount:55, type:"want", timing:"now", customDate:"" }
    ],
    deposit: 750,
    firstMonthRent: 750,
    utilityDeposit: 250,
    movingCosts: 500,
    emergencyMonths: 2
  };

  let state = structuredClone(defaultState);
  let lastCalc = null;
  let toastTimer = null;

  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 }).format(Number.isFinite(n) ? n : 0);
  const money2 = n => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number.isFinite(n) ? n : 0);
  const monthLabel = d => new Intl.DateTimeFormat("en-US", { month:"short", year:"numeric", timeZone:"UTC" }).format(d);
  const longDate = d => new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric", timeZone:"UTC" }).format(d);
  const clamp = (n,min,max) => Math.min(max,Math.max(min,n));

  function parseDate(s){
    if(!s) return null;
    const [y,m,d] = s.split("-").map(Number);
    return new Date(Date.UTC(y,m-1,d||1));
  }
  function firstOfMonth(d){ return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
  function addMonths(d,n){ return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+n, 1)); }
  function monthKey(d){ return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`; }
  function monthsBetween(a,b){ return (b.getUTCFullYear()-a.getUTCFullYear())*12 + b.getUTCMonth()-a.getUTCMonth(); }
  function sameMonth(a,b){ return monthKey(a)===monthKey(b); }
  function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }

  function monthlyIncome(s=state){ return num(s.paycheck)*num(s.paychecksPerYear)/12 + num(s.extraIncome); }
  function allNeeds(s=state){ return s.expenses.filter(e=>e.type==="need").reduce((a,e)=>a+num(e.amount),0); }
  function allWants(s=state){ return s.expenses.filter(e=>e.type==="want").reduce((a,e)=>a+num(e.amount),0); }
  function moveOutFund(s=state){
    const emergency = num(s.emergencyMonths)*allNeeds(s);
    const oneTime = num(s.deposit)+num(s.firstMonthRent)+num(s.utilityDeposit)+num(s.movingCosts);
    return { emergency, oneTime, total: emergency+oneTime };
  }

  function expenseStart(exp, moveDate, modelStart){
    if(exp.timing === "move") return moveDate;
    if(exp.timing === "date") return firstOfMonth(parseDate(exp.customDate) || modelStart);
    return modelStart;
  }

  function simulate(s=state, moveDateOverride=null, months=MONTHS_TO_FORECAST){
    const modelStart = firstOfMonth(parseDate(s.modelStartDate) || new Date());
    const moveDate = firstOfMonth(moveDateOverride || parseDate(s.targetMoveDate) || modelStart);
    const income = monthlyIncome(s);
    const fund = moveOutFund(s);
    let savings = num(s.currentSavings);
    const rows=[];
    for(let i=0;i<months;i++){
      const date=addMonths(modelStart,i);
      const beginning=savings;
      let needs=0,wants=0;
      s.expenses.forEach(exp=>{
        const start=expenseStart(exp,moveDate,modelStart);
        if(date >= start){
          if(exp.type === "want") wants += num(exp.amount); else needs += num(exp.amount);
        }
      });
      const moveCosts = sameMonth(date,moveDate) ? fund.oneTime : 0;
      const net = income - needs - wants - moveCosts;
      const end = beginning + net;
      rows.push({date, beginning, income, needs, wants, moveCosts, net, end});
      savings=end;
    }
    return { rows, modelStart, moveDate, income, fund };
  }

  function fundsAtMove(s=state, moveDate=null){
    const sim=simulate(s, moveDate, 72);
    const row=sim.rows.find(r=>sameMonth(r.date,sim.moveDate));
    return row ? row.beginning : sim.rows.at(-1)?.end || num(s.currentSavings);
  }

  function recurringAtMonth(s, date, moveDate){
    const modelStart=firstOfMonth(parseDate(s.modelStartDate)||date);
    let needs=0,wants=0;
    s.expenses.forEach(exp=>{
      if(date >= expenseStart(exp,moveDate,modelStart)){
        if(exp.type==="want") wants += num(exp.amount); else needs += num(exp.amount);
      }
    });
    return {needs,wants,total:needs+wants,leftover:monthlyIncome(s)-needs-wants};
  }

  function earliestCashReady(s=state, maxMonths=72){
    const modelStart=firstOfMonth(parseDate(s.modelStartDate)||new Date());
    const goal=moveOutFund(s).total;
    for(let i=0;i<maxMonths;i++){
      const candidate=addMonths(modelStart,i);
      const cash=fundsAtMove(s,candidate);
      if(cash >= goal) return {date:candidate,cash};
    }
    return null;
  }

  function currentMonthRecurring(s=state){
    const modelStart=firstOfMonth(parseDate(s.modelStartDate)||new Date());
    const moveDate=firstOfMonth(parseDate(s.targetMoveDate)||modelStart);
    return recurringAtMonth(s,modelStart,moveDate);
  }

  function calculate(){
    syncStateFromInputs();
    const sim=simulate(state);
    const targetRow=sim.rows.find(r=>sameMonth(r.date,sim.moveDate)) || sim.rows[0];
    const fund=sim.fund;
    const cashAtTarget=targetRow?.beginning ?? state.currentSavings;
    const surplus=cashAtTarget-fund.total;
    const post=recurringAtMonth(state,sim.moveDate,sim.moveDate);
    const earliest=earliestCashReady(state);
    const current=currentMonthRecurring(state);
    const currentSavingsRate=sim.income-current.needs-current.wants;
    lastCalc={sim,targetRow,fund,cashAtTarget,surplus,post,earliest,current,currentSavingsRate};
    renderAll();
    return lastCalc;
  }

  function syncInputsFromState(){
    ["paycheck","paychecksPerYear","extraIncome","currentSavings","modelStartDate","targetMoveDate","deposit","firstMonthRent","utilityDeposit","movingCosts","emergencyMonths"].forEach(k=>$(k).value=state[k]);
    renderExpenseInputs();
  }

  function syncStateFromInputs(){
    state.paycheck=num($("paycheck").value); state.paychecksPerYear=num($("paychecksPerYear").value); state.extraIncome=num($("extraIncome").value); state.currentSavings=num($("currentSavings").value);
    state.modelStartDate=$("modelStartDate").value||defaultState.modelStartDate; state.targetMoveDate=$("targetMoveDate").value||defaultState.targetMoveDate;
    state.deposit=num($("deposit").value); state.firstMonthRent=num($("firstMonthRent").value); state.utilityDeposit=num($("utilityDeposit").value); state.movingCosts=num($("movingCosts").value); state.emergencyMonths=num($("emergencyMonths").value);
    document.querySelectorAll(".expense-row").forEach(row=>{
      const exp=state.expenses.find(e=>e.id===row.dataset.id); if(!exp) return;
      exp.amount=num(row.querySelector(".expense-amount").value);
      exp.timing=row.querySelector(".expense-timing").value;
      const cd=row.querySelector(".expense-date"); if(cd) exp.customDate=cd.value;
    });
  }

  function renderExpenseInputs(){
    const el=$("expenseList"); el.innerHTML="";
    state.expenses.forEach(exp=>{
      const row=document.createElement("div"); row.className="expense-row"; row.dataset.id=exp.id;
      row.innerHTML=`
        <div><div class="expense-name">${escapeHtml(exp.name)} <span class="tag ${exp.type}">${exp.type==="need"?"BILL":"FUN"}</span></div><label>Monthly amount<div class="money-input"><span>$</span><input class="expense-amount" inputmode="decimal" type="number" min="0" step="0.01" value="${num(exp.amount)}"></div></label></div>
        <label>Starts<select class="expense-timing"><option value="now" ${exp.timing==="now"?"selected":""}>Now</option><option value="move" ${exp.timing==="move"?"selected":""}>At move</option><option value="date" ${exp.timing==="date"?"selected":""}>Custom</option></select></label>
        <button type="button" class="delete-expense" aria-label="Delete ${escapeHtml(exp.name)}">×</button>
        <label class="timing-field ${exp.timing==="date"?"":"hidden"}">Custom date<input class="expense-date" type="date" value="${exp.customDate||""}"></label>`;
      row.querySelector(".expense-timing").addEventListener("change",e=>{ exp.timing=e.target.value; row.querySelector(".timing-field").classList.toggle("hidden",exp.timing!=="date"); calculate(); });
      row.querySelector(".expense-amount").addEventListener("input",debounce(calculate,80));
      row.querySelector(".expense-date").addEventListener("change",calculate);
      row.querySelector(".delete-expense").addEventListener("click",()=>{ if(state.expenses.length<=1) return; state.expenses=state.expenses.filter(e=>e.id!==exp.id); renderExpenseInputs(); calculate(); });
      el.appendChild(row);
    });
  }

  function renderAll(){
    if(!lastCalc) return;
    const c=lastCalc;
    const pct=clamp(c.cashAtTarget/c.fund.total*100,0,100);
    $("progressBar").style.width=`${pct}%`;
    $("progressText").textContent=`${money(c.cashAtTarget)} ready`;
    $("goalText").textContent=`${money(c.fund.total)} goal`;
    $("fundsAtTarget").textContent=money2(c.cashAtTarget);
    $("moveOutGoal").textContent=money2(c.fund.total);
    $("earliestDate").textContent=c.earliest?longDate(c.earliest.date):"Beyond forecast";
    $("postMoveLeftover").textContent=`${money2(c.post.leftover)}/mo`;
    $("postMoveLeftover").style.color=c.post.leftover<0?"#ff9a92":"";
    $("monthlyIncome").textContent=money2(c.sim.income);
    $("preMoveSavings").textContent=`${money2(c.currentSavingsRate)}/mo`;
    $("wantSpend").textContent=`${money2(allWants(state))}/mo`;
    $("needTotal").textContent=`${money2(allNeeds(state))}/mo`;
    $("wantsTotal").textContent=`${money2(allWants(state))}/mo`;
    $("currentNeedSpend").textContent=`${money2(c.current.needs)}/mo`;
    $("yearlyWants").textContent=`${money2(allWants(state)*12)}/year`;
    $("weeklyWants").textContent=`${money2(allWants(state)*12/52)}/week`;
    $("heroTargetDate").textContent=new Intl.DateTimeFormat("en-US",{month:"short",year:"numeric",timeZone:"UTC"}).format(c.sim.moveDate);
    const savePct=Math.round(c.currentSavingsRate/Math.max(c.sim.income,1)*100);
    $("saveRateChip").textContent=c.currentSavingsRate>=0?`${savePct}% headed to savings`:`Spending more than you make`;
    $("saveRateChip").style.background=c.currentSavingsRate>=0?"":"#feecea";
    $("saveRateChip").style.color=c.currentSavingsRate>=0?"":"#a22820";

    const badge=$("statusBadge"), title=$("statusTitle"), sub=$("statusSubtitle"), msg=$("actionMessage");
    badge.className="status-badge";
    const weeksToMove=Math.max(1,Math.round((c.sim.moveDate-c.sim.modelStart)/(7*24*60*60*1000)));
    const weeklyGap=Math.abs(c.surplus)/weeksToMove;
    if(c.post.leftover < 0){
      badge.classList.add("nope"); badge.textContent="MONTHLY MONEY DOESN'T WORK";
      title.textContent="You can get the keys, but you can't keep paying the bills.";
      sub.textContent=`After you move, your normal monthly spending is ${money(Math.abs(c.post.leftover))} more than your take-home pay.`;
      msg.innerHTML=`<strong>Fix this before you sign.</strong> You need to cut bills/fun money or earn at least <strong>${money(Math.abs(c.post.leftover))} more each month</strong>.`;
    } else if(c.surplus >= 0){
      badge.classList.add("ready"); badge.textContent="TARGET WORKS";
      title.textContent="You're on track to get the keys.";
      sub.textContent=`By ${longDate(c.sim.moveDate)}, you should have ${money(c.surplus)} more than your move-out cash goal.`;
      msg.innerHTML=`After the move, you'd have about <strong>${money(c.post.leftover)} left each month</strong>. That's your cushion for surprises, saving, and life.`;
    } else if(Math.abs(c.surplus) <= Math.max(100,c.fund.total*.05)){
      badge.classList.add("close"); badge.textContent="VERY CLOSE";
      title.textContent=`You're only ${money(Math.abs(c.surplus))} short.`;
      sub.textContent=`Your ${longDate(c.sim.moveDate)} goal is within reach without blowing up your whole life.`;
      const wait=c.earliest?Math.max(0,monthsBetween(c.sim.moveDate,c.earliest.date)):null;
      msg.innerHTML=weeklyGap<1?`Find <strong>about $1 a week</strong> between now and move day and you close the gap.`:`Find about <strong>${money(Math.ceil(weeklyGap))} a week</strong> between now and move day and you close the gap.${wait>0?` Otherwise, the current plan points to <strong>${longDate(c.earliest.date)}</strong>.`:""}`;
    } else {
      badge.classList.add("nope"); badge.textContent="NOT READY YET";
      title.textContent=`You're ${money(Math.abs(c.surplus))} away from the keys.`;
      sub.textContent=`That's the cash gap on ${longDate(c.sim.moveDate)}. The plan is showing you exactly what has to change.`;
      const wait=c.earliest?Math.max(0,monthsBetween(c.sim.moveDate,c.earliest.date)):null;
      const weekly=money(Math.ceil(weeklyGap));
      msg.innerHTML=wait!==null?`To keep the same move date, free up about <strong>${weekly} a week</strong>. If nothing changes, your cash-ready date is <strong>${longDate(c.earliest.date)}</strong>.`:`The current plan doesn't reach the cash goal yet. Start with fun money, then look at rent and income.`;
    }

    renderFundBreakdown(); renderLeaks(); renderChart(); renderDonut(); renderForecast(); renderReportingNotice();
  }

  function renderFundBreakdown(){
    const c=lastCalc; const parts=[
      ["Deposit",state.deposit],["First rent",state.firstMonthRent],["Utility deposit",state.utilityDeposit],["Moving/setup",state.movingCosts],["Emergency fund",c.fund.emergency]
    ];
    const max=Math.max(...parts.map(p=>num(p[1])),1);
    $("fundBreakdown").innerHTML=parts.map(([label,value])=>`<div class="fund-row"><span>${label}</span><div class="fund-bar-track"><div class="fund-bar" style="width:${clamp(num(value)/max*100,2,100)}%"></div></div><strong>${money(value)}</strong></div>`).join("")+`<div class="fund-total"><span>Total cash target</span><strong>${money2(c.fund.total)}</strong></div>`;
  }

  function renderLeaks(){
    const wants=state.expenses.filter(e=>e.type==="want"&&num(e.amount)>0).sort((a,b)=>b.amount-a.amount);
    const goal=Math.max(lastCalc.fund.total,1);
    $("leakCards").innerHTML=(wants.length?wants.slice(0,3):[{name:"No want spending",amount:0}]).map(exp=>{
      const annual=num(exp.amount)*12; const pct=annual/goal*100;
      return `<article class="leak-card"><div class="leak-name">${escapeHtml(exp.name)}</div><strong>${money(exp.amount)}/mo</strong><p>${money(annual)} a year. That is ${Math.round(pct)}% of all the cash you need to move out.</p></article>`;
    }).join("");

    const halfState=structuredClone(state); halfState.expenses.forEach(e=>{if(e.type==="want")e.amount=num(e.amount)*.5});
    const halfEarliest=earliestCashReady(halfState); const baseEarliest=lastCalc.earliest;
    const baseTargetCash=lastCalc.cashAtTarget; const halfTargetCash=fundsAtMove(halfState,parseDate(state.targetMoveDate));
    const gain=halfTargetCash-baseTargetCash;
    let dateText="";
    if(baseEarliest&&halfEarliest){
      const savedMonths=Math.max(0,monthsBetween(halfEarliest.date,baseEarliest.date));
      dateText=savedMonths>0?` That pulls the cash-ready date forward about <strong>${savedMonths} month${savedMonths===1?"":"s"}</strong>.`:" Your cash-ready month stays the same, but the cushion gets thicker.";
    }
    $("cutHalfCard").innerHTML=`<strong>Try this:</strong> cut your fun money in half. You would have about <strong>${money(gain)} extra</strong> by move day.${dateText}`;
  }

  function renderChart(){
    const rows=lastCalc.sim.rows.slice(0,18); if(!rows.length) return;
    const w=760,h=250,pad={l:55,r:18,t:18,b:36};
    const vals=rows.flatMap(r=>[r.end,r.beginning]); vals.push(lastCalc.fund.total, lastCalc.fund.emergency);
    const min=Math.min(0,...vals), max=Math.max(...vals,1); const span=max-min||1;
    const x=i=>pad.l+(w-pad.l-pad.r)*(i/Math.max(rows.length-1,1));
    const y=v=>pad.t+(h-pad.t-pad.b)*(1-(v-min)/span);
    const pts=rows.map((r,i)=>`${x(i)},${y(r.end)}`).join(" ");
    const area=`${pad.l},${h-pad.b} ${pts} ${x(rows.length-1)},${h-pad.b}`;
    const yTicks=4; let grid="";
    for(let i=0;i<=yTicks;i++){const v=min+span*(i/yTicks); const yy=y(v); grid+=`<line x1="${pad.l}" y1="${yy}" x2="${w-pad.r}" y2="${yy}" stroke="#eef0f3"/><text x="${pad.l-8}" y="${yy+3}" text-anchor="end" class="chart-axis">${compactMoney(v)}</text>`;}
    const labels=rows.map((r,i)=>i%3===0?`<text x="${x(i)}" y="${h-10}" text-anchor="middle" class="chart-axis">${monthLabel(r.date).replace(" "," ’")}</text>`:"").join("");
    const targetIndex=rows.findIndex(r=>sameMonth(r.date,lastCalc.sim.moveDate)); const tx=targetIndex>=0?x(targetIndex):null;
    const emergencyY=y(lastCalc.fund.emergency);
    $("savingsChart").innerHTML=`<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#35a675" stop-opacity=".24"/><stop offset="100%" stop-color="#35a675" stop-opacity=".02"/></linearGradient></defs>${grid}<line x1="${pad.l}" y1="${y(lastCalc.fund.total)}" x2="${w-pad.r}" y2="${y(lastCalc.fund.total)}" class="chart-goal"/><text x="${w-pad.r}" y="${y(lastCalc.fund.total)-6}" text-anchor="end" class="chart-label">Cash goal ${compactMoney(lastCalc.fund.total)}</text><line x1="${pad.l}" y1="${emergencyY}" x2="${w-pad.r}" y2="${emergencyY}" class="chart-emergency"/><text x="${w-pad.r}" y="${emergencyY-6}" text-anchor="end" class="chart-emergency-label">Minimum emergency fund ${compactMoney(lastCalc.fund.emergency)}</text>${tx!==null?`<line x1="${tx}" y1="${pad.t}" x2="${tx}" y2="${h-pad.b}" class="chart-target"/><text x="${tx+5}" y="${pad.t+11}" class="chart-axis">Target move</text>`:""}<polygon points="${area}" class="chart-area"/><polyline points="${pts}" class="chart-line"/>${rows.map((r,i)=>i===0||i===rows.length-1||sameMonth(r.date,lastCalc.sim.moveDate)?`<circle cx="${x(i)}" cy="${y(r.end)}" r="4" class="chart-dot"/>`:"").join("")}${labels}</svg>`;
  }

  function renderDonut(){
    const inc=lastCalc.sim.income; const cur=lastCalc.current; const left=inc-cur.needs-cur.wants;
    const needPct=clamp(cur.needs/Math.max(inc,1)*100,0,100), wantPct=clamp(cur.wants/Math.max(inc,1)*100,0,100-needPct), savePct=clamp(100-needPct-wantPct,0,100);
    $("spendDonut").style.background=`conic-gradient(#637083 0 ${needPct}%, #d99c44 ${needPct}% ${needPct+wantPct}%, #35a675 ${needPct+wantPct}% 100%)`;
    $("donutSave").textContent=money(left);
    $("splitLegend").innerHTML=[
      ["#64736b","Bills & basics now",cur.needs],["#d99c44","Fun money now",cur.wants],["#2aa66f",left>=0?"Going to savings":"Monthly shortfall",Math.abs(left)]
    ].map(([color,label,val])=>`<div class="legend-row"><i class="legend-dot" style="background:${color}"></i><span>${label}</span><strong>${money(val)}</strong></div>`).join("");
  }

  function renderForecast(){
    $("forecastBody").innerHTML=lastCalc.sim.rows.slice(0,24).map(r=>`<tr class="${sameMonth(r.date,lastCalc.sim.moveDate)?"target-row":""}"><td>${monthLabel(r.date)}</td><td>${money2(r.beginning)}</td><td>${money2(r.income)}</td><td>${money2(r.needs)}</td><td>${money2(r.wants)}</td><td>${money2(r.moveCosts)}</td><td class="${r.net<0?"negative":"positive"}">${money2(r.net)}</td><td>${money2(r.end)}</td></tr>`).join("");
  }

  function renderReportingNotice(){
    const notice=$("reportingNotice");
    if(CONFIG.reportEndpoint){ notice.textContent=CONFIG.reportingNotice||"A summary is sent to the site owner when you run this plan."; notice.classList.remove("hidden"); }
    else notice.classList.add("hidden");
  }

  async function sendReport(){
    if(!CONFIG.reportEndpoint || !lastCalc) return;
    const payload={
      event:"plan_run", sentAt:new Date().toISOString(), planName:state.name||"Unnamed plan",
      summary:{targetMoveDate:state.targetMoveDate,currentSavings:state.currentSavings,monthlyIncome:lastCalc.sim.income,monthlyWants:allWants(state),moveOutCashNeeded:lastCalc.fund.total,cashAtTarget:lastCalc.cashAtTarget,surplusShortfall:lastCalc.surplus,postMoveMonthlyLeftover:lastCalc.post.leftover,earliestCashReadyDate:lastCalc.earliest?lastCalc.earliest.date.toISOString().slice(0,10):null},
      plan:state
    };
    try{ await fetch(CONFIG.reportEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),mode:"cors",keepalive:true}); }
    catch(err){ console.warn("Owner report could not be sent",err); }
  }

  function getSaved(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return []} }
  function setSaved(list){ localStorage.setItem(STORAGE_KEY,JSON.stringify(list)); }
  function saveScenario(){
    syncStateFromInputs();
    const name=prompt("Name this plan:",state.name||"My move-out plan"); if(!name) return;
    state.name=name.trim(); const list=getSaved(); const id=crypto.randomUUID?crypto.randomUUID():String(Date.now());
    list.unshift({id,name:state.name,savedAt:new Date().toISOString(),state:structuredClone(state)}); setSaved(list.slice(0,30)); showToast("Plan saved on this device"); renderSavedList();
  }
  function renderSavedList(){
    const list=getSaved(), el=$("savedList");
    if(!list.length){el.innerHTML=`<div class="empty-state">No saved plans yet. Save one after you get the numbers where you want them.</div>`;return;}
    el.innerHTML=list.map(item=>`<div class="saved-item" data-id="${item.id}"><div><strong>${escapeHtml(item.name)}</strong><span>${new Date(item.savedAt).toLocaleString()}</span></div><button type="button" class="load-plan">Load</button><button type="button" class="remove-plan">Delete</button></div>`).join("");
    el.querySelectorAll(".saved-item").forEach(row=>{
      const item=list.find(i=>i.id===row.dataset.id);
      row.querySelector(".load-plan").onclick=()=>{state=structuredClone(item.state);syncInputsFromState();calculate();$("savedDialog").close();showToast("Plan loaded")};
      row.querySelector(".remove-plan").onclick=()=>{if(confirm(`Delete “${item.name}”?`)){setSaved(getSaved().filter(i=>i.id!==item.id));renderSavedList();showToast("Plan deleted")}};
    });
  }

  function encodePlan(obj){ const bytes=new TextEncoder().encode(JSON.stringify(obj)); let bin="";bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin).replaceAll("+","-").replaceAll("/","_").replaceAll("=",""); }
  function decodePlan(str){ let s=str.replaceAll("-","+").replaceAll("_","/"); while(s.length%4)s+="="; const bin=atob(s); const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(bytes)); }
  function sharePlan(){
    syncStateFromInputs(); const base=location.href.split("#")[0]; const url=`${base}#plan=${encodePlan(state)}`;
    if(navigator.share){ navigator.share({title:"My move-out plan",text:"Here’s the move-out plan I ran.",url}).catch(()=>{}); }
    else navigator.clipboard?.writeText(url).then(()=>showToast("Share link copied"));
  }
  function loadSharedPlan(){
    const m=location.hash.match(/^#plan=(.+)$/); if(!m) return false;
    try{const incoming=decodePlan(m[1]); if(incoming&&incoming.expenses){state={...structuredClone(defaultState),...incoming};$("sharedBanner").classList.remove("hidden");return true;}}catch(err){console.warn("Bad shared plan",err)} return false;
  }

  function addExpense(){
    const name=$("newExpenseName").value.trim(); if(!name) return;
    const timing=$("newExpenseTiming").value;
    state.expenses.push({id:`custom-${Date.now()}`,name,amount:num($("newExpenseAmount").value),type:$("newExpenseType").value,timing,customDate:timing==="date"?$("newExpenseDate").value:""});
    renderExpenseInputs();calculate();$("expenseForm").reset();$("newExpenseDateWrap").classList.add("hidden");showToast("Expense added");
  }

  function bind(){
    ["paycheck","paychecksPerYear","extraIncome","currentSavings","deposit","firstMonthRent","utilityDeposit","movingCosts","emergencyMonths"].forEach(id=>$(id).addEventListener("input",debounce(calculate,80)));
    ["modelStartDate","targetMoveDate"].forEach(id=>$(id).addEventListener("change",calculate));
    $("runBtn").addEventListener("click",async()=>{calculate();await sendReport();showToast("Numbers updated")});
    $("saveBtn").addEventListener("click",saveScenario); $("shareBtn").addEventListener("click",sharePlan);
    $("savedBtn").addEventListener("click",()=>{renderSavedList();$("savedDialog").showModal()});
    $("addExpenseBtn").addEventListener("click",()=>$("expenseDialog").showModal());
    $("newExpenseTiming").addEventListener("change",e=>$("newExpenseDateWrap").classList.toggle("hidden",e.target.value!=="date"));
    $("expenseForm").addEventListener("submit",e=>{e.preventDefault();addExpense();$("expenseDialog").close()});
  }

  function compactMoney(v){const a=Math.abs(v);const sign=v<0?"-":"";if(a>=1000000)return`${sign}$${(a/1000000).toFixed(1)}m`;if(a>=1000)return`${sign}$${(a/1000).toFixed(a>=10000?0:1)}k`;return`${sign}$${Math.round(a)}`}
  function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
  function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}}
  function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),1800)}

  loadSharedPlan(); syncInputsFromState(); bind(); calculate();
})();
