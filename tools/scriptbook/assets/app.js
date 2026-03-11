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

  async function loadManifest(){
    const res = await fetch("data/manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error("无法加载 manifest.json");
    return res.json();
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
      left.innerHTML = `<div class="title">${esc(it.title || it.relPath)}</div><div class="path">${esc(it.relPath)}</div>`;

      const right = document.createElement("div");
      const badges = [];
      badges.push(`<span class="badge">${esc(it.lang || it.ext || "")}</span>`);
      if(it.blocked){
        badges.push(`<span class="badge bad">已隐藏</span>`);
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
    try{
      const m = await loadManifest();
      $("stats").textContent = `共 ${m.items.length} 个文件`;
      renderList(m.items);
    }catch(e){
      $("stats").textContent = String(e && e.message ? e.message : e);
    }
  })();
})();
