/* ============================================================
   Happy Roof — Roofing Assistant Chatbot
   chat.js  |  Embedded on all pages
   ============================================================
   Features:
   - Floating chat widget (bottom-right)
   - Roofing knowledge base with intent matching
   - Conversation summary → email (info@happyroof.com)
   - Live operator escalation (SMS, number TBD)
   ============================================================ */

(function () {
  'use strict';

  // ── Knowledge base ──────────────────────────────────────────
  const KB = [
    {
      intents: ['hello','hi','hey','howdy','good morning','good afternoon','good evening','start','help'],
      response: `Hey there! 👋 I'm the Happy Roof assistant. I can answer questions about our roofing services, pricing, warranties, and more.\n\nWhat can I help you with today?`,
      quick: ['Get a free estimate','What services do you offer?','How much does a roof cost?','Emergency repair']
    },
    {
      intents: ['estimate','quote','price','cost','how much','free estimate','free inspection','ballpark','rough estimate'],
      response: `Great question! We offer **free estimates** with no obligation.\n\n📞 Call or text us at **(813) 595-7663**\n🕐 Mon–Fri 9am–5pm\n\nWant a **rough ballpark right now?** I can calculate a price range based on your roof type and home size — just know it's an estimate that needs a real inspection to confirm.\n\nOr fill out the quick estimate form on our home page and we'll get back to you within 1 business day.`,
      quick: ['Get a rough ballpark estimate','Yes, contact me','What affects roof cost?']
    },
    {
      intents: ['service','offer','do you','what do','what can','residential','commercial','repair','replace','replacement','reroof','re-roof'],
      response: `Happy Roof covers everything roofing-related:\n\n🏠 **Residential** — Shingle, tile, metal, flat roof replacements & repairs\n🏢 **Commercial** — Flat, TPO, mod-bit, and low-slope systems\n🔍 **Inspections** — Free roof inspections & storm damage assessments\n⚡ **Emergency** — 48-hr response for active leaks\n🌧️ **Storm Damage** — Insurance claim support\n🏗️ **Gutters** — Installation and repair\n\nAll work managed by our licensed team with quality oversight on every project. What type of project do you have?`,
      quick: ['Roof replacement','Roof repair','Emergency leak','Storm damage']
    },
    {
      intents: ['warranty','guarantee','how long','15 year','10 year','workmanship'],
      response: `Happy Roof stands behind its work with industry-leading warranties:\n\n✅ **15-Year Workmanship Warranty** — Shingle, Metal & Tile roofs\n✅ **10-Year Workmanship Warranty** — Flat roof installations\n✅ **Manufacturer warranties** — Up to lifetime on qualifying GAF, Owens Corning, Verea, and Gulfcoast Supply products\n\nThese are *in addition* to manufacturer warranties, giving you dual coverage. Any other questions?`,
      quick: ['What brands do you use?','Get a free estimate','Contact the team']
    },
    {
      intents: ['brand','material','owens','corning','verea','tile','shingle','metal','tpo','flat','membrane','gulf'],
      response: `We work with the industry's best manufacturers. Our preferred vendors:\n\n🔶 **Owens Corning** — All shingles: Duration HDZ, UHDZ, Oakridge, Berkshire (Preferred Contractor)\n🧱 **Verea Clay** — All tile: barrel, S-tile, flat profiles (vereaclaytile.com)\n⚙️ **Gulfcoast Supply** — All metal: standing seam, corrugated, exposed fastener (gulfcoastsupply.com)\n🏗️ **Flat Systems** — TPO, mod-bit, torch-down\n\nWe also install GAF, Titan, Atlas, TriCounty Metals, Crown Roof Tiles, and others by request. Want help choosing the right material?`,
      quick: ['What lasts longest?','Which is most affordable?','Get a quote']
    },
    {
      intents: ['emergency','leak','urgent','active leak','flooding','water','storm hit','night','weekend','asap','right now'],
      response: `⚡ **Emergency roofing situations — call us directly:**\n\n📞 **(813) 595-7663**\n\nWe offer **48-hour emergency response** for active leaks and storm damage. For after-hours emergencies, leave a voicemail with your name, address, and situation and we'll call back as soon as possible.\n\nStay safe and avoid the affected area if possible. Is there anything else I can help with?`,
      quick: ['Contact the team','Storm damage help','Insurance questions']
    },
    {
      intents: ['storm','hurricane','wind','hail','damage','insurance','claim','adjuster','deductible'],
      response: `Storm damage to your roof? We help at every step:\n\n1️⃣ **Free storm damage inspection** — we document everything\n2️⃣ **Work with your adjuster** — we can meet on-site\n3️⃣ **Supplement support** — we make sure you get what you're owed\n4️⃣ **Expert installation** — no shortcuts, all code-compliant\n\nInsurance claims are part of what we do every day in Tampa Bay. Want to schedule a free inspection?`,
      quick: ['Schedule inspection','Call (813) 595-7663','How long does it take?']
    },
    {
      intents: ['how long','timeline','days','weeks','project','schedule','how fast','turnaround'],
      response: `Timelines vary by project type:\n\n🏠 **Residential replacement** — typically 1–2 days once materials arrive\n🔧 **Repair** — often same week, sometimes next day\n🏢 **Commercial** — 2–7 days depending on size\n📋 **Permit & ordering** — 1–2 weeks before install\n\nWe'll give you a specific timeline during your free estimate. Want to get the process started?`,
      quick: ['Schedule estimate','Call us now','More questions']
    },
    {
      intents: ['location','where','address','oldsmar','tampa','clearwater','st pete','pinellas','hillsborough','pasco','county','serve','area'],
      response: `Happy Roof is based in **Oldsmar, FL** (141 Stevens Ave) and serves the greater Tampa Bay area:\n\n📍 Hillsborough County\n📍 Pinellas County\n📍 Pasco County\n\nIf you're not sure if we serve your area, just call us at **(813) 595-7663** and we'll let you know!\n\nAnything else I can help with?`,
      quick: ['Get a quote','Call us','Services offered']
    },
    {
      intents: ['license','licensed','insured','bonded','certified','credential','ccc'],
      response: `Yes — Happy Roof is fully licensed, bonded, and insured:\n\n📋 **State License:** #CCC1337380\n🛡️ **Fully insured** — general liability + workers' comp\n✅ **Owens Corning Preferred** contractor\n\nYou can verify our license at myfloridalicense.com. Peace of mind, always.`,
      quick: ['Get an estimate','Learn about warranties','Contact us']
    },
    {
      intents: ['pay','payment','finance','financing','credit','deposit','cash','check','down payment'],
      response: `We accept multiple payment methods including check, credit card, and ACH bank transfer. Financing options may be available — ask your project manager during your estimate appointment.\n\nWe typically collect a deposit at signing and final payment upon job completion. No payment is due until you're satisfied with the work.\n\nWant to get an estimate started?`,
      quick: ['Schedule estimate','Call (813) 595-7663','Other questions']
    },
    {
      intents: ['referral','refer','friend','family','bonus','earn','reward'],
      response: `🎉 Our referral program pays **up to $1,000 per referral!**\n\n💵 **Tier 1** — Estimate completed: **$50**\n💵 **Tier 2** — Any repair closed: **$125**\n💵 **Tier 3** — Roof replacement up to $12,500: **$250**\n💵 **Tier 4** — Roof replacement up to $25,000: **$500**\n💵 **Tier 5** — Roof replacement up to $40,000: **$750**\n💵 **Tier 6** — Roof replacement $40,001+: **$1,000**\n\nTiers stack — if your referral completes an estimate *and* closes a job, you earn both payouts. No cap, no expiration. Visit our Referrals page to learn more!`,
      quick: ['Go to referral page','How do I get paid?','More questions']
    },
    {
      intents: ['contact','phone','call','email','reach','talk','speak','human','person','office','hours'],
      response: `Here's how to reach the Happy Roof team:\n\n📞 **Phone/Text:** (813) 595-7663\n📧 **Email:** info@happyroof.com\n🕐 **Office Hours:** Mon–Fri 9am–5pm\n📍 **Address:** 141 Stevens Ave, Oldsmar, FL\n🌐 **Web:** happyroof.com\n\nFor after-hours emergencies, leave a voicemail and we'll respond as soon as possible.`,
      quick: ['Request live operator','Send message summary','Other questions']
    },
    {
      intents: ['operator','agent','human','live','real person','talk to someone','representative'],
      response: `I'll connect you with a live team member! 🔗\n\nThe fastest way to reach us:\n📞 **Call/Text:** (813) 595-7663\n📧 **Email:** info@happyroof.com\n\nOr I can **send a summary of our conversation** to our team so they have full context when they reach out to you. Would you like me to do that?`,
      quick: ['Yes, send summary to team','Call (813) 595-7663','Keep chatting']
    },
    {
      intents: ['send summary','email summary','summarize','send chat','forward conversation','notify team'],
      response: `_send_summary_`,
      quick: []
    },
    {
      intents: ['thank','thanks','thank you','appreciate','helpful','great','awesome','perfect'],
      response: `Happy to help! 😊 That's what we're here for.\n\nIf you ever need a free roof estimate or have more questions, don't hesitate to reach out:\n\n📞 **(813) 595-7663**\n🌐 **happyroof.com**\n\nHave a great day!`,
      quick: ['Get a free estimate','Visit referral program']
    },
    {
      intents: ['component','anatomy','parts','deck','decking','underlayment','ice and water','ice & water','sheathing','roof parts','what is a roof made','drip edge','ridge cap','fascia','roof layer'],
      response: `A roof is built from several key layers that work together:\n\n🪵 **Deck/Sheathing** — The wood base (OSB or plywood) everything attaches to\n📄 **Underlayment** — Synthetic or felt water-resistant barrier on the deck\n🧊 **Ice & Water Shield** — Self-adhering membrane at eaves, valleys, and penetrations\n🏠 **Shingles / Tile / Metal** — The visible outer layer you see\n🔧 **Flashing** — Metal pieces at joints, valleys, and penetrations to block water\n🔲 **Drip Edge** — Metal channel along eaves and rakes to direct water clear of the fascia\n⛰️ **Ridge Cap** — Specialty shingles that cap the peak\n🌬️ **Ventilation** — Soffit (intake) and ridge (exhaust) vents regulate attic temperature\n\nA failure in any single layer can cause leaks or structural damage. We inspect all of them during our free roof inspection.`,
      quick: ['Signs of roof damage','How long does a roof last?','Get a free inspection']
    },
    {
      intents: ['sign','damage','failing','bad roof','curling','cracking','granule','missing shingle','moss','algae','sagging','ceiling stain','dark spot','roof problem','need new roof'],
      response: `Common signs your roof needs attention:\n\n⚠️ **Curling or buckling shingles** — age or poor attic ventilation\n⚠️ **Missing shingles** — exposed deck is an immediate water risk\n⚠️ **Granule loss** — bare patches on shingles or granules collecting in gutters\n⚠️ **Moss or algae growth** — traps moisture and accelerates shingle breakdown\n⚠️ **Sagging areas** — possible deck rot or structural failure — urgent!\n⚠️ **Interior ceiling stains or active drips** — water is already inside\n⚠️ **Cracked or split shingles** — common after hail or significant age\n⚠️ **Daylight visible through roof boards** (from attic) — gaps in the system\n⚠️ **Gutters full of shingle granules** — a sign shingles are near end of life\n\nIf you're seeing any of these, schedule a free inspection. Catching problems early is always cheaper than waiting.`,
      quick: ['Schedule a free inspection','Emergency repair','How long does a roof last?']
    },
    {
      intents: ['lifespan','how long last','life expectancy','how many years','roof age','when to replace','old roof','roof life'],
      response: `Roof lifespan varies significantly by material:\n\n🏠 **3-Tab Shingles** — 15–20 years\n🏠 **Architectural Shingles** — 25–30 years\n🔒 **Impact-Resistant Shingles** — 30–40 years (and insurance discounts in FL)\n⚙️ **Metal Roofing** — 40–70 years\n🧱 **Concrete Tile** — 30–50 years\n🏺 **Clay Tile** — 50–100 years\n🏗️ **TPO Flat Roof** — 15–25 years\n📦 **Mod-Bit Flat** — 10–20 years\n\nFlorida's intense UV, heat cycles, and hurricane season put extra stress on roofing systems. A roof approaching the top of its lifespan should be inspected sooner rather than later — especially before storm season. Want us to take a look?`,
      quick: ['Schedule free inspection','What materials do you install?','Get a rough ballpark estimate']
    },
    {
      intents: ['ventilation','ridge vent','soffit vent','attic vent','airflow','exhaust vent','intake vent','hot attic','attic heat','attic cool','attic air'],
      response: `Proper roof ventilation is critical — especially in Florida's heat:\n\n🌬️ **How it works:** Cool outside air enters through **soffit vents** at the eaves; hot attic air exhausts through **ridge vents** at the peak. This continuous airflow keeps your attic from overheating.\n\n**Why it matters:**\n✅ Extends shingle life — heat is the #1 cause of premature shingle failure\n✅ Reduces AC load and cuts energy bills\n✅ Prevents moisture buildup and mold\n✅ Protects the roof deck from warping and rot\n\n**Signs of poor ventilation:**\n⚠️ Shingles curling or blistering earlier than expected\n⚠️ Attic feels like a sauna in summer\n⚠️ Higher-than-normal energy bills\n⚠️ Mold or mildew smell from attic\n\nWe evaluate ventilation on every inspection — it's often the silent cause behind premature roof failure.`,
      quick: ['Schedule inspection','Signs of roof damage','Get a free estimate']
    },
    {
      intents: ['flashing','chimney flashing','pipe boot','step flashing','counter flashing','valley flashing','penetration','seal around','metal strip','vent flashing'],
      response: `**Flashing** is the metal material (aluminum, galvanized steel, or copper) that seals every joint where your roof meets a wall, pipe, or other structure. It's the single most common source of leaks when done wrong or when it fails.\n\n🔧 **Types we install and repair:**\n• **Step flashing** — where a roof slope meets a vertical wall (dormers, additions)\n• **Counter/cap flashing** — mortared into chimney masonry above step flashing\n• **Valley flashing** — where two roof planes meet and water concentrates\n• **Pipe boots** — rubber/metal collars around plumbing vent stacks\n• **Drip edge** — metal channel along eaves and rakes\n• **Skylight flashing** — integrated kits around skylight frames\n\nMany leaks that seem like shingle failures are actually flashing failures. A flashing repair is often far less expensive than a full section replacement. Want us to inspect yours?`,
      quick: ['Get a free inspection','Emergency repair','Signs of roof damage']
    },
    {
      intents: ['diy','do it myself','do it yourself','install myself','homeowner install','can i fix','self install','fix it myself'],
      response: `We get it — DIY saves money on most home projects. But roofing is one area we strongly caution most homeowners away from:\n\n⚠️ **Safety** — Roof falls are a leading cause of serious injury and death in construction\n⚠️ **Florida permit law** — Most replacements require a permit; unlicensed work can void your homeowner's insurance and cause major issues at resale\n⚠️ **Manufacturer warranty void** — Warranties require installation by certified contractors\n⚠️ **Hidden damage** — Pros know to check for deck rot, ventilation issues, and compromised flashing that a surface install would miss\n⚠️ **Liability** — A DIY roof that leaks can cause tens of thousands in interior damage\n\nFor minor spot repairs — replacing a few shingles or sealing a pipe boot — experienced homeowners can manage carefully. For anything larger, a professional free inspection first is always worth it.`,
      quick: ['Schedule free inspection','What does it cost?','Get a rough ballpark estimate']
    },
    {
      intents: ['reroof','re-roof','overlay','recover','second layer','tear off','tearoff','tear-off','remove old shingles','shingle over'],
      response: `Two options for an aging roof:\n\n**Reroof (Overlay)** — New shingles go over existing ones\n✅ Lower upfront cost, faster, less debris\n❌ Can't inspect the deck, adds weight, shorter lifespan, manufacturer warranties limited\n\n**Tear-Off Replacement** — Everything removed down to bare deck\n✅ Full deck inspection and repair, full manufacturer warranty, longest-lasting result\n❌ Higher cost, more labor\n\n🏛️ **Florida building code** allows only **one shingle overlay**. If your home already has two shingle layers, a full tear-off is required by law.\n\nWe recommend tear-offs in almost all cases — it's the only way to know what's underneath and ensure your new roof performs its full lifespan. We'll advise you honestly during your free estimate.`,
      quick: ['Schedule free estimate','What materials do you install?','How long does a roof last?']
    },
    {
      intents: ['gutter','gutters','downspout','gutter guard','leaf guard','water drainage','fascia board','soffit repair','overflow gutter'],
      response: `Gutters are a critical part of your roofing system — they channel water away from your foundation, siding, and fascia.\n\n🏗️ **What we do:**\n• Seamless aluminum gutter installation\n• Gutter repair and re-sealing\n• Downspout repositioning\n• Fascia board replacement (often needed alongside gutter work)\n\n**Signs your gutters need attention:**\n⚠️ Water pooling or eroding soil near the foundation\n⚠️ Gutters sagging or pulling away from fascia\n⚠️ Peeling paint on siding near gutters\n⚠️ Overflow during normal rain\n⚠️ Granules accumulating in gutters (sign of aging shingles)\n\nWe often bundle gutter work with roof replacements for a complete system. Want to include gutters in your estimate?`,
      quick: ['Get a free estimate','Schedule inspection','What services do you offer?']
    },
    {
      intents: ['contractor','choose contractor','hire roofer','pick roofer','red flag','storm chaser','door to door','scam','bad roofer','deductible waiver','waive deductible'],
      response: `Choosing the right contractor matters as much as the materials. Here's what to look for — and watch out for:\n\n✅ **Green flags:**\n• Licensed and insured — verify at **myfloridalicense.com**\n• Local, established business with verifiable address\n• Written, itemized contract before work starts\n• Pulls permits (required by FL law for most work)\n• Does not demand full payment upfront\n• Manufacturer-certified (Owens Corning, etc.)\n\n🚩 **Red flags:**\n• Out-of-town "storm chasers" showing up right after a hurricane\n• High-pressure tactics to sign immediately\n• Cash-only with no written contract\n• Promises to waive your deductible — *this is insurance fraud*\n• No verifiable local reviews or physical address\n\nHappy Roof is licensed (#CCC1337380), local to Oldsmar, FL, and pulls every required permit. We're here year-round — not just after the next storm.`,
      quick: ['Verify our license','Schedule free estimate','Contact the team']
    },
  ];

  const FALLBACK = `Hmm, I'm not sure I have a great answer for that specific question! 🤔\n\nThe best next step would be to speak directly with our team:\n\n📞 **(813) 595-7663** — call or text\n📧 **info@happyroof.com**\n🕐 Mon–Fri 9am–5pm\n\nOr I can send a summary of our chat to the team so they can follow up with you. Want me to do that?`;

  // ── Pricing data (per roofing square = 100 sq ft of roof) ───
  const PRICING = {
    'shingle-standard':  { label: 'Architectural Shingles (Standard)',        rate: 758  },
    'shingle-impact':    { label: 'Impact-Resistant Shingles',                 rate: 898  },
    'shingle-luxury':    { label: 'Luxury / Designer Shingles',                rate: 1298 },
    'metal':             { label: 'Metal Roofing (mid-range)',                  rate: 1215 },
    'tile-standard':     { label: 'Concrete Tile (Standard)',                   rate: 1425 },
    'tile-premium':      { label: 'Concrete Tile (Premium)',                    rate: 1758 },
    'tile-clay':         { label: 'Clay Tile',                                  rate: 2425 },
    'flat-tpo':          { label: 'TPO Flat Roof',                              rate: 1146 },
    'flat-modbit':       { label: 'Modified Bitumen (Mod-Bit) Flat Roof',       rate: 822  },
  };

  // ── State ───────────────────────────────────────────────────
  let open = false;
  let messages = [];
  let awaitingContactInfo = false;
  let pendingAction = null; // 'email' | 'sms'
  let contactStep = 0;
  let tempContact = {};
  let pendingEstimate = null; // null | { step: 'type'|'subtype'|'size', type: '', subtype: '' }
  let qualifyStep = 0; // 0=not started, 1=asked need, 2=asked type, 3=asked zip, 4=done
  let qualifyData = {}; // { need, roofType, zip }

  // ── Helpers ─────────────────────────────────────────────────
  function matchIntent(text) {
    const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
    for (const entry of KB) {
      if (entry.intents.some(kw => t.includes(kw))) return entry;
    }
    return null;
  }

  function formatMessage(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function timestamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function buildSummary() {
    return messages
      .map(m => `[${m.from === 'bot' ? 'Assistant' : 'Visitor'}] ${m.raw}`)
      .join('\n');
  }

  // ── Submit via FormSubmit (same as other site forms) ───────
  function sendSummaryEmail(name, phone, email) {
    const data = {
      _subject: `Chat Summary — ${name || 'Visitor'}`,
      Name: name || 'Not provided',
      Phone: phone || 'Not provided',
      Email: email || 'Not provided',
      Conversation: buildSummary()
    };
    const stPayload = { name: name||'', phone: phone||'', email: email||'', service: 'Chat Lead', notes: buildSummary(), source: 'Website - Chatbot', page: window.location.pathname };
    fetch('/api/submit-lead', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(stPayload) })
      .catch(() => fetch('https://formsubmit.co/ajax/info@happyroof.com', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify(data) }))
      .catch(() => {});
  }

  // ── Render ──────────────────────────────────────────────────
  function render() {
    const list = document.getElementById('hr-chat-messages');
    if (!list) return;
    list.innerHTML = '';

    messages.forEach(m => {
      const wrap = document.createElement('div');
      wrap.style.cssText = `display:flex;flex-direction:column;align-items:${m.from === 'user' ? 'flex-end' : 'flex-start'};margin-bottom:.75rem`;

      const bubble = document.createElement('div');
      bubble.style.cssText = m.from === 'user'
        ? 'background:#E6A817;color:#fff;border-radius:14px 14px 4px 14px;padding:.625rem .875rem;max-width:82%;font-size:.88rem;line-height:1.55'
        : 'background:#2A2A2A;color:#E0E0E0;border-radius:14px 14px 14px 4px;padding:.625rem .875rem;max-width:88%;font-size:.88rem;line-height:1.55;border:1px solid #252525';
      bubble.innerHTML = formatMessage(m.text);
      wrap.appendChild(bubble);

      const ts = document.createElement('span');
      ts.style.cssText = 'font-size:.65rem;color:#444;margin-top:.2rem;padding:0 .25rem';
      ts.textContent = m.time;
      wrap.appendChild(ts);

      list.appendChild(wrap);

      // Quick replies
      if (m.quick && m.quick.length) {
        const qr = document.createElement('div');
        qr.style.cssText = 'display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.35rem;margin-bottom:.35rem';
        m.quick.forEach(q => {
          const btn = document.createElement('button');
          btn.textContent = q;
          btn.style.cssText = 'background:transparent;border:1px solid #2E2E2E;border-radius:100px;color:#F0C040;font-size:.75rem;padding:.3rem .75rem;cursor:pointer;transition:background .15s,border-color .15s;font-family:inherit';
          btn.onmouseenter = () => { btn.style.background='rgba(230,168,23,.1)'; btn.style.borderColor='rgba(230,168,23,.4)'; };
          btn.onmouseleave = () => { btn.style.background='transparent'; btn.style.borderColor='#2E2E2E'; };
          btn.onclick = () => handleQuick(q);
          qr.appendChild(btn);
        });
        list.appendChild(qr);
      }
    });

    list.scrollTop = list.scrollHeight;
  }

  function addMessage(from, text, raw, quick) {
    messages.push({ from, text, raw: raw || text, time: timestamp(), quick: quick || [] });
    render();
  }

  // ── Lead qualification intro flow ──────────────────────────
  function handleQualifyStep(text) {
    const t = text.toLowerCase().trim();

    if (qualifyStep === 1) {
      // They told us what they need
      qualifyData.need = text;
      qualifyStep = 2;
      setTimeout(() => {
        addMessage('bot',
          `Got it — **${text.toLowerCase()}**. What type of roof do you have (or want)?`,
          null,
          ['Shingle', 'Metal', 'Tile', 'Flat / TPO', 'Not sure']
        );
      }, 350);
      return;
    }

    if (qualifyStep === 2) {
      qualifyData.roofType = text;
      qualifyStep = 3;
      setTimeout(() => {
        addMessage('bot',
          `And what's your **zip code**? (So I can confirm we serve your area)`,
          null, []
        );
      }, 350);
      return;
    }

    if (qualifyStep === 3) {
      qualifyData.zip = text;
      qualifyStep = 4; // done — switch to normal chat
      const inArea = /^3[34]\d{3}$/.test(text.replace(/\s/g, ''));
      if (inArea) {
        setTimeout(() => {
          addMessage('bot',
            `Great news — we serve your area! 🎉\n\nBased on what you told me:\n📋 **Need:** ${qualifyData.need}\n🏠 **Roof type:** ${qualifyData.roofType}\n📍 **Zip:** ${qualifyData.zip}\n\nI can help you from here — ask me anything about pricing, materials, warranties, or our process. Or if you're ready:`,
            null,
            ['Get a free estimate', 'Get a rough ballpark estimate', 'How much does a roof cost?', 'Talk to the team']
          );
        }, 400);
      } else {
        setTimeout(() => {
          addMessage('bot',
            `Thanks! I'm not 100% sure if **${text}** is in our service area, but let's find out.\n\n📞 Give us a quick call at **(813) 595-7663** and we'll confirm right away. Or keep chatting — I'm happy to answer any roofing questions in the meantime!`,
            null,
            ['Get a free estimate', 'Call (813) 595-7663', 'Ask a question']
          );
        }, 400);
      }
      return;
    }
  }

  // ── Contact collection flow ─────────────────────────────────
  const contactPrompts = [
    { key: 'name',  ask: 'What\'s your name?' },
    { key: 'phone', ask: 'What\'s the best phone number to reach you?' },
    { key: 'email', ask: 'And your email address? (optional — press Enter to skip)' },
  ];

  function startContactFlow(action) {
    pendingAction = action;
    awaitingContactInfo = true;
    contactStep = 0;
    tempContact = {};
    setTimeout(() => {
      addMessage('bot', contactPrompts[0].ask);
    }, 300);
  }

  function handleContactStep(text) {
    const step = contactPrompts[contactStep];
    if (step.key !== 'email' && !text.trim()) {
      addMessage('bot', 'I need at least your name and phone to connect you with the team. ' + step.ask);
      return;
    }
    tempContact[step.key] = text.trim();
    contactStep++;

    if (contactStep < contactPrompts.length) {
      setTimeout(() => addMessage('bot', contactPrompts[contactStep].ask), 300);
    } else {
      // Done collecting — complete action
      awaitingContactInfo = false;
      if (pendingAction === 'email') {
        setTimeout(() => {
          addMessage('bot', `✅ Done! Your conversation summary has been sent to our team.\n\nWe'll review it and reach out to **${tempContact.name}** at **${tempContact.phone}** shortly — typically within 1 business day.`);
          sendSummaryEmail(tempContact.name, tempContact.phone, tempContact.email);
        }, 400);
      } else if (pendingAction === 'sms') {
        setTimeout(() => {
          addMessage('bot', `✅ Thanks, **${tempContact.name}**! A live team member will text **${tempContact.phone}** as soon as possible during business hours (Mon–Fri 9am–5pm).\n\nFor urgent issues, please call **(813) 595-7663** directly.`);
        }, 400);
      }
      pendingAction = null;
    }
  }

  // ── Pricing estimator flow ──────────────────────────────────
  function startEstimateFlow() {
    pendingEstimate = { step: 'type', type: '', subtype: '' };
    setTimeout(() => {
      addMessage('bot',
        `Sure! Let's get a rough range together. 🏠\n\nFirst — what type of roofing material are you thinking about?`,
        null,
        ['Shingle', 'Metal', 'Tile', 'Flat / TPO']
      );
    }, 350);
  }

  function handleEstimateStep(text) {
    const t = text.toLowerCase().trim();

    if (pendingEstimate.step === 'type') {
      if (t.includes('shingle')) {
        pendingEstimate.step = 'subtype';
        pendingEstimate.type = 'shingle';
        setTimeout(() => {
          addMessage('bot',
            `Got it — shingles. Which grade?\n\n• **Standard** (Architectural) — most popular, 25–30 yr lifespan\n• **Impact Resistant** — stronger against hail, qualifies for FL insurance discounts\n• **Luxury / Designer** — premium look, enhanced durability`,
            null,
            ['Standard Shingles', 'Impact Resistant', 'Luxury / Designer']
          );
        }, 350);
      } else if (t.includes('metal')) {
        pendingEstimate.step = 'size';
        pendingEstimate.type = 'metal';
        pendingEstimate.subtype = 'metal';
        setTimeout(() => {
          addMessage('bot',
            `Metal it is! ⚙️ Metal pricing varies by gauge and finish (mill finish vs painted, exposed vs seamless). I'll use a **mid-range figure of ~$1,215 per square** for the estimate — actual cost can range from ~$1,020 to ~$1,650/sq depending on the system.\n\nAbout how many **square feet is your home** (living area footprint)?`,
            null, []
          );
        }, 350);
      } else if (t.includes('tile')) {
        pendingEstimate.step = 'subtype';
        pendingEstimate.type = 'tile';
        setTimeout(() => {
          addMessage('bot',
            `Tile is a great long-term choice! Which type?\n\n• **Standard Concrete Tile** — durable, 30–50 yr lifespan\n• **Premium Concrete Tile** — enhanced profile and color options\n• **Clay Tile** — highest-end, 50–100 yr lifespan`,
            null,
            ['Standard Concrete Tile', 'Premium Concrete Tile', 'Clay Tile']
          );
        }, 350);
      } else if (t.includes('flat') || t.includes('tpo') || t.includes('mod') || t.includes('commercial')) {
        pendingEstimate.step = 'subtype';
        pendingEstimate.type = 'flat';
        setTimeout(() => {
          addMessage('bot',
            `Flat roof systems — which type?\n\n• **TPO** — most common, heat-welded seams, energy efficient, 15–25 yr\n• **Modified Bitumen (Mod-Bit)** — torch-applied, reliable, 10–20 yr`,
            null,
            ['TPO', 'Modified Bitumen (Mod-Bit)']
          );
        }, 350);
      } else {
        setTimeout(() => {
          addMessage('bot', `Please choose one of the roof types so I can calculate:`, null,
            ['Shingle', 'Metal', 'Tile', 'Flat / TPO']);
        }, 350);
      }
      return;
    }

    if (pendingEstimate.step === 'subtype') {
      if (pendingEstimate.type === 'shingle') {
        if (t.includes('impact')) pendingEstimate.subtype = 'shingle-impact';
        else if (t.includes('luxury') || t.includes('designer')) pendingEstimate.subtype = 'shingle-luxury';
        else pendingEstimate.subtype = 'shingle-standard';
      } else if (pendingEstimate.type === 'tile') {
        if (t.includes('premium')) pendingEstimate.subtype = 'tile-premium';
        else if (t.includes('clay')) pendingEstimate.subtype = 'tile-clay';
        else pendingEstimate.subtype = 'tile-standard';
      } else if (pendingEstimate.type === 'flat') {
        pendingEstimate.subtype = t.includes('mod') ? 'flat-modbit' : 'flat-tpo';
      }
      pendingEstimate.step = 'size';
      setTimeout(() => {
        addMessage('bot', `Perfect! Now — roughly how many **square feet is your home** (just the living area footprint, not roof area)?`, null, []);
      }, 350);
      return;
    }

    if (pendingEstimate.step === 'size') {
      const num = parseFloat(t.replace(/[^0-9.]/g, ''));
      if (!num || num < 200 || num > 50000) {
        setTimeout(() => {
          addMessage('bot', `I need a valid home square footage (e.g. "1,800" or "2400"). What's the approximate size of your home?`, null, []);
        }, 350);
        return;
      }

      // Roof area ≈ home footprint × 1.3 (typical pitch factor)
      const roofSquares = (num * 1.3) / 100;
      const key = pendingEstimate.subtype || 'metal';
      const product = PRICING[key];
      const base = product.rate * roofSquares;

      // Material-specific range multipliers (matches calculator)
      const rangeMult = {
        'shingle-standard': { low: 0.50, high: 1.0 },
        'shingle-impact':   { low: 0.50, high: 1.0 },
        'shingle-luxury':   { low: 0.50, high: 1.0 },
        'metal':            { low: 0.55, high: 1.4 },
        'tile-standard':    { low: 0.67, high: 1.35 },
        'tile-premium':     { low: 0.67, high: 1.35 },
        'tile-clay':        { low: 0.67, high: 1.35 },
        'flat-tpo':         { low: 0.50, high: 0.90 },
        'flat-modbit':      { low: 0.50, high: 0.90 },
      };
      const mult = rangeMult[key] || { low: 0.50, high: 1.0 };
      const lower = Math.round((base * mult.low) / 100) * 100;
      const upper = Math.round((base * mult.high) / 100) * 100;
      const fmt = n => '$' + n.toLocaleString();

      pendingEstimate = null;
      setTimeout(() => {
        addMessage('bot',
          `Here's your rough ballpark estimate:\n\n🏠 **${product.label}**\n📐 ~${num.toLocaleString()} sq ft home\n\n💰 **Estimated range: ${fmt(lower)} – ${fmt(upper)}**\n\n⚠️ *This is a rough range only.* Actual pricing depends on your roof pitch, number of layers, deck condition, flashing work, and other factors — all things we assess during a free in-person or virtual estimate.\n\nWant us to come out and give you an accurate number?`,
          null,
          ['Yes, schedule a free estimate','Call (813) 595-7663','Run another estimate']
        );
      }, 500);
      return;
    }
  }

  // ── Handle incoming user message ────────────────────────────
  function handleInput(text) {
    if (!text.trim()) return;
    addMessage('user', text, text);

    // Lead qualification flow
    if (qualifyStep > 0 && qualifyStep < 4) {
      handleQualifyStep(text);
      return;
    }

    // Contact collection flow
    if (awaitingContactInfo) {
      handleContactStep(text);
      return;
    }

    // Pricing estimator flow
    if (pendingEstimate) {
      handleEstimateStep(text);
      return;
    }

    const lower = text.toLowerCase();

    // Quick reply routing
    if (lower.includes('just have questions') || lower.includes('ask a question')) {
      qualifyStep = 4; // skip qualification
      setTimeout(() => {
        addMessage('bot',
          `No problem! Ask me anything about roofing — pricing, materials, warranties, our process, or whatever's on your mind. 🏠`,
          null,
          ['How much does a roof cost?', 'What services do you offer?', 'What brands do you use?', 'Emergency repair']
        );
      }, 350);
      return;
    }
    if (lower.includes('go to referral')) {
      setTimeout(() => {
        addMessage('bot', 'Heading to the Referral Program page!');
        setTimeout(() => window.location.href = 'referrals.html', 800);
      }, 300);
      return;
    }
    if (lower.includes('call (813)') || lower.includes('call us now') || lower.includes('call us')) {
      setTimeout(() => {
        addMessage('bot', 'Connecting you now!');
        setTimeout(() => window.location.href = 'tel:8135957663', 600);
      }, 300);
      return;
    }

    // Pricing estimator trigger
    if (lower.includes('rough ballpark') || lower.includes('ballpark estimate') || lower.includes('run another estimate') || lower.includes('get a rough')) {
      startEstimateFlow();
      return;
    }

    // Special intents
    if (lower.includes('send summary') || lower.includes('notify team') || lower.includes('email summary') || lower.includes('yes, send')) {
      startContactFlow('email');
      return;
    }
    if (lower.includes('live operator') || lower.includes('request live') || lower.includes('text me') || lower.includes('text operator')) {
      startContactFlow('sms');
      return;
    }
    if (lower.includes('talk to the team') || lower.includes('contact me') || lower.includes('yes, contact') || lower.includes('reach out') || lower.includes('schedule a free estimate') || lower.includes('yes, schedule')) {
      startContactFlow('email');
      return;
    }

    // KB match
    const match = matchIntent(text);
    if (match) {
      if (match.response === '_send_summary_') {
        startContactFlow('email');
      } else {
        setTimeout(() => addMessage('bot', match.response, match.response, match.quick), 420);
      }
    } else {
      setTimeout(() => addMessage('bot', FALLBACK, FALLBACK, ['Send summary to team','Call (813) 595-7663','Keep chatting']), 420);
    }
  }

  function handleQuick(text) {
    handleInput(text);
  }

  // ── Toggle open/close ───────────────────────────────────────
  function toggleChat() {
    open = !open;
    const win = document.getElementById('hr-chat-window');
    const fab = document.getElementById('hr-chat-fab');
    const badge = document.getElementById('hr-chat-badge');
    win.style.display = open ? 'flex' : 'none';
    fab.innerHTML = open
      ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>`
      : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
    if (badge) badge.style.display = 'none';
    if (open) {
      setTimeout(() => {
        const inp = document.getElementById('hr-chat-input');
        if (inp) inp.focus();
        render();
      }, 100);
    }
  }

  // ── Build DOM ───────────────────────────────────────────────
  function init() {
    // Container
    const wrap = document.createElement('div');
    wrap.id = 'hr-chat-wrap';
    wrap.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:.75rem;font-family:"Inter",sans-serif';

    // Chat window
    const win = document.createElement('div');
    win.id = 'hr-chat-window';
    win.style.cssText = [
      'display:none;flex-direction:column',
      'width:360px;max-width:calc(100vw - 2rem)',
      'height:520px;max-height:calc(100vh - 120px)',
      'background:#1A1A1A;border:1px solid #222;border-radius:20px',
      'box-shadow:0 32px 80px -12px rgba(0,0,0,.55),0 8px 24px -8px rgba(0,0,0,.4)',
      'overflow:hidden'
    ].join(';');

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'background:#111;border-bottom:1px solid #1E1E1E;padding:.875rem 1rem;display:flex;align-items:center;gap:.75rem;flex-shrink:0';
    header.innerHTML = `
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#F0C040,#E6A817);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="white" stroke-width="1.5"/><circle cx="7" cy="7.5" r="1" fill="white"/><circle cx="13" cy="7.5" r="1" fill="white"/><path d="M6.5 12c1 3 6 3 7 0" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <p style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1rem;color:#F7F7F7;letter-spacing:.01em;line-height:1.1">Happy Roof Assistant</p>
        <p style="font-size:.72rem;color:#3B9FD9;margin-top:.05rem">● Online · Typically replies instantly</p>
      </div>
      <button onclick="document.getElementById('hr-chat-window').style.display='none';document.getElementById('hr-chat-fab').innerHTML='<svg width=\\'22\\' height=\\'22\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\'><path d=\\'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linejoin=\\'round\\'/></svg>'" style="background:transparent;border:none;cursor:pointer;color:#555;padding:.25rem;border-radius:6px;display:flex;align-items:center;transition:color .15s" onmouseenter="this.style.color='#F7F7F7'" onmouseleave="this.style.color='#555'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>`;
    win.appendChild(header);

    // Messages area
    const msgs = document.createElement('div');
    msgs.id = 'hr-chat-messages';
    msgs.style.cssText = 'flex:1;overflow-y:auto;padding:1rem;scroll-behavior:smooth';
    // Scrollbar styling
    msgs.style.scrollbarWidth = 'thin';
    msgs.style.scrollbarColor = '#2A2A2A transparent';
    win.appendChild(msgs);

    // Input area
    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'padding:.75rem;border-top:1px solid #2A2A2A;display:flex;gap:.5rem;flex-shrink:0;background:#1A1A1A';

    const inp = document.createElement('input');
    inp.id = 'hr-chat-input';
    inp.type = 'text';
    inp.placeholder = 'Ask about roofing…';
    inp.style.cssText = 'flex:1;background:#2A2A2A;border:1px solid #252525;border-radius:10px;padding:.6rem .875rem;color:#F7F7F7;font-size:.875rem;font-family:inherit;outline:none;transition:border-color .18s;min-width:0';
    inp.onfocus = () => inp.style.borderColor = 'rgba(230,168,23,.5)';
    inp.onblur = () => inp.style.borderColor = '#252525';
    inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };

    const sendBtn = document.createElement('button');
    sendBtn.style.cssText = 'background:#E6A817;border:none;border-radius:10px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .18s,transform .15s';
    sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
    sendBtn.onmouseenter = () => { sendBtn.style.background='#2D8CC4'; sendBtn.style.transform='scale(1.06)'; };
    sendBtn.onmouseleave = () => { sendBtn.style.background='#E6A817'; sendBtn.style.transform='scale(1)'; };
    sendBtn.onclick = sendMsg;

    inputWrap.appendChild(inp);
    inputWrap.appendChild(sendBtn);
    win.appendChild(inputWrap);
    wrap.appendChild(win);

    // FAB button
    const fab = document.createElement('button');
    fab.id = 'hr-chat-fab';
    fab.onclick = toggleChat;
    fab.style.cssText = [
      'width:56px;height:56px;border-radius:50%;border:none;cursor:pointer',
      'background:linear-gradient(135deg,#F0C040,#E6A817)',
      'color:white;display:flex;align-items:center;justify-content:center',
      'box-shadow:0 8px 28px -4px rgba(230,168,23,.6),0 4px 12px -4px rgba(0,0,0,.4)',
      'transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s',
      'position:relative'
    ].join(';');
    fab.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
    fab.onmouseenter = () => { fab.style.transform='scale(1.08)'; fab.style.boxShadow='0 12px 36px -4px rgba(230,168,23,.7),0 4px 12px -4px rgba(0,0,0,.4)'; };
    fab.onmouseleave = () => { fab.style.transform='scale(1)'; fab.style.boxShadow='0 8px 28px -4px rgba(230,168,23,.6),0 4px 12px -4px rgba(0,0,0,.4)'; };

    // Notification badge
    const badge = document.createElement('span');
    badge.id = 'hr-chat-badge';
    badge.style.cssText = 'position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:#3B9FD9;border-radius:50%;border:2px solid #1A1A1A;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;color:#1A1A1A';
    badge.textContent = '1';
    fab.appendChild(badge);
    wrap.appendChild(fab);

    document.body.appendChild(wrap);

    // Initial greeting — start qualification flow
    setTimeout(() => {
      qualifyStep = 1;
      addMessage('bot',
        `Hey there! 👋 I'm the Happy Roof assistant.\n\nTo point you in the right direction — what brings you here today?`,
        null,
        ['I need a new roof', 'Roof repair', 'Storm damage', 'Free inspection', 'Just have questions']
      );
    }, 800);
  }

  function sendMsg() {
    const inp = document.getElementById('hr-chat-input');
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    handleInput(text);
  }

  // ── Global mobile CSS fixes ─────────────────────────────────
  function injectMobileCSS() {
    const s = document.createElement('style');
    s.textContent = `
      /* Prevent horizontal scroll on all pages */
      html, body { max-width:100%; overflow-x:hidden; }

      /* Smooth scroll on mobile */
      html { -webkit-overflow-scrolling:touch; }

      /* Ensure tap targets are large enough */
      .nav-link { min-height:44px; display:inline-flex; align-items:center; }
      #mobile-menu a { min-height:48px; display:flex; align-items:center; }

      /* Improve form usability on mobile — prevent zoom on focus (iOS) */
      input, select, textarea { font-size:16px !important; }

      /* Chat window full-width on small screens */
      @media (max-width:420px) {
        #hr-chat-wrap { right:.75rem; left:.75rem; }
        #hr-chat-window { width:100% !important; }
      }

      /* Mobile sticky bar safe-area support (notch phones) */
      #hr-mobile-bar { padding-bottom:calc(.9rem + env(safe-area-inset-bottom)); }

      /* Theme color (shown in browser chrome on mobile) */
    `;
    // Add theme-color meta if not already present
    if (!document.querySelector('meta[name="theme-color"]')) {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      m.content = '#1A1A1A';
      document.head.appendChild(m);
    }
    document.head.appendChild(s);
  }

  // ── Mobile sticky CTA bar ───────────────────────────────────
  function initMobileBar() {
    const bar = document.createElement('div');
    bar.id = 'hr-mobile-bar';
    bar.style.cssText = [
      'display:none;position:fixed;bottom:0;left:0;right:0;z-index:9998',
      'background:#1A1A1A;border-top:1px solid #222',
      'padding:.6rem 1rem .9rem',
      'grid-template-columns:1fr 1fr;gap:.6rem',
      'box-shadow:0 -8px 32px -8px rgba(0,0,0,.4)'
    ].join(';');
    bar.innerHTML = `
      <a href="tel:8135957663" style="display:flex;align-items:center;justify-content:center;gap:.45rem;padding:.75rem;background:#2A2A2A;border:1px solid #222;border-radius:10px;color:#3B9FD9;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1rem;letter-spacing:.03em;text-decoration:none">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.82-.82a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Call Us
      </a>
      <a href="contact.html" style="display:flex;align-items:center;justify-content:center;gap:.45rem;padding:.75rem;background:#E6A817;border-radius:10px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1rem;letter-spacing:.03em;text-decoration:none;box-shadow:0 4px 16px -4px rgba(230,168,23,.55)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Free Estimate
      </a>`;

    document.body.appendChild(bar);

    // Show only on mobile
    function applyBar() {
      const isMobile = window.innerWidth < 768;
      bar.style.display = isMobile ? 'grid' : 'none';
      // Add bottom padding to body so content isn't hidden behind bar
      document.body.style.paddingBottom = isMobile ? '80px' : '';
      // Offset chat widget above bar on mobile
      const chatWrap = document.getElementById('hr-chat-wrap');
      if (chatWrap) chatWrap.style.bottom = isMobile ? '5.5rem' : '1.5rem';
    }

    applyBar();
    window.addEventListener('resize', applyBar);
  }

  // ── Boot ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { injectMobileCSS(); init(); initMobileBar(); });
  } else {
    injectMobileCSS(); init(); initMobileBar();
  }

})();
