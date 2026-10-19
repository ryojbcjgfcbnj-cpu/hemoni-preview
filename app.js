/* 和鸣 Hemoni · 官网交互脚本 */
(function () {
  "use strict";

  /* ---------- 导航栏 ---------- */
  const nav = document.getElementById("nav");
  const onScrollNav = () => nav.classList.toggle("scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScrollNav, { passive: true });
  onScrollNav();

  const burger = document.getElementById("burger");
  const navLinks = document.getElementById("navLinks");
  burger.addEventListener("click", () => navLinks.classList.toggle("open"));
  navLinks.addEventListener("click", (e) => {
    if (e.target.tagName === "A") navLinks.classList.remove("open");
  });

  /* ---------- Hero 粒子网络 ---------- */
  const canvas = document.getElementById("hero-canvas");
  try {
  if (canvas && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, particles = [];
    const mouse = { x: -9999, y: -9999 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const parent = canvas.parentElement;
      W = parent.clientWidth;
      H = parent.clientHeight;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.floor((W * H) / 16000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.8 + 0.6,
        hue: Math.random() > 0.5 ? "124,107,255" : "34,211,238"
      }));
    }

    canvas.parentElement.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });
    canvas.parentElement.addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });

    function tick() {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 12000) { p.x -= dx * 0.012; p.y -= dy * 0.012; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.hue},0.55)`;
        ctx.fill();
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 11500) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(124,107,255,${(1 - d2 / 11500) * 0.16})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(tick);
    }
    resize();
    window.addEventListener("resize", resize);
    tick();
  }
  } catch (err) {
    console.warn("hero canvas disabled:", err);
  }

  /* ---------- 滚动入场 ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); revealIO.unobserve(en.target); }
    });
  }, { threshold: 0.12 });
  revealEls.forEach((el) => revealIO.observe(el));

  /* ---------- 数字滚动 ---------- */
  const counters = document.querySelectorAll(".stat-num");
  const counterIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      counterIO.unobserve(el);
      const target = +el.dataset.count;
      const prefix = el.dataset.prefix || "";
      const suffix = el.dataset.suffix || "";
      const dur = 1200, t0 = performance.now();
      (function step(t) {
        const k = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = prefix + Math.round(target * eased) + suffix;
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }, { threshold: 0.6 });
  counters.forEach((el) => counterIO.observe(el));

  /* ---------- 卡片光斑跟随 ---------- */
  document.querySelectorAll(".feature-card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  /* ---------- 文件站演示 ---------- */
  const CHUNKS = [
    { no: "#1", tag: "行业规模", text: "2025 年国内智能客服市场规模约 86 亿元，年复合增长率 24.3%，其中大模型驱动的新一代客服占比首超 30%。" },
    { no: "#2", tag: "核心痛点", text: "调研的 312 家企业中，68% 认为「答非所问」是首要痛点，52% 抱怨知识库维护成本随业务扩张线性上升。" },
    { no: "#3", tag: "技术路线", text: "头部厂商普遍采用 RAG + 意图路由架构，多轮会话平均轮次 4.7 轮，端到端首响时间中位数 1.8 秒。" },
    { no: "#4", tag: "成本数据", text: "人工坐席单次会话综合成本约 6.4 元，智能客服降至 0.31 元， ROI 回收周期平均 5.2 个月。" },
    { no: "#5", tag: "厂商格局", text: "市场 CR5 为 47%，垂直行业定制化厂商增速（41%）显著高于通用型厂商（19%）。" },
    { no: "#6", tag: "用户画像", text: "电商与金融客户贡献 62% 营收；中型企业（200-2000 人）决策周期最短，平均 23 天。" },
    { no: "#7", tag: "选型建议", text: "白皮书建议按「知识库冷启动成本、多轮表现、人工接管体验」三维度打分，权重 3:4:3。" },
    { no: "#8", tag: "未来趋势", text: "2026 年预判：Agent 式客服（可代办、可追问）将从 8% 渗透提升至 27%，成为下一个主战场。" }
  ];
  const chunksBox = document.getElementById("chunks");
  const stationOut = document.getElementById("stationOut");
  const pasteBtn = document.getElementById("pasteBtn");
  const savedTip = document.getElementById("stationSaved");
  let picked = new Set([1, 3]); // 默认勾选两块，呼应「市场调研 + 成本」

  function renderOut() {
    const head = "【文件站 · 按需取用】\n《2025 智能客服行业白皮书》目录：\n" +
      CHUNKS.map((c) => `  ${c.no} ${c.tag}`).join("｜") +
      "\n\n本次仅调取 " + picked.size + " 个相关块：\n";
    if (picked.size === 0) {
      stationOut.innerHTML = '<span class="placeholder">左侧勾选摘要块后，这里会实时拼出 AI 实际收到的 prompt……</span>';
      return;
    }
    let html = head.replace(/《.*?》/g, '<span class="hl">$&</span>');
    picked.forEach((i) => {
      const c = CHUNKS[i];
      html += `\n<span class="hl">${c.no} ${c.tag}</span>：${c.text}`;
    });
    html += `\n\n（全文 8 块 · 仅载入 ${picked.size} 块，其余未占用上下文）`;
    stationOut.innerHTML = html;
  }

  function renderChunks() {
    chunksBox.innerHTML = "";
    CHUNKS.forEach((c, i) => {
      const div = document.createElement("div");
      div.className = "chunk" + (picked.has(i) ? " picked" : "");
      div.innerHTML = `<div class="chunk-head"><span class="cno">${c.no}</span><span class="ctag">${c.tag}</span></div><div class="chunk-body">${c.text}</div>`;
      div.addEventListener("click", () => {
        picked.has(i) ? picked.delete(i) : picked.add(i);
        renderChunks(); renderOut();
      });
      chunksBox.appendChild(div);
    });
  }

  if (chunksBox) {
    renderChunks(); renderOut();
    pasteBtn.addEventListener("click", () => {
      pasteBtn.disabled = true;
      pasteBtn.textContent = "⏳ 解析中…";
      savedTip.classList.remove("show");
      let i = 0;
      const timer = setInterval(() => {
        if (i < CHUNKS.length) {
          picked = new Set([...picked, i]);
          i++;
          renderChunks(); renderOut();
        } else {
          clearInterval(timer);
          pasteBtn.textContent = "✓ 已入库";
          savedTip.classList.add("show");
          setTimeout(() => {
            pasteBtn.disabled = false;
            pasteBtn.textContent = "📋 模拟粘贴全文";
            picked = new Set([1, 3]);
            renderChunks(); renderOut();
            savedTip.classList.remove("show");
          }, 2600);
        }
      }, 170);
    });
  }

  /* ---------- 省 token 对比条 ---------- */
  const bars = document.querySelectorAll(".token-bar");
  const barIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      barIO.unobserve(el);
      requestAnimationFrame(() => { el.style.width = el.dataset.width; });
    });
  }, { threshold: 0.5 });
  bars.forEach((el) => barIO.observe(el));

  /* ---------- 风格指纹条 ---------- */
  const fpBars = document.querySelectorAll(".fp-bar i");
  const fpIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      fpIO.unobserve(en.target);
      en.target.style.width = en.target.dataset.w;
    });
  }, { threshold: 0.5 });
  fpBars.forEach((el) => fpIO.observe(el));

  /* ---------- Hero 状态管家事件流 ---------- */
  const hmFeed = document.getElementById("hmFeed");
  if (hmFeed) {
    const hmToast = document.getElementById("hmToast");
    const lines = [
      "Kimi Code 开始任务「官网重构」",
      "DeepSeek 等待确认 → 已推送飞书",
      "Codex 完成「单元测试补全」用时 4m12s · 8.7k tokens",
      "Kimi Code 公开步骤：读取 task.md → 修改 styles.css",
      "WorkBuddy 报错：节点超时 → 已推送钉钉",
      "Kimi Code 完成「官网重构」用时 12m40s · 12.4k tokens"
    ];
    let i = 0;
    setInterval(() => {
      const t = new Date().toTimeString().slice(0, 8);
      const div = document.createElement("div");
      div.className = "hm-feed-line";
      div.innerHTML = `<span>${t}</span>${lines[i % lines.length]}`;
      i++;
      hmFeed.appendChild(div);
      while (hmFeed.children.length > 2) hmFeed.removeChild(hmFeed.firstChild);
      if (/已推送/.test(div.textContent) && hmToast) {
        hmToast.classList.add("show");
        setTimeout(() => hmToast.classList.remove("show"), 2200);
      }
      const hmPet = document.getElementById("hmPet");
      const hmPetBubble = document.getElementById("hmPetBubble");
      const blob = hmPet && hmPet.querySelector(".pet-blob");
      if (hmPet && blob) {
        const t2 = div.textContent;
        if (/等待确认/.test(t2)) {
          blob.className = "pet-blob mini wait";
          hmPet.classList.add("wait"); hmPet.classList.remove("done");
          hmPetBubble.textContent = "还在等确认…";
        } else if (/完成/.test(t2)) {
          blob.className = "pet-blob mini done";
          hmPet.classList.add("done"); hmPet.classList.remove("wait");
          hmPetBubble.textContent = "又搞定一个！";
        } else if (/开始工作|修改|消耗/.test(t2)) {
          blob.className = "pet-blob mini work";
          hmPet.classList.remove("wait", "done");
          hmPetBubble.textContent = "盯着呢～";
        }
      }
    }, 2800);
  }

  /* ---------- 状态管家演示：事件流 ---------- */
  const bdFeed = document.getElementById("bdFeed");  if (bdFeed) {
    const bdPush = document.getElementById("bdPush");
    const events = [
      { t: "10:24:17", txt: "Kimi Code 开始「官网重构」" },
      { t: "10:24:31", txt: "DeepSeek 进入「等待确认」" },
      { t: "10:24:32", txt: "已推送飞书 · 钉钉", push: true },
      { t: "10:25:02", txt: "Codex 完成「单元测试补全」用时 4m12s · 8.7k tok" },
      { t: "10:25:03", txt: "已推送飞书 · 钉钉", push: true },
      { t: "10:25:40", txt: "WorkBuddy 报错：节点超时" },
      { t: "10:25:41", txt: "已推送飞书 · 钉钉", push: true },
      { t: "10:26:48", txt: "DeepSeek 任务恢复执行" },
      { t: "10:27:20", txt: "Kimi Code 完成「官网重构」用时 12m40s · 12.4k tok" },
      { t: "10:27:21", txt: "已推送飞书 · 钉钉", push: true }
    ];
    let idx = 0, timer = null;
    function tickEvent() {
      const ev = events[idx % events.length]; idx++;
      const line = document.createElement("div");
      line.className = "bd-line" + (ev.push ? " push" : "");
      line.innerHTML = `<span>${ev.t}</span>${ev.txt}`;
      bdFeed.appendChild(line);
      while (bdFeed.children.length > 6) bdFeed.removeChild(bdFeed.firstChild);
      if (ev.push && bdPush) {
        bdPush.classList.add("show");
        setTimeout(() => bdPush.classList.remove("show"), 2200);
      }
    }
    const bdIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { if (!timer) timer = setInterval(tickEvent, 2100); }
        else { clearInterval(timer); timer = null; }
      });
    }, { threshold: 0.25 });
    bdIO.observe(bdFeed);
  }

  /* ---------- 桌面宠物：状态演绎 ---------- */
  const petBody = document.getElementById("petBody");
  if (petBody) {
    const petBubble = document.getElementById("petBubble");
    const PET = {
      working: { text: "放我身上就行，我来安排～", mood: 88 },
      waiting: { text: "DeepSeek 还在等你确认！", mood: 52 },
      done: { text: "搞定！快夸我～", mood: 96 },
      idle: { text: "60 秒没活干，我关电脑咯 Zzz", mood: 70 }
    };
    const btns = [...document.querySelectorAll(".pa-btn[data-state]")];
    let cur = "working", autoTimer = null, resumeTimer = null;

    function setPet(state) {
      cur = state;
      petBody.className = "pet-body " + state;
      petBubble.textContent = PET[state].text;
      btns.forEach((b) => b.classList.toggle("on", b.dataset.state === state));
    }

    const AUTO = ["working", "waiting", "done", "idle"];
    let autoIdx = 0;
    function startAuto() {
      if (autoTimer) return;
      autoTimer = setInterval(() => {
        autoIdx = (AUTO.indexOf(cur) + 1) % AUTO.length;
        setPet(AUTO[autoIdx]);
      }, 3600);
    }
    function pauseAuto() {
      clearInterval(autoTimer); autoTimer = null;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(startAuto, 12000);
    }
    btns.forEach((b) => b.addEventListener("click", () => { setPet(b.dataset.state); pauseAuto(); }));

    // 喂食 / 摸摸：回饱食度、涨等级经验
    document.querySelectorAll(".pa-btn.feed").forEach((b) => {
      b.addEventListener("click", () => {
        const isFeed = b.textContent.includes("喂食");
        const bar = document.getElementById(isFeed ? "barMood" : "barFull");
        const val = document.getElementById(isFeed ? "valMood" : "valFull");
        const v = Math.min(100, (+val.textContent || 0) + (isFeed ? 8 : 5));
        bar.style.width = v + "%"; val.textContent = v;
        petBubble.textContent = isFeed ? "唔……再来一碗！" : "好舒服，多摸两下～";
      });
    });

    const petIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) startAuto();
        else { clearInterval(autoTimer); autoTimer = null; }
      });
    }, { threshold: 0.3 });
    petIO.observe(petBody);
  }

  /* ---------- 拖入快捷处理演示 ---------- */
  const clipTypes = document.getElementById("clipTypes");
  if (clipTypes) {
    const CLIP = {
      share: { sample: "https://www.example.com/share/9f3a2b\n元宝分享链接：看看这段对话里提到哪些资料", acts: ["导入回答编辑", "提取资料清单", "收集附件"] },
      answer: { sample: "用户：帮我对比这两个方案\n模型：方案 A 成本低 18%，方案 B 扩展性好……", acts: ["排版分段", "显式摘要", "存文字产物"] },
      code: { sample: "Traceback (most recent call last):\n  File \"etl.py\", line 42, in <module>", acts: ["解释报错", "定位问题", "存文件站"] },
      error: { sample: "Error: ETIMEDOUT connect ECONNREFUSED 127.0.0.1:8000\n    at TCPConnectWrap.afterConnect", acts: ["解释报错", "搜索解决方案", "存文件站"] },
      text: { sample: "把这段需求描述整理成任务清单，周五前要", acts: ["资料准备", "生成任务树", "润色表达"] }
    };
    const clipText = document.getElementById("clipText");
    const clipActions = document.getElementById("clipActions");
    function setType(t) {
      const d = CLIP[t];
      clipText.textContent = d.sample;
      clipTypes.querySelectorAll(".ct").forEach((c) => c.classList.toggle("on", c.dataset.t === t));
      clipActions.innerHTML = "";
      d.acts.forEach((a, i) => {
        const btn = document.createElement("button");
        btn.className = "ca"; btn.type = "button"; btn.textContent = a;
        btn.style.animationDelay = (i * 0.08) + "s";
        btn.addEventListener("click", () => {
          clipActions.querySelectorAll(".ca").forEach((x) => x.style.borderColor = "");
          btn.style.borderColor = "var(--green)";
          btn.textContent = a + " ✓";
        });
        clipActions.appendChild(btn);
      });
    }
    clipTypes.querySelectorAll(".ct").forEach((c) => c.addEventListener("click", () => setType(c.dataset.t)));
    setType("share");
  }

  /* ---------- 资料比对卡演示 ---------- */
  const cmpBtn = document.getElementById("cmpBtn");
  if (cmpBtn) {
    const demo = cmpBtn.closest(".cmp-demo");
    cmpBtn.addEventListener("click", () => {
      if (demo.classList.contains("run")) {
        demo.classList.remove("run");
        cmpBtn.textContent = "⇄ 开始比对";
      } else {
        demo.classList.add("run");
        cmpBtn.textContent = "↺ 重新比对";
      }
    });
    // 进入视口时自动演示一次
    const cmpIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          setTimeout(() => {
            if (!demo.classList.contains("run")) {
              demo.classList.add("run");
              cmpBtn.textContent = "↺ 重新比对";
            }
          }, 600);
          cmpIO.unobserve(demo);
        }
      });
    }, { threshold: 0.4 });
    cmpIO.observe(demo);
  }

})();
