(function(){
  const $ = (id) => document.getElementById(id);

  function esc(s){
    return String(s).replace(/[&<>\"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  function fmtBytes(n){
    if (!Number.isFinite(n)) return "-";
    const u=["B","KB","MB","GB"];let i=0;let v=n;
    while(v>=1024&&i<u.length-1){v/=1024;i++;}
    return `${v.toFixed(i===0?0:1)} ${u[i]}`;
  }

  function firstDir(relPath){
    const s = String(relPath || "");
    const idx = s.indexOf("/");
    return idx === -1 ? "(root)" : s.slice(0, idx);
  }

  async function loadJson(url, errMsg){
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(errMsg);
    return res.json();
  }

  async function loadManifest(){
    return loadJson("data/manifest.json", "无法加载 manifest.json");
  }

  async function loadReadmeRefs(){
    return loadJson("data/readme-refs.json", "无法加载 readme-refs.json");
  }

  async function loadPackageScripts(){
    return loadJson("data/package-scripts.json", "无法加载 package-scripts.json");
  }

  function indexItem(it){
    const parts = [];
    parts.push(it.title || "");
    parts.push(it.relPath || "");
    parts.push(it.desc || "");
    if (Array.isArray(it.tags)) parts.push(it.tags.join(" "));
    return parts.join("\n").toLowerCase();
  }

  function uniqSorted(arr){
    return Array.from(new Set(arr)).sort((a,b)=>a.localeCompare(b));
  }

  function fillSelect(sel, options, allLabel){
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = allLabel;
    sel.appendChild(o0);
    for(const v of options){
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    }
  }

  function renderList(items){
    const el = $("list");
    el.innerHTML = "";
    const frag = document.createDocumentFragment();

    for(const it of items){
      const a = document.createElement("a");
      a.className = "item";
      a.href = `s/${encodeURIComponent(it.id)}/index.html`;

      const left = document.createElement("div");
      left.className = "left";

      const tags = Array.isArray(it.tags) ? it.tags.filter(Boolean) : [];
      const shown = tags.slice(0, 3);
      const moreN = Math.max(0, tags.length - shown.length);
      const tagHtml = shown.map((t)=>`<span class="chip">${esc(t)}</span>`).join("");
      const moreHtml = moreN ? `<span class="chip chip-more">+${moreN}</span>` : "";

      const desc = String(it.desc || "").trim();
      const descHtml = desc ? `<div class="desc">${esc(desc)}</div>` : `<div class="desc muted">（无描述）</div>`;

      left.innerHTML = [
        `<div class="title">${esc(it.title || it.relPath)}</div>`,
        `<div class="path">${esc(it.relPath)}</div>`,
        descHtml,
        (tagHtml || moreHtml) ? `<div class="chips">${tagHtml}${moreHtml}</div>` : "",
      ].join("");

      const right = document.createElement("div");
      const badges = [];
      badges.push(`<span class="badge">${esc(it.lang || it.ext || "")}</span>`);
      if(it.blocked){
        badges.push(`<span class="badge bad">已隐藏</span>`);
      } else {
        badges.push(`<span class="badge good">可展示</span>`);
      }
      if(it.redacted){
        badges.push(`<span class="badge warn">已脱敏</span>`);
      }
      if(it.isReadmeEntry){
        badges.push(`<span class="badge">README</span>`);
      }
      if(it.hasNpmScripts){
        badges.push(`<span class="badge">npm</span>`);
      }
      badges.push(`<span class="badge">${esc(fmtBytes(it.sizeBytes))}</span>`);
      right.innerHTML = badges.join(" ");

      a.appendChild(left);
      a.appendChild(right);
      frag.appendChild(a);
    }

    el.appendChild(frag);
  }

  (async function main(){
    const state = {
      manifest: null,
      all: [],
      indexed: [],
      filtered: [],
      pageSize: 80,
      shown: 0,
    };

    try{
      const [m, readmeRefs, pkgScripts] = await Promise.all([
        loadManifest(),
        loadReadmeRefs(),
        loadPackageScripts(),
      ]);

      const readmeSet = new Set(
        (readmeRefs && Array.isArray(readmeRefs.items) ? readmeRefs.items : []).map((x) => x.relPath)
      );

      const npmSet = new Set(
        (pkgScripts && Array.isArray(pkgScripts.items) ? pkgScripts.items : []).map((x) => x.relPath)
      );

      state.manifest = m;
      state.all = (m.items || []).map((it) => ({
        ...it,
        isReadmeEntry: readmeSet.has(it.relPath),
        hasNpmScripts: npmSet.has(it.relPath),
      }));

      state.indexed = state.all.map((it) => ({ it, dir: firstDir(it.relPath), q: indexItem(it) }));

      fillSelect($("dir"), uniqSorted(state.indexed.map((x)=>x.dir)), "全部目录");
      fillSelect($("type"), uniqSorted(state.all.map((x)=>x.lang || x.ext || "").filter(Boolean)), "全部类型");

      const allTags = uniqSorted(
        state.all.flatMap((x)=>Array.isArray(x.tags) ? x.tags : []).filter(Boolean)
      );

      const tagsBox = $("tags");
      tagsBox.innerHTML = "";
      for(const t of allTags){
        const lab = document.createElement("label");
        lab.className = "tagopt";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = t;
        cb.addEventListener("change", () => apply());
        const sp = document.createElement("span");
        sp.textContent = t;
        lab.appendChild(cb);
        lab.appendChild(sp);
        tagsBox.appendChild(lab);
      }

      function apply(){
        const q = ($("q").value || "").trim().toLowerCase();
        const dir = $("dir").value;
        const type = $("type").value;
        const sort = $("sort").value;
        const st = $("state").value;
        const entry = $("entry").value;

        const selectedTags = Array.from(document.querySelectorAll("#tags input[type=checkbox]:checked"))
          .map((x) => x.value)
          .filter(Boolean);

        let arr = state.indexed;
        if (dir) arr = arr.filter((x)=>x.dir === dir);
        if (type) arr = arr.filter((x)=> (x.it.lang || x.it.ext || "") === type);
        if (selectedTags.length) {
          arr = arr.filter((x) => {
            if (!Array.isArray(x.it.tags)) return false;
            for (const t of selectedTags) {
              if (!x.it.tags.includes(t)) return false;
            }
            return true;
          });
        }
        if (st === "visible") arr = arr.filter((x)=>!x.it.blocked);
        if (st === "blocked") arr = arr.filter((x)=>!!x.it.blocked);
        if (entry === "readme") arr = arr.filter((x)=>!!x.it.isReadmeEntry);
        if (entry === "npm") arr = arr.filter((x)=>!!x.it.hasNpmScripts);
        if (q) arr = arr.filter((x)=>x.q.includes(q));

        let items = arr.map((x)=>x.it);
        if (sort === "mtime") items.sort((a,b)=>(b.mtimeMs||0)-(a.mtimeMs||0));
        else if (sort === "size") items.sort((a,b)=>(b.sizeBytes||0)-(a.sizeBytes||0));
        else items.sort((a,b)=>String(a.relPath).localeCompare(String(b.relPath)));

        state.filtered = items;
        state.shown = 0;
        $("list").innerHTML = "";
        loadMore();
      }

      function loadMore(){
        const next = state.filtered.slice(state.shown, state.shown + state.pageSize);
        if (next.length) {
          // 追加渲染
          const prev = $("list").children.length;
          if (prev === 0) renderList(next);
          else {
            // 追加：复用 renderList 的 DOM 逻辑
            const el = $("list");
            const frag = document.createDocumentFragment();
            for(const it of next){
              const a = document.createElement("a");
              a.className = "item";
              a.href = `s/${encodeURIComponent(it.id)}/index.html`;

              const left = document.createElement("div");
              left.className = "left";

              const tags = Array.isArray(it.tags) ? it.tags.filter(Boolean) : [];
              const shown = tags.slice(0, 3);
              const moreN = Math.max(0, tags.length - shown.length);
              const tagHtml = shown.map((t)=>`<span class="chip">${esc(t)}</span>`).join("");
              const moreHtml = moreN ? `<span class="chip chip-more">+${moreN}</span>` : "";

              const desc = String(it.desc || "").trim();
              const descHtml = desc ? `<div class="desc">${esc(desc)}</div>` : `<div class="desc muted">（无描述）</div>`;

              left.innerHTML = [
                `<div class="title">${esc(it.title || it.relPath)}</div>`,
                `<div class="path">${esc(it.relPath)}</div>`,
                descHtml,
                (tagHtml || moreHtml) ? `<div class="chips">${tagHtml}${moreHtml}</div>` : "",
              ].join("");

              const right = document.createElement("div");
              const badges = [];
              badges.push(`<span class="badge">${esc(it.lang || it.ext || "")}</span>`);
              if(it.blocked){
                badges.push(`<span class="badge bad">已隐藏</span>`);
              } else {
                badges.push(`<span class="badge good">可展示</span>`);
              }
              if(it.redacted){
                badges.push(`<span class="badge warn">已脱敏</span>`);
              }
              if(it.isReadmeEntry){
                badges.push(`<span class="badge">README</span>`);
              }
              if(it.hasNpmScripts){
                badges.push(`<span class="badge">npm</span>`);
              }
              badges.push(`<span class="badge">${esc(fmtBytes(it.sizeBytes))}</span>`);
              right.innerHTML = badges.join(" ");

              a.appendChild(left);
              a.appendChild(right);
              frag.appendChild(a);
            }
            el.appendChild(frag);
          }
        }

        state.shown += next.length;
        $("stats").textContent = `共 ${state.all.length} 个文件；当前命中 ${state.filtered.length}；已显示 ${Math.min(state.shown, state.filtered.length)}`;
        $("more").disabled = state.shown >= state.filtered.length;
      }

      $("q").addEventListener("input", () => apply());
      $("dir").addEventListener("change", () => apply());
      $("type").addEventListener("change", () => apply());
      $("sort").addEventListener("change", () => apply());
      $("state").addEventListener("change", () => apply());
      $("entry").addEventListener("change", () => apply());
      $("more").addEventListener("click", () => loadMore());
      $("reset").addEventListener("click", () => {
        $("q").value = "";
        $("dir").value = "";
        $("type").value = "";
        $("sort").value = "name";
        $("state").value = "";
        $("entry").value = "";
        for (const cb of document.querySelectorAll("#tags input[type=checkbox]")) {
          cb.checked = false;
        }
        apply();
      });

      state.filtered = state.all.slice();
      apply();
    }catch(e){
      $("stats").textContent = String(e && e.message ? e.message : e);
    }
  })();
})();
